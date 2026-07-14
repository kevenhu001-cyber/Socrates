/* config/providers.js — Wave 3 of main-js-split plan.
 * Provider configuration: apiConfig, BEAGLE_BUILT_IN, webSearchOn, appMode,
 * and helper functions for reasoning/model detection.
 * Extracted from main.js L9169-L9566 + refreshApiConfig at L9291.
 *
 * CRITICAL: apiConfig is mutated in place by callers (apiConfig.activeId = ...),
 * NEVER reassigned (apiConfig = {...}). See window.apiConfig bridge comment.
 */

/* P_privacy-leak — do NOT put a real or fake model name in the default.
 * The built-in "Beagle" provider is an alias; the actual upstream model
 * is operator-configured server-side and must never be hinted at in
 * the public client bundle. The model field is intentionally empty
 * (server uses provider.model from the DB regardless of what's here).
 * Reasoning/vision flags stay on (Beagle supports both by default). */
var BEAGLE_BUILT_IN = { id: "beagle-built-in", label: "Beagle", url: "/api/minimax/v1", model: "", vision: true, isBuiltIn: true, key: "" };
var apiConfig = { activeId: null, providers: [] };
var webSearchOn = false;
var appMode = "chat";
var thinkingOn = true;

try {
  var savedMode = localStorage.getItem("socrates-appmode");
  if (savedMode === "chat" || savedMode === "tutor") appMode = savedMode;
} catch (e) {}
try {
  var saved = localStorage.getItem("socrates-websearch");
  if (saved !== null) webSearchOn = saved === "true";
} catch (e) {}

function isReasoningProvider() {
  var active = apiConfig.activeId;
  if (!active) return false;
  var p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  if (!p) return false;
  var m = (p.model || "").toLowerCase();
  var l = (p.label || "").toLowerCase();
  return /deepseek-r1|qwq-|minimax-m1|reasoning|think/.test(m) || /deepseek-r1|qwq/.test(l);
}

function pickStreamBudgets() {
  var active = apiConfig.activeId;
  if (!active) return { timeoutMs: 300000, heartbeatMs: 60000, maxAttempts: 3, retryable: [429, 503] };
  var p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  if (!p) return { timeoutMs: 300000, heartbeatMs: 60000, maxAttempts: 3, retryable: [429, 503] };
  var m = (p.model || "").toLowerCase();
  var l = (p.label || "").toLowerCase();
  var isReasoning = /deepseek-r1|qwq-|minimax-m1/.test(m) || /deepseek-r1|qwq/.test(l);
  return { timeoutMs: isReasoning ? 600000 : 300000, heartbeatMs: isReasoning ? 120000 : 60000, maxAttempts: 5, retryable: [429, 500, 502, 503] };
}

function hasUsableActive() {
  var active = apiConfig.activeId;
  if (!active) return false;
  var p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  return !!p;
}

function isMiniMaxProvider() {
  var active = apiConfig.activeId;
  if (!active) return false;
  var p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  return p ? /minimax/.test((p.model || "").toLowerCase()) : false;
}

function ensureSessionShape(s) {
  if (!s) s = {};
  if (!Array.isArray(s.kbNodes)) s.kbNodes = [];
  if (!Array.isArray(s.mistakes)) s.mistakes = [];
  return s;
}

function syncAppModeUI() {
  var toggles = document.querySelectorAll(".app-mode-toggle");
  toggles.forEach(function (el) { el.classList.toggle("active", el.dataset.mode === appMode); });
  var chatEl = document.getElementById("chatModeToggle");
  var tutorEl = document.getElementById("tutorModeToggle");
  if (chatEl) chatEl.classList.toggle("active", appMode === "chat");
  if (tutorEl) tutorEl.classList.toggle("active", appMode === "tutor");
  try { localStorage.setItem("socrates-appmode", appMode); } catch (e) {}
  /* Mirror appMode to body[data-app-mode] so the CSS rule
     body[data-app-mode="chat"] .tutor-only{display:none !important}
     actually takes effect — hiding tutor-only tab buttons + panels
     in chat mode so the sidebar keeps a stable flex layout. */
  try { document.body.setAttribute("data-app-mode", appMode); } catch (e) {}
}

/* Setter for appMode — updates the module-level variable so
   syncAppModeUI / syncSidebarForMode / pickers.js see the new
   value. main.js's toggleAppMode calls this instead of directly
   assigning window.appMode, because the imported binding is
   read-only and the old code was inadvertently reverting the
   toggle by reading back the stale module variable. */
function setAppMode(v) {
  appMode = v;
}

function syncSidebarForMode() {
  var tutorOnly = document.querySelectorAll(".tutor-only");
  tutorOnly.forEach(function (el) { el.style.display = appMode === "tutor" ? "" : "none"; });
  var chatModeEl = document.getElementById("chatModeOnly");
  if (chatModeEl) chatModeEl.style.display = appMode === "chat" ? "" : "none";
}

async function refreshApiConfig() {
  var CURRENT_USER = window.CURRENT_USER;
  console.log("[refreshApiConfig] ENTRY, CURRENT_USER=", CURRENT_USER && CURRENT_USER.email);
  if (!CURRENT_USER) {
    console.log("[refreshApiConfig] EARLY RETURN: no CURRENT_USER");
    apiConfig.activeId = null;
    apiConfig.providers = [];
    try { if (typeof window.markProvidersFetched === "function") window.markProvidersFetched(); } catch (_) {}
    try { window.syncModelPills(); } catch (_) {}
    try { window.renderProviderList(); } catch (_) {}
    return apiConfig;
  }
  try {
    var r = await window.apiFetch("/api/api-key");
    console.log("[refreshApiConfig] /api/api-key response:", r);
    var rows = Array.isArray(r && r.providers) ? r.providers : [];
    var serverBeagleModel = null;
    var serverBeagleRow = rows.find(function (p) { return p.id === BEAGLE_BUILT_IN.id; });
    if (serverBeagleRow) serverBeagleModel = serverBeagleRow.model;
    rows = rows.filter(function (p) { return p.id !== BEAGLE_BUILT_IN.id; });
    if (serverBeagleModel) BEAGLE_BUILT_IN.model = serverBeagleModel;
    var lastId = null;
    try { lastId = localStorage.getItem(LAST_ACTIVE_ID_KEY); } catch (_) {}
    var activeId = null;
    /* Priority 1: user's last selection from localStorage.
       This ensures the user's preference survives page refresh,
       even for providers (like beagle-built-in) not tracked
       by the server's isActive flag. */
    if (lastId) {
      if (lastId === BEAGLE_BUILT_IN.id && window.SERVER_HAS_BEAGLE_KEY) {
        activeId = lastId;
      } else if (rows.some(function (p) { return p.id === lastId; })) {
        activeId = lastId;
      }
    }
    /* Priority 2: server's isActive flag (sync from other devices). */
    if (!activeId) {
      var serverActive = rows.find(function (p) { return p.isActive; });
      if (serverActive) activeId = serverActive.id;
    }
    /* Priority 3: built-in Beagle if available. */
    if (!activeId && window.SERVER_HAS_BEAGLE_KEY) { activeId = BEAGLE_BUILT_IN.id; }
    /* Priority 4: first user provider. */
    if (!activeId && rows.length > 0) { activeId = rows[0].id; }
    apiConfig.activeId = activeId;
    apiConfig.providers = [BEAGLE_BUILT_IN].concat(rows);
    try { if (typeof window.markProvidersFetched === "function") window.markProvidersFetched(); } catch (_) {}
    try { window.syncModelPills(); } catch (_) {}
    try { window.renderProviderList(); } catch (_) {}
    try { window.syncChatModel(); } catch (_) {}
    return apiConfig;
  } catch (e) {
    console.warn("[refreshApiConfig] failed:", e && e.message);
    apiConfig.activeId = null;
    apiConfig.providers = [];
    try { if (typeof window.markProvidersFetched === "function") window.markProvidersFetched(); } catch (_) {}
    return apiConfig;
  }
}

var LAST_ACTIVE_ID_KEY = "socrates-last-active-id";

function saveLastActiveId(id) {
  try { localStorage.setItem(LAST_ACTIVE_ID_KEY, id); } catch (e) {}
}

function loadLastActiveId() {
  try { return localStorage.getItem(LAST_ACTIVE_ID_KEY) || null; } catch (e) { return null; }
}

export {
  BEAGLE_BUILT_IN, apiConfig, webSearchOn, appMode, thinkingOn,
  isReasoningProvider, pickStreamBudgets, hasUsableActive,
  isMiniMaxProvider, ensureSessionShape,
  syncAppModeUI, syncSidebarForMode, setAppMode,
  refreshApiConfig,
  LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId,
};