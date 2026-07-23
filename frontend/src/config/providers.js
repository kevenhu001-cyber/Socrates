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
/* Web Search default differs by mode — see the post-init block below
 * that runs after appMode is loaded from localStorage. We initialise
 * to true here and override below. */
var webSearchOn = true;
/* Extensive thinking: chat-mode prompt switch. When on, the full
 * CHAT_SYSTEM_PROMPT (verbose "careful scholar" voice + thinking suffix)
 * is injected; when off, CHAT_CONCISE_PROMPT replaces both. This is no
 * longer a standalone toggle — it is derived from the reasoning-effort
 * picker (High = deep thinking on). See ui/effortPicker.js. */
var extensiveThinkingOn = false;
var appMode = "chat";
var thinkingOn = true;

try {
  var savedMode = localStorage.getItem("socrates-appmode");
  if (savedMode === "chat" || savedMode === "tutor") appMode = savedMode;
} catch (e) {}
/* Web Search mode-aware default: chat mode → on, tutor mode → off.
   Tutor-mode Socratic tutoring doesn't need web search for conceptual
   topics (e.g. 复变函数), and the diagnostic-phase auto-search at
   submitChatMessage adds 12s+ of latency to the first turn. An
   existing explicit user preference (any non-null value) still wins
   so switching modes doesn't silently flip the toggle. */
try {
  var _wsSaved = localStorage.getItem("socrates-websearch");
  if (_wsSaved !== null) {
    webSearchOn = _wsSaved === "true";
  } else if (appMode === "tutor") {
    webSearchOn = false;
  }
} catch (e) { /* localStorage blocked — keep chat-mode default (true) */ }
/* Deep thinking now follows the reasoning-effort picker: High effort
 * enables the verbose prompt, Medium/Low use the concise one. Derive the
 * initial value from the persisted effort so the first turn matches the
 * picker before ui/effortPicker.js finishes loading. */
try {
  var savedEffort = localStorage.getItem("socrates-reasoning-effort");
  extensiveThinkingOn = (savedEffort === "high");
} catch (e) {}

/* P_privacy-leak — built-in providers don't expose their model name,
 * so the regex-based check below would always return false for them.
 * Use the boolean capability hint bridged from /api/config instead. */
function setWebSearchOn(value) {
  webSearchOn = !!value;
  try { window.webSearchOn = webSearchOn; } catch (e) {}
  try { localStorage.setItem("socrates-websearch", JSON.stringify(webSearchOn)); } catch (e) {}
  return webSearchOn;
}

function _isReasoningForActive() {
  var active = apiConfig.activeId;
  if (!active) return false;
  var p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  if (!p) return false;
  if (p.isBuiltIn) return !!window.BEAGLE_IS_REASONING;
  var m = (p.model || "").toLowerCase();
  var l = (p.label || "").toLowerCase();
  return /deepseek-r1|qwq-|minimax-m1|reasoning|think/.test(m) || /deepseek-r1|qwq/.test(l);
}

function isReasoningProvider() {
  return _isReasoningForActive();
}

function pickStreamBudgets() {
  var active = apiConfig.activeId;
  if (!active) return { timeoutMs: 300000, heartbeatMs: 60000, maxAttempts: 3, retryable: [429, 503] };
  var p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  if (!p) return { timeoutMs: 300000, heartbeatMs: 60000, maxAttempts: 3, retryable: [429, 503] };
  var isReasoning = _isReasoningForActive();
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
  /* Drive the .mode-segmented sliding indicator — the CSS pseudo-element
     reacts to [data-seg-active="chat"|"tutor"] and slides to the matching
     half. This produces the slide-between-Chat/Tutor animation.
     P_chatgpt-landing — the segmented control now lives in the top bar
     (#modeSegmentedTop). Mirror the attribute there too for any
     downstream CSS hooks (the new top-bar pill uses :not(::before)
     styling so the indicator itself stays hidden, but data-seg-active
     is still useful as a JS-readable signal). */
  var segEl = document.getElementById("modeSegmented");
  if (segEl) segEl.setAttribute("data-seg-active", appMode);
  try { localStorage.setItem("socrates-appmode", appMode); } catch (e) {}
  /* Mirror appMode to body[data-app-mode] so the CSS rule
     body[data-app-mode="chat"] .tutor-only{display:none !important}
     actually takes effect — hiding tutor-only tab buttons + panels
     in chat mode so the sidebar keeps a stable flex layout. */
  try { document.body.setAttribute("data-app-mode", appMode); } catch (e) {}
  /* P_mode-i18n — reroute the topic title / subtitle / disclaimer and
     the chat-input placeholder through applyI18n() so they reflect the
     active mode (chat vs tutor). Without this, toggling the mode from
     Extensions would switch CSS/visibility but leave the topic-setup
     text stuck on whichever mode was active on the first page load. */
  if (typeof window.applyI18n === 'function') {
    try { window.applyI18n(); } catch (_) {}
  }
  /* U-H2 — keep the chat-header mode badge in sync with the active
     mode whenever the mode UI is re-synced. */
  if (typeof window.updateModeBadge === 'function') {
    try { window.updateModeBadge(); } catch (_) {}
  }
  /* P_mobile-topbar — keep the mobile top-bar mode dropdown label +
     active item in sync with the current mode. */
  if (typeof window.syncMobileModeSwitch === 'function') {
    try { window.syncMobileModeSwitch(); } catch (_) {}
  }
  /* P_hide-mode-switch-in-conversation — re-evaluate the conversation-
     active body attribute whenever the mode UI is re-synced. State
     changes that don't touch msgList (e.g. setting a topic in tutor
     mode, switching phase) are caught here; message-driven changes are
     covered by the MutationObserver in mobileModeSwitch. */
  if (typeof window.syncConversationActive === 'function') {
    try { window.syncConversationActive(); } catch (_) {}
  }
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
  if (!CURRENT_USER) {
    apiConfig.activeId = null;
    apiConfig.providers = [];
    try { if (typeof window.markProvidersFetched === "function") window.markProvidersFetched(); } catch (_) {}
    try { window.syncModelPills(); } catch (_) {}
    try { window.renderProviderList(); } catch (_) {}
    return apiConfig;
  }
  try {
    var r = await window.apiFetch("/api/api-key");
    /* The API deliberately never returns plaintext keys.  Normalise its
       safe wire shape once at the boundary so the rest of the UI can keep
       using the established provider contract (`vision`, masked `key`).
       Previously `isMultimodal` / `hasKey` were left untranslated, which
       made saved models look unconfigured and silently lost their vision
       capability after every refresh. */
    var rows = Array.isArray(r && r.providers) ? r.providers.map(function (p) {
      p = p || {};
      var label = String(p.label || "").trim();
      var model = String(p.model || "").trim();
      return Object.assign({}, p, {
        label: label,
        model: model,
        /* A non-secret sentinel lets settings render the masked-key state
           without ever putting a credential back in browser memory. */
        key: p.hasKey === true ? "__configured__" : "",
        vision: p.vision === true || p.isMultimodal === true,
      });
    }) : [];
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
    /* Do not expose Beagle as a selectable fallback when the server has no
       configured built-in key.  The old unconditional insertion made the
       picker show a plausible-but-unusable model and could replace a saved
       selection with it on cold start. */
    apiConfig.providers = (window.SERVER_HAS_BEAGLE_KEY ? [BEAGLE_BUILT_IN] : []).concat(rows);
    try { if (typeof window.markProvidersFetched === "function") window.markProvidersFetched(); } catch (_) {}
    try { window.syncModelPills(); } catch (_) {}
    try { window.renderProviderList(); } catch (_) {}
    try { window.syncChatModel(); } catch (_) {}
    return apiConfig;
  } catch (e) {
    apiConfig.activeId = null;
    apiConfig.providers = [];
    try { if (typeof window.markProvidersFetched === "function") window.markProvidersFetched(); } catch (_) {}
    return apiConfig;
  }
}

var LAST_ACTIVE_ID_KEY = "socrates-last-active-id";

function saveLastActiveId(id) {
  try {
    if (!id || id === "null" || id === "undefined") {
      localStorage.removeItem(LAST_ACTIVE_ID_KEY);
      return;
    }
    localStorage.setItem(LAST_ACTIVE_ID_KEY, String(id));
  } catch (e) {}
}

function loadLastActiveId() {
  try {
    var value = localStorage.getItem(LAST_ACTIVE_ID_KEY);
    return value && value !== "null" && value !== "undefined" ? value : null;
  } catch (e) { return null; }
}

export {
  BEAGLE_BUILT_IN, apiConfig, webSearchOn, setWebSearchOn, extensiveThinkingOn, appMode, thinkingOn,
  isReasoningProvider, pickStreamBudgets, hasUsableActive,
  isMiniMaxProvider, ensureSessionShape,
  syncAppModeUI, syncSidebarForMode, setAppMode,
  refreshApiConfig,
  LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId,
};
