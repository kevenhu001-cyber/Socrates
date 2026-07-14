/* ui/settings.js — Wave 2c of main-js-split plan.
 * Settings modal: API provider list + CRUD.
 * Extracted from main.js L11743-L12058.
 *
 * Touches via window.*:
 *   apiConfig (mutate in place — CRITICAL!), BEAGLE_BUILT_IN, SERVER_HAS_BEAGLE_KEY,
 *   TIER_KEY_LIMITS, LAST_ACTIVE_ID_KEY, CURRENT_USER, loadLastActiveId,
 *   syncModelPills, syncChatModel, syncSettingsUI, esc, escAttr, t, apiFetch,
 *   markProvidersFetched, renderProviderList (self-call, recurses via saveSettings)
 */

function openSettings() {
  document.getElementById("settingsOverlay").classList.remove("hidden");
  renderProviderList();
}

function closeSettings() {
  document.getElementById("settingsOverlay").classList.add("hidden");
}

function toggleAPI() {
  var rows = document.getElementById("providerList");
  if (rows) rows.classList.toggle("collapsed");
}

function syncSettingsUI() {
  var rows = document.getElementById("providerList");
  if (rows) rows.classList.remove("collapsed");
}

function renderProviderList() {
  var cont = document.getElementById("providerList");
  if (!cont) return;
  var apiConfig = window.apiConfig;
  /* Filter out built-in / Beagle — not shown in API Configuration. */
  var userProviders = (apiConfig.providers || []).filter(function (p) { return !p.isBuiltIn && p.id !== "beagle-built-in"; });
  if (!userProviders.length) {
    cont.innerHTML = '<div class="provider-empty">No models yet. Click "+ Add" to configure your first one.</div>';
    return;
  }
  var t = window.t;
  var esc = window.esc;
  var html = "";
  userProviders.forEach(function (p) {
    var isActive = p.id === apiConfig.activeId;
    var displayKey = p.key ? "" : (p.id && p.id.indexOf("new-") !== 0 ? "••••••••" : "");
    if (displayKey === "••••••••") {
      /* masked — no value attr */
    }
    var keyVal = p.key ? "" : (p.id && p.id.indexOf("new-") !== 0 ? "••••••••" : "");
    html += '<div class="provider-row' + (isActive ? " active" : "") + '" data-id="' + esc(p.id || "") + '">';
    html += '<button class="provider-active-btn" onclick="setActiveProvider(\'' + esc(p.id || "") + '\')" title="' + (isActive ? "Active model" : "Set as active") + '">' + (isActive ? "●" : "○") + '</button>';
    html += '<div class="provider-fields">';
    html += '<input class="settings-input" name="providerLabel" placeholder="' + esc(t("provider.placeholderLabel") || "Label") + '" value="' + esc(p.label || "") + '" oninput="updateProviderField(\'' + esc(p.id || "") + '\',\'label\',this.value)">';
    html += '<input class="settings-input" name="providerUrl" placeholder="' + esc(t("provider.placeholderUrl") || "Base URL") + '" value="' + esc(p.url || "") + '" oninput="updateProviderField(\'' + esc(p.id || "") + '\',\'url\',this.value)">';
    html += '<form style="display:contents" onsubmit="return false"><input type="text" name="username" autocomplete="username" style="display:none" aria-hidden="true"><input class="settings-input" name="providerKey" type="password" autocomplete="new-password" placeholder="' + esc(t("provider.placeholderKey") || "sk-...") + '" value="' + esc(keyVal) + '" oninput="updateProviderField(\'' + esc(p.id || "") + '\',\'key\',this.value)"></form>';
    html += '<input class="settings-input" name="providerModel" placeholder="' + esc(t("provider.placeholderModel") || "Model ID") + '" value="' + esc(p.model || "") + '" oninput="updateProviderField(\'' + esc(p.id || "") + '\',\'model\',this.value)">';
    html += '<label class="provider-multimodal" title="' + esc(t("provider.multimodalHint") || "") + '">'
       + '<input type="checkbox" name="providerMultimodal"'
       + (p.vision ? ' checked' : '')
       + ' onchange="updateProviderField(\'' + esc(p.id || "") + '\',\'vision\',this.checked)">'
       + '<span data-i18n-key="provider.multimodal">Multimodal (vision-capable)</span>'
       + '</label>';
    html += '</div>';
    html += '<button class="provider-del" onclick="removeProvider(\'' + esc(p.id || "") + '\')" title="Remove">&times;</button>';
    html += '</div>';
  });
  cont.innerHTML = html;
}

function addProvider() {
  var apiConfig = window.apiConfig;
  var limitMap = window.TIER_KEY_LIMITS || {};
  var tier = (window.CURRENT_USER && window.CURRENT_USER.tier) || 'diophantus';
  var limit = limitMap[tier] || 2;
  var current = (apiConfig.providers || []).filter(function (p) { return !p.isBuiltIn && p.id !== "beagle-built-in"; }).length;
  if (current >= limit) {
    window.showToast("API provider limit reached (" + limit + ") for your plan.");
    return;
  }
  var id = "new-" + Date.now().toString(36);
  apiConfig.providers.push({ id: id, label: "", url: "", key: "", model: "", vision: false, isBuiltIn: false });
  renderProviderList();
  /* Focus the first input in the newly added row. */
  var rows = document.getElementById("providerList");
  if (rows) {
    var inputs = rows.querySelectorAll('input[name="providerLabel"]');
    var last = inputs[inputs.length - 1];
    if (last) setTimeout(function () { last.focus(); }, 0);
  }
}

function removeProvider(id) {
  var apiConfig = window.apiConfig;
  var idx = apiConfig.providers.findIndex(function (p) { return p.id === id; });
  if (idx < 0) return;
  apiConfig.providers.splice(idx, 1);
  if (apiConfig.activeId === id) apiConfig.activeId = null;
  window.apiFetch("/api/api-key/" + encodeURIComponent(id), { method: "DELETE" }).catch(function () {});
  renderProviderList();
}

function setActiveProvider(id) {
  var apiConfig = window.apiConfig;
  var prevActiveId = apiConfig.activeId;
  apiConfig.activeId = id;
  window.saveLastActiveId(id);
  /* Built-in providers (beagle-built-in) are not real DB records for
     this user — skip the PATCH to avoid a 404. But we still need to
     tell the server to deactivate the previously active provider so
     the server's isActive flag stays in sync. */
  if (id === "beagle-built-in") {
    if (prevActiveId && prevActiveId !== "beagle-built-in") {
      window.apiFetch("/api/api-key/" + encodeURIComponent(prevActiveId), { method: "PATCH", body: { isActive: false } }).catch(function () {});
    }
  } else {
    window.apiFetch("/api/api-key/" + encodeURIComponent(id), { method: "PATCH", body: { isActive: true } }).catch(function () {});
  }
  window.syncModelPills();
  window.syncChatModel();
  renderProviderList();
}

function updateProviderField(id, field, value) {
  var apiConfig = window.apiConfig;
  var p = apiConfig.providers.find(function (x) { return x.id === id; });
  if (!p) return;
  if (field === "key" && value && value.trim()) {
    /* P_key-placeholder-pollution — the `••••••••` placeholder mask is
     * a visual-only placeholder; if the user types into a masked field,
     * the caret position produced the `••••••••` value as literal text
     * rather than an intent to change the key. Detect and discard this
     * degenerate case. */
    var clean = value.trim();
    if (clean === "••••••••") return;
    p.key = clean;
  } else if (field === "vision") {
    p.vision = !!value;
    p.isMultimodal = !!value; /* backward compat for attachments.js */
  } else {
    p[field] = value;
  }
}

function saveSettings() {
  var apiConfig = window.apiConfig;
  var providers = apiConfig.providers || [];
  var newRows = providers.filter(function (p) { return !p.isBuiltIn && p.id !== "beagle-built-in"; });
  if (!newRows.length) { window.showToast("Add at least one provider"); return; }
  var lastValid = null;
  var lastErr = null;
  Promise.all(newRows.map(function (p) {
    if (p.id.startsWith("new-")) {
      var body = { label: p.label || "", url: p.url || "", key: p.key || "", model: p.model || "", vision: !!p.vision };
      return window.apiFetch("/api/api-key", { method: "POST", body: body, timeoutMs: 10_000 }).then(function (r) {
        if (r && r.id) { p.id = r.id; lastValid = p.id; }
      }).catch(function (e) { lastErr = e; });
    } else {
      var body = { label: p.label, url: p.url, key: p.key || "", model: p.model, vision: !!p.vision };
      return window.apiFetch("/api/api-key/" + encodeURIComponent(p.id), { method: "PATCH", body: body, timeoutMs: 10_000 }).then(function () { lastValid = p.id; }).catch(function (e) { lastErr = e; });
    }
  })).then(function () {
    renderProviderList();
    if (lastValid) apiConfig.activeId = lastValid;
    window.saveLastActiveId(lastValid);
    window.syncModelPills();
    try { window.syncModels(); } catch (e) {}
    window.syncChatModel();
    if (lastErr) {
      window.showToast("Saved, but one provider sync failed: " + (lastErr.message || "unknown error") + ". Try saving again.");
    } else if (apiConfig.activeId) {
      window.showToast("Saved — " + window.t("api.saved"));
    }
  });
}

function clearSettings() {
  var apiConfig = window.apiConfig;
  var providers = apiConfig.providers || [];
  Promise.all(providers
    .filter(function (p) { return !p.isBuiltIn && p.id !== "beagle-built-in" && !p.id.startsWith("new-"); })
    .map(function (p) { return window.apiFetch("/api/api-key/" + encodeURIComponent(p.id), { method: "DELETE" }).catch(function () {}); })
  ).then(function () {
    apiConfig.activeId = null;
    apiConfig.providers = [Object.assign({}, window.BEAGLE_BUILT_IN)];
    try { localStorage.removeItem("socrates-provider-keys"); } catch (e) {}
    try { localStorage.removeItem(window.LAST_ACTIVE_ID_KEY); } catch (e) {}
    renderProviderList();
    window.syncModelPills();
    window.syncSettingsUI();
  });
}

export {
  openSettings, closeSettings, toggleAPI, syncSettingsUI,
  renderProviderList, addProvider, removeProvider,
  setActiveProvider, updateProviderField, saveSettings, clearSettings,
};