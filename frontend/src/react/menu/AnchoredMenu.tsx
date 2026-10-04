import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Shared viewport-aware menu: portals escape scrolling lists, with keyboard
 * navigation and focus restoration owned here instead of individual surfaces. */
export function AnchoredMenu({ anchor, onClose, className, children, above = false, spill = false }: {
  anchor: RefObject<HTMLElement | null>; onClose: () => void;
  className: string; children: ReactNode; above?: boolean; spill?: boolean;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8 });
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
    node.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !node.contains(event.target) && !trigger.contains(event.target)) onClose();
    };
    const dismiss = () => onClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', reposition, true);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor, above, onClose, spill]);
  const host = document.getElementById('appShell');
  if (!host) return null;
  return createPortal(<div ref={menu} className={className} role="menu" style={{ position: 'fixed', ...position }}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        if (event.key === 'Escape') { event.preventDefault(); anchor.current?.focus(); }
        onClose();
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
