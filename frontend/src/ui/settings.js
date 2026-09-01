/* ui/settings.js — Wave 2c of main-js-split plan.
 * Settings modal: API provider list + CRUD.
 * Extracted from main.js L11743-L12058.
 *
 * Optimizations:
 *   - Event delegation on providerList (no inline onclick/oninput/onchange).
 *   - API Key never exposed in input value attribute; uses placeholder mask.
 *   - Input validation (URL format, key length) with inline error messages.
 *   - saveSettings uses Promise.allSettled + disables button during save.
 *   - setActiveProvider rolls back on PATCH failure.
 *   - removeProvider deletes server-side first, then updates local state.
 *   - clearSettings uses confirmClearSettings from dangerConfirms.js.
 *
 * Touches via window.*:
 *   apiConfig (mutate in place — CRITICAL!), BEAGLE_BUILT_IN, SERVER_HAS_BEAGLE_KEY,
 *   TIER_KEY_LIMITS, LAST_ACTIVE_ID_KEY, CURRENT_USER, loadLastActiveId,
 *   syncModelPills, syncChatModel, syncSettingsUI, esc, escAttr, t, apiFetch,
 *   markProvidersFetched, renderProviderList (self-call, recurses via saveSettings)
 */

/* ─── Track keys that are masked (existing saved keys not shown in DOM) ─── */
var _maskedKeys = {};

/* React migration bridge — publishes settings modal state so the React
   compatibility root renders the overlay. M4 step 4.5b: the snapshot
   carries `{ open, externalApiOn }` only — React owns the skeleton
   (toggle track, provider list container, tone preset container, action
   buttons) and derives their classes from this state. The bodyHTML
   round-trip is gone: legacy `renderProviderList()` / `renderTonePresets()`
   write directly into the React-rendered containers. */
function _publishSettingsState() {
  try {
    var bridge = window.__socratesSettingsBridge;
    if (bridge && typeof bridge.publish === "function") {
      var overlay = document.getElementById("settingsOverlay");
      bridge.publish({
        open: overlay ? !overlay.classList.contains("hidden") : false,
        externalApiOn: _externalApiOn,
      });
    }
  } catch (_) { /* swallow */ }
}

/* ─── Open / Close ─── */
function openSettings() {
  document.getElementById("settingsOverlay").classList.remove("hidden");
  syncToggleUI();
  renderProviderList();
  if (typeof window.renderTonePresets === "function") window.renderTonePresets();
  _publishSettingsState();
}

function closeSettings() {
  document.getElementById("settingsOverlay").classList.add("hidden");
  _publishSettingsState();
}

/* The settings modal buttons are React-owned since M4 step 4.5b
   (SettingsModal.tsx renders them with onClick handlers that call the
   legacy actions below). There is no bindSettingsUI() anymore. */

/* ─── "Use External API" toggle — now actually tracked and functional ─── */
var _externalApiOn = true;
try {
  var saved = localStorage.getItem("socrates-external-api");
  if (saved !== null) _externalApiOn = saved === "true";
} catch {}

function toggleAPI() {
  _externalApiOn = !_externalApiOn;
  try { localStorage.setItem("socrates-external-api", JSON.stringify(_externalApiOn)); } catch {}
  /* React owns the toggle-track `on` class and the provider-list
     `collapsed` class (derived from snap.externalApiOn), so we only
     publish — no direct classList toggling (M4 step 4.5b). */
  _publishSettingsState();
}

function syncToggleUI() {
  _publishSettingsState();
}

function syncSettingsUI() {
  syncToggleUI();
}

/* ─── Validation helpers ─── */
function _validateUrl(val) {
  if (!val || !val.trim()) return null; /* empty is OK (optional) */
  var v = val.trim();
  if (!/^https?:\/\//i.test(v)) return "URL must start with http:// or https://";
  try { new URL(v); return null; } catch (_) { return "Invalid URL format"; }
}

function _validateKey(val) {
  if (!val || !val.trim()) return null; /* empty is OK (optional) */
  if (val.trim().length < 8) return "Key is too short (min 8 characters)";
  return null;
}

function _clearFieldError(el) {
  var err = el.parentNode && el.parentNode.querySelector(".settings-field-error");
  if (err) err.remove();
  el.classList.remove("input-error");
}

function _showFieldError(el, msg) {
  _clearFieldError(el);
  el.classList.add("input-error");
  var err = document.createElement("span");
  err.className = "settings-field-error";
  err.textContent = msg;
  el.parentNode.appendChild(err);
}

/* ─── Render provider list ─── */
function renderProviderList() {
  var cont = document.getElementById("providerList");
  if (!cont) return;
  var apiConfig = window.apiConfig;
  var allProviders = apiConfig.providers || [];
  var userProviders = allProviders.filter(function (p) { return !p.isBuiltIn && p.id !== "beagle-built-in"; });
  var builtIn = allProviders.find(function (p) { return p.isBuiltIn || p.id === "beagle-built-in"; });
  if (!userProviders.length) {
    if (builtIn) {
      var t2 = window.t;
      var esc2 = window.esc;
      var biLabel = esc2(builtIn.label || builtIn.model || "Built-in AI");
      var biModel = esc2(builtIn.model || "");
      var builtInActive = apiConfig.activeId === builtIn.id || !apiConfig.activeId;
      var hint = esc2(t2 && t2("settings.builtInHint") || "Your built-in AI is ready to use. Add a custom provider below if you want to use your own API key.");
      cont.innerHTML =
        '<div class="provider-row built-in-row' + (builtInActive ? ' active' : '') + '" data-id="' + esc2(builtIn.id) + '">'
        + '<button class="provider-active-btn" title="' + (builtInActive ? "Active model" : "Set as active") + '">' + (builtInActive ? "●" : "○") + '</button>'
        + '<div class="provider-fields">'
        + '<div class="provider-builtin-label">' + biLabel + (builtInActive ? ' <span class="provider-builtin-tag">' + esc2(t2 && t2("settings.builtInTag") || "Built-in · Active") + '</span>' : '') + '</div>'
        + '<div class="provider-builtin-model">' + biModel + '</div>'
        + '<div class="provider-builtin-hint">' + hint + '</div>'
        + '</div>'
        + '</div>'
        + '<div class="provider-empty">' + esc2(t2 && t2("settings.noCustomProviders") || 'No custom providers. Click "+ Add" to use your own API key.') + '</div>';
    } else {
      cont.innerHTML = '<div class="provider-empty">No models yet. Click "+ Add" to configure your first one.</div>';
    }
    return;
  }
  var t = window.t;
  var esc = window.esc;
  var html = "";
  userProviders.forEach(function (p) {
    var isActive = p.id === apiConfig.activeId;
    var hasKey = !!p.key;
    var keyIsMasked = hasKey && !p.id.startsWith("new-");
    if (keyIsMasked) _maskedKeys[p.id] = true;
    /* Key field: use a placeholder-only approach for security.
       Existing keys show "••••••••" as placeholder with no value.
       New keys (new-*) show the actual key in value. */
    var keyValue = (!hasKey || keyIsMasked) ? "" : esc(p.key);
    var keyPlaceholder = keyIsMasked ? "••••••••" : (esc(t("provider.placeholderKey") || "sk-..."));
    html += '<div class="provider-row' + (isActive ? " active" : "") + '" data-id="' + esc(p.id || "") + '">';
    html += '<button class="provider-active-btn" title="' + (isActive ? "Active model" : "Set as active") + '">' + (isActive ? "●" : "○") + '</button>';
    html += '<div class="provider-fields">';
    html += '<input class="settings-input" data-field="label" placeholder="' + esc(t("provider.placeholderLabel") || "Label") + '" value="' + esc(p.label || "") + '">';
    html += '<input class="settings-input" data-field="url" placeholder="' + esc(t("provider.placeholderUrl") || "Base URL") + '" value="' + esc(p.url || "") + '">';
    html += '<form style="display:contents" onsubmit="return false"><input type="text" name="username" autocomplete="username" style="display:none" aria-hidden="true"><input class="settings-input" data-field="key" type="password" autocomplete="new-password" placeholder="' + keyPlaceholder + '" value="' + keyValue + '"></form>';
    html += '<input class="settings-input" data-field="model" placeholder="' + esc(t("provider.placeholderModel") || "Model ID") + '" value="' + esc(p.model || "") + '">';
    html += '<label class="provider-multimodal" title="' + esc(t("provider.multimodalHint") || "") + '">'
       + '<input type="checkbox" data-field="vision"'
       + (p.vision ? ' checked' : '')
       + '>'
       + '<span data-i18n-key="provider.multimodal">Multimodal (vision-capable)</span>'
       + '</label>';
    html += '</div>';
    html += '<button class="provider-del" title="Remove">&times;</button>';
    html += '</div>';
  });
  cont.innerHTML = html;
  /* Re-bind event delegation after innerHTML replace */
  _bindProviderListEvents(cont);
}

/* ─── Event delegation ─── */
var _providerListBound = false;
function _bindProviderListEvents(cont) {
  /* We use a fresh listener each render since innerHTML replaces the DOM.
     Remove old listener by cloning a new approach: we use capturing on the
     container with a single handler for all events. */
  if (_providerListBound) {
    cont.removeEventListener("click", _onProviderListClick);
    cont.removeEventListener("input", _onProviderListInput);
    cont.removeEventListener("change", _onProviderListChange);
    cont.removeEventListener("focusin", _onProviderListFocusIn);
  }
  cont.addEventListener("click", _onProviderListClick);
  cont.addEventListener("input", _onProviderListInput);
  cont.addEventListener("change", _onProviderListChange);
  cont.addEventListener("focusin", _onProviderListFocusIn);
  _providerListBound = true;
}

function _getProviderId(el) {
  var row = el && el.closest && el.closest(".provider-row");
  return row ? row.getAttribute("data-id") : null;
}

function _getProvider(id) {
  var apiConfig = window.apiConfig;
  return (apiConfig.providers || []).find(function (x) { return x.id === id; });
}

function _onProviderListClick(e) {
  var target = e.target;
  if (target.classList.contains("provider-active-btn")) {
    var id = _getProviderId(target);
    if (id) setActiveProvider(id);
    return;
  }
  if (target.classList.contains("provider-del")) {
    var id = _getProviderId(target);
    if (id) removeProvider(id);
    return;
  }
}

function _onProviderListInput(e) {
  var target = e.target;
  if (!target.classList.contains("settings-input")) return;
  var field = target.getAttribute("data-field");
  if (!field) return;
  var id = _getProviderId(target);
  if (!id) return;
  /* Clear any previous error for this field on input */
  _clearFieldError(target);
  var value = target.value;
  var p = _getProvider(id);
  if (!p) return;
  if (field === "key") {
    /* If the field was masked and user types, the mask placeholder is gone.
       If the user clears the field, treat as "keep existing key" (no-op). */
    if (value === "" && _maskedKeys[id]) {
      /* User cleared a masked field — don't delete the key, just leave it */
      return;
    }
    /* If user types something, unmask and store */
    delete _maskedKeys[id];
    p.key = value;
  } else if (field === "vision") {
    /* handled by change event */
  } else {
    p[field] = value;
  }
}

function _onProviderListChange(e) {
  var target = e.target;
  if (target.getAttribute("data-field") === "vision" && target.type === "checkbox") {
    var id = _getProviderId(target);
    if (!id) return;
    var p = _getProvider(id);
    if (p) p.vision = target.checked;
  }
}

function _onProviderListFocusIn(e) {
  var target = e.target;
  if (!target.classList.contains("settings-input")) return;
  var field = target.getAttribute("data-field");
  if (field !== "key") return;
  var id = _getProviderId(target);
  if (!id) return;
  /* If this field was masked (existing key not shown), clear the value
     so the user can type a new key. The empty value means "keep existing". */
  if (_maskedKeys[id]) {
    target.value = "";
    /* Don't delete _maskedKeys yet — we keep it until the user actually types */
  }
}

/* ─── CRUD operations ─── */

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
    var inputs = rows.querySelectorAll('input[data-field="label"]');
    var last = inputs[inputs.length - 1];
    if (last) setTimeout(function () { last.focus(); }, 0);
  }
}

function removeProvider(id) {
  /* Server-first: delete on server before updating local state */
  if (id.startsWith("new-")) {
    /* Not yet saved on server — just remove locally */
    _removeProviderLocal(id);
    return;
  }
  window.apiFetch("/api/api-key/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
    _removeProviderLocal(id);
  }).catch(function (err) {
    window.showToast("Failed to remove provider: " + (err.message || "server error") + ". Try again.");
  });
}

function _removeProviderLocal(id) {
  var apiConfig = window.apiConfig;
  var idx = apiConfig.providers.findIndex(function (p) { return p.id === id; });
  if (idx < 0) return;
  apiConfig.providers.splice(idx, 1);
  if (apiConfig.activeId === id) apiConfig.activeId = null;
  delete _maskedKeys[id];
  renderProviderList();
  window.syncModelPills();
  window.syncChatModel();
}

function setActiveProvider(id) {
  var apiConfig = window.apiConfig;
  var prevActiveId = apiConfig.activeId;
  /* Optimistic update */
  apiConfig.activeId = id;
  window.saveLastActiveId(id);
  renderProviderList();
  window.syncModelPills();
  window.syncChatModel();
  /* Sync with server; rollback on failure */
  if (id === "beagle-built-in") {
    if (prevActiveId && prevActiveId !== "beagle-built-in") {
      window.apiFetch("/api/api-key/" + encodeURIComponent(prevActiveId), { method: "PATCH", body: { isActive: false } }).catch(function () {
        /* Non-critical — server will reconcile on next refreshApiConfig */
      });
    }
  } else {
    window.apiFetch("/api/api-key/" + encodeURIComponent(id), { method: "PATCH", body: { isActive: true } }).catch(function () {
      /* Rollback on failure */
      apiConfig.activeId = prevActiveId;
      window.saveLastActiveId(prevActiveId);
      renderProviderList();
      window.syncModelPills();
      window.syncChatModel();
      window.showToast("Failed to activate provider on server. Changes reverted.");
    });
  }
}

function updateProviderField(id, field, value) {
  /* Legacy API kept for any external callers; new code uses event delegation */
  var p = _getProvider(id);
  if (!p) return;
  if (field === "key") {
    delete _maskedKeys[id];
    p.key = value;
  } else if (field === "vision") {
    p.vision = !!value;
  } else {
    p[field] = value;
  }
}

/* ─── Save with validation, loading state, and proper error handling ─── */
var _saving = false;

function _validateProvider(p) {
  var errors = [];
  if (p.url && p.url.trim()) {
    var urlErr = _validateUrl(p.url);
    if (urlErr) errors.push({ field: "url", msg: urlErr + " for \"" + (p.label || p.model || p.id) + "\"" });
  }
  /* `key` is a non-secret configured sentinel after a refresh.  It
     represents an existing encrypted key, not user input to validate. */
  if (!_maskedKeys[p.id] && p.key && p.key.trim()) {
    var keyErr = _validateKey(p.key);
    if (keyErr) errors.push({ field: "key", msg: keyErr + " for \"" + (p.label || p.model || p.id) + "\"" });
  }
  return errors;
}

function _highlightFieldErrors(providerId, errors) {
  var cont = document.getElementById("providerList");
  if (!cont) return;
  var row = cont.querySelector('.provider-row[data-id="' + providerId + '"]');
  if (!row) return;
  errors.forEach(function (e) {
    var input = row.querySelector('input[data-field="' + e.field + '"]');
    if (input) _showFieldError(input, e.msg);
  });
}

function saveSettings() {
  if (_saving) return;
  var apiConfig = window.apiConfig;
  var providers = apiConfig.providers || [];
  var newRows = providers.filter(function (p) { return !p.isBuiltIn && p.id !== "beagle-built-in"; });
  var hasBuiltIn = providers.some(function (p) { return p.isBuiltIn || p.id === "beagle-built-in"; });
  if (!newRows.length && !hasBuiltIn) { window.showToast("Add at least one provider"); return; }
  if (!newRows.length && hasBuiltIn) { window.showToast("Built-in AI is already active."); return; }

  /* Validate all providers first */
  var allErrors = [];
  newRows.forEach(function (p) {
    var errs = _validateProvider(p);
    if (errs.length) {
      allErrors = allErrors.concat(errs);
      _highlightFieldErrors(p.id, errs);
    }
  });
  if (allErrors.length) {
    window.showToast("Please fix the highlighted errors before saving.");
    return;
  }

  _saving = true;
  _setSaveButtonState(true);

  var results = { saved: 0, failed: 0, lastError: null, lastValidId: null };

  Promise.allSettled(newRows.map(function (p) {
    var hasReplacementKey = !_maskedKeys[p.id] && !!(p.key && p.key.trim());
    if (p.id.startsWith("new-")) {
      var body = { label: p.label || "", url: p.url || "", key: p.key || "", model: p.model || "", isMultimodal: !!p.vision };
      return window.apiFetch("/api/api-key", { method: "POST", body: body, timeoutMs: 10_000 }).then(function (r) {
        if (r && r.id) { p.id = r.id; results.lastValidId = p.id; }
        results.saved++;
      });
    } else {
      var body = { label: p.label, url: p.url, model: p.model, isMultimodal: !!p.vision };
      /* Empty password fields mean "keep the encrypted key", never
         replace it with an encryption of an empty string. */
      if (hasReplacementKey) body.key = p.key;
      return window.apiFetch("/api/api-key/" + encodeURIComponent(p.id), { method: "PATCH", body: body, timeoutMs: 10_000 }).then(function () {
        results.lastValidId = p.id;
        results.saved++;
      });
    }
  })).then(function (settled) {
    settled.forEach(function (r) {
      if (r.status === "rejected") {
        results.failed++;
        results.lastError = r.reason;
      }
    });
  }).finally(function () {
    _saving = false;
    _setSaveButtonState(false);
    renderProviderList();
    if (results.lastValidId) {
      apiConfig.activeId = results.lastValidId;
      window.saveLastActiveId(results.lastValidId);
    } else {
      window.saveLastActiveId(null);
    }
    window.syncModelPills();
    window.syncChatModel();
    if (results.failed > 0 && results.saved > 0) {
      window.showToast("Saved " + results.saved + " provider(s), but " + results.failed + " failed: " + ((results.lastError && results.lastError.message) || "unknown error") + ". Try saving again.");
    } else if (results.failed > 0) {
      window.showToast("Save failed: " + ((results.lastError && results.lastError.message) || "unknown error"));
    } else if (apiConfig.activeId) {
      window.showToast("Saved — " + window.t("api.saved"));
    }
  });
}

function _setSaveButtonState(disabled) {
  var saveBtn = document.querySelector(".settings-btn.primary");
  if (!saveBtn) return;
  saveBtn.disabled = disabled;
  saveBtn.textContent = disabled ? "Saving…" : "Save";
  saveBtn.classList.toggle("saving", disabled);
}

/* ─── Clear all (delegates to confirmClearSettings) ─── */
function clearSettings() {
  /* Use the existing confirm dialog from dangerConfirms.js */
  window.confirmClearSettings();
}

export {
  openSettings, closeSettings, toggleAPI, syncSettingsUI,
  renderProviderList, addProvider, removeProvider,
  setActiveProvider, updateProviderField, saveSettings, clearSettings,
};
