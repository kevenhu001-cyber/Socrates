import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildUserCodexProviderConfig,
  sessionWorkspaceKey,
} from '../src/services/codexProvider.js';

test('Codex user provider config points at the provider it defines', () => {
  const config = buildUserCodexProviderConfig('https://llm.example.test/v1', 'test-token');

  assert.equal(config.model_provider, 'socrates');
  assert.equal(config['model_providers.socrates.base_url'], 'https://llm.example.test/v1');
  assert.equal(config['model_providers.socrates.experimental_bearer_token'], 'test-token');
});

test('session workspace keys are stable and distinct from project keys', () => {
  assert.equal(sessionWorkspaceKey('11111111-1111-4111-8111-111111111111'), 'session:11111111-1111-4111-8111-111111111111');
  assert.notEqual(
    sessionWorkspaceKey('11111111-1111-4111-8111-111111111111'),
    sessionWorkspaceKey('22222222-2222-4222-8222-222222222222'),
  );
});
