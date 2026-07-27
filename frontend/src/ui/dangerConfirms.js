/* ui/dangerConfirms.js — Wave 2 of main-js-split plan.
 * Three "are you sure?" confirm actions reachable from the profile modal:
 * - confirmClearCache:    wipe local session cache, hard reload
 * - confirmClearSettings: delete every non-built-in API provider + local storage
 * - confirmDeleteAccount: full account deletion via /api/auth/account
 *
 * Touches the following globals:
 *   - showConfirm (ui/confirm.js)
 *   - apiFetch, t, renderRecents, resetApp, showGate, showAuthSignin, resetState,
 *     renderUserFooter, closeProfile, renderProviderList, syncModelPills, syncSettingsUI,
 *     CURRENT_USER, apiConfig (mutate in place!), webSearchOn, BEAGLE_BUILT_IN,
 *     LAST_ACTIVE_ID_KEY
 */

function confirmClearCache() {
  window.showConfirm(window.t("confirm.clearConversations.title"), window.t("confirm.clearConversations.msg"), false).then(function (yes) {
    if (yes !== true) { return; }
    try { localStorage.removeItem("socrates-sessions-v2"); } catch (e) { /* ignore */ }
    window.state.currentSessionId = null;
    window.renderRecents();
    window.resetApp();
    location.reload();
  }).catch(function(){});
}

function confirmClearSettings() {
  window.showConfirm(window.t("confirm.clearApiSettings.title"), window.t("confirm.clearApiSettings.msg"), false).then(function (yes) {
    if (yes !== true) { return; }
    if (!window.CURRENT_USER) { return; }
    var apiConfig = window.apiConfig;
    var deletePromises = [];
    for (var i = 0; i < apiConfig.providers.length; i++) {
      var p = apiConfig.providers[i];
      if (p.isBuiltIn || p.id === "beagle-built-in") { continue; }
      if (p.id.indexOf("new-") === 0) { continue; }
      deletePromises.push(
        window.apiFetch("/api/api-key/" + encodeURIComponent(p.id), { method: "DELETE" })
          .catch(function(){})
      );
    }
    Promise.all(deletePromises).then(function(){
      apiConfig.activeId = null;
      apiConfig.providers = [Object.assign({}, window.BEAGLE_BUILT_IN)];
      try { localStorage.removeItem("socrates-provider-keys"); } catch (e) { /* ignore */ }
      try { localStorage.removeItem(window.LAST_ACTIVE_ID_KEY); } catch (e) { /* ignore */ }
      window.renderProviderList();
      window.syncModelPills();
      window.syncSettingsUI();
      window.closeProfile();
    }).catch(function(){});
  }).catch(function(){});
}

function confirmDeleteAccount() {
  window.showConfirm(window.t("confirm.deleteAccount.title"), window.t("confirm.deleteAccount.msg"), true).then(function (yes) {
    if (!yes) return;
    (async function () {
      try {
        await window.apiFetch("/api/auth/account", { method: "DELETE" });
        window.CURRENT_USER = null;
        try { localStorage.removeItem("socrates-sessions-v2"); } catch (e) {}
        try { localStorage.removeItem("socrates-api"); } catch (e) {}
        try { localStorage.removeItem("socrates-provider-keys"); } catch (e) {}
        try { localStorage.removeItem("socrates-websearch"); } catch (e) {}
        window.resetState();
        window.resetApp();
        window.showGate();
        window.renderUserFooter();
        window.closeProfile();
        window.showAuthSignin();
      } catch (e) {
        alert(window.t("settings.action.deleteAccount").replace("{msg}", e.message));
      }
    })();
  });
}

export { confirmClearCache, confirmClearSettings, confirmDeleteAccount };
