import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldSubmitComposerKey } from './composerKeyboard.ts';

test('desktop Enter submits, Shift+Enter inserts a newline', () => {
  assert.equal(shouldSubmitComposerKey({ key: 'Enter' }, true), true);
  assert.equal(shouldSubmitComposerKey({ key: 'Enter', shiftKey: true }, true), false);
  assert.equal(shouldSubmitComposerKey({ key: 'a' }, true), false);
});
test('IME candidate confirmation never submits, including legacy keyCode 229', () => {
  assert.equal(shouldSubmitComposerKey({ key: 'Enter', isComposing: true }, true), false);
  assert.equal(shouldSubmitComposerKey({ key: 'Enter', keyCode: 229 }, true), false);
});
test('native and mobile multiline inputs retain their return key', () => {
  assert.equal(shouldSubmitComposerKey({ key: 'Enter' }, false), false);
});
