import assert from 'node:assert/strict';
import test from 'node:test';

import { wrapForCanvas } from '../src/render/canvasWrap.ts';

test('chat mode passes through unchanged', () => {
  const html = '<p>Hello</p>';
  assert.equal(wrapForCanvas(html, 'chat', 'write', 'canvas-1'), html);
});

test('undefined mode passes through unchanged', () => {
  const html = '<p>Hello</p>';
  assert.equal(wrapForCanvas(html, '', 'write', 'canvas-1'), html);
});

test('canvas mode wraps with required data attributes', () => {
  const html = '<p>Hello</p>';
  const out = wrapForCanvas(html, 'canvas', 'write', 'canvas-abc');
  assert.match(out, /^<div class="canvas-block"/);
  assert.match(out, /data-output-mode="canvas"/);
  assert.match(out, /data-canvas-extension="write"/);
  assert.match(out, /data-canvas-id="canvas-abc"/);
  assert.ok(out.endsWith('</div>'), 'must close the wrapper');
});

test('extension key is attr-escaped (no quote injection)', () => {
  const out = wrapForCanvas('<p>x</p>', 'canvas', 'evil" onclick="x', 'c1');
  assert.ok(!out.includes('evil" onclick'), 'raw quote must be escaped');
  assert.match(out, /data-canvas-extension="evil&quot; onclick=&quot;x"/);
});

test('canvas id is attr-escaped', () => {
  const out = wrapForCanvas('<p>x</p>', 'canvas', 'write', '"><script>');
  assert.ok(!out.includes('"><script>'), 'raw id must be escaped');
});