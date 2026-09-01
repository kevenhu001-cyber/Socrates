import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

import { getLegacyActions, i18n } from '../legacy/gateway';
import { installConfirmBridge, useConfirmSnapshot } from './confirm.bridge';

/* M4 step 4.5c — React owns the confirm-dialog overlay. Legacy
   ui/confirm.js publishes `{ open, title, msg, danger }` and keeps the
   `showConfirm` Promise resolver; React mirrors visibility and renders
   the buttons, calling legacy.closeConfirm(true/false). Focus/Esc
   replace the old `installModalA11y({ overlayId: 'confirmDialog' })`
   registration (which is removed from main.js). */

function ConfirmDialog() {
  const snap = useConfirmSnapshot();
  const overlayRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
  const legacy = getLegacyActions();

  /* Focus management: remember the trigger element on open, focus the
     title (data-initial-focus, matching the legacy modalA11y behavior),
     and restore focus to the trigger when the dialog closes. */
  useEffect(() => {
    if (snap.open) {
      prevFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      const t1 = window.setTimeout(() => {
        const explicit = overlayRef.current?.querySelector(
          '[data-initial-focus]',
        ) as HTMLElement | null;
        const target =
          explicit ??
          (overlayRef.current?.querySelector('#confirmOkBtn') as
            | HTMLElement
            | null);
        if (target) {
          try {
            target.focus({ preventScroll: true });
          } catch (_err) {
            /* focus is best-effort */
          }
        }
      }, 50);
      return () => window.clearTimeout(t1);
    }
    const prev = prevFocusRef.current;
    prevFocusRef.current = null;
    if (prev && typeof prev.focus === 'function') {
      try {
        prev.focus({ preventScroll: true });
      } catch (_err) {
        /* focus restore is best-effort */
      }
    }
    return undefined;
  }, [snap.open]);

  /* Esc-to-close. The legacy modalA11y bound closeConfirm(false); React
     owns the overlay now, so the keydown listener lives here. */
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        legacy.confirm.closeConfirm(false);
      }
    }
    overlay.addEventListener('keydown', onKey, true);
    return () => overlay.removeEventListener('keydown', onKey, true);
  }, [legacy]);

  /* Backdrop click closes as "cancel" (target === overlay host). */
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      legacy.confirm.closeConfirm(false);
    }
  };

  return (
    <div
      ref={overlayRef}
      className={`confirm-dialog${snap.open ? '' : ' hidden'}`}
      id="confirmDialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirmTitle"
      aria-describedby="confirmMsg"
      onClick={handleOverlayClick}
    >
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <div
          className="confirm-title"
          id="confirmTitle"
          tabIndex={-1}
          data-initial-focus="true"
        >
          {snap.title}
        </div>
        <div className="confirm-msg" id="confirmMsg">
          {snap.msg}
        </div>
        <div className="confirm-actions" id="confirmActions">
          <button
            className="confirm-btn cancel"
            id="confirmCancelBtn"
            onClick={() => legacy.confirm.closeConfirm(false)}
          >
            {i18n('common.cancel', 'Cancel')}
          </button>
          <button
            className={`confirm-btn ${snap.danger ? 'danger' : 'primary'}`}
            id="confirmOkBtn"
            onClick={() => legacy.confirm.closeConfirm(true)}
          >
            {snap.danger ? i18n('common.delete', 'Delete') : i18n('common.ok', 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Mount the React confirm dialog. Creates a dedicated body-level
 * container so `createRoot` owns the overlay shell. Legacy
 * `showConfirm()` / `closeConfirm()` keep the Promise resolver and
 * publish visibility/copy through the bridge (M4 step 4.5c).
 */
export function mountConfirmDialog(): void {
  let container = document.getElementById('confirmDialogReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'confirmDialogReactRoot';
    document.body.appendChild(container);
  }

  if (container.dataset.mountedBy === 'confirm-dialog') return;
  container.dataset.mountedBy = 'confirm-dialog';

  installConfirmBridge();
  const root = createRoot(container);
  root.render(<ConfirmDialog />);
}
