import assert from 'node:assert/strict';
import test from 'node:test';

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.CustomEvent = dom.window.CustomEvent;
globalThis.HTMLElement = dom.window.HTMLElement;

import {
  createInlineToolRow,
  settleInlineToolRow,
  settleInlineToolGroupRow,
} from '../src/ui/toolInline.ts';

test('single Write row settles without a file summary card', () => {
  const row = createInlineToolRow({ id: 'w1', name: 'Write', input: { file_path: '/a.js' } });
  settleInlineToolRow(row, { ok: true, durationMs: 1200 });
  assert.equal(row.dataset.state, 'done');
  assert.equal(row.querySelector('.tool-inline-file-summary'), null);
});

test('settled write group stays a single summary row without a nested file card', () => {
  const row = createInlineToolRow({ id: 'g1', name: 'Write', input: { file_path: '/a.js' } });
  settleInlineToolGroupRow(row, [
    { id: 'g1', name: 'Write', input: { file_path: '/a.js' }, result: { ok: true } },
    { id: 'g2', name: 'Edit', input: { file_path: '/b.js' }, result: { ok: true } },
    { id: 'g3', name: 'Write', input: { file_path: '/a.js' }, result: { ok: true } },
  ]);
  assert.equal(row.dataset.state, 'done');
  assert.equal(row.querySelector('.tool-inline-file-summary'), null);
});

test('failed write group does not get a summary card', () => {
  const row = createInlineToolRow({ id: 'e1', name: 'Edit', input: { file_path: '/a.js' } });
  settleInlineToolGroupRow(row, [
    { id: 'e1', name: 'Write', input: { file_path: '/a.js' }, result: { ok: true } },
    { id: 'e2', name: 'Edit', input: { file_path: '/b.js' }, failed: true, result: { ok: false } },
  ]);
  assert.equal(row.dataset.state, 'error');
  assert.equal(row.querySelector('.tool-inline-file-summary'), null);
});

test('settled row reveals the elapsed meta chip when a duration exists', () => {
  const row = createInlineToolRow({ id: 'm1', name: 'Read', input: { file_path: '/x.js' } });
  settleInlineToolRow(row, { ok: true, durationMs: 3400 });
  const meta = row.querySelector('.tool-inline-meta');
  assert.ok(meta.classList.contains('is-visible'), 'expected the meta chip to be visible after settle');
  assert.match(meta.textContent, /3\.4s/);
});
