import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinkPreviewItems } from '../src/ui/linkPreviews.ts';

test('link preview model preserves fetched status while keeping provider copy as text', () => {
  const items = buildLinkPreviewItems(['https://www.example.com/article', 'https://example.org'], [
    {
      ok: true,
      title: '<script>alert(1)</script>',
      content: 'x'.repeat(230),
      truncated: true,
      chars: 230,
    },
    { ok: false, reason: '<img src=x onerror=alert(1)>' },
  ]);

  assert.deepEqual(items, [
    {
      url: 'https://www.example.com/article',
      host: 'example.com',
      title: '<script>alert(1)</script>',
      excerpt: `${'x'.repeat(217)}…`,
      status: 'excerpt · 230 chars',
      failed: false,
    },
    {
      url: 'https://example.org',
      host: 'example.org',
      title: 'https://example.org',
      excerpt: '',
      status: '<img src=x onerror=alert(1)>',
      failed: true,
    },
  ]);
});

test('link preview model rejects executable URLs and handles empty lists', () => {
  const items = buildLinkPreviewItems(['javascript:alert(1)']);
  assert.equal(items[0].url, '#');
  assert.equal(items[0].host, '#');
  assert.deepEqual(buildLinkPreviewItems([]), []);
});
