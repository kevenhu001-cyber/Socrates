export const MENU_EDGE_GUTTER = 6;
export const MENU_ANCHOR_GAP = 4;
export const MENU_PHONE_BREAKPOINT = 768;
export const MENU_PHONE_SPILL_OFFSET = 8;

export const ENABLED_MENU_ITEM_SELECTOR = [
  '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)',
  '[role="menuitemcheckbox"]:not([aria-disabled="true"]):not(:disabled)',
  '[role="menuitemradio"]:not([aria-disabled="true"]):not(:disabled)',
].join(',');
