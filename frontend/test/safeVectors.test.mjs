import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeUrl, sanitizeUrls, escapeHtml } from '../src/util/safe.js';

describe('safe.js URL sanitization (F4 attack vectors)', () => {
  it('blocks javascript:/vbscript: with case/whitespace tricks', () => {
    assert.equal(sanitizeUrl('javascript:alert(1)'), '#');
    assert.equal(sanitizeUrl('  JaVaScRiPt:alert(1)'), '#');
    assert.equal(sanitizeUrl('vbscript:msgbox(1)'), '#');
  });

  it('blocks data:text/html and data:image/svg+xml', () => {
    assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');
    assert.equal(sanitizeUrl('data:image/svg+xml;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), '#');
    assert.equal(sanitizeUrl('data:application/xhtml+xml,<p>x</p>'), '#');
  });

  it('allows safe schemes and relative URLs', () => {
    assert.equal(sanitizeUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(sanitizeUrl('/api/files/123'), '/api/files/123');
    assert.equal(sanitizeUrl('#section'), '#section');
    assert.equal(sanitizeUrl('blob:https://app/uuid'), 'blob:https://app/uuid');
    assert.equal(sanitizeUrl('mailto:a@b.c'), 'mailto:a@b.c');
  });

  it('allows raster data-images, blocks non-base64', () => {
    assert.equal(sanitizeUrl('data:image/png;base64,iVBORw0KGgo='), 'data:image/png;base64,iVBORw0KGgo=');
    assert.equal(sanitizeUrl('data:image/png noto-a-real-image'), '#');
  });

  it('sanitizeUrls rewrites quoted and unquoted attributes', () => {
    assert.match(sanitizeUrls('<a href="javascript:alert(1)">x</a>'), /href="#"/);
    assert.match(sanitizeUrls("<img src='javascript:alert(1)'>"), /src=['"]#['"]/);
    assert.match(sanitizeUrls('<a href=javascript:alert(1)>x</a>'), /href=['"]#['"]/);
    assert.match(sanitizeUrls('<a href="https://ok.example/">x</a>'), /https:\/\/ok\.example/);
  });

  it('escapeHtml neutralizes tag breakouts', () => {
    assert.equal(escapeHtml('</script><script>alert(1)</script>'), '&lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });
});
