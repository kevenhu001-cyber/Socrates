import { reportSwallow } from '../util/reportSwallow.ts';
import { getProviderConfigSnapshot, refreshProviderConfig } from './providerConfig.service.ts';
import { LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId } from './providerConfig.service.ts';
/* config/providers.js — Wave 3 of main-js-split plan.
 * App preferences and helper functions for reasoning/model detection.
 * Extracted from main.js L9169-L9566 + refreshApiConfig at L9291.
 */
/* Web search is off by default. A stored explicit preference still wins;
 * see the post-init block below that runs after appMode is loaded. */
var webSearchOn = false;
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
} catch (e) {reportSwallow(e, 'config/providers.restoreAppMode', 'expected'); }
/* Web search stays off unless the user explicitly enabled it before.
   An existing stored preference (any non-null value) still wins. */
try {
  var _wsSaved = localStorage.getItem("socrates-websearch");
  if (_wsSaved !== null) {
    webSearchOn = _wsSaved === "true";
  }
} catch (e) { /* localStorage blocked — keep the default (false) */ reportSwallow(e, 'config/providers.restoreWebSearchOn'); }
/* Deep thinking now follows the reasoning-effort picker: High effort
 * enables the verbose prompt, Medium/Low use the concise one. Derive the
 * initial value from the persisted effort so the first turn matches the
 * picker before ui/effortPicker.js finishes loading. */
try {
  var savedEffort = localStorage.getItem("socrates-reasoning-effort");
  extensiveThinkingOn = (savedEffort === "high");
} catch (e) {reportSwallow(e, 'config/providers.restoreReasoningEffort', 'expected'); }

/* P_privacy-leak — built-in providers don't expose their model name,
 * so the regex-based check below would always return false for them.
 * Use the boolean capability hint bridged from /api/config instead. */
function setWebSearchOn(value) {
  webSearchOn = !!value;
  try { window.webSearchOn = webSearchOn; } catch (e) {reportSwallow(e, 'config/providers.setWebSearchOn'); }
  try { localStorage.setItem("socrates-websearch", JSON.stringify(webSearchOn)); } catch (e) {reportSwallow(e, 'config/providers.setWebSearchOn#2', 'expected'); }
  /* The composer's web-search chip (RichComposer) subscribes to this. */
  try { document.dispatchEvent(new CustomEvent("socrates:websearchchange", { detail: { on: webSearchOn } })); } catch (e) {reportSwallow(e, 'config/providers.setWebSearchOn#3'); }
  return webSearchOn;
}

function _isReasoningForActive() {
  var config = getProviderConfigSnapshot();
  var active = config.activeId;
  if (!active) return false;
  var p = config.providers.find(function (x) { return x && x.id === active; });
  if (!p) return false;
  if (p.isBuiltIn) return !!window.BEAGLE_IS_REASONING;
  var m = (p.model || "").toLowerCase();
  var l = (p.label || "").toLowerCase();
  return /deepseek-r1|qwq-|minimax-m1|reasoning|think/.test(m) || /deepseek-r1|qwq/.test(l);
}

function isReasoningProvider() {
  return _isReasoningForActive();
}

function hasUsableActive() {
  var config = getProviderConfigSnapshot();
  var active = config.activeId;
  if (!active) return false;
  var p = config.providers.find(function (x) { return x && x.id === active; });
  return !!p;
}

function isMiniMaxProvider() {
  var config = getProviderConfigSnapshot();
  var active = config.activeId;
  if (!active) return false;
  var p = config.providers.find(function (x) { return x && x.id === active; });
  return p ? /minimax/.test((p.model || "").toLowerCase()) : false;
}

function ensureSessionShape(s) {
  if (!s) s = {};
  if (!Array.isArray(s.kbNodes)) s.kbNodes = [];
  if (!Array.isArray(s.mistakes)) s.mistakes = [];
  return s;
}

function syncAppModeUI() {
  /* The top-bar Chat/Tutor pill (#modeSegmentedTop / .app-mode-toggle) was
     removed, so there is no segmented indicator to drive here. Mode state is
     mirrored onto <body data-app-mode> below; #mobileMode (narrow viewports)
     and the tutor mode banner own their own per-mode UI. */
  try { localStorage.setItem("socrates-appmode", appMode); } catch (e) {reportSwallow(e, 'config/providers.syncAppModeUI'); }
  /* Mirror appMode to body[data-app-mode] so the CSS rule
     body[data-app-mode="chat"] .tutor-only{display:none !important}
     actually takes effect — hiding tutor-only tab buttons + panels
     in chat mode so the sidebar keeps a stable flex layout. */
  try { document.body.setAttribute("data-app-mode", appMode); } catch (e) {reportSwallow(e, 'config/providers.syncAppModeUI#2'); }
  /* P_mode-i18n — reroute the topic title / subtitle / disclaimer and
     the chat-input placeholder through applyI18n() so they reflect the
     active mode (chat vs tutor). Without this, toggling the mode from
     Extensions would switch CSS/visibility but leave the topic-setup
     text stuck on whichever mode was active on the first page load. */
  if (typeof window.applyI18n === 'function') {
    try { window.applyI18n(); } catch (e) {reportSwallow(e, 'config/providers.syncAppModeUI#3'); }
  }
  /* P_mobile-topbar — keep the mobile top-bar mode dropdown label +
     active item in sync with the current mode. */
  if (typeof window.syncMobileModeSwitch === 'function') {
    try { window.syncMobileModeSwitch(); } catch (e) {reportSwallow(e, 'config/providers.syncAppModeUI#4'); }
  }
  /* P_hide-mode-switch-in-conversation — re-evaluate the conversation-
     active body attribute whenever the mode UI is re-synced. State
     changes that don't touch msgList (e.g. setting a topic in tutor
     mode, switching phase) are caught here; message-driven changes are
     covered by the MutationObserver in mobileModeSwitch. */
  if (typeof window.syncConversationActive === 'function') {
    try { window.syncConversationActive(); } catch (e) {reportSwallow(e, 'config/providers.syncAppModeUI#5'); }
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
  /* P_appMode-sync — keep window.appMode in lock-step so toggleAppMode
     and all legacy code that reads window.appMode see the correct value.
     Previously every call site had to manually sync both, and several
     bugs leaked from forgetting one side of the mirror. */
  window.appMode = v;
}

function syncSidebarForMode() {
  var tutorOnly = document.querySelectorAll(".tutor-only");
  tutorOnly.forEach(function (el) { el.style.display = appMode === "tutor" ? "" : "none"; });
}

var refreshApiConfig = refreshProviderConfig;

export {
  webSearchOn, setWebSearchOn, extensiveThinkingOn, appMode, thinkingOn,
  isReasoningProvider, hasUsableActive,
  isMiniMaxProvider, ensureSessionShape,
  syncAppModeUI, syncSidebarForMode, setAppMode,
  refreshApiConfig,
  LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId,
};
