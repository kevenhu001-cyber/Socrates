import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Shared viewport-aware menu: portals escape scrolling lists, with keyboard
 * navigation and focus restoration owned here instead of individual surfaces. */
export function AnchoredMenu({ anchor, onClose, className, children, above = false, spill = false }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void;
  className: string; children: ReactNode; above?: boolean; spill?: boolean;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
  const [closing, setClosing] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const closingRef = useRef(false);

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    // Matches the 120ms ui-overlay-out exit in polish/overlays.css.
    closeTimerRef.current = window.setTimeout(() => {
      onClose();
    }, 120);
  }, [onClose]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  // Initial focus belongs to opening, not to positioning or the exit animation.
  // Re-running it while closing would steal Escape/Tab's destination focus.
  useLayoutEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, []);

  useLayoutEffect(() => {
    const trigger = anchor.current;
    const node = menu.current;
    if (!trigger || !node) return;
    const reposition = () => {
      const rect = trigger.getBoundingClientRect();
      const { width, height } = node.getBoundingClientRect();
      const phoneSpill = spill && innerWidth <= 768;
      setPosition({
        left: Math.max(6, Math.min((phoneSpill ? rect.left - 8 : rect.right - width), innerWidth - width - 6)),
        top: Math.max(6, Math.min(above ? rect.top - height - 6 : rect.bottom + (phoneSpill ? -4 : 4), innerHeight - height - 6)),
      });
    };
    reposition();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !node.contains(event.target) && !trigger.contains(event.target)) requestClose();
    };
    const dismiss = () => requestClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor, above, requestClose, spill]);
  const host = document.getElementById('appShell');
  if (!host) return null;
  return createPortal(<div ref={menu} className={`anchored-menu ${className}`.trim()} data-state={closing ? 'closing' : 'open'} data-placement={above ? 'above' : 'below'} data-align={spill && innerWidth <= 768 ? 'start' : 'end'} inert={closing} role="menu" style={{ position: 'fixed', ...position }}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') event.preventDefault();
        // Let Tab's native default continue from the trigger in document order,
        // rather than into an item that will disappear after the exit animation.
        anchor.current?.focus({ preventScroll: true });
        requestClose();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 :
          (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length]?.focus();
      }
    }}>{children}</div>, host);
}
