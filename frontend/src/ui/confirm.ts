/* ui/confirm.ts — Wave 1a of main-js-split plan.
 * Generic confirm-dialog modal. Extracted from main.js L10359-L10378.
 * State: module-private _confirmResolve (single in-flight promise).
 * Reads via window.t() (i18n) for button labels.
 */

type ConfirmCallback = (value: boolean) => void;

var _confirmResolve: ConfirmCallback | null = null;

function showConfirm(title: string, msg: string, isDanger?: boolean): Promise<boolean> {
  return new Promise<boolean>(function (resolve) {
    _confirmResolve = resolve;
    var titleEl = document.getElementById("confirmTitle");
    if (titleEl) titleEl.textContent = title;
    var msgEl = document.getElementById("confirmMsg");
    if (msgEl) msgEl.textContent = msg;
    var okBtn = document.getElementById("confirmOkBtn") as HTMLElement | null;
    if (!okBtn) return;
    okBtn.className = "confirm-btn " + (isDanger ? "danger" : "primary");
    okBtn.textContent = isDanger ? (window as any).t("common.delete") : (window as any).t("common.ok");
    okBtn.onclick = function () { closeConfirm(true); };
    var dialog = document.getElementById("confirmDialog");
    if (dialog) dialog.classList.remove("hidden");
  });
}

function closeConfirm(resolveWith?: boolean): void {
  var dialog = document.getElementById("confirmDialog");
  if (dialog) dialog.classList.add("hidden");
  if (_confirmResolve) {
    _confirmResolve(resolveWith === undefined ? false : resolveWith);
    _confirmResolve = null;
  }
}

export { showConfirm, closeConfirm };
