/* ui/confirm.js — Wave 1a of main-js-split plan.
 * Generic confirm-dialog modal. Extracted from main.js L10359-L10378.
 * State: module-private _confirmResolve (single in-flight promise).
 * Reads via window.t() (i18n) for button labels.
 */

var _confirmResolve = null;

function showConfirm(title, msg, isDanger) {
  return new Promise(function (resolve) {
    _confirmResolve = resolve;
    document.getElementById("confirmTitle").textContent = title;
    document.getElementById("confirmMsg").textContent = msg;
    var okBtn = document.getElementById("confirmOkBtn");
    okBtn.className = "confirm-btn " + (isDanger ? "danger" : "primary");
    okBtn.textContent = isDanger ? window.t("common.delete") : window.t("common.ok");
    /* OK button fires in the target phase (before the delegated handler),
       so the explicit `onclick` drives the resolve(true). The cancel button
       is handled by the delegated data-action="closeConfirm" handler in
       delegate.js, which calls closeConfirm() (no args = false). No need
       to wire a second listener here. */
    okBtn.onclick = function () { closeConfirm(true); };
    var dlg = document.getElementById("confirmDialog");
    dlg.classList.remove("hidden");
    if (typeof dlg.__handleOpen === "function") dlg.__handleOpen();
  });
}

function closeConfirm(resolveWith) {
  var dlg = document.getElementById("confirmDialog");
  dlg.classList.add("hidden");
  if (typeof dlg.__handleClose === "function") dlg.__handleClose();
  if (_confirmResolve) {
    _confirmResolve(resolveWith === undefined ? false : resolveWith);
    _confirmResolve = null;
  }
}

export { showConfirm, closeConfirm };
