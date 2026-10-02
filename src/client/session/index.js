import { createEmitter } from './emitter.js';
import { createAnalyser, createMeter } from './metering.js';
import { createTools, toolLabel } from './tools.js';
import { connect } from './webrtc.js';
import { createEventHandler } from './events.js';

const MIC_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
};
const PRIOR_TURNS = 40;
const PRIOR_CHARS = 6000;

export function prior(turns = []) {
  const kept = turns
    .filter((turn) => turn?.content && ['user', 'assistant'].includes(turn.role))
    .slice(-PRIOR_TURNS)
    .map((turn) => ({ role: turn.role, content: String(turn.content).slice(0, PRIOR_CHARS) }));
  let total = kept.reduce((sum, turn) => sum + turn.content.length, 0);
  while (total > PRIOR_CHARS && kept.length > 1) total -= kept.shift().content.length;
  return kept;
}

export function createVoiceSession({
  model = 'gpt-live-1', voice, backendModel, memory, toolsOff = () => [],
} = {}) {
  const { on, emit } = createEmitter();
  const messages = [];
  const tools = createTools({ memory });
  let current = model;
  let currentVoice = voice;
  let currentBackend = backendModel;
  let call = null;
  let events = null;
  let pending = null;
  let audio = null;
  let audioEl = null;
  let micStream = null;
  let micAnalyser = null;
  let outAnalyser = null;
  let state = 'idle';
  let context = [];
  let muted = false;
  let generation = 0;
  let picked = 0;
  let connectedPick = 0;

  function setState(next) {
    if (state === next) return;
    state = next;
    emit('state', next);
  }
  function fail(message) { emit('error', { message }); }

  async function runTool({ name, args }) {
    const tool = tools[name];
    if (!tool) return { ok: false, error: 'Unknown tool: ' + name };
    emit('tool', toolLabel(name));
    const mine = generation;
    let output;
    try { output = await tool(args); }
    catch (err) { output = { ok: false, error: err?.message ?? String(err) }; }
    if (mine === generation) {
      if (output?.id && output?.status) emit('task', output);
      else emit('memory', output);
    }
    return output;
  }

  const meter = createMeter(
    () => state === 'speaking' ? outAnalyser : micAnalyser,
    (level) => emit('level', level),
  );

  async function start() {
    if (call || pending) return;
    const controller = new AbortController();
    pending = controller;
    const mine = ++generation;
    const abandoned = () => mine !== generation;
    setState('connecting');
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(globalThis.isSecureContext === false
          ? 'the microphone needs https or localhost (npm run dev:lan)'
          : 'this browser cannot access a microphone; try Safari or Chrome');
      }
      const stream = await navigator.mediaDevices.getUserMedia(MIC_CONSTRAINTS);
      if (abandoned()) { stream.getTracks().forEach((track) => track.stop()); return; }
      micStream = stream;
      connectedPick = picked;
      audio = new AudioContext();
      micAnalyser = createAnalyser(audio, micStream);
      audioEl = new Audio();
      audioEl.autoplay = true;
      const earlier = prior(context);
      const handler = createEventHandler({
        setState, emit, fail, messages, runTool,
        send: (event) => call?.send(event),
      });
      events = handler;
      const connection = await connect({
        options: { model: current, voice: currentVoice, backendModel: currentBackend,
          history: earlier, resumed: earlier.length > 0,
          memories: memory?.lines() ?? [], toolsOff: toolsOff() },
        signal: controller.signal,
        micStream,
        onEvent: (event) => {
          if (!abandoned()) handler.handle(event);
          else if (event.type === 'session.closed') emit('usage', { ...event.usage, final: true });
        },
        onTrack: (stream) => {
          if (abandoned()) return;
          audioEl.srcObject = stream;
          outAnalyser = createAnalyser(audio, stream);
          audioEl.play?.().catch(() => fail('Audio playback was blocked; allow sound and reconnect.'));
        },
        onClose: (reason) => {
          /**
           * A call the page has already walked away from closes on its own
           * terms — a hang-up waiting out its final usage, a redial, a cancel
           * part-way through connecting. Whatever it says on the way down is
           * not news to whoever asked for it, so it is not raised at them.
           */
          if (abandoned()) return;
          if (reason) fail(reason);
          stop();
        },
      });
      if (abandoned()) { connection.close(); return; }
      call = connection;
      pending = null;
      current = connection.model ?? current;
      currentVoice = connection.voice ?? currentVoice;
      currentBackend = connection.backendModel ?? currentBackend;
      meter.start();
      setState('listening');
    } catch (err) {
      if (!abandoned()) { fail(err?.message ?? String(err)); stop(); }
    } finally {
      if (pending === controller) pending = null;
    }
  }

  function stop() {
    generation++;
    const controller = pending;
    pending = null;
    controller?.abort();
    events?.reset();
    events = null;
    const closing = call;
    call = null;
    closing?.close();
    meter.stop();
    micStream?.getTracks().forEach((track) => track.stop());
    audio?.close();
    if (audioEl) audioEl.srcObject = null;
    micStream = audio = audioEl = micAnalyser = outAnalyser = null;
    muted = false;
    setState('idle');
  }

  function send(text) {
    const content = text.trim();
    if (!content || !call?.open) return;
    const message = { role: 'user', content };
    messages.push(message);
    emit('message', message);
    call.send({ type: 'response.item.create', item: {
      type: 'message', role: 'user', content: [{ type: 'input_text', text: content }],
    } });
    call.send({ type: 'response.create' });
    setState('thinking');
  }

  // A byte budget is conservative for the API's 500-token append limit.
  function append(type, text) {
    let chunk = '';
    const encoder = new TextEncoder();
    for (const char of text) {
      if (encoder.encode(chunk + char).length > 480) {
        call.send({ type, delegation_id: null, content: chunk });
        chunk = '';
      }
      chunk += char;
    }
    if (chunk) call.send({ type, delegation_id: null, content: chunk });
  }

  return {
    on, start, stop, send,
    get context() { return context; },
    set context(turns) { context = Array.isArray(turns) ? turns : []; },
    get messages() { return messages; },
    note(text) {
      const content = String(text ?? '').trim();
      if (!content || !call?.open) return false;
      append('session.commentary.append', content);
      return true;
    },
    get connected() { return call?.open ?? false; },
    get busy() { return events?.responding ?? false; },
    get state() { return state; },
    get muted() { return muted; },
    set muted(next) {
      muted = Boolean(next);
      micStream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    },
    get model() { return current; },
    set model(next) { current = next; picked++; },
    get voice() { return currentVoice; },
    set voice(next) { currentVoice = next; picked++; },
    /** The Responses model behind the call; like the others, a redial to change. */
    get backendModel() { return currentBackend; },
    set backendModel(next) { currentBackend = next; picked++; },
    get stale() { return !!call && picked !== connectedPick; },
    cancel() {
      if (call?.open) append('session.instructions.append', 'Stop speaking now and listen.');
    },
  };
}
