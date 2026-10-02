import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { createVoiceSession } from '../../src/client/session/index.js';
import { installMediaStack } from '../helpers/fake-rtc.js';
let media, session;
afterEach(() => {
  session?.stop();
  for (const peer of media?.peers ?? []) peer.channel?.deliver({ type: 'session.closed', usage: { seconds: 1 } });
  media?.restore();
});
function setup(options = {}, sessionOptions = {}) {
  media = installMediaStack(options);
  session = createVoiceSession(sessionOptions);
  return session;
}
const tick = () => new Promise((resolve) => setImmediate(resolve));
describe('Live voice session', () => {
  it('exchanges SDP through our server with startup history and switches', async () => {
    setup({}, { toolsOff: () => ['web_search'] });
    session.context = [{ role: 'user', content: 'My name is Pat' }];
    await session.start();
    assert.equal(session.connected, true);
    assert.equal(media.sdpRequests.length, 0);
    const request = media.secretRequests[0];
    assert.equal(request.sdp, 'v=0 fake offer');
    assert.equal(request.model, 'gpt-live-1');
    assert.deepEqual(request.history, session.context);
    assert.deepEqual(request.toolsOff, ['web_search']);
    assert.deepEqual(media.peers[0].channel.sent, []);
  });
  it('dials with the backend that was picked, and a new pick makes the call stale', async () => {
    setup({}, { backendModel: 'gpt-5.6-luna' });
    await session.start();
    assert.equal(media.secretRequests[0].backendModel, 'gpt-5.6-luna');
    assert.equal(session.stale, false);
    session.backendModel = 'gpt-5.6-terra';
    assert.equal(session.stale, true);
  });
  it('submits typed input to the delegated backend', async () => {
    setup(); await session.start();
    session.send('  search for the latest news  ');
    const sent = media.peers[0].channel.sent;
    assert.equal(sent[0].type, 'response.item.create');
    assert.equal(sent[0].item.content[0].text, 'search for the latest news');
    assert.equal(sent[1].type, 'response.create');
  });
  it('separates workspace notes from input and requests speech interruption', async () => {
    setup(); await session.start();
    session.note('[workspace] Task one finished'); session.cancel();
    const sent = media.peers[0].channel.sent;
    assert.equal(sent[0].type, 'session.commentary.append');
    assert.equal(sent[0].delegation_id, null);
    assert.equal(sent[1].type, 'session.instructions.append');
    assert.equal(session.messages.length, 0);
  });
  it('returns function results through Live', async () => {
    const memory = { enabled: true, lines: () => [], add: (text) => ({ text }), items: [] };
    setup({}, { memory }); await session.start();
    const channel = media.peers[0].channel;
    const deliver = (event) => channel.deliver({ type: 'response.event', delegation_id: 'd1', event });
    deliver({ type: 'response.created', response: { id: 'r1' } });
    deliver({ type: 'response.output_item.done', item: { type: 'function_call', name: 'remember', call_id: 'c1', arguments: '{"memory":"coffee"}' } });
    deliver({ type: 'response.completed', response: { id: 'r1', output: [] } });
    await tick();
    assert.equal(channel.sent[0].type, 'response.item.create');
    assert.equal(JSON.parse(channel.sent[0].item.output).remembered, 'coffee');
    assert.equal(channel.sent[1].type, 'response.create');
  });
  it('stays quiet about a call the page already hung up on', async () => {
    setup(); await session.start();
    const errors = []; session.on('error', (e) => errors.push(e.message));
    session.stop();
    /** The close never confirms and the connection gives up underneath it. */
    media.peers[0].drop('failed');
    await tick();
    assert.deepEqual(errors, []);
    assert.equal(session.state, 'idle');
  });
  it('still reports a call that drops on its own', async () => {
    setup(); await session.start();
    const errors = []; session.on('error', (e) => errors.push(e.message));
    media.peers[0].drop('failed');
    await tick();
    assert.equal(errors.length, 1);
    assert.match(errors[0], /connection lost/);
    assert.equal(session.state, 'idle');
  });
  it('mutes capture and drains final usage on hangup', async () => {
    setup(); await session.start();
    session.muted = true;
    assert.equal(media.micTracks[0].enabled, false);
    session.voice = 'stone'; assert.equal(session.stale, true);
    const usage = []; session.on('usage', (u) => usage.push(u));
    session.stop();
    const peer = media.peers[0];
    assert.equal(peer.channel.sent.at(-1).type, 'session.close');
    assert.equal(peer.closed, false);
    assert.equal(media.micTracks[0].stopped, true);
    peer.channel.deliver({ type: 'session.closed', usage: { seconds: 7 } });
    assert.equal(peer.closed, true);
    assert.deepEqual(usage.at(-1), { seconds: 7, final: true });
  });
  it('releases media after startup failures', async () => {
    setup(); media.secretStatus = 502;
    const errors = []; session.on('error', (e) => errors.push(e.message));
    await session.start();
    assert.equal(session.connected, false);
    assert.ok(errors.some((e) => /mint failed/.test(e)));
    assert.ok(media.peers[0].closed);
    assert.ok(media.micTracks[0].stopped);
  });
  it('reports unavailable microphones before requesting a session', async () => {
    setup({ mediaDevices: false, secureContext: false });
    const errors = []; session.on('error', (e) => errors.push(e.message));
    await session.start();
    assert.match(errors[0], /https/);
    assert.equal(media.secretRequests.length, 0);
  });
});
