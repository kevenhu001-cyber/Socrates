// config/providers.ts — Wave 3 of main-js-split plan.
// Provider configuration: apiConfig, BEAGLE_BUILT_IN, webSearchOn, appMode,
// and helper functions for reasoning/model detection.
//
// CRITICAL: apiConfig is mutated in place by callers (apiConfig.activeId = ...),
// NEVER reassigned (apiConfig = {...}). See window.apiConfig bridge comment.

interface Provider {
  id: string;
  label: string;
  url?: string;
  model?: string;
  vision?: boolean;
  isBuiltIn?: boolean;
  key?: string;
  isActive?: boolean;
  hasKey?: boolean;
  isMultimodal?: boolean;
}

/* P_privacy-leak — do NOT put a real or fake model name in the default.
 * The built-in "Beagle" provider is an alias; the actual upstream model
 * is operator-configured server-side and must never be hinted at in
 * the public client bundle. The model field is intentionally empty
 * (server uses provider.model from the DB regardless of what's here).
 * Reasoning/vision flags stay on (Beagle supports both by default). */
const BEAGLE_BUILT_IN: Provider = { id: "beagle-built-in", label: "Beagle", url: "/api/minimax/v1", model: "", vision: true, isBuiltIn: true, key: "" };
const apiConfig: { activeId: string | null; providers: Provider[] } = { activeId: null, providers: [] };
/* Web Search default differs by mode — see the post-init block below
 * that runs after appMode is loaded from localStorage. We initialise
 * to true here and override below. */
let webSearchOn = true;
/* Extensive thinking: chat-mode prompt switch. When on, the full
 * CHAT_SYSTEM_PROMPT (verbose "careful scholar" voice + thinking suffix)
 * is injected; when off, CHAT_CONCISE_PROMPT replaces both. This is no
 * longer a standalone toggle — it is derived from the reasoning-effort
 * picker (High = deep thinking on). See ui/effortPicker.js. */
let extensiveThinkingOn = false;
let appMode = "chat";
let thinkingOn = true;

try {
  const savedMode = localStorage.getItem("socrates-appmode");
  if (savedMode === "chat" || savedMode === "tutor") appMode = savedMode;
} catch (e) { /* ignore */ }
/* Web Search mode-aware default: chat mode → on, tutor mode → off.
   Tutor-mode Socratic tutoring doesn't need web search for conceptual
   topics (e.g. 复变函数), and the diagnostic-phase auto-search at
   submitChatMessage adds 12s+ of latency to the first turn. An
   existing explicit user preference (any non-null value) still wins
   so switching modes doesn't silently flip the toggle. */
try {
  const _wsSaved = localStorage.getItem("socrates-websearch");
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
  const savedEffort = localStorage.getItem("socrates-reasoning-effort");
  extensiveThinkingOn = (savedEffort === "high");
} catch (e) { /* ignore */ }

/* P_privacy-leak — built-in providers don't expose their model name,
 * so the regex-based check below would always return false for them.
 * Use the boolean capability hint bridged from /api/config instead. */
function setWebSearchOn(value: boolean): boolean {
  webSearchOn = !!value;
  try { (window as any).webSearchOn = webSearchOn; } catch (e) { /* ignore */ }
  try { localStorage.setItem("socrates-websearch", JSON.stringify(webSearchOn)); } catch (e) { /* ignore */ }
  return webSearchOn;
}

function _isReasoningForActive(): boolean {
  const active = apiConfig.activeId;
  if (!active) return false;
  const p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  if (!p) return false;
  if (p.isBuiltIn) return !!(window as any).BEAGLE_IS_REASONING;
  const m = (p.model || "").toLowerCase();
  const l = (p.label || "").toLowerCase();
  return /deepseek-r1|qwq-|minimax-m1|reasoning|think/.test(m) || /deepseek-r1|qwq/.test(l);
}

function isReasoningProvider(): boolean {
  return _isReasoningForActive();
}

function pickStreamBudgets(): { timeoutMs: number; heartbeatMs: number; maxAttempts: number; retryable: number[] } {
  const active = apiConfig.activeId;
  if (!active) return { timeoutMs: 300000, heartbeatMs: 60000, maxAttempts: 3, retryable: [429, 503] };
  const p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  if (!p) return { timeoutMs: 300000, heartbeatMs: 60000, maxAttempts: 3, retryable: [429, 503] };
  const isReasoning = _isReasoningForActive();
  return { timeoutMs: isReasoning ? 600000 : 300000, heartbeatMs: isReasoning ? 120000 : 60000, maxAttempts: 5, retryable: [429, 500, 502, 503] };
}

function hasUsableActive(): boolean {
  const active = apiConfig.activeId;
  if (!active) return false;
  const p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  return !!p;
}

function isMiniMaxProvider(): boolean {
  const active = apiConfig.activeId;
  if (!active) return false;
  const p = (apiConfig.providers || []).find(function (x) { return x && x.id === active; });
  return p ? /minimax/.test((p.model || "").toLowerCase()) : false;
}

interface SessionShape {
  kbNodes?: unknown[];
  mistakes?: unknown[];
  [key: string]: unknown;
}

function ensureSessionShape(s: SessionShape | null | undefined): SessionShape {
  if (!s) s = {} as SessionShape;
  if (!Array.isArray(s.kbNodes)) s.kbNodes = [];
  if (!Array.isArray(s.mistakes)) s.mistakes = [];
  return s;
}

function syncAppModeUI(): void {
  const toggles = document.querySelectorAll<HTMLElement>(".app-mode-toggle");
  toggles.forEach(function (el) { el.classList.toggle("active", el.dataset.mode === appMode); });
  const chatEl = document.getElementById("chatModeToggle");
  const tutorEl = document.getElementById("tutorModeToggle");
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
  const segEl = document.getElementById("modeSegmented");
  if (segEl) segEl.setAttribute("data-seg-active", appMode);
  try { localStorage.setItem("socrates-appmode", appMode); } catch (e) { /* ignore */ }
  /* Mirror appMode to body[data-app-mode] so the CSS rule
     body[data-app-mode="chat"] .tutor-only{display:none !important}
     actually takes effect — hiding tutor-only tab buttons + panels
     in chat mode so the sidebar keeps a stable flex layout. */
  try { document.body.setAttribute("data-app-mode", appMode); } catch (e) { /* ignore */ }
  /* P_mode-i18n — reroute the topic title / subtitle / disclaimer and
     the chat-input placeholder through applyI18n() so they reflect the
     active mode (chat vs tutor). Without this, toggling the mode from
     Extensions would switch CSS/visibility but leave the topic-setup
     text stuck on whichever mode was active on the first page load. */
  if (typeof (window as any).applyI18n === 'function') {
    try { (window as any).applyI18n(); } catch (_) { /* ignore */ }
  }
  /* U-H2 — keep the chat-header mode badge in sync with the active
     mode whenever the mode UI is re-synced. */
  if (typeof (window as any).updateModeBadge === 'function') {
    try { (window as any).updateModeBadge(); } catch (_) { /* ignore */ }
  }
  /* P_mobile-topbar — keep the mobile top-bar mode dropdown label +
     active item in sync with the current mode. */
  if (typeof (window as any).syncMobileModeSwitch === 'function') {
    try { (window as any).syncMobileModeSwitch(); } catch (_) { /* ignore */ }
  }
  /* P_hide-mode-switch-in-conversation — re-evaluate the conversation-
     active body attribute whenever the mode UI is re-synced. State
     changes that don't touch msgList (e.g. setting a topic in tutor
     mode, switching phase) are caught here; message-driven changes are
     covered by the MutationObserver in mobileModeSwitch. */
  if (typeof (window as any).syncConversationActive === 'function') {
    try { (window as any).syncConversationActive(); } catch (_) { /* ignore */ }
  }
}

/* Setter for appMode — updates the module-level variable so
   syncAppModeUI / syncSidebarForMode / pickers.js see the new
   value. main.js's toggleAppMode calls this instead of directly
   assigning window.appMode, because the imported binding is
   read-only and the old code was inadvertently reverting the
   toggle by reading back the stale module variable. */
function setAppMode(v: string): void {
  appMode = v;
}

function syncSidebarForMode(): void {
  const tutorOnly = document.querySelectorAll<HTMLElement>(".tutor-only");
  tutorOnly.forEach(function (el) { el.style.display = appMode === "tutor" ? "" : "none"; });
  const chatModeEl = document.getElementById("chatModeOnly");
  if (chatModeEl) chatModeEl.style.display = appMode === "chat" ? "" : "none";
}

interface ApiKeyResponse {
  providers?: Provider[];
}

async function refreshApiConfig(): Promise<{ activeId: string | null; providers: Provider[] }> {
  const CURRENT_USER = (window as any).CURRENT_USER;
  if (!CURRENT_USER) {
    apiConfig.activeId = null;
    apiConfig.providers = [];
    try { if (typeof (window as any).markProvidersFetched === "function") (window as any).markProvidersFetched(); } catch (_) { /* ignore */ }
    try { (window as any).syncModelPills(); } catch (_) { /* ignore */ }
    try { (window as any).renderProviderList(); } catch (_) { /* ignore */ }
    return apiConfig;
  }
  try {
    const r = await (window as any).apiFetch("/api/api-key") as ApiKeyResponse;
    /* The API deliberately never returns plaintext keys.  Normalise its
       safe wire shape once at the boundary so the rest of the UI can keep
       using the established provider contract (`vision`, masked `key`).
       Previously `isMultimodal` / `hasKey` were left untranslated, which
       made saved models look unconfigured and silently lost their vision
       capability after every refresh. */
    let rows = Array.isArray(r?.providers) ? r.providers.map(function (p: Provider) {
      p = p || {};
      const label = String(p.label || "").trim();
      const model = String(p.model || "").trim();
      return Object.assign({}, p, {
        label: label,
        model: model,
        /* A non-secret sentinel lets settings render the masked-key state
           without ever putting a credential back in browser memory. */
        key: p.hasKey === true ? "__configured__" : "",
        vision: p.vision === true || p.isMultimodal === true,
      });
    }) : [];
    let serverBeagleModel: string | null = null;
    const serverBeagleRow = rows.find(function (p: Provider) { return p.id === BEAGLE_BUILT_IN.id; });
    if (serverBeagleRow) serverBeagleModel = serverBeagleRow.model ?? null;
    rows = rows.filter(function (p: Provider) { return p.id !== BEAGLE_BUILT_IN.id; });
    if (serverBeagleModel) BEAGLE_BUILT_IN.model = serverBeagleModel;
    let lastId: string | null = null;
    try { lastId = localStorage.getItem(LAST_ACTIVE_ID_KEY); } catch (_) { /* ignore */ }
    let activeId: string | null = null;
    /* Priority 1: user's last selection from localStorage.
       This ensures the user's preference survives page refresh,
       even for providers (like beagle-built-in) not tracked
       by the server's isActive flag. */
    if (lastId) {
      if (lastId === BEAGLE_BUILT_IN.id && (window as any).SERVER_HAS_BEAGLE_KEY) {
        activeId = lastId;
      } else if (rows.some(function (p: Provider) { return p.id === lastId; })) {
        activeId = lastId;
      }
    }
    /* Priority 2: server's isActive flag (sync from other devices). */
    if (!activeId) {
      const serverActive = rows.find(function (p: Provider) { return p.isActive; });
      if (serverActive) activeId = serverActive.id;
    }
    /* Priority 3: built-in Beagle if available. */
    if (!activeId && (window as any).SERVER_HAS_BEAGLE_KEY) { activeId = BEAGLE_BUILT_IN.id; }
    /* Priority 4: first user provider. */
    if (!activeId && rows.length > 0) { activeId = rows[0].id; }
    apiConfig.activeId = activeId;
    /* Do not expose Beagle as a selectable fallback when the server has no
       configured built-in key.  The old unconditional insertion made the
       picker show a plausible-but-unusable model and could replace a saved
       selection with it on cold start. */
    apiConfig.providers = ((window as any).SERVER_HAS_BEAGLE_KEY ? [BEAGLE_BUILT_IN] : []).concat(rows);
    try { if (typeof (window as any).markProvidersFetched === "function") (window as any).markProvidersFetched(); } catch (_) { /* ignore */ }
    try { (window as any).syncModelPills(); } catch (_) { /* ignore */ }
    try { (window as any).renderProviderList(); } catch (_) { /* ignore */ }
    try { (window as any).syncChatModel(); } catch (_) { /* ignore */ }
    return apiConfig;
  } catch (e) {
    apiConfig.activeId = null;
    apiConfig.providers = [];
    try { if (typeof (window as any).markProvidersFetched === "function") (window as any).markProvidersFetched(); } catch (_) { /* ignore */ }
    return apiConfig;
  }
}

const LAST_ACTIVE_ID_KEY = "socrates-last-active-id";

function saveLastActiveId(id: string | null | undefined): void {
  try {
    if (!id || id === "null" || id === "undefined") {
      localStorage.removeItem(LAST_ACTIVE_ID_KEY);
      return;
    }
    localStorage.setItem(LAST_ACTIVE_ID_KEY, String(id));
  } catch (e) { /* ignore */ }
}

function loadLastActiveId(): string | null {
  try {
    const value = localStorage.getItem(LAST_ACTIVE_ID_KEY);
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
