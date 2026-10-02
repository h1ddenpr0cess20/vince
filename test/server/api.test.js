import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { createApiMiddleware } from '../../src/server/api.js';
import { loadConfig } from '../../src/server/config.js';
import { startOpenAIStub } from '../helpers/openai-stub.js';
import { withServer } from '../helpers/request.js';

async function api(env = {}, stubOptions) {
  const stub = await startOpenAIStub(stubOptions);
  const config = loadConfig({ OPENAI_API_KEY: 'sk-test', OPENAI_BASE_URL: stub.baseUrl, ...env });
  return { stub, middleware: createApiMiddleware(config) };
}

const post = (body) => ({
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

describe('GET /api/models', () => {
  it('returns the catalog and both defaults', async () => {
    const { stub, middleware } = await api({ OPENAI_VOICE: 'stone' });
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const { status, body } = await request('/api/models');
      assert.equal(status, 200);
      assert.equal(body.model, 'gpt-live-1');
      assert.equal(body.voice, 'stone');
      assert.ok(body.voices.includes('stone'));
      assert.ok(body.models.every((m) => m.id.startsWith('gpt-live-')));
      assert.equal(body.backendModel, 'gpt-5.6-terra');
      assert.equal(body.backendModels[0].id, 'gpt-5.6-terra');
      assert.ok(body.backendModels.every((m) => /^gpt-(?:[5-9]|[1-9][0-9]+)/.test(m.id)));
      assert.deepEqual(body.switches, [{ name: 'web_search', label: 'web search' }]);
    });
  });

  it('reports an upstream failure as a 502, not as its own error', async () => {
    const { stub, middleware } = await api({}, { fail: { status: 500, message: 'upstream is down' } });
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const { status, body } = await request('/api/models');
      assert.equal(status, 502);
      assert.match(body.error, /upstream is down/);
    });
  });
});

describe('POST /api/session', () => {
  it('creates a Live session for the requested model and voice', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const { status, body } = await request('/api/session', post({ sdp: 'v=0 offer', model: 'gpt-live-1-2026-09-11', voice: 'stone' }));
      assert.equal(status, 200);
      assert.equal(body.session.id, 'live_test');
      assert.equal(body.transport.sdp, 'v=0 fake answer');
      assert.equal(body.voice, 'stone');
      assert.equal(body.model, 'gpt-live-1-2026-09-11');
    });
  });

  it('mints the backend the browser picked, and ignores one it should not', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const picked = await request('/api/session', post({ sdp: 'v=0 offer', backendModel: 'gpt-5.6-luna' }));
      assert.equal(picked.body.backendModel, 'gpt-5.6-luna');

      const bogus = await request('/api/session', post({ sdp: 'v=0 offer', backendModel: 'whisper-1-realtime' }));
      assert.equal(bogus.body.backendModel, 'gpt-5.6-terra');
    });
  });

  it('rejects an empty body before creating a billable session', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const { status, body } = await request('/api/session', { method: 'POST' });
      assert.equal(status, 400);
      assert.match(body.error, /SDP/);
      assert.equal(stub.requests.length, 0);
    });
  });

  it('rejects a malformed body with a 400', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const { status, body } = await request('/api/session', post('{not json'));
      assert.equal(status, 400);
      assert.equal(body.error, 'malformed request body');
    });
  });

  it('vets the model the browser names, the way it vets the voice', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      for (const model of ['gpt-realtime-translate', 'whisper-1-realtime', 'not-a-model', 42]) {
        const { body } = await request('/api/session', post({ sdp: 'v=0 offer', model }));
        assert.equal(body.model, 'gpt-live-1', `${model} was minted as-is`);
      }

      const ok = await request('/api/session', post({ sdp: 'v=0 offer', model: 'gpt-live-1-2026-09-11' }));
      assert.equal(ok.body.model, 'gpt-live-1-2026-09-11', 'a real realtime id must still pass');
    });
  });

  it('rejects valid JSON that is not an object with a 400, not a 502', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      for (const raw of ['null', '"stone"', '42']) {
        const { status, body } = await request('/api/session', post(raw));
        assert.equal(status, 400, `${raw} should be a 400`);
        assert.equal(body.error, 'malformed request body');
      }
    });
  });

  it('refuses a body far larger than the memory list it is meant to carry', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const { status, body } = await request('/api/session', post({ sdp: 'v=0 offer', model: 'x'.repeat(200_000) }));
      assert.equal(status, 400);
      assert.equal(body.error, 'malformed request body');
      assert.equal(stub.requests.length, 0, 'nothing should have been minted');
    });
  });

  // An oversized body has to be read to the end before it can be answered, or
  // the client is left writing into a socket nobody drains and the request hangs
  // rather than failing. This one is big enough to outrun the socket buffer.
  it('answers an oversized body instead of stalling on the rest of it', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      const started = Date.now();
      const { status } = await request('/api/session', post({ sdp: 'v=0 offer', model: 'x'.repeat(2_000_000) }));
      assert.equal(status, 400);
      assert.ok(Date.now() - started < 10_000, 'it should fail fast, not hang');
    });
  });
});

describe('routing', () => {
  it('answers /api/* with a 500 when the key is missing, before calling anyone', async () => {
    const { stub } = await api();
    after(() => stub.close());

    const keyless = createApiMiddleware(loadConfig({ OPENAI_BASE_URL: stub.baseUrl }));
    await withServer(keyless, async (request) => {
      const { status, body } = await request('/api/models');
      assert.equal(status, 500);
      assert.match(body.error, /OPENAI_API_KEY/);
      assert.equal(stub.requests.length, 0);
    });
  });

  it('404s an unknown /api route rather than falling through to static', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    await withServer(middleware, async (request) => {
      assert.equal((await request('/api/nope')).status, 404);
      assert.equal((await request('/api/models', { method: 'POST' })).status, 404);
      assert.equal((await request('/api/session')).status, 404);
    });
  });

  it('passes anything outside /api/ down the chain', async () => {
    const { stub, middleware } = await api();
    after(() => stub.close());

    const sentinel = (req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('fell through');
    };

    await withServer([middleware, sentinel], async (request) => {
      assert.equal((await request('/')).body, 'fell through');
      assert.equal((await request('/assets/index.js')).body, 'fell through');
    });
  });
});
