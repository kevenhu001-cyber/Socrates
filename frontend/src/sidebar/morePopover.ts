import { useMorePopoverStore } from './morePopover.store.ts';

/** Actions used by the navigation adapter and typed legacy gateway. */
export function toggleMorePopover(): void {
  useMorePopoverStore.getState().toggle();
}

export function closeMorePopover(): void {
  useMorePopoverStore.getState().setOpen(false);
}
