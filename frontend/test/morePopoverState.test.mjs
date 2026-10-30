import assert from 'node:assert/strict';
import test from 'node:test';

const { morePopoverState, publishMorePopoverState } = await import('../src/ui/morePopoverState.ts');

test('More popover publisher shares open state and notifies React subscribers', () => {
  morePopoverState.__resetForTests();
  let notifications = 0;
  const unsubscribe = morePopoverState.subscribe(() => { notifications += 1; });

  publishMorePopoverState(true);
  morePopoverState.flush();
  assert.equal(morePopoverState.getSnapshot().isOpen, true);
  assert.equal(notifications, 1);

  publishMorePopoverState(false);
  morePopoverState.flush();
  assert.equal(morePopoverState.getSnapshot().isOpen, false);
  assert.equal(notifications, 2);

  unsubscribe();
  morePopoverState.__resetForTests();
});
