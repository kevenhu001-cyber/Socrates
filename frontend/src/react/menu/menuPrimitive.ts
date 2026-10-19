export const MENU_EDGE_GUTTER = 6;
export const MENU_ANCHOR_GAP = 4;
export const MENU_PHONE_BREAKPOINT = 768;
export const MENU_PHONE_SPILL_OFFSET = 8;
export const MENU_EXIT_MS = 120;

export type MenuPlacement = 'above' | 'below';
export type MenuAlignment = 'start' | 'end';
export type MenuNavigationKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End';

export type RectLike = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom'>;

export interface AnchoredMenuLayoutInput {
  anchorRect: RectLike;
  menuWidth: number;
  menuHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  above?: boolean;
  spill?: boolean;
}

export interface AnchoredMenuLayout {
  left: number;
  top: number;
  placement: MenuPlacement;
  align: MenuAlignment;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

/**
 * Geometry-only adapter for anchored menus. Keeping viewport collision math
 * outside React makes the current implementation easy to test and gives a
 * single seam for a future Base UI positioning primitive.
 */
export function computeAnchoredMenuLayout({
  anchorRect,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  above = false,
  spill = false,
}: AnchoredMenuLayoutInput): AnchoredMenuLayout {
  const phoneSpill = spill && viewportWidth <= MENU_PHONE_BREAKPOINT;
  const maxLeft = Math.max(MENU_EDGE_GUTTER, viewportWidth - menuWidth - MENU_EDGE_GUTTER);
  const maxTop = Math.max(MENU_EDGE_GUTTER, viewportHeight - menuHeight - MENU_EDGE_GUTTER);

  const desiredLeft = phoneSpill
    ? anchorRect.left - MENU_PHONE_SPILL_OFFSET
    : anchorRect.right - menuWidth;
  const desiredTop = above
    ? anchorRect.top - menuHeight - MENU_EDGE_GUTTER
    : anchorRect.bottom + (phoneSpill ? -MENU_ANCHOR_GAP : MENU_ANCHOR_GAP);

  return {
    left: clamp(desiredLeft, MENU_EDGE_GUTTER, maxLeft),
    top: clamp(desiredTop, MENU_EDGE_GUTTER, maxTop),
    placement: above ? 'above' : 'below',
    align: phoneSpill ? 'start' : 'end',
  };
}

/** Pure roving-focus index calculation shared by the current adapter and a
 * future headless menu implementation. */
export function getNextMenuItemIndex(
  activeIndex: number,
  itemCount: number,
  key: MenuNavigationKey,
): number {
  if (itemCount <= 0) return -1;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;

  const normalizedIndex = activeIndex >= 0 && activeIndex < itemCount
    ? activeIndex
    : key === 'ArrowUp' ? 0 : -1;
  const delta = key === 'ArrowUp' ? -1 : 1;
  return (normalizedIndex + delta + itemCount) % itemCount;
}

export const ENABLED_MENU_ITEM_SELECTOR = [
  '[role="menuitem"]:not([aria-disabled="true"]):not(:disabled)',
  '[role="menuitemcheckbox"]:not([aria-disabled="true"]):not(:disabled)',
  '[role="menuitemradio"]:not([aria-disabled="true"]):not(:disabled)',
].join(',');
