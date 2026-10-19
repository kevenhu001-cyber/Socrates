import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  computeAnchoredMenuLayout,
  ENABLED_MENU_ITEM_SELECTOR,
  getNextMenuItemIndex,
  MENU_EXIT_MS,
  type AnchoredMenuLayout,
  type MenuNavigationKey,
} from './menuPrimitive';

/** Shared viewport-aware menu: portals escape scrolling lists, with keyboard
 * navigation and focus restoration owned here instead of individual surfaces.
 *
 * Product components depend on this facade, while geometry/navigation live in
 * menuPrimitive.ts so a future Base UI primitive can replace the headless
 * implementation without rewriting each caller. */
export function AnchoredMenu({ anchor, onClose, className, children, above = false, spill = false, label }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void;
  className: string; children: ReactNode; above?: boolean; spill?: boolean; label?: string;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [layout, setLayout] = useState<AnchoredMenuLayout>({
    left: 8,
    top: 8,
    placement: above ? 'above' : 'below',
    align: 'end',
  });
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);
  onCloseRef.current = onClose;

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    // Matches the ui-overlay-out exit in polish/overlays.css.
    closeTimerRef.current = window.setTimeout(() => {
      onCloseRef.current();
    }, MENU_EXIT_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Initial focus belongs to opening, not to positioning or the exit animation.
  // Re-running it while closing would steal Escape/Tab's destination focus.
  useLayoutEffect(() => {
    const selected = menu.current?.querySelector<HTMLElement>(
      '[role="menuitemradio"][aria-checked="true"]:not([aria-disabled="true"]):not(:disabled)',
    );
    const firstEnabled = menu.current?.querySelector<HTMLElement>(ENABLED_MENU_ITEM_SELECTOR);
    (selected || firstEnabled)?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const trigger = anchor.current;
    const node = menu.current;
    if (!trigger || !node) return;

    const reposition = () => {
      const rect = trigger.getBoundingClientRect();
      // offsetWidth/offsetHeight are transform-independent, so the entrance
      // scale animation cannot perturb the collision math.
      setLayout(computeAnchoredMenuLayout({
        anchorRect: rect,
        menuWidth: node.offsetWidth,
        menuHeight: node.offsetHeight,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        above,
        spill,
      }));
    };

    reposition();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !node.contains(event.target) && !trigger.contains(event.target)) requestClose();
    };
    const dismiss = () => requestClose();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reposition);
    resizeObserver?.observe(node);
    resizeObserver?.observe(trigger);
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', reposition, true);
    return () => {
      resizeObserver?.disconnect();
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor, above, requestClose, spill]);

  const host = document.getElementById('appShell');
  if (!host) return null;

  return createPortal(
    <div
      ref={menu}
      className={`anchored-menu ${className}`.trim()}
      data-anchored-menu=""
      data-state={closing ? 'closing' : 'open'}
      data-placement={layout.placement}
      data-align={layout.align}
      inert={closing}
      role="menu"
      style={{ position: 'fixed', left: layout.left, top: layout.top }}
      aria-label={label}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          if (event.key === 'Escape') event.preventDefault();
          // Let Tab's native default continue from the trigger in document order,
          // rather than into an item that will disappear after the exit animation.
          anchor.current?.focus({ preventScroll: true });
          requestClose();
          return;
        }

        if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const items = [...event.currentTarget.querySelectorAll<HTMLElement>(ENABLED_MENU_ITEM_SELECTOR)]
            .filter((item) => item.getClientRects().length > 0);
          const index = items.indexOf(document.activeElement as HTMLElement);
          const nextIndex = getNextMenuItemIndex(index, items.length, event.key as MenuNavigationKey);
          if (nextIndex >= 0) items[nextIndex]?.focus();
        }
      }}
    >
      {children}
    </div>,
    host,
  );
}
