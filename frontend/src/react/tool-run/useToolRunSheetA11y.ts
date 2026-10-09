import { useEffect, useRef, type RefObject } from 'react';

import type { ToolRunSheetRequest } from './ToolRunSheetContext.js';

export function useToolRunSheetA11y(
  sheet: ToolRunSheetRequest | null,
  onClose: () => void,
): {
  closeRef: RefObject<HTMLButtonElement | null>;
  panelRef: RefObject<HTMLElement | null>;
} {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const isOpen = sheet !== null;
  const trigger = sheet?.trigger ?? null;

  useEffect(() => {
    if (!isOpen) {
      const target = returnFocusRef.current;
      returnFocusRef.current = null;
      if (target && target.isConnected) {
        try { target.focus({ preventScroll: true }); } catch (_) { target.focus(); }
      }
      return undefined;
    }

    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], summary, input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        closeRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = oldOverflow;
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!trigger) return;
    returnFocusRef.current = trigger;
    try { closeRef.current?.focus({ preventScroll: true }); } catch (_) { closeRef.current?.focus(); }
  }, [trigger]);

  return { closeRef, panelRef };
}
