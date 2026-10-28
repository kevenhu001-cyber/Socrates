import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div class="msg-body"><pre><code>&lt;main&gt;hello&lt;/main&gt;</code></pre></div></body></html>');
globalThis.document = dom.window.document;
globalThis.window = dom.window;

const { wireCodeBlockHeaders } = await import('../src/render/postRender.ts');

test('code block headers infer markup and remain idempotent', () => {
  const body = document.querySelector('.msg-body');
  wireCodeBlockHeaders(body);

  const pre = body.querySelector('pre');
  const header = body.querySelector('.code-block-header');
  assert.equal(header.nextElementSibling, pre);
  assert.equal(header.querySelector('.code-block-header-lang').textContent, 'html');
  assert.equal(header.querySelector('.code-block-expand').getAttribute('aria-label'), 'Expand code');

  wireCodeBlockHeaders(body);
  assert.equal(body.querySelectorAll('.code-block-header').length, 1);
});

test('tool and visualization artifacts do not receive code headers', () => {
  const body = document.createElement('div');
  body.className = 'msg-body';
  body.innerHTML = '<div class="exec-artifact"><pre><code>const x = 1;</code></pre></div>' +
    '<div class="viz"><pre><code>const y = 2;</code></pre></div>';
  wireCodeBlockHeaders(body);
  assert.equal(body.querySelectorAll('.code-block-header').length, 0);
});
