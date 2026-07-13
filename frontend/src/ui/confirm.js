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
    okBtn.onclick = function () { closeConfirm(true); };
    document.getElementById("confirmDialog").classList.remove("hidden");
  });
}

function closeConfirm(resolveWith) {
  document.getElementById("confirmDialog").classList.add("hidden");
  if (_confirmResolve) {
    _confirmResolve(resolveWith === undefined ? false : resolveWith);
    _confirmResolve = null;
  }
}

export { showConfirm, closeConfirm };
