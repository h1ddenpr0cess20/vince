import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createEventHandler } from '../../src/client/session/events.js';
let handler;
afterEach(() => handler?.reset());
function setup(runTool = async () => ({ ok: true })) {
  const log = [], sent = [], messages = [];
  handler = createEventHandler({ messages, runTool,
    setState: (state) => log.push(['state', state]),
    emit: (type, value) => log.push([type, value]),
    fail: (message) => log.push(['error', message]),
    send: (event) => sent.push(event),
  });
  const response = (event, delegation_id = 'd1') => handler.handle({ type: 'response.event', delegation_id, event });
  return { log, sent, messages, response };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
describe('Live events', () => {
  it('keeps overlapping speaker fragments in stable rows', () => {
    const { messages, log } = setup();
    handler.handle({ type: 'session.input_transcript.delta', delta: 'Tell ', start_ms: 0, end_ms: 100 });
    handler.handle({ type: 'session.output_transcript.delta', delta: 'Sure.', start_ms: 50, end_ms: 150 });
    handler.handle({ type: 'session.input_transcript.delta', delta: 'me more', start_ms: 100, end_ms: 200 });
    assert.equal(messages.length, 2);
    assert.equal(messages[0].content, 'Tell me more');
    assert.equal(messages[0].fragments.length, 2);
    assert.equal(log.filter(([t]) => t === 'message')[0][1].id, log.filter(([t]) => t === 'message')[2][1].id);
  });
  it('nudges the ear on every fragment, harder for its own voice', () => {
    const { log } = setup();
    handler.handle({ type: 'session.input_transcript.delta', delta: 'hello', start_ms: 0, end_ms: 100 });
    handler.handle({ type: 'session.output_transcript.delta', delta: 'hi', start_ms: 200, end_ms: 300 });
    assert.deepEqual(log.filter(([t]) => t === 'pulse').map(([, w]) => w), [0.22, 0.32]);
  });
  it('does not present backend completion or text as speech', async () => {
    const { response, log } = setup();
    response({ type: 'response.created', response: { id: 'r1' } });
    response({ type: 'response.output_text.delta', delta: 'private backend thought' });
    response({ type: 'response.completed', response: { id: 'r1', output: [], usage: { input_tokens: 3 } } });
    await tick();
    assert.ok(!log.some(([t]) => ['text', 'caption', 'message', 'state'].includes(t)));
    assert.equal(log.find(([t]) => t === 'backend')[1].usage.input_tokens, 3);
  });
  it('waits for all function results and continues once', async () => {
    let finish;
    const executed = [];
    const { response, sent } = setup(async ({ name }) => {
      executed.push(name);
      if (name === 'remember') await new Promise((resolve) => { finish = resolve; });
      return { ok: true };
    });
    response({ type: 'response.created', response: { id: 'r1' } });
    const item = { type: 'function_call', call_id: 'c1', name: 'remember', arguments: '{"memory":"coffee"}' };
    response({ type: 'response.function_call_arguments.done', ...item });
    assert.equal(executed.length, 0);
    response({ type: 'response.output_item.done', item });
    response({ type: 'response.output_item.done', item });
    response({ type: 'response.output_item.done', item: { ...item, call_id: 'c2', name: 'forget' } });
    response({ type: 'response.completed', response: { id: 'r1', output: [] } });
    response({ type: 'response.completed', response: { id: 'r1', output: [] } });
    assert.equal(sent.length, 0);
    finish(); await tick();
    assert.deepEqual(executed, ['remember', 'forget']);
    assert.deepEqual(sent.map((e) => e.type), ['response.item.create', 'response.item.create', 'response.create']);
    assert.equal(sent[0].item.call_id, 'c1');
  });
  it('returns an error for malformed arguments without executing', async () => {
    let ran = false;
    const { response, sent } = setup(async () => { ran = true; });
    response({ type: 'response.created', response: { id: 'r1' } });
    response({ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'remember', arguments: '{' } });
    response({ type: 'response.completed', response: { id: 'r1', output: [] } });
    await tick();
    assert.equal(ran, false);
    assert.match(sent[0].item.output, /Invalid JSON/);
  });
  it('drops in-flight results after disconnect', async () => {
    let finish;
    const { response, sent } = setup(() => new Promise((resolve) => { finish = resolve; }));
    response({ type: 'response.created', response: { id: 'r1' } });
    response({ type: 'response.output_item.done', item: { type: 'function_call', call_id: 'c1', name: 'remember', arguments: '{}' } });
    response({ type: 'response.completed', response: { id: 'r1', output: [] } });
    handler.reset(); finish({ ok: true }); await tick();
    assert.deepEqual(sent, []);
  });
  it('surfaces citations, cumulative usage and backend errors', async () => {
    const { response, log } = setup();
    response({ type: 'response.created', response: { id: 'r1' } });
    response({ type: 'response.web_search_call.searching' });
    response({ type: 'response.output_item.done', item: { type: 'message', content: [{ annotations: [{ type: 'url_citation', title: 'Source', url: 'https://example.com' }] }] } });
    handler.handle({ type: 'session.usage.updated', usage: { seconds: 12 } });
    handler.handle({ type: 'session.closed', usage: { seconds: 14 } });
    response({ type: 'response.failed', response: { error: { message: 'lookup failed' } } });
    await tick();
    assert.ok(log.some(([t]) => t === 'source'));
    assert.deepEqual(log.filter(([t]) => t === 'usage').map(([, v]) => v), [{ seconds: 12, final: false }, { seconds: 14, final: true }]);
    assert.ok(log.some(([t, v]) => t === 'error' && v === 'lookup failed'));
  });
});
