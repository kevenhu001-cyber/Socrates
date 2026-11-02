import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONVERSATION_ROW_DRAG_OPACITY, conversationRowPaint, isRowActivationKey } from './conversationRowModel.ts';

const palette = { card: '#fff', fill: 'rgba(0, 0, 0, 0.04)', hairline: 'rgba(0, 0, 0, 0.08)' };
const rest = { active: false, hovered: false, menuOpen: false, dragging: false };

test('a resting row sets no paint, so host CSS keeps focus and press states', () => {
  assert.equal(conversationRowPaint(rest, palette), null);
});

test('the current chat is a white card with a hairline ring, even under the pointer', () => {
  assert.deepEqual(conversationRowPaint({ ...rest, active: true }, palette), { backgroundColor: '#fff', boxShadow: '0 0 0 1px rgba(0, 0, 0, 0.08)' });
  assert.deepEqual(
    conversationRowPaint({ ...rest, active: true, hovered: true }, palette, 'var(--ui-elevation-raised)'),
    { backgroundColor: '#fff', boxShadow: 'var(--ui-elevation-raised)' },
  );
});

test('hover and an open menu take the 4% fill', () => {
  assert.deepEqual(conversationRowPaint({ ...rest, hovered: true }, palette), { backgroundColor: palette.fill });
  assert.deepEqual(conversationRowPaint({ ...rest, menuOpen: true }, palette), { backgroundColor: palette.fill });
});

test('the drag source fades without losing its selected card', () => {
  assert.deepEqual(conversationRowPaint({ ...rest, dragging: true }, palette), { opacity: CONVERSATION_ROW_DRAG_OPACITY });
  assert.equal(conversationRowPaint({ ...rest, active: true, dragging: true }, palette)?.backgroundColor, '#fff');
});

test('only Enter or Space on the row itself opens the chat, and never while renaming', () => {
  assert.equal(isRowActivationKey('Enter', true, false), true);
  assert.equal(isRowActivationKey(' ', true, false), true);
  assert.equal(isRowActivationKey('Enter', false, false), false);
  assert.equal(isRowActivationKey('Enter', true, true), false);
  assert.equal(isRowActivationKey('a', true, false), false);
});
