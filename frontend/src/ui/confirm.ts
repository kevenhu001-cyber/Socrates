/* ui/confirm.ts — Wave 1a of main-js-split plan.
 * Generic confirm-dialog modal. Extracted from main.js L10359-L10378.
 * State: module-private _confirmResolve (single in-flight promise).
 *
 * M4 step 4.5c: the overlay skeleton is React-owned (ConfirmDialog.tsx
 * renders #confirmDialog into #confirmDialogReactRoot at boot). This
 * module keeps the Promise resolver semantics and publishes
 * `{ open, title, msg, danger }` through `window.__socratesConfirmBridge`;
 * React mirrors visibility and renders the buttons, calling
 * `closeConfirm(true/false)` via `__socratesLegacy.confirm`.
 */

import { normalizeChineseProse } from '../util/chineseTypography.ts';

let _confirmResolve: ((value: boolean) => void) | null = null;
let _state = { open: false, title: '', msg: '', danger: false };
let _bridgePromise: Promise<unknown> | null = null;

/* The React ConfirmDialog mounts lazily at boot. If a showConfirm()
   lands before that mount has installed the bridge, the publish would
   be swallowed and the returned Promise would never resolve — the
   dialog simply never appears. Self-install the bridge in that case so
   the snapshot is waiting for the component when it does render. */
function _ensureConfirmBridge(): Promise<unknown> {
  if (typeof window !== 'undefined' && window.__socratesConfirmBridge) {
    return Promise.resolve(window.__socratesConfirmBridge);
  }
  if (!_bridgePromise) {
    _bridgePromise = import('../react/confirm/confirm.bridge.ts').then((m) => {
      return m.installConfirmBridge();
    }).catch((err) => {
      _bridgePromise = null;
      console.error('[confirm] bridge install failed', err);
      return null;
    });
  }
  return _bridgePromise;
}

function _publishConfirmState(): void {
  try {
    const bridge = typeof window !== 'undefined' ? window.__socratesConfirmBridge : undefined;
    if (bridge && typeof bridge.publish === 'function') {
      bridge.publish({
        open: _state.open,
        title: _state.title,
        msg: _state.msg,
        danger: _state.danger,
      });
      return;
    }
    void _ensureConfirmBridge().then(() => { _publishConfirmState(); });
  } catch (_) { /* empty-catch: intentional — confirm bridge publish is best effort */ }
}

export function showConfirm(title?: string, msg?: string, isDanger?: boolean): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    _confirmResolve = resolve;
    _state = {
      open: true,
      title: normalizeChineseProse(String(title || '')),
      msg: normalizeChineseProse(String(msg || '')),
      danger: !!isDanger,
    };
    _publishConfirmState();
  });
}

export function closeConfirm(resolveWith?: boolean): void {
  if (!_state.open && !_confirmResolve) return;
  _state = { open: false, title: _state.title, msg: _state.msg, danger: _state.danger };
  _publishConfirmState();
  if (_confirmResolve) {
    _confirmResolve(resolveWith === undefined ? false : resolveWith);
    _confirmResolve = null;
  }
}
