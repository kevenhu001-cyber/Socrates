import { restingRect } from '../../ui/pressFeedback.ts';

function positionTopicMenu(
  menu: HTMLElement,
  trigger: HTMLElement,
  mode: 'topic' | 'chat' | null,
  rect: Pick<DOMRect, 'bottom' | 'left' | 'top'>,
  viewportWidth: number,
  viewportBottom: number,
  menuHeightCap: number,
): boolean {
  if (mode !== 'topic' || viewportWidth <= 768) return false;
  const topicWrap = trigger.closest('#composerInputWrap');
  const wrapRect = topicWrap ? topicWrap.getBoundingClientRect() : rect;
  const menuTop = rect.bottom + 8;
  const room = Math.max(120, viewportBottom - menuTop - 16);
  menu.style.width = '220px';
  menu.style.maxHeight = `${Math.min(room, menuHeightCap)}px`;
  menu.style.left = `${Math.max(8, Math.min(wrapRect.left, viewportWidth - 228))}px`;
  menu.style.top = `${menuTop}px`;
  menu.dataset.menuSide = 'below';
  return true;
}

/* Phone popover, as in the reference: it covers the question box's text row
   and leaves the control row (+, effort, mic, send) visible, sharing the box's
   left edge and width. The inline !important values outrank the retired
   bottom-sheet pins that compatibility CSS may still carry. */
function positionMobileMenu(menu: HTMLElement, trigger: HTMLElement, viewportTop: number): void {
  const frame = trigger.closest('[data-composer-frame]') ?? trigger.closest('#composerInputWrap');
  const frameRect = frame ? frame.getBoundingClientRect() : restingRect(trigger);
  const controlTop = restingRect(trigger).top;
  const bottomEdge = controlTop - 8;
  const layoutHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  menu.style.setProperty('left', `${Math.round(frameRect.left)}px`, 'important');
  menu.style.setProperty('right', 'auto', 'important');
  menu.style.setProperty('width', `${Math.round(frameRect.width)}px`, 'important');
  menu.style.setProperty('max-width', 'none', 'important');
  menu.style.setProperty('top', 'auto', 'important');
  menu.style.setProperty('bottom', `${Math.round(layoutHeight - bottomEdge)}px`, 'important');
  menu.style.setProperty('max-height', `${Math.max(160, Math.round(bottomEdge - viewportTop - 16))}px`, 'important');
  menu.dataset.menuSide = 'above';
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
  mode: 'topic' | 'chat' | null,
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

  if (positionTopicMenu(menu, trigger, mode, rect, viewportWidth, viewportBottom, menuHeightCap)) return;
  if (viewportWidth <= 768) {
    positionMobileMenu(menu, trigger, viewportTop);
    return;
  }

  menu.style.width = '220px';
  menu.style.maxHeight = `${menuHeightCap}px`;
  menu.style.left = '0px';
  menu.style.top = '0px';
  const width = menu.offsetWidth || 260;
  const height = menu.offsetHeight || 300;
  const wrap = trigger.closest('#composerInputWrap');
  const wrapRect = wrap ? wrap.getBoundingClientRect() : rect;
  const left = Math.max(8, Math.min(rect.left, viewportWidth - width - 8));
  const placement = chooseDesktopMenuPosition(
    menu, wrapRect.top, wrapRect.bottom, viewportTop, viewportBottom, height, menuHeightCap,
  );
  const top = clampDesktopMenuTop(
    placement.top, viewportTop, viewportBottom, menu.offsetHeight, height,
  );
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.dataset.menuSide = placement.side;
}
