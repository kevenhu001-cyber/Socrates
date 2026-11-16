import { restingRect } from '../../ui/pressFeedback.ts';

/* Phone bottom sheet, matching the mobile drawer reference (screenshot 1000038600.jpg):
   it slides up from the bottom of the viewport, spans full width, with rounded top corners. */
function positionMobileMenu(menu: HTMLElement): void {
  menu.style.setProperty('position', 'fixed', 'important');
  menu.style.setProperty('left', '0px', 'important');
  menu.style.setProperty('right', '0px', 'important');
  menu.style.setProperty('width', '100%', 'important');
  menu.style.setProperty('max-width', '100%', 'important');
  menu.style.setProperty('top', 'auto', 'important');
  menu.style.setProperty('bottom', '0px', 'important');
  menu.style.setProperty('max-height', '75vh', 'important');
  menu.style.setProperty('border-radius', '20px 20px 0 0', 'important');
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
  return Math.max(viewportTop + 8, Math.min(viewportBottom - (menuHeight || fallbackHeight) - 8, top));
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
  for (const prop of ['top', 'bottom', 'left', 'right', 'width', 'max-width', 'max-height']) menu.style.removeProperty(prop);
  const rect = restingRect(trigger);
  const viewport = typeof window !== 'undefined' ? window.visualViewport : null;
  const viewportTop = viewport ? Math.max(0, viewport.offsetTop || 0) : 0;
  const viewportBottom = viewport ? viewportTop + viewport.height : (typeof window !== 'undefined' ? window.innerHeight : 800);
  const viewportWidth = viewport ? viewport.width : (typeof window !== 'undefined' ? window.innerWidth : 1024);
  const menuHeightCap = viewportWidth > 768
    ? Math.max(120, Math.min(560, (viewportBottom - viewportTop) * 0.62))
    : Math.max(120, (viewportBottom - viewportTop) / 2);

  if (viewportWidth <= 768) {
    positionMobileMenu(menu);
    return;
  }

  menu.style.width = '240px';
  menu.style.maxHeight = `${menuHeightCap}px`;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const width = menu.offsetWidth || 260;
  const height = menu.offsetHeight || 300;
  const left = Math.max(8, Math.min(rect.left - 5, viewportWidth - width - 8));
  const placement = chooseDesktopMenuPosition(
    menu, rect.top, rect.bottom, viewportTop, viewportBottom, height, menuHeightCap,
  );
  const top = clampDesktopMenuTop(
    placement.top, viewportTop, viewportBottom, menu.offsetHeight, height,
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.dataset.menuSide = placement.side;
}
