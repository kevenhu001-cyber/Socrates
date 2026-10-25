import type { RefObject } from 'react';
import { useEffect } from 'react';
import { closeSettings } from './settings.service';
import { setModalOpen, trapFocus } from '../../ui/modalA11y.js';

/**
 * The element that opened the dialog. `document.body` is not a real trigger:
 * a programmatically opened dialog has nothing to return the focus to. A
 * control inside the dialog is not a trigger either — the trigger always sits
 * outside it.
 */
function captureTrigger(overlay: HTMLElement | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return null;
  if (active === document.body || active === document.documentElement) return null;
  if (overlay && overlay.contains(active)) return null;
  return active;
}

/**
 * Hand the focus back to the trigger once the dialog is gone. A nested modal
 * — or any other surface that took the focus meanwhile — keeps it.
 */
function restoreTriggerFocus(trigger: HTMLElement | null, overlay: HTMLElement | null): void {
  if (!trigger || !trigger.isConnected) return;
  const active = document.activeElement;
  if (active && active !== document.body) {
    // Only reclaim the focus when the dialog itself owned it.
    if (!overlay || !overlay.contains(active)) return;
  }
  try {
    trigger.focus({ preventScroll: true });
  } catch {
    /* empty-catch: intentional — focus restore is best-effort */
  }
}

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
    const overlay = overlayRef.current;
    const trigger = captureTrigger(overlay);
    setModalOpen('settingsOverlay', true, trigger);
    const timeoutId = window.setTimeout(() => {
      const explicit = overlay?.querySelector('[data-initial-focus]') as HTMLElement | null;
      if (!explicit) return;
      const active = document.activeElement;
      /* The shell turns inert while the dialog is open, so the trigger can no
         longer hold the focus — that case still wants the initial focus. Any
         other active element means the user, or a nested modal, already moved
         the focus: taking it back would break that surface (this is what used
         to steal the focus away from a parent dialog's control). */
      const stillWaiting = !active || active === document.body || active === trigger;
      if (!stillWaiting) return;
      try {
        explicit.focus({ preventScroll: true });
      } catch {
        /* empty-catch: intentional — initial focus is best-effort */
      }
    }, 50);
    return () => {
      window.clearTimeout(timeoutId);
      /* Release the shell first: the trigger lives inside it and stays
         unfocusable while it is inert. */
      setModalOpen('settingsOverlay', false);
      restoreTriggerFocus(trigger, overlay);
    };
  }, [open, overlayRef]);
}
