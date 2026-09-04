// @ts-check
/**
 * Unit tests for services/embedding.ts + routes/embeddingConfig.ts —
 * the vector layer of the session_chunks hybrid retrieval.
 *
 * Pure part: `isAllowedEmbeddingUrl` (the SSRF guard). Mirrors the
 * apiKeys.ts provider-URL posture, so the cases pin the same
 * private / loopback / link-local / userinfo rejections.
 *
 * Pure part 2: `adminEmails` semantics are pinned by the route test
 * (no ADMIN_EMAILS → the endpoint is closed) but the env read is
 * exercised via an import-time snapshot to avoid polluting other
 * suites.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedEmbeddingUrl } from '../src/services/embedding.js';

describe('embedding.isAllowedEmbeddingUrl — SSRF guard', () => {
  test('accepts a canonical public https endpoint', () => {
    assert.equal(isAllowedEmbeddingUrl('https://api.openai.com/v1'), true);
    assert.equal(isAllowedEmbeddingUrl('https://api.minimax.chat/v1'), true);
    assert.equal(isAllowedEmbeddingUrl('https://embedding.corp.example.com/v1'), true);
  });

  test('rejects non-https schemes', () => {
    assert.equal(isAllowedEmbeddingUrl('http://api.openai.com/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('ftp://api.openai.com/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('file:///etc/passwd'), false);
    assert.equal(isAllowedEmbeddingUrl('javascript:alert(1)'), false);
  });

  test('rejects localhost equivalents', () => {
    assert.equal(isAllowedEmbeddingUrl('https://localhost/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://sub.localhost/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://api.local/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://127.0.0.1/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://[::1]/v1'), false);
  });

  test('rejects RFC1918 private ranges', () => {
    assert.equal(isAllowedEmbeddingUrl('https://10.0.0.1/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://172.16.0.1/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://172.31.255.255/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://192.168.1.1/v1'), false);
  });

  test('rejects link-local and carrier-grade NAT', () => {
    assert.equal(isAllowedEmbeddingUrl('https://169.254.169.254/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://100.64.0.1/v1'), false);
  });

  test('rejects userinfo / fragment smuggling', () => {
    assert.equal(isAllowedEmbeddingUrl('https://user:pass@api.openai.com/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('https://api.openai.com/v1#fragment'), false);
  });

  test('rejects malformed / oversized input', () => {
    assert.equal(isAllowedEmbeddingUrl(null), false);
    assert.equal(isAllowedEmbeddingUrl(undefined), false);
    assert.equal(isAllowedEmbeddingUrl(42), false);
    assert.equal(isAllowedEmbeddingUrl(''), false);
    assert.equal(isAllowedEmbeddingUrl('https://' + 'a'.repeat(2100) + '/v1'), false);
    assert.equal(isAllowedEmbeddingUrl('not a url'), false);
  });

  test('accepts public IPs outside private ranges', () => {
    assert.equal(isAllowedEmbeddingUrl('https://8.8.8.8/v1'), true);
    assert.equal(isAllowedEmbeddingUrl('https://1.1.1.1/v1'), true);
  });
});
