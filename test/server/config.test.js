import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KNOWN_VOICES, loadConfig } from '../../src/server/config.js';

describe('loadConfig', () => {
  it('falls back to the published defaults on an empty environment', () => {
    const config = loadConfig({});
    assert.equal(config.port, 5173);
    assert.equal(config.baseUrl, 'https://api.openai.com/v1');
    assert.equal(config.defaultModel, 'gpt-live-1');
    assert.equal(config.defaultVoice, 'ripple');
    assert.deepEqual(config.voices, [...KNOWN_VOICES]);
    assert.equal(config.apiKey, undefined);
  });

  it('reads every override', () => {
    const config = loadConfig({
      PORT: '8080',
      OPENAI_BASE_URL: 'https://gateway.example/v1',
      OPENAI_API_KEY: 'sk-test',
      OPENAI_LIVE_MODEL: 'gpt-live-1-2026-09-11',
      OPENAI_VOICE: 'stone',
    });
    assert.equal(config.port, 8080);
    assert.equal(config.baseUrl, 'https://gateway.example/v1');
    assert.equal(config.apiKey, 'sk-test');
    assert.equal(config.defaultModel, 'gpt-live-1-2026-09-11');
    assert.equal(config.defaultVoice, 'stone');
  });

  it('puts an unrecognised voice at the front of the picker rather than dropping it', () => {
    const { voices, defaultVoice } = loadConfig({ OPENAI_VOICE: 'unreleased' });
    assert.equal(defaultVoice, 'unreleased');
    assert.equal(voices[0], 'unreleased');
    assert.deepEqual(voices.slice(1), [...KNOWN_VOICES]);
  });

  it('does not duplicate a known voice that is also the default', () => {
    const { voices } = loadConfig({ OPENAI_VOICE: 'stone' });
    assert.equal(voices.filter((v) => v === 'stone').length, 1);
  });

  it('ignores a non-numeric PORT instead of listening on NaN', () => {
    assert.equal(loadConfig({ PORT: 'nonsense' }).port, 5173);
  });
});
