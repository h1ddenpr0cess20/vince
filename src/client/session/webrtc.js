import { createLiveSession } from '../api.js';

/** Live uses a server-side SDP exchange, then waits for session.started. */
export async function connect({ options, micStream, onEvent, onTrack, onClose, signal }) {
  const pc = new RTCPeerConnection();
  const channel = pc.createDataChannel('oai-events');
  let started = false;
  let closing = false;
  let finalized = false;
  let closeTimer;
  let startTimer;
  let resolveStart;
  let rejectStart;
  const ready = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
  ready.catch(() => {});
  function cleanup() {
    clearTimeout(closeTimer);
    clearTimeout(startTimer);
    channel.close();
    pc.close();
  }
  function broken(message) {
    if (finalized) return;
    finalized = true;
    rejectStart(new Error(message));
    cleanup();
    onClose(message);
  }
  signal?.addEventListener('abort', () => broken('connection cancelled'), { once: true });
  pc.ontrack = (event) => onTrack(event.streams[0]);
  pc.addTrack(micStream.getAudioTracks()[0], micStream);
  channel.addEventListener('message', ({ data }) => {
    let event;
    try { event = JSON.parse(data); } catch { return; }
    if (event.type === 'session.started') {
      started = true;
      clearTimeout(startTimer);
      resolveStart();
    }
    if (event.type === 'error' && !started) {
      broken(event.error?.message ?? 'Live session startup failed');
      return;
    }
    onEvent(event);
    if (event.type === 'session.closed') {
      finalized = true;
      rejectStart(new Error('Live session ended before startup'));
      cleanup();
      onClose(null);
    }
  });
  channel.addEventListener('close', () => {
    if (!finalized) broken('Live connection ended without final usage');
  });
  channel.addEventListener('error', () => broken('Live events channel failed'));
  pc.addEventListener('connectionstatechange', () => {
    if (['failed', 'closed', 'disconnected'].includes(pc.connectionState) && !finalized) {
      broken('Live connection lost; final usage is unconfirmed');
    }
  });
  try {
    await pc.setLocalDescription(await pc.createOffer());
    if (pc.iceGatheringState !== 'complete') {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error('ICE gathering timed out')), 10_000);
        function finish(err) {
          clearTimeout(timer);
          pc.removeEventListener('icegatheringstatechange', changed);
          signal?.removeEventListener('abort', aborted);
          if (err) reject(err); else resolve();
        }
        function changed() { if (pc.iceGatheringState === 'complete') finish(); }
        function aborted() { finish(new Error('connection cancelled')); }
        pc.addEventListener('icegatheringstatechange', changed);
        signal?.addEventListener('abort', aborted, { once: true });
        changed();
      });
    }
    if (signal?.aborted) throw new Error('connection cancelled');
    const result = await createLiveSession({ ...options, sdp: pc.localDescription.sdp }, signal);
    if (signal?.aborted) throw new Error('connection cancelled');
    startTimer = setTimeout(() => broken('Live session did not start'), 15_000);
    await pc.setRemoteDescription({ type: 'answer', sdp: result.transport.sdp });
    await ready;
    return {
      model: result.model, voice: result.voice, backendModel: result.backendModel,
      get open() { return started && !closing && !finalized && channel.readyState === 'open'; },
      send(event) {
        if (!this.open) return false;
        channel.send(JSON.stringify(event));
        return true;
      },
      close() {
        if (closing || finalized) return;
        closing = true;
        if (channel.readyState !== 'open') return broken('Live close could not be confirmed');
        channel.send(JSON.stringify({ type: 'session.close' }));
        closeTimer = setTimeout(() => broken('Live close timed out; final usage is unconfirmed'), 15_000);
      },
    };
  } catch (err) {
    finalized = true;
    cleanup();
    throw err;
  }
}
