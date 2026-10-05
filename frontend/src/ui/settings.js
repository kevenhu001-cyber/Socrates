import { confirmClearSettings } from './dangerConfirms.js';
import { saveLastActiveId } from '../config/providers.js';
import { showToast } from './toast.js';
import { publishProfileSnapshot } from './profile.js';


/* ui/settings.js — Settings feature actions and provider persistence.
 * React owns all settings DOM; this module keeps the provider configuration
 * mutations and API operations that still depend on the legacy apiConfig.
 */

var _maskedKeys = {};
var _savedKeys = {};
var _providerErrors = {};
var _settingsOpen = false;
var _externalApiOn = true;
var _saving = false;
try {
  var saved = localStorage.getItem("socrates-external-api");
  if (saved !== null) _externalApiOn = saved === "true";
} catch {}

function _providerSnapshotRow(provider, activeId) {
  var id = String(provider.id || "");
  var isBuiltIn = !!provider.isBuiltIn || id === "beagle-built-in";
  return {
    id: id,
    label: String(provider.label || ""),
    url: String(provider.url || ""),
    model: String(provider.model || ""),
    vision: !!provider.vision,
    isBuiltIn: isBuiltIn,
    isActive: activeId === id || (!activeId && isBuiltIn),
    hasKey: !!provider.key || !!_savedKeys[id],
  };
}

function _providerSnapshot() {
  var apiConfig = window.apiConfig || {};
  var providers = Array.isArray(apiConfig.providers) ? apiConfig.providers : [];
  return providers.map(function (provider) {
    return _providerSnapshotRow(provider || {}, apiConfig.activeId);
  });
}

function _publishSettingsState() {
  var bridge = typeof window !== "undefined" && window.__socratesSettingsBridge;
  if (!bridge || typeof bridge.publish !== "function") return;
  var providerErrors = {};
  Object.keys(_providerErrors).forEach(function (id) {
    providerErrors[id] = Object.assign({}, _providerErrors[id]);
  });
  bridge.publish({
    open: _settingsOpen,
    externalApiOn: _externalApiOn,
    providers: _providerSnapshot(),
    providerErrors: providerErrors,
    saving: _saving,
  });
}

function publishSettingsProviders() {
  var apiConfig = window.apiConfig || {};
  var providers = Array.isArray(apiConfig.providers) ? apiConfig.providers : [];
  var currentIds = {};
  providers.forEach(function (provider) {
    var id = String(provider && provider.id || "");
    if (!id) return;
    currentIds[id] = true;
    if (provider.key && !id.startsWith("new-")) {
      _savedKeys[id] = true;
      if (!Object.prototype.hasOwnProperty.call(_maskedKeys, id)) _maskedKeys[id] = true;
    }
  });
  Object.keys(_maskedKeys).forEach(function (id) {
    if (!currentIds[id]) delete _maskedKeys[id];
  });
  Object.keys(_savedKeys).forEach(function (id) {
    if (!currentIds[id]) delete _savedKeys[id];
  });
  Object.keys(_providerErrors).forEach(function (id) {
    if (!currentIds[id]) delete _providerErrors[id];
  });
  _publishSettingsState();
}

async function openSettings() {
  try {
    const { mountSettingsModal } = await import('../react/settings/SettingsModal.tsx');
    mountSettingsModal();
  } catch (_) {
    showToast("Could not load settings. Please try again.");
    return;
  }
  _settingsOpen = true;
  publishSettingsProviders();
  if (typeof publishProfileSnapshot === "function") publishProfileSnapshot();
}

function closeSettings() {
  _settingsOpen = false;
  _publishSettingsState();
}

function toggleAPI() {
  _externalApiOn = !_externalApiOn;
  try { localStorage.setItem("socrates-external-api", JSON.stringify(_externalApiOn)); } catch {}
  _publishSettingsState();
}

function syncSettingsUI() {
  publishSettingsProviders();
}

/* ─── Provider validation and state operations ─── */
function _validateUrl(val) {
  if (!val || !val.trim()) return null;
  var value = val.trim();
  if (!/^https?:\/\//i.test(value)) return "URL must start with http:// or https://";
  try { new URL(value); return null; } catch (_) { return "Invalid URL format"; }
}

function _validateKey(val) {
  if (!val || !val.trim()) return null;
  if (val.trim().length < 8) return "Key is too short (min 8 characters)";
  return null;
}

function _getProvider(id) {
  var apiConfig = window.apiConfig || {};
  return (apiConfig.providers || []).find(function (provider) { return provider.id === id; });
}

function _clearProviderError(id, field) {
  var current = _providerErrors[id];
  if (!current || !Object.prototype.hasOwnProperty.call(current, field)) return;
  var next = Object.assign({}, current);
  delete next[field];
  _providerErrors = Object.assign({}, _providerErrors);
  if (Object.keys(next).length) _providerErrors[id] = next;
  else delete _providerErrors[id];
}

function updateProviderField(id, field, value) {
  var provider = _getProvider(id);
  if (!provider) return;
  if (field === "key") {
    if (value === "" && _maskedKeys[id]) return;
    if (value === "" && _savedKeys[id]) {
      provider.key = "__configured__";
      _maskedKeys[id] = true;
    } else {
      _maskedKeys[id] = false;
      provider.key = String(value);
    }
  } else if (field === "vision") {
    provider.vision = !!value;
  } else if (field === "label" || field === "url" || field === "model") {
    provider[field] = String(value);
  } else {
    return;
  }
  _clearProviderError(id, field);
  _publishSettingsState();
}

/* ─── CRUD operations ─── */

function addProvider() {
  var apiConfig = window.apiConfig;
  var limitMap = window.TIER_KEY_LIMITS || {};
  var tier = (window.CURRENT_USER && window.CURRENT_USER.tier) || 'diophantus';
  var limit = limitMap[tier] || 2;
  var current = (apiConfig.providers || []).filter(function (provider) { return !provider.isBuiltIn && provider.id !== "beagle-built-in"; }).length;
  if (current >= limit) {
    showToast("API provider limit reached (" + limit + ") for your plan.");
    return null;
  }
  var id = "new-" + Date.now().toString(36);
  apiConfig.providers.push({ id: id, label: "", url: "", key: "", model: "", vision: false, isBuiltIn: false });
  _publishSettingsState();
  return id;
}

function removeProvider(id) {
  if (id.startsWith("new-")) {
    _removeProviderLocal(id);
    return Promise.resolve(true);
  }
  return window.apiFetch("/api/api-key/" + encodeURIComponent(id), { method: "DELETE" }).then(function () {
    _removeProviderLocal(id);
    return true;
  }).catch(function (err) {
    showToast("Failed to remove provider: " + (err.message || "server error") + ". Try again.");
    return false;
  });
}

function _removeProviderLocal(id) {
  var apiConfig = window.apiConfig;
  var idx = apiConfig.providers.findIndex(function (provider) { return provider.id === id; });
  if (idx < 0) return;
  apiConfig.providers.splice(idx, 1);
  if (apiConfig.activeId === id) apiConfig.activeId = null;
  delete _maskedKeys[id];
  delete _savedKeys[id];
  delete _providerErrors[id];
  publishSettingsProviders();
  window.syncModelPills();
  window.syncChatModel();
  if (typeof window.syncEffortUI === "function") window.syncEffortUI();
}

function setActiveProvider(id) {
  var apiConfig = window.apiConfig;
  var prevActiveId = apiConfig.activeId;
  apiConfig.activeId = id;
  saveLastActiveId(id);
  _publishSettingsState();
  window.syncModelPills();
  window.syncChatModel();
  if (id === "beagle-built-in") {
    if (prevActiveId && prevActiveId !== "beagle-built-in") {
      return window.apiFetch("/api/api-key/" + encodeURIComponent(prevActiveId), { method: "PATCH", body: { isActive: false } }).catch(function () {
        /* Non-critical — server will reconcile on next refreshApiConfig */
      });
    }
    return Promise.resolve();
  }
  return window.apiFetch("/api/api-key/" + encodeURIComponent(id), { method: "PATCH", body: { isActive: true } }).catch(function () {
    apiConfig.activeId = prevActiveId;
    saveLastActiveId(prevActiveId);
    _publishSettingsState();
    window.syncModelPills();
    window.syncChatModel();
    if (typeof window.syncEffortUI === "function") window.syncEffortUI();
    showToast("Failed to activate provider on server. Changes reverted.");
  });
}

/* ─── Save with validation, loading state, and proper error handling ─── */
function _validateProvider(provider) {
  var errors = [];
  if (provider.url && provider.url.trim()) {
    var urlError = _validateUrl(provider.url);
    if (urlError) errors.push({ field: "url", msg: urlError + " for \"" + (provider.label || provider.model || provider.id) + "\"" });
  }
  if (!_maskedKeys[provider.id] && provider.key && provider.key !== "__configured__" && provider.key.trim()) {
    var keyError = _validateKey(provider.key);
    if (keyError) errors.push({ field: "key", msg: keyError + " for \"" + (provider.label || provider.model || provider.id) + "\"" });
  }
  return errors;
}

function _collectProviderErrors(rows) {
  var errorsByProvider = {};
  rows.forEach(function (provider) {
    var errors = _validateProvider(provider);
    if (!errors.length) return;
    errorsByProvider[provider.id] = {};
    errors.forEach(function (error) { errorsByProvider[provider.id][error.field] = error.msg; });
  });
  return errorsByProvider;
}

function _persistProvider(provider, results) {
  var originalId = provider.id;
  var hasReplacementKey = !_maskedKeys[originalId] && !!(provider.key && provider.key.trim()) && provider.key !== "__configured__";
  if (originalId.startsWith("new-")) {
    var create = { label: provider.label || "", url: provider.url || "", key: provider.key || "", model: provider.model || "", isMultimodal: !!provider.vision };
    return Promise.resolve().then(function () {
      return window.apiFetch("/api/api-key", { method: "POST", body: create });
    }).then(function (response) {
      if (response && response.id) provider.id = response.id;
      results.lastValidId = provider.id;
      results.lastValidLabel = provider.label || provider.model || provider.id;
      results.savedIds.push(originalId);
      results.savedProviderIds.push(provider.id);
      results.saved++;
    });
  }
  var update = { label: provider.label, url: provider.url, model: provider.model, isMultimodal: !!provider.vision };
  if (hasReplacementKey) update.key = provider.key;
  return Promise.resolve().then(function () {
    return window.apiFetch("/api/api-key/" + encodeURIComponent(originalId), { method: "PATCH", body: update });
  }).then(function () {
    results.lastValidId = originalId;
    results.lastValidLabel = provider.label || provider.model || originalId;
    results.savedIds.push(originalId);
    results.savedProviderIds.push(provider.id);
    results.saved++;
  });
}

function _recordProviderFailures(settled, rows, results) {
  settled.forEach(function (result, index) {
    if (result.status !== "rejected") return;
    results.failed++;
    results.failedIds.push(rows[index].id);
    results.lastError = result.reason;
  });
}

function _finishProviderSave(apiConfig, results) {
  _saving = false;
  if (results.lastValidId) {
    apiConfig.activeId = results.lastValidId;
    saveLastActiveId(results.lastValidId);
  } else {
    saveLastActiveId(null);
  }
  results.savedIds.forEach(function (id) {
    delete _maskedKeys[id];
    delete _savedKeys[id];
  });
  results.savedProviderIds.forEach(function (id) {
    var provider = _getProvider(id);
    if (provider && provider.key) {
      _savedKeys[id] = true;
      if (!id.startsWith("new-")) _maskedKeys[id] = true;
    }
  });
  _publishSettingsState();
  window.syncModelPills();
  window.syncChatModel();
  _notifyProviderSave(apiConfig, results);
  return { savedIds: results.savedIds, failedIds: results.failedIds };
}

function _notifyProviderSave(apiConfig, results) {
  var message = (results.lastError && results.lastError.message) || "unknown error";
  if (results.failed > 0 && results.saved > 0) {
    showToast("Saved " + results.saved + " provider(s), but " + results.failed + " failed: " + message + ". Try saving again.");
  } else if (results.failed > 0) {
    showToast("Save failed: " + message);
  } else if (apiConfig.activeId) {
    showToast("Saved — " + (results.lastValidLabel || apiConfig.activeId));
  }
}

async function saveSettings() {
  if (_saving) return { savedIds: [], failedIds: [] };
  var apiConfig = window.apiConfig;
  var providers = apiConfig.providers || [];
  var rows = providers.filter(function (provider) { return !provider.isBuiltIn && provider.id !== "beagle-built-in"; });
  var hasBuiltIn = providers.some(function (provider) { return provider.isBuiltIn || provider.id === "beagle-built-in"; });
  if (!rows.length) {
    showToast(hasBuiltIn ? "Built-in AI is already active." : "Add at least one provider");
    return { savedIds: [], failedIds: [] };
  }

  var validationErrors = _collectProviderErrors(rows);
  var invalidIds = Object.keys(validationErrors);
  if (invalidIds.length) {
    _providerErrors = validationErrors;
    _publishSettingsState();
    showToast("Please fix the highlighted errors before saving.");
    return { savedIds: [], failedIds: invalidIds };
  }

  _providerErrors = {};
  _saving = true;
  _publishSettingsState();
  var results = { saved: 0, failed: 0, lastError: null, lastValidId: null, lastValidLabel: null, savedIds: [], savedProviderIds: [], failedIds: [] };
  try {
    var settled = await Promise.allSettled(rows.map(function (provider) { return _persistProvider(provider, results); }));
    _recordProviderFailures(settled, rows, results);
  } catch (error) {
    results.failed = rows.length;
    results.failedIds = rows.map(function (provider) { return provider.id; });
    results.lastError = error;
  }
  return _finishProviderSave(apiConfig, results);
}

/* ─── Clear all (delegates to confirmClearSettings) ─── */
function clearSettings() {
  /* Use the existing confirm dialog from dangerConfirms.js */
  confirmClearSettings();
}

export {
  openSettings, closeSettings, toggleAPI, syncSettingsUI, publishSettingsProviders,
  addProvider, removeProvider, setActiveProvider, updateProviderField,
  saveSettings, clearSettings,
};
