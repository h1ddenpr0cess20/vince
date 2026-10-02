import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { fetchCatalog, createLiveSession } from '../../src/client/api.js';
import { withGlobals } from '../helpers/dom.js';

let restore = () => {};

function stubFetch(reply) {
  const calls = [];
  restore = withGlobals({
    fetch: async (url, init) => {
      calls.push({ url, init });
      const { status = 200, body = {}, malformed = false } = reply(url) ?? {};
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => {
          if (malformed) throw new SyntaxError('Unexpected token');
          return body;
        },
      };
    },
  });
  return calls;
}

afterEach(() => restore());

describe('fetchCatalog', () => {
  it('returns the proxy payload', async () => {
    const calls = stubFetch(() => ({ body: { models: [{ id: 'gpt-realtime-2.1' }], voice: 'ballad' } }));
    const catalog = await fetchCatalog();
    assert.equal(calls[0].url, '/api/models');
    assert.equal(catalog.voice, 'ballad');
  });

  it('throws the proxy\'s own message, which the caption shows verbatim', async () => {
    stubFetch(() => ({ status: 500, body: { error: 'OPENAI_API_KEY is not set' } }));
    await assert.rejects(() => fetchCatalog(), /OPENAI_API_KEY is not set/);
  });

  it('still says something useful when the error body is unreadable', async () => {
    stubFetch(() => ({ status: 502, malformed: true }));
    await assert.rejects(() => fetchCatalog(), /\/api\/models returned 502/);
  });
});

describe('createLiveSession', () => {
  it('posts the requested model and voice as JSON', async () => {
    const calls = stubFetch(() => ({ body: { session: { id: 'live_x' }, transport: { sdp: 'answer' } } }));

    const secret = await createLiveSession({ model: 'gpt-live-1', voice: 'vesper', sdp: 'offer' });

    assert.equal(calls[0].url, '/api/session');
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(calls[0].init.headers['content-type'], 'application/json');
    assert.deepEqual(JSON.parse(calls[0].init.body), { model: 'gpt-live-1', voice: 'vesper', sdp: 'offer' });
    assert.equal(secret.session.id, 'live_x');
  });

  it('surfaces a mint failure', async () => {
    stubFetch(() => ({ status: 502, body: { error: 'Incorrect API key provided' } }));
    await assert.rejects(() => createLiveSession({}), /Incorrect API key provided/);
  });
});
