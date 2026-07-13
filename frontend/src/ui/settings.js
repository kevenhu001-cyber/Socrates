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
  var rows = document.getElementById("providerRows");
  if (rows) rows.classList.toggle("collapsed");
}

function syncSettingsUI() {
  var rows = document.getElementById("providerRows");
  if (rows) rows.classList.remove("collapsed");
}

function renderProviderList() {
  var rows = document.getElementById("providerRows");
  if (!rows) return;
  var apiConfig = window.apiConfig;
  var providers = apiConfig.providers || [];
  var activeId = apiConfig.activeId;

  /* Surface the built-in provider first (Beagle), then sorted active key first. */
  var sorted = providers.slice().sort(function (a, b) {
    if (a.id === "beagle-built-in") return -1;
    if (b.id === "beagle-built-in") return 1;
    if (a.id === activeId) return -1;
    if (b.id === activeId) return 1;
    return 0;
  });
  rows.innerHTML = sorted.map(function (p, idx) { return renderProviderRow(p, idx === 0); }).join("");

  /* ─── provider-row indexing ───
   * The very first row is a special Beagle built-in section rendered only when
   * SERVER_HAS_BEAGLE_KEY is true. It's followed by user-added providers.
   * The inline `onclick` / `oninput` handlers rely on row-idx-relative targets
   * found by the updateProviderField / setActiveProvider functions.
   * Every row except Beagle has clickable active/delete and editable fields. */
}

function renderProviderRow(p, isFirst) {
  var isBuiltIn = p.isBuiltIn || p.id === "beagle-built-in";
  var apiConfig = window.apiConfig;
  var activeId = apiConfig.activeId;
  var isActive = p.id === activeId;
  var label = window.esc(p.label || (p.id === "beagle-built-in" ? "Built-in" : ""));
  var url = window.esc(p.url || "");
  var model = window.esc(p.model || "");
  var keyPreview = p.key ? "••••••••" : (p.id && p.id.indexOf("new-") !== 0 ? "••••••••" : "");
  var hasVision = p.vision ? "checked" : "";

  if (isBuiltIn) {
    return '<div class="provider-row builtin-row" data-pid="' + window.esc(p.id) + '">' +
      '<div class="provider-label"><strong>Beagle (Built-in)</strong>' +
      '</div><div class="provider-model-row">Model: <span class="provider-model-label">' + model + '</span>' +
      '</div></div>';
  }

  var keyInput = keyPreview
    ? '<input class="provider-input" id="key-' + window.esc(p.id) + '" type="password" placeholder="••••••••" oninput="updateProviderField(\'' + window.esc(p.id) + '\',\'key\',this.value)" value="' + window.esc(keyPreview) + '">'
    : '<input class="provider-input" id="key-' + window.esc(p.id) + '" type="password" placeholder="sk-..." oninput="updateProviderField(\'' + window.esc(p.id) + '\',\'key\',this.value)">';

  return '<div class="provider-row' + (isActive ? ' active' : '') + '" data-pid="' + window.esc(p.id) + '">' +
    '<div class="provider-label"><input class="provider-input provider-label-input" id="label-' + window.esc(p.id) + '" value="' + label + '" placeholder="e.g. My OpenAI key" oninput="updateProviderField(\'' + window.esc(p.id) + '\',\'label\',this.value)">' +
    '</div>' +
    '<div class="provider-field"><span class="provider-field-label">URL</span><input class="provider-input" id="url-' + window.esc(p.id) + '" value="' + url + '" placeholder="https://api.openai.com/v1" oninput="updateProviderField(\'' + window.esc(p.id) + '\',\'url\',this.value)"></div>' +
    '<div class="provider-field">' + keyInput + '</div>' +
    '<div class="provider-model-row"><span class="provider-field-label">Model</span><input class="provider-input" id="model-' + window.esc(p.id) + '" value="' + model + '" placeholder="e.g. gpt-4o-mini" oninput="updateProviderField(\'' + window.esc(p.id) + '\',\'model\',this.value)"></div>' +
    '<div class="provider-actions">' +
    '<label class="provider-action provider-checkbox"><input type="checkbox" ' + hasVision + ' onchange="updateProviderField(\'' + window.esc(p.id) + '\',\'vision\',this.checked)"> Vision</label>' +
    '<button class="provider-action ' + (isActive ? 'active' : '') + '" onclick="setActiveProvider(\'' + window.esc(p.id) + '\')">' + (isActive ? '&bull; Active' : 'Activate') + '</button>' +
    '<button class="provider-action danger" onclick="removeProvider(\'' + window.esc(p.id) + '\')">Delete</button>' +
    '</div></div>';
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
  var el = document.getElementById("label-" + id);
  if (el) setTimeout(function () { el.focus(); }, 0);
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
  apiConfig.activeId = id;
  window.saveLastActiveId(id);
  window.apiFetch("/api/api-key/" + encodeURIComponent(id) + "/activate", { method: "PATCH" }).catch(function () {});
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
    window.syncModels();
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