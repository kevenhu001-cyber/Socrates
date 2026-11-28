import { restingRect } from '../lib/restingRect';

/* 2026-11-26 phone reference: the "+" menu is a floating card that rests just
 * above the question box with 12px side margins, not a full-width bottom
 * sheet. `composerTop` is the box's top edge in the layout viewport; the card
 * keeps an 8px gap above it and never grows past the visible viewport. */
const MOBILE_MENU_MARGIN = 12;
const MOBILE_MENU_GAP = 8;

/** Place the phone list against the composer when possible. If the visual
 * viewport is shortened or panned by a keyboard, use the other edge or a
 * bounded in-viewport overlay rather than producing a zero-height menu. */
export function mobileMenuPlacement(
  viewportTop: number,
  viewportBottom: number,
  anchorTop: number,
  anchorBottom: number,
): { edge: number; maxHeight: number; side: 'sheet' | 'mobile-below' | 'mobile-overlay' } {
  const top = viewportTop + MOBILE_MENU_MARGIN;
  const bottom = Math.max(top, viewportBottom - MOBILE_MENU_MARGIN);
  const cap = Math.min(bottom - top, (viewportBottom - viewportTop) * 0.75);
  const aboveEdge = Math.min(bottom, anchorTop - MOBILE_MENU_GAP);
  const belowEdge = Math.max(top, anchorBottom + MOBILE_MENU_GAP);
  const above = Math.max(0, aboveEdge - top);
  const below = Math.max(0, bottom - belowEdge);
  if (above >= 120 || (above >= 46 && above >= below)) {
    return { edge: aboveEdge, maxHeight: Math.min(above, cap), side: 'sheet' };
  }
  if (below >= 46) {
    return { edge: belowEdge, maxHeight: Math.min(below, cap), side: 'mobile-below' };
  }
  return { edge: top, maxHeight: cap, side: 'mobile-overlay' };
}

function positionMobileMenu(
  menu: HTMLElement,
  viewportTop: number,
  viewportBottom: number,
  viewportLeft: number,
  viewportWidth: number,
  anchorTop: number,
  anchorBottom: number,
): void {
  const placement = mobileMenuPlacement(viewportTop, viewportBottom, anchorTop, anchorBottom);
  menu.style.position = 'fixed';
  menu.style.left = `${viewportLeft + MOBILE_MENU_MARGIN}px`;
  menu.style.right = `${Math.max(0, window.innerWidth - viewportLeft - viewportWidth) + MOBILE_MENU_MARGIN}px`;
  menu.style.width = 'auto';
  menu.style.maxWidth = 'none';
  menu.style.top = placement.side === 'sheet' ? 'auto' : `${placement.edge}px`;
  menu.style.bottom =
    placement.side === 'sheet' ? `${window.innerHeight - placement.edge}px` : 'auto';
  menu.style.maxHeight = `${placement.maxHeight}px`;
  menu.dataset.menuSide = placement.side;
}

function chooseDesktopMenuPosition(
  menu: HTMLElement,
  anchorTop: number,
  anchorBottom: number,
  viewportTop: number,
  viewportBottom: number,
  height: number,
  cap: number,
): { top: number; side: 'above' | 'below' } {
  const belowTop = anchorBottom + 8;
  const aboveTop = anchorTop - height - 8;
  const belowSpace = viewportBottom - belowTop - 8;
  const aboveSpace = anchorTop - viewportTop - 8;
  let top: number;
  let side: 'above' | 'below';
  if (belowSpace >= height) {
    top = belowTop;
    side = 'below';
  } else if (aboveSpace >= height) {
    top = aboveTop;
    side = 'above';
  } else if (belowSpace >= 120 && belowSpace >= aboveSpace) {
    menu.style.maxHeight = `${Math.min(belowSpace, cap)}px`;
    top = belowTop;
    side = 'below';
  } else if (aboveSpace >= 120) {
    menu.style.maxHeight = `${Math.min(aboveSpace, cap)}px`;
    top = anchorTop - aboveSpace - 8;
    side = 'above';
  } else {
    menu.style.maxHeight = `${Math.min(Math.max(120, Math.max(belowSpace, aboveSpace)), cap)}px`;
    top = belowSpace >= aboveSpace ? belowTop : viewportTop + 8;
    side = belowSpace >= aboveSpace ? 'below' : 'above';
  }
  return { top, side };
}

function clampDesktopMenuTop(
  top: number,
  viewportTop: number,
  viewportBottom: number,
  menuHeight: number,
  fallbackHeight: number,
): number {
  return Math.max(
    viewportTop + 8,
    Math.min(viewportBottom - (menuHeight || fallbackHeight) - 8, top),
  );
}

/**
 * Measures and positions the React-owned menu after its items commit. The
 * component invokes this from a layout effect when the menu opens or resizes.
 */
export function positionComposerToolsMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  _mode: 'topic' | 'chat' | null,
): void {
  for (const prop of [
    'top',
    'bottom',
    'left',
    'right',
    'width',
    'max-width',
    'max-height',
    'position',
    'border-radius',
  ])
    menu.style.removeProperty(prop);
  const rect = restingRect(trigger);
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
  const viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  const viewportBottom = viewport
    ? viewportTop + viewport.height
    : typeof window !== 'undefined'
      ? window.innerHeight
      : 800;
  const viewportWidth = viewport
    ? viewport.width
    : typeof window !== 'undefined'
      ? window.innerWidth
      : 1024;
  const viewportHeight = viewportBottom - viewportTop;
  if (viewportWidth <= 768) {
    // The keyboard can shrink the visual viewport without resizing the
    // layout viewport. Keep the sheet inside the visible part of the screen.
    const frame = trigger.closest('[data-composer-frame]') ?? trigger.closest('.composer-shell');
    const anchor = frame?.getBoundingClientRect() ?? rect;
    positionMobileMenu(
      menu,
      viewportTop,
      viewportBottom,
      viewport?.offsetLeft ?? 0,
      viewportWidth,
      anchor.top,
      anchor.bottom,
    );
    return;
  }

  const menuHeightCap = Math.max(120, Math.min(560, viewportHeight * 0.62));
  /* 300px matches the reference "+" card: wide enough for the icon, label,
     shortcut and check on one line without turning into a settings panel. */
  menu.style.width = '300px';
  menu.style.maxHeight = `${menuHeightCap}px`;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const width = menu.offsetWidth || 260;
  const height = menu.offsetHeight || 300;
  /* Anchor the card to the whole composer, not the small + button: opening
     below the button covered the capsule's bottom edge, and opening above it
     in a conversation must clear the composer entirely. */
  const frame = trigger.closest('[data-composer-frame]') ?? trigger.closest('.composer-shell');
  const anchor = frame?.getBoundingClientRect() ?? rect;
  const left = Math.max(8, Math.min(anchor.left, viewportWidth - width - 8));
  const placement = chooseDesktopMenuPosition(
    menu,
    anchor.top,
    anchor.bottom,
    viewportTop,
    viewportBottom,
    height,
    menuHeightCap,
  );
  const top = clampDesktopMenuTop(
    placement.top,
    viewportTop,
    viewportBottom,
    menu.offsetHeight,
    height,
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.dataset.menuSide = placement.side;
}
