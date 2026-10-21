import test from 'node:test';
import assert from 'node:assert/strict';
import { getCachedComposerMarkdown, scheduleComposerNotification, cancelComposerNotification } from '../src/react/composer-input/composerMarkdown.ts';

test('document identity shares serialization across notification and immediate send reads', () => {
  let serializations = 0;
  const editor = { state: { doc: {} }, getMarkdown: () => `draft-${++serializations}` };
  assert.equal(getCachedComposerMarkdown(editor), 'draft-1');
  assert.equal(getCachedComposerMarkdown(editor), 'draft-1');
  editor.state.doc = {};
  assert.equal(getCachedComposerMarkdown(editor), 'draft-2');
  assert.equal(serializations, 2);
});

test('frame notifications coalesce and cancellation/destroy suppress stale work', () => {
  const originalRaf = globalThis.requestAnimationFrame, originalCancel = globalThis.cancelAnimationFrame;
  const frames = new Map();
  let next = 0, calls = 0;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = (id) => frames.delete(id);
  const editor = { isDestroyed: false };
  const flush = () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((callback) => callback()); };
  try {
    scheduleComposerNotification(editor, () => { calls += 100; });
    scheduleComposerNotification(editor, () => { calls += 1; });
    flush();
    assert.equal(calls, 1);
    scheduleComposerNotification(editor, () => { calls += 10; });
    cancelComposerNotification(editor);
    flush();
    assert.equal(calls, 1);
    scheduleComposerNotification(editor, () => { calls += 10; });
    editor.isDestroyed = true;
    flush();
    assert.equal(calls, 1);
  } finally { globalThis.requestAnimationFrame = originalRaf; globalThis.cancelAnimationFrame = originalCancel; }
});
