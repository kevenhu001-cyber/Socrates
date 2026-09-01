/* ui/confirm.js — Wave 1a of main-js-split plan.
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

var _confirmResolve = null;
var _state = { open: false, title: "", msg: "", danger: false };

function _publishConfirmState() {
  try {
    var bridge = window.__socratesConfirmBridge;
    if (bridge && typeof bridge.publish === "function") {
      bridge.publish({
        open: _state.open,
        title: _state.title,
        msg: _state.msg,
        danger: _state.danger,
      });
    }
  } catch (_) { /* swallow */ }
}

function showConfirm(title, msg, isDanger) {
  return new Promise(function (resolve) {
    _confirmResolve = resolve;
    _state = {
      open: true,
      title: title || "",
      msg: msg || "",
      danger: !!isDanger,
    };
    _publishConfirmState();
  });
}

function closeConfirm(resolveWith) {
  if (!_state.open && !_confirmResolve) return;
  _state = { open: false, title: _state.title, msg: _state.msg, danger: _state.danger };
  _publishConfirmState();
  if (_confirmResolve) {
    _confirmResolve(resolveWith === undefined ? false : resolveWith);
    _confirmResolve = null;
  }
}

export { showConfirm, closeConfirm };
