// @ts-check
/**
 * Unit tests for src/lib/sanitize.js — the server-side HTML /
 * plain-text / extra-body sanitizers.
 *
 * This module is a security boundary. sanitizeStoredHtml is the
 * LAST line of defense against stored XSS when assistant messages
 * are re-rendered into other users' browsers (e.g. via public
 * share links, or via a future server-side render path). A
 * regression here is a P0.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  sanitizeExtraBody,
  normalizeVisibility,
  sanitizeStoredHtml,
  sanitizePlainText,
} from '../src/lib/sanitize.js';

/* ── sanitizeExtraBody ────────────────────────────────────────── */

describe('sanitizeExtraBody', () => {
  test('returns undefined for non-object input', () => {
    assert.equal(sanitizeExtraBody(null), undefined);
    assert.equal(sanitizeExtraBody(undefined), undefined);
    assert.equal(sanitizeExtraBody('hello'), undefined);
    assert.equal(sanitizeExtraBody(42), undefined);
    assert.equal(sanitizeExtraBody(true), undefined);
  });

  test('returns undefined for arrays (object but not the shape we want)', () => {
    assert.equal(sanitizeExtraBody([]), undefined);
    assert.equal(sanitizeExtraBody(['thinking']), undefined);
  });

  test('drops unknown keys, keeps whitelisted primitives', () => {
    const out = sanitizeExtraBody({
      top_p: 0.9,
      temperature: 0.7,           // not whitelisted
      thinking: { type: 'enabled' }, // nested object
    });
    assert.deepEqual(out, { top_p: 0.9, thinking: { type: 'enabled' } });
  });

  test('refuses to smuggle disallowed top-level keys', () => {
    const out = sanitizeExtraBody({
      tools: [{ type: 'function' }],
      api_key: 'sk-...',
      messages: [{ role: 'system' }],
      top_p: 0.5,
    });
    assert.equal(out.tools, undefined, 'tools must NOT be forwarded');
    assert.equal(out.api_key, undefined, 'api_key must NOT be forwarded');
    assert.equal(out.messages, undefined, 'messages must NOT be forwarded');
    assert.equal(out.top_p, 0.5);
  });

  test('drops nested objects whose values include non-primitives', () => {
    const out = sanitizeExtraBody({
      thinking: { type: 'enabled', callback: () => 1 }, // function value
      top_p: 0.5,
    });
    // The whole `thinking` entry is dropped because its values aren't
    // all primitives — defense against injecting callable objects.
    assert.deepEqual(out, { top_p: 0.5 });
  });

  test('accepts primitive arrays for whitelisted keys', () => {
    const out = sanitizeExtraBody({
      stop: ['\n', '###'],
      logit_bias: { '50256': -100 },
    });
    assert.deepEqual(out.stop, ['\n', '###']);
    assert.deepEqual(out.logit_bias, { '50256': -100 });
  });

  test('returns undefined when nothing remains after filtering', () => {
    const out = sanitizeExtraBody({ totally: 'unknown', also: ['bad'] });
    assert.equal(out, undefined);
  });

  test('does not mutate the input object', () => {
    const input = { top_p: 0.5, smuggled: 'dropped' };
    const snapshot = JSON.stringify(input);
    sanitizeExtraBody(input);
    assert.equal(JSON.stringify(input), snapshot);
  });
});

/* ── normalizeVisibility ──────────────────────────────────────── */

describe('normalizeVisibility', () => {
  test('returns known values verbatim', () => {
    assert.equal(normalizeVisibility('public'), 'public');
    assert.equal(normalizeVisibility('unlisted'), 'unlisted');
    assert.equal(normalizeVisibility('private'), 'private');
  });

  test('silently falls back to "unlisted" for the deprecated "link" value', () => {
    // Legacy clients still send "link" — they should not see a
    // 4xx error; we coerce quietly.
    assert.equal(normalizeVisibility('link'), 'unlisted');
  });

  test('silently falls back to "unlisted" for anything else', () => {
    assert.equal(normalizeVisibility(''), 'unlisted');
    assert.equal(normalizeVisibility('PUBLIC'), 'unlisted', 'case-sensitive');
    assert.equal(normalizeVisibility('public; DROP TABLE shares; --'), 'unlisted');
    assert.equal(normalizeVisibility(null), 'unlisted');
    assert.equal(normalizeVisibility(undefined), 'unlisted');
    assert.equal(normalizeVisibility(42), 'unlisted');
    assert.equal(normalizeVisibility({}), 'unlisted');
  });
});

/* ── sanitizeStoredHtml ───────────────────────────────────────── */

describe('sanitizeStoredHtml', () => {
  test('coerces non-string to empty string (no object leakage)', () => {
    assert.equal(sanitizeStoredHtml(null), '');
    assert.equal(sanitizeStoredHtml(undefined), '');
    assert.equal(sanitizeStoredHtml(42), '');
    assert.equal(sanitizeStoredHtml({ evil: '<script>' }), '');
    assert.equal(sanitizeStoredHtml([]), '');
  });

  test('empty string passes through as empty string', () => {
    assert.equal(sanitizeStoredHtml(''), '');
  });

  test('strips <script> tags AND their content', () => {
    const out = sanitizeStoredHtml('hi<script>alert(1)</script>bye');
    assert.equal(out.includes('<script'), false);
    assert.equal(out.includes('alert(1)'), false, 'KEEP_CONTENT default is OFF for forbidden tags');
    assert.match(out, /hibye/);
  });

  test('strips <iframe> / <object> / <embed> / <form> tags', () => {
    for (const tag of ['iframe', 'object', 'embed', 'form']) {
      const out = sanitizeStoredHtml(`a<${tag}>x</${tag}>b`);
      assert.equal(out.includes(`<${tag}`), false, `${tag} must be stripped`);
    }
  });

  test('drops inline event handlers (onclick / onerror / onload)', () => {
    const out = sanitizeStoredHtml('<img src="x" onerror="alert(1)">');
    assert.equal(out.includes('onerror'), false);
    assert.equal(out.includes('alert(1)'), false);
  });

  test('blocks javascript: URLs in href', () => {
    const out = sanitizeStoredHtml('<a href="javascript:alert(1)">x</a>');
    assert.equal(out.includes('javascript:'), false);
  });

  test('blocks data: URLs in href (image data URIs are NOT whitelisted here)', () => {
    const out = sanitizeStoredHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>');
    assert.equal(out.includes('data:text/html'), false);
  });

  test('preserves benign markdown output tags', () => {
    const out = sanitizeStoredHtml(
      '<p><strong>hi</strong> <a href="https://example.com">link</a></p>',
    );
    assert.match(out, /<p>/);
    assert.match(out, /<strong>hi<\/strong>/);
    assert.match(out, /href="https:\/\/example\.com"/);
  });

  test('preserves custom Tutor scaffold tags (theorem, proof, key-point, derivation)', () => {
    for (const tag of ['theorem', 'proof', 'key-point', 'derivation']) {
      const out = sanitizeStoredHtml(`<${tag}>body</${tag}>`);
      assert.match(out, new RegExp(`<${tag}[^>]*>body</${tag}>`), `${tag} must survive`);
    }
  });
});

/* ── sanitizePlainText ────────────────────────────────────────── */

describe('sanitizePlainText', () => {
  test('coerces non-string to empty string', () => {
    assert.equal(sanitizePlainText(null), '');
    assert.equal(sanitizePlainText(undefined), '');
    assert.equal(sanitizePlainText(42), '');
  });

  test('strips C0 control chars except newline / carriage return / tab', () => {
    // \x00 (NUL), \x07 (BEL), \x1B (ESC), \x7F (DEL) should all be
    // removed; \n, \r, \t should remain (the sanitizer only strips
    // dangerous control chars — it does NOT collapse whitespace).
    const out = sanitizePlainText('a\x00b\x07c\x1Bd\x7Fe\nf\rg\th');
    assert.equal(out, 'abcde\nf\rg\th');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(sanitizePlainText('  hi  '), 'hi');
    assert.equal(sanitizePlainText('\n\nhi\n\n'), 'hi');
  });

  test('preserves Unicode content untouched', () => {
    const out = sanitizePlainText('你好，世界 🌍');
    assert.equal(out, '你好，世界 🌍');
  });

  test('empty string passes through', () => {
    assert.equal(sanitizePlainText(''), '');
  });

  /* P_share-rawtext — the read-only share view now ships rawText so the
   * front-end can splice inline tool rows at toolCalls[].textOffset. That is
   * only sound while storage is a no-op for the text the model produced:
   * every offset was computed against the un-sanitized string, so a single
   * preserved character means a preserved index. */
  test('leaves the markdown of an assistant turn byte-identical, so recorded offsets stay valid', () => {
    const raw = [
      'Let me look that up.',
      '',
      '## Findings',
      '',
      '- a source with **bold** and `inline code`',
      '- [a link](https://example.test/a)',
      '',
      '| model | params |',
      '| --- | --- |',
      '| 7B | 7e9 |',
      '',
      '```python',
      'def route(x):',
      '\treturn x ** 2',
      '```',
      '',
      'Energy falls off as $E \\propto 1/r^2$.',
    ].join('\n');
    const stored = sanitizePlainText(raw);
    assert.equal(stored, raw);
    assert.equal(stored.length, raw.length);
    // A split point recorded mid-document survives at the same index.
    const offset = raw.indexOf('## Findings');
    assert.ok(offset > 0);
    assert.equal(stored.slice(offset, offset + 11), '## Findings');
  });

  test('the one length-changing case is edge trim, and only for padded text', () => {
    /* A turn whose raw text starts with whitespace loses that prefix, which
     * shifts every offset by the trimmed length — the layout snaps its split
     * points to blank lines, so the shift cannot cut a word, but a caller
     * that needs exact indexes must trim before computing them. */
    const padded = '\n\nLead.\n\nTail.';
    const stored = sanitizePlainText(padded);
    assert.equal(stored, 'Lead.\n\nTail.');
    assert.equal(padded.length - stored.length, 2);
    // Interior structure — the part offsets index — is never rewritten.
    assert.equal(stored.indexOf('\n\nTail.'), 'Lead.'.length);
  });
});