import assert from 'node:assert/strict';
import test from 'node:test';
import { useMorePopoverStore } from '../src/sidebar/morePopover.store.ts';

test('More popover owner shares open state and notifies React subscribers', () => {
  useMorePopoverStore.getState().setOpen(false);
  let notifications = 0;
  const unsubscribe = useMorePopoverStore.subscribe(() => { notifications += 1; });
  try {
    useMorePopoverStore.getState().setOpen(true);
    assert.equal(useMorePopoverStore.getState().isOpen, true);
    assert.equal(notifications, 1);
    useMorePopoverStore.getState().toggle();
    assert.equal(useMorePopoverStore.getState().isOpen, false);
    assert.equal(notifications, 2);
  } finally {
    unsubscribe();
    useMorePopoverStore.getState().setOpen(false);
  }
});
