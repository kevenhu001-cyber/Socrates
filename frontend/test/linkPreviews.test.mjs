import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderLinkPreviews } from '../src/ui/linkPreviews.ts';

test('link previews preserve fetched status and escape untrusted text', () => {
  const dom = new JSDOM('', { url: 'https://socrates.test/' });
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;

  try {
    const target = document.createElement('div');
    renderLinkPreviews(target, ['https://www.example.com/article', 'https://example.org'], [
      {
        ok: true,
        title: '<script>alert(1)</script>',
        content: 'x'.repeat(230),
        truncated: true,
        chars: 230,
      },
      { ok: false, reason: '<img src=x onerror=alert(1)>' },
    ]);

    const cards = target.querySelectorAll('.link-card');
    assert.equal(cards.length, 2);
    assert.equal(cards[0].classList.contains('ok'), true);
    assert.equal(cards[0].querySelector('.link-card-host').textContent.trim(), 'example.com');
    assert.equal(cards[0].querySelector('.link-card-title').textContent, '<script>alert(1)</script>');
    assert.equal(cards[0].querySelector('.link-card-title').querySelector('script'), null);
    assert.equal(cards[0].querySelector('.link-card-status').textContent, 'excerpt · 230 chars');
    assert.equal(cards[0].querySelector('.link-card-excerpt').textContent, `${'x'.repeat(217)}…`);
    assert.equal(cards[1].classList.contains('err'), true);
    assert.equal(cards[1].querySelector('.link-card-status').textContent.trim(), '<img src=x onerror=alert(1)>');
    assert.equal(cards[1].querySelector('.link-card-status').querySelector('img'), null);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});

test('link preview renderer leaves the target untouched without URLs', () => {
  const dom = new JSDOM('', { url: 'https://socrates.test/' });
  const previousDocument = globalThis.document;
  globalThis.document = dom.window.document;

  try {
    const target = document.createElement('div');
    renderLinkPreviews(target, [], []);
    assert.equal(target.childElementCount, 0);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});
