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
