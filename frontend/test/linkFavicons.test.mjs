import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createLinkFavicon, decorateExternalLinks } from '../src/ui/linkFavicons.js';

test('external answer links receive the linked domain favicon first', () => {
  const dom = new JSDOM('<div class="msg-body"><p><a href="https://www.anthropic.com/research">Anthropic</a></p></div>', {
    url: 'https://socrates.test/',
  });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  decorateExternalLinks(dom.window.document);
  const link = dom.window.document.querySelector('a');
  const favicon = link.firstElementChild;
  assert.equal(favicon.classList.contains('site-link-favicon'), true);
  assert.equal(favicon.getAttribute('src'), 'https://www.anthropic.com/favicon.ico');
  assert.equal(link.dataset.faviconDecorated, '1');

  decorateExternalLinks(dom.window.document);
  assert.equal(link.querySelectorAll('.site-link-favicon').length, 1);
});

test('favicon creation rejects non-http links', () => {
  const dom = new JSDOM('', { url: 'https://socrates.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  assert.equal(createLinkFavicon('javascript:alert(1)'), null);
});

/* P_perf-local-favicon — the fallback used to be
   https://www.google.com/s2/favicons, which is unreachable from mainland
   China and left the <img> hanging. It must now be a local data URI so a
   failed origin favicon costs no network round trip at all. */
test('favicon fallback is a local data URI, never a remote host', () => {
  const dom = new JSDOM('', { url: 'https://socrates.test/' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;

  const favicon = createLinkFavicon('https://www.anthropic.com/research');
  const fallback = favicon.dataset.fallback;
  assert.equal(fallback.startsWith('data:image/svg+xml'), true);
  assert.equal(/https?:\/\//.test(fallback), false);
  /* The monogram is derived from the hostname, so it still identifies
     the site without asking anyone for it. */
  assert.equal(decodeURIComponent(fallback).includes('>A<'), true);

  const other = createLinkFavicon('https://example.org/a');
  assert.equal(other.dataset.fallback.startsWith('data:image/svg+xml'), true);
  assert.notEqual(other.dataset.fallback, fallback);
});
