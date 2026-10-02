/** Spoken transcripts and backend responses have independent lifecycles. */
export function createEventHandler({ setState, emit, fail, messages, runTool, send }) {
  const responses = new Map();
  const called = new Set();
  const rows = { user: [], assistant: [] };
  let active = true;
  let counter = 0;
  let activityTimer;
  let busy = false;
  const prefix = 'live-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  function setBusy() {
    const next = responses.size > 0;
    if (next !== busy) { busy = next; emit('busy', busy); }
  }
  function transcript(event, role) {
    if (typeof event.delta !== 'string' || !event.delta) return;
    const fragment = { delta: event.delta, start_ms: event.start_ms, end_ms: event.end_ms };
    // Display grouping only; it never triggers tools or defines a semantic turn.
    let row = rows[role].findLast((r) => event.start_ms >= r.start_ms && event.start_ms <= r.end_ms + 1500);
    if (!row) {
      row = { id: prefix + '-' + (++counter), role, content: '', start_ms: event.start_ms, end_ms: event.end_ms, fragments: [] };
      rows[role].push(row);
      messages.push(row);
    }
    row.fragments.push(fragment);
    row.fragments.sort((a, b) => a.start_ms - b.start_ms);
    row.content = row.fragments.map((f) => f.delta).join('');
    row.end_ms = Math.max(row.end_ms, event.end_ms);
    emit('message', { ...row, fragments: [...row.fragments] });
    if (role === 'user') emit('user', row.content);
    else emit('caption', row.content);
    // The squash the ear does on speech: a nudge per fragment, on top of the
    // level meter. Vince's own voice hits harder than the one he is listening to.
    emit('pulse', role === 'assistant' ? 0.32 : 0.22);
    setState(role === 'assistant' ? 'speaking' : 'listening');
    clearTimeout(activityTimer);
    activityTimer = setTimeout(() => { if (active) setState(busy ? 'thinking' : 'listening'); }, 1500);
  }
  async function complete(key, event) {
    const response = responses.get(key);
    if (!response || response.finishing) return;
    response.finishing = true;
    const failed = event.type !== 'response.completed';
    if (!failed) {
      for (const call of response.calls) {
        if (!active) return;
        let args;
        let output;
        try { args = JSON.parse(call.arguments || '{}'); }
        catch { output = { ok: false, error: 'Invalid JSON tool arguments' }; }
        if (!output) output = await runTool({ name: call.name, args });
        if (!active) return;
        send({ type: 'response.item.create', item: {
          type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output),
        } });
      }
      if (response.calls.length && active) send({ type: 'response.create' });
    } else {
      fail(event.response?.error?.message ?? ('Backend response ' + event.type.split('.').at(-1)));
    }
    responses.delete(key);
    setBusy();
    emit('backend', { delegation_id: key, response_id: response.id, usage: event.response?.usage });
  }
  function handle(event) {
    if (!active) return;
    if (event.type === 'session.input_transcript.delta') return transcript(event, 'user');
    if (event.type === 'session.output_transcript.delta') return transcript(event, 'assistant');
    if (event.type === 'session.usage.updated' || event.type === 'session.closed') {
      emit('usage', { ...event.usage, final: event.type === 'session.closed' });
    }
    if (event.type === 'error') fail(event.error?.message ?? 'Live error');
    if (event.type !== 'response.event') return;
    const nested = event.event;
    const key = event.delegation_id;
    if (!nested || !key) return;
    if (nested.type === 'response.created') {
      responses.set(key, { id: nested.response?.id, calls: [], finishing: false });
      setBusy();
    }
    const response = responses.get(key);
    if (nested.type === 'response.output_item.done') {
      const item = nested.item;
      if (item?.type === 'function_call' && response && item.call_id && !called.has(item.call_id)) {
        called.add(item.call_id);
        response.calls.push(item);
      }
      if (item?.type === 'message') {
        for (const part of item.content ?? []) {
          for (const citation of part.annotations ?? []) {
            if (citation.type === 'url_citation') emit('source', citation);
          }
        }
      }
    }
    if (nested.type.startsWith('response.web_search_call.')) emit('tool', 'searching the web');
    if (['response.completed', 'response.failed', 'response.incomplete', 'response.cancelled'].includes(nested.type)) {
      complete(key, nested).catch((err) => { if (active) fail(err.message); });
    }
  }
  return {
    handle,
    get responding() { return busy; },
    reset() { active = false; clearTimeout(activityTimer); responses.clear(); setBusy(); },
  };
}
