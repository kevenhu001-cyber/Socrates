/* ui/dangerConfirms.js — Wave 2 of main-js-split plan.
 * Three "are you sure?" confirm actions reachable from the profile modal:
 * - confirmClearCache:    wipe local session cache, hard reload
 * - confirmClearSettings: delete every non-built-in API provider + local storage
 * - confirmDeleteAccount: full account deletion via /api/auth/account
 *
 * Touches the following globals:
 *   - showConfirm (ui/confirm.js)
 *   - apiFetch, t, renderRecents, resetApp, showGate, showAuthSignin, resetState,
 *     renderUserFooter, closeProfile, CURRENT_USER, webSearchOn
 */

import { stateStore } from '../state/store.js';
import { showConfirm } from './confirm.js';

import { clearProviderConfig } from '../config/providerConfig.service.ts';

import { renderUserFooter } from './profile.js';

function confirmClearCache() {
  showConfirm(window.t("confirm.clearConversations.title"), window.t("confirm.clearConversations.msg"), false).then(function (yes) {
    if (yes !== true) { return; }
    try { localStorage.removeItem("socrates-sessions-v2"); } catch { /* ignore */ }
    stateStore.dispatch({type:'state/set',key:'currentSessionId',value:null});
    window.renderRecents();
    window.resetApp();
    location.reload();
  }).catch(function(){});
}

function confirmClearSettings() {
  showConfirm(window.t("confirm.clearApiSettings.title"), window.t("confirm.clearApiSettings.msg"), false).then(function (yes) {
    if (yes !== true) { return; }
    clearProviderConfig().then(function(){ window.closeProfile(); }).catch(function(){ /* clear provider config is best effort */ });
  }).catch(function(){});
}

function confirmDeleteAccount() {
  showConfirm(window.t("confirm.deleteAccount.title"), window.t("confirm.deleteAccount.msg"), true).then(function (yes) {
    if (!yes) return;
    (async function () {
      try {
        await window.apiFetch("/api/auth/account", { method: "DELETE" });
        window.CURRENT_USER = null;
        try { localStorage.removeItem("socrates-sessions-v2"); } catch {}
        try { localStorage.removeItem("socrates-api"); } catch {}
        try { localStorage.removeItem("socrates-provider-keys"); } catch {}
        try { localStorage.removeItem("socrates-websearch"); } catch {}
        window.resetState();
        window.resetApp();
        window.showGate();
        renderUserFooter();
        window.closeProfile();
        window.showAuthSignin();
      } catch (e) {
        alert(window.t("settings.action.deleteAccount").replace("{msg}", e.message));
      }
    })();
  });
}

export { confirmClearCache, confirmClearSettings, confirmDeleteAccount };
