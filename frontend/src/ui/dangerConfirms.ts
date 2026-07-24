/* ui/dangerConfirms.ts — Wave 2 of main-js-split plan.
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

function confirmClearCache(): void {
  (window as any).showConfirm("Clear conversations?", "This removes all local chat history from this browser. Your account data stays on the server.", false).then(function (yes: any) {
    if (yes !== true) { return; }
    try { localStorage.removeItem("socrates-sessions-v2"); } catch (_e) { /* ignore */ }
    (window as any).state.currentSessionId = null;
    (window as any).renderRecents();
    (window as any).resetApp();
    location.reload();
  }).catch(function () {});
}

function confirmClearSettings(): void {
  (window as any).showConfirm("Clear API settings?", "This removes all configured API providers and keys. You'll need to reconfigure them.", false).then(function (yes: any) {
    if (yes !== true) { return; }
    if (!(window as any).CURRENT_USER) { return; }
    var apiConfig = (window as any).apiConfig;
    var deletePromises = [];
    for (var i = 0; i < apiConfig.providers.length; i++) {
      var p = apiConfig.providers[i];
      if (p.isBuiltIn || p.id === "beagle-built-in") { continue; }
      if (p.id.indexOf("new-") === 0) { continue; }
      deletePromises.push(
        (window as any).apiFetch("/api/api-key/" + encodeURIComponent(p.id), { method: "DELETE" })
          .catch(function () {})
      );
    }
    Promise.all(deletePromises).then(function () {
      apiConfig.activeId = null;
      apiConfig.providers = [Object.assign({}, (window as any).BEAGLE_BUILT_IN)];
      try { localStorage.removeItem("socrates-provider-keys"); } catch (_e) { /* ignore */ }
      try { localStorage.removeItem((window as any).LAST_ACTIVE_ID_KEY); } catch (_e) { /* ignore */ }
      (window as any).renderProviderList();
      (window as any).syncModelPills();
      (window as any).syncSettingsUI();
      (window as any).closeProfile();
    }).catch(function () {});
  }).catch(function () {});
}

function confirmDeleteAccount(): void {
  (window as any).showConfirm("Delete your account?", "This permanently deletes your account, all chat sessions, and all saved settings. This cannot be undone.", true).then(function (yes: any) {
    if (!yes) return;
    (async function () {
      try {
        await (window as any).apiFetch("/api/auth/account", { method: "DELETE" });
        (window as any).CURRENT_USER = null;
        try { localStorage.removeItem("socrates-sessions-v2"); } catch (_e) {}
        try { localStorage.removeItem("socrates-api"); } catch (_e) {}
        try { localStorage.removeItem("socrates-provider-keys"); } catch (_e) {}
        try { localStorage.removeItem("socrates-websearch"); } catch (_e) {}
        (window as any).resetState();
        (window as any).resetApp();
        (window as any).showGate();
        (window as any).renderUserFooter();
        (window as any).closeProfile();
        (window as any).showAuthSignin();
      } catch (e: any) {
        alert((window as any).t("settings.action.deleteAccount").replace("{msg}", e.message));
      }
    })();
  });
}

export { confirmClearCache, confirmClearSettings, confirmDeleteAccount };
