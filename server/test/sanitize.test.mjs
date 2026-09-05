// @ts-check
/**
 * Frontend unit tests for the safe-string utilities
 * (escapeHtml, sanitizeUrl, sanitizeUrls, stripChatArtifacts).
 *
 * The backend test suite is configured to pick up `*.test.js` from
 * `server/test/`. This file is in `server/test/` but uses ESM
 * imports against the frontend source — run with:
 *
 *   node --test test/sanitize.test.mjs
 *
 * (or, since `server/package.json` test glob is `test/*.test.js`,
 * rename to `sanitize.test.js` and import via relative path
 * "../frontend/src/util/safe.js").
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { escapeHtml, sanitizeUrl, sanitizeUrls } from '../../frontend/src/util/safe.js';
import { stripChatArtifacts } from '../../frontend/src/util/stripChatArtifacts.js';

describe('safe: escapeHtml', () => {
  test('escapes &, <, >, ", \'', () => {
    assert.equal(escapeHtml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  test('handles null / undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  test('does not double-escape entities', () => {
    // The escape is a one-pass replace; "&amp;" is intentionally
    // not preserved (it would otherwise become &amp;amp;).
    assert.equal(escapeHtml('&amp;'), '&amp;amp;');
  });
});

describe('safe: sanitizeUrl', () => {
  test('allows http / https / mailto / tel', () => {
    assert.equal(sanitizeUrl('https://example.com/a'), 'https://example.com/a');
    assert.equal(sanitizeUrl('http://example.com'), 'http://example.com');
    assert.equal(sanitizeUrl('mailto:a@b.com'), 'mailto:a@b.com');
    assert.equal(sanitizeUrl('tel:+15555550100'), 'tel:+15555550100');
  });

  test('allows relative URLs', () => {
    assert.equal(sanitizeUrl('/path/to/x'), '/path/to/x');
    assert.equal(sanitizeUrl('#section'), '#section');
    assert.equal(sanitizeUrl('?q=1'), '?q=1');
  });

  test('rejects javascript:', () => {
    assert.equal(sanitizeUrl('javascript:alert(1)'), '#');
    assert.equal(sanitizeUrl('  JavaScript:alert(1)'), '#');
    assert.equal(sanitizeUrl('java\nscript:alert(1)'), '#');
  });

  test('rejects data:text/html', () => {
    assert.equal(sanitizeUrl('data:text/html,<script>alert(1)</script>'), '#');
    assert.equal(sanitizeUrl('data:  text/html;base64,xxx'), '#');
  });

  test('rejects vbscript:', () => {
    assert.equal(sanitizeUrl('vbscript:msgbox(1)'), '#');
  });

  test('rejects unknown / dangerous protocols', () => {
    // F4 hardening: the allowlist is now explicit (http/https/mailto/
    // tel/blob/relative + raster data: images). file:/filesystem: have
    // no legitimate use in browser-rendered chat output and are blocked
    // (previously file: passed through the catch-all scheme pattern).
    assert.equal(sanitizeUrl('file:///etc/passwd'), '#');
    assert.equal(sanitizeUrl('filesystem:https://x/y'), '#');
    assert.equal(sanitizeUrl('data:image/svg+xml;base64,PHNjcmlwdA=='), '#');
    // And the relative check requires no scheme at all, so a digit-led
    // scheme is rejected (but doesn't have any practical attack vector).
    assert.equal(sanitizeUrl('1nvalid:foo'), '#');
  });
});

describe('safe: sanitizeUrls (HTML pass)', () => {
  test('rewrites javascript: in href', () => {
    const html = '<a href="javascript:alert(1)">click</a>';
    assert.equal(sanitizeUrls(html), '<a href="#">click</a>');
  });

  test('rewrites javascript: in src', () => {
    const html = '<img src="javascript:alert(1)">';
    assert.equal(sanitizeUrls(html), '<img src="#">');
  });

  test('leaves http(s) alone', () => {
    const html = '<a href="https://example.com">x</a>';
    assert.equal(sanitizeUrls(html), html);
  });

  test('handles single-quoted attributes', () => {
    const html = "<a href='javascript:alert(1)'>x</a>";
    assert.equal(sanitizeUrls(html), "<a href='#'>x</a>");
  });

  test('handles multiple attributes in one tag', () => {
    const html = '<a href="javascript:1" data-x="y">x</a>';
    // data-x isn't in the regex's attribute list, so it stays untouched.
    assert.equal(sanitizeUrls(html), '<a href="#" data-x="y">x</a>');
  });
});

describe('safe: stripChatArtifacts', () => {
  test('removes <|im_start|>...<|im_end|> blocks', () => {
    const t = 'before <|im_start|>system\nsecret<|im_end|> after';
    assert.equal(stripChatArtifacts(t), 'before  after');
  });

  test('removes standalone chat-template tokens', () => {
    assert.equal(stripChatArtifacts('hello <|endoftext|> world'), 'hello  world');
    assert.equal(stripChatArtifacts('<|im_start|>'), '');
  });

  test('removes Llama 1 boundary tokens', () => {
    assert.equal(stripChatArtifacts('a <s> b </s> c'), 'a  b  c');
  });

  test('removes Llama 2 markers', () => {
    assert.equal(stripChatArtifacts('[INST]hi[/INST]'), 'hi');
    assert.equal(stripChatArtifacts('<<SYS>>rules<</SYS>>'), 'rules');
  });

  test('collapses 3+ newlines to 2', () => {
    const t = 'a\n\n\n\nb';
    assert.equal(stripChatArtifacts(t), 'a\n\nb');
  });

  test('returns the input unchanged when no artifacts present', () => {
    const t = 'plain text\nwith newlines';
    assert.equal(stripChatArtifacts(t), t);
  });

  test('handles empty / null', () => {
    assert.equal(stripChatArtifacts(''), '');
    assert.equal(stripChatArtifacts(null), null);
    assert.equal(stripChatArtifacts(undefined), undefined);
  });
});
