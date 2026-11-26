import { restingRect } from '../../legacy/pressFeedback.ts';

/* Phone bottom sheet, matching the mobile drawer reference (screenshot 1000038600.jpg):
   it slides up from the bottom of the viewport, spans full width, with rounded top corners. */
/* 2026-11-26 phone reference: the "+" menu is a floating card that rests just
 * above the question box with 12px side margins, not a full-width bottom
 * sheet. `composerTop` is the box's top edge in the layout viewport; the card
 * keeps an 8px gap above it and never grows past the visible viewport. */
const MOBILE_MENU_MARGIN = 12;
const MOBILE_MENU_GAP = 8;

function positionMobileMenu(
  menu: HTMLElement,
  viewportHeight: number,
  bottomInset: number,
  composerTop: number | null,
): void {
  const layoutHeight = typeof window !== 'undefined' ? window.innerHeight : viewportHeight;
  const bottom =
    composerTop !== null && composerTop > 0
      ? Math.max(bottomInset, layoutHeight - composerTop + MOBILE_MENU_GAP)
      : bottomInset;
  const room = Math.max(160, viewportHeight - (bottom - bottomInset) - MOBILE_MENU_MARGIN * 2);
  menu.style.setProperty('position', 'fixed', 'important');
  menu.style.setProperty('left', `${MOBILE_MENU_MARGIN}px`, 'important');
  menu.style.setProperty('right', `${MOBILE_MENU_MARGIN}px`, 'important');
  menu.style.setProperty('width', 'auto', 'important');
  menu.style.setProperty('max-width', 'none', 'important');
  menu.style.setProperty('top', 'auto', 'important');
  menu.style.setProperty('bottom', `${bottom}px`, 'important');
  menu.style.setProperty('max-height', `${Math.min(room, viewportHeight * 0.75)}px`, 'important');
  menu.style.removeProperty('border-radius');
  menu.dataset.menuSide = 'sheet';
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
    positionMobileMenu(
      menu,
      viewportHeight,
      Math.max(0, window.innerHeight - viewportBottom),
      frame ? frame.getBoundingClientRect().top : null,
    );
    return;
  }

  const menuHeightCap = Math.max(120, Math.min(560, viewportHeight * 0.62));
  menu.style.width = '240px';
  menu.style.maxHeight = `${menuHeightCap}px`;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const width = menu.offsetWidth || 260;
  const height = menu.offsetHeight || 300;
  const left = Math.max(8, Math.min(rect.left - 5, viewportWidth - width - 8));
  const placement = chooseDesktopMenuPosition(
    menu,
    rect.top,
    rect.bottom,
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
