/* ui/confirm.ts — Wave 1a of main-js-split plan.
 * Generic confirm-dialog modal. Extracted from main.js L10359-L10378.
 * State: module-private _confirmResolve (single in-flight promise).
 *
 * M4 step 4.5c: the overlay skeleton is React-owned (ConfirmDialog.tsx
 * renders #confirmDialog into #confirmDialogReactRoot at boot). This
 * module keeps the Promise resolver semantics and publishes
 * `{ open, title, msg, danger }` through the shared confirm state module;
 * React subscribes to that module and renders the buttons, calling
 * `closeConfirm(true/false)` via `__socratesLegacy.confirm`.
 */

import { normalizeChineseProse } from '../util/chineseTypography.ts';
import { publishConfirmState } from './confirmState.ts';

let _confirmResolve: ((value: boolean) => void) | null = null;
let _state = { open: false, title: '', msg: '', danger: false };

function _publishConfirmState(): void {
  publishConfirmState({
    open: _state.open,
    title: _state.title,
    msg: _state.msg,
    danger: _state.danger,
  });
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
