import type { RefObject } from 'react';
import { useEffect } from 'react';
import { closeSettings } from './settings.service';
import { setModalOpen, trapFocus } from '../../ui/modalA11y.js';

export function useSettingsDialogA11y(
  open: boolean,
  overlayRef: RefObject<HTMLDivElement | null>,
): void {
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        closeSettings();
      } else if (event.key === 'Tab') {
        trapFocus(event, overlay);
      }
    };
    overlay.addEventListener('keydown', onKey, true);
    return () => overlay.removeEventListener('keydown', onKey, true);
  }, [overlayRef]);

  useEffect(() => {
    if (!open) return;
    setModalOpen('settingsOverlay', true);
    const timeoutId = window.setTimeout(() => {
      const explicit = overlayRef.current?.querySelector('[data-initial-focus]') as HTMLElement | null;
      if (!explicit) return;
      try {
        explicit.focus({ preventScroll: true });
      } catch {
        /* empty-catch: intentional — initial focus is best-effort */
      }
    }, 50);
    return () => {
      window.clearTimeout(timeoutId);
      setModalOpen('settingsOverlay', false);
    };
  }, [open, overlayRef]);
}
