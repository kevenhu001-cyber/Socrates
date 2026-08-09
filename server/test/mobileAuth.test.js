import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  EMBEDDED_TARGETS,
  createMobileAccessToken,
  getEmbeddedTargetFromWebSessionToken,
  isEmbeddedTarget,
  parseMobileAccessToken,
} from '../src/lib/mobileAuth.js';

describe('mobile web-session contract', () => {
  test('accepts only the first-party embedded target allow-list', () => {
    assert.deepEqual(EMBEDDED_TARGETS, [
      'projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'skills', 'api-settings',
    ]);
    assert.equal(isEmbeddedTarget('projects'), true);
    assert.equal(isEmbeddedTarget('api-settings'), true);
    assert.equal(isEmbeddedTarget('https://evil.example'), false);
    assert.equal(isEmbeddedTarget('../projects'), false);
    assert.equal(isEmbeddedTarget(null), false);
  });

  test('binds the embedded target to the opaque handoff token', () => {
    const token = 'mws1.knowledge.' + 'a'.repeat(64);
    assert.equal(getEmbeddedTargetFromWebSessionToken(token), 'knowledge');
    assert.equal(getEmbeddedTargetFromWebSessionToken('mws1.projects.' + 'b'.repeat(64)), 'projects');
    assert.equal(getEmbeddedTargetFromWebSessionToken('mws1.https://evil.example.' + 'c'.repeat(64)), null);
    assert.equal(getEmbeddedTargetFromWebSessionToken('sid123'), null);
  });
});

describe('mobile bearer access token', () => {
  test('round-trips valid tokens and rejects tampering/expiry', () => {
    const now = 1_700_000_000_000;
    const token = createMobileAccessToken('user-123', now);
    assert.deepEqual(parseMobileAccessToken(token, now + 1), {
      sub: 'user-123', aud: 'mobile', exp: now + 15 * 60 * 1000,
    });
    assert.equal(parseMobileAccessToken(token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'), now), null);
    assert.equal(parseMobileAccessToken(token, now + 15 * 60 * 1000), null);
  });
});
