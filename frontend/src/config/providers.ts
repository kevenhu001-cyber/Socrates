import { reportSwallow } from '../util/reportSwallow.ts';
import { getProviderConfigSnapshot, refreshProviderConfig } from './providerConfig.service.ts';
import { LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId } from './providerConfig.service.ts';
/* config/providers.ts — Wave 3 of main-js-split plan.
 * App preferences and helper functions for reasoning/model detection.
 * Extracted from main.js L9169-L9566 + refreshApiConfig at L9291.
 */

/** Legacy window members this module still coordinates through the shell. */
interface ProvidersLegacyWindow extends Window {
  applyI18n?: () => void;
}

export type AppMode = 'chat' | 'tutor';

/* Web search is off by default. A stored explicit preference still wins;
 * see the post-init block below that runs after appMode is loaded. */
let webSearchOn = false;
/* Extensive thinking: chat-mode prompt switch. When on, the full
 * CHAT_SYSTEM_PROMPT (verbose "careful scholar" voice + thinking suffix)
 * is injected; when off, CHAT_CONCISE_PROMPT replaces both. This is no
 * longer a standalone toggle — it is derived from the reasoning-effort
 * preference (High = deep thinking on). */
let extensiveThinkingOn = false;
let appMode: AppMode = "chat";
const appModeListeners = new Set<() => void>();

try {
  const savedMode = localStorage.getItem("socrates-appmode");
  if (savedMode === "chat" || savedMode === "tutor") appMode = savedMode;
} catch (e) {reportSwallow(e, 'config/providers.restoreAppMode', 'expected'); }
/* Web search stays off unless the user explicitly enabled it before.
   An existing stored preference (any non-null value) still wins. */
try {
  const _wsSaved = localStorage.getItem("socrates-websearch");
  if (_wsSaved !== null) {
    webSearchOn = _wsSaved === "true";
  }
} catch (e) { /* localStorage blocked — keep the default (false) */ reportSwallow(e, 'config/providers.restoreWebSearchOn'); }
/* Deep thinking follows reasoning effort: High enables the verbose prompt,
 * while Medium/Low use the concise one. */
try {
  const savedEffort = localStorage.getItem("socrates-reasoning-effort");
  extensiveThinkingOn = (savedEffort === "high");
} catch (e) {reportSwallow(e, 'config/providers.restoreReasoningEffort', 'expected'); }

function setWebSearchOn(value: unknown): boolean {
  webSearchOn = !!value;
  try { localStorage.setItem("socrates-websearch", JSON.stringify(webSearchOn)); } catch (e) {reportSwallow(e, 'config/providers.setWebSearchOn#2', 'expected'); }
  /* The composer's web-search chip (RichComposer) subscribes to this. */
  try { document.dispatchEvent(new CustomEvent("socrates:websearchchange", { detail: { on: webSearchOn } })); } catch (e) {reportSwallow(e, 'config/providers.setWebSearchOn#3'); }
  return webSearchOn;
}

function hasUsableActive(): boolean {
  const config = getProviderConfigSnapshot();
  const active = config.activeId;
  if (!active) return false;
  const p = config.providers.find(function (x) { return x && x.id === active; });
  return !!p;
}

function ensureSessionShape(s?: Record<string, unknown> | null): Record<string, unknown> {
  const session = s || {};
  if (!Array.isArray(session.kbNodes)) session.kbNodes = [];
  if (!Array.isArray(session.mistakes)) session.mistakes = [];
  return session;
}

function syncAppModeUI(): void {
  /* React subscribes to appMode for the top-bar mode control. The
     body mirror remains for CSS-only tutor surfaces during this migration. */
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
  const win = window as ProvidersLegacyWindow;
  if (typeof win.applyI18n === 'function') {
    try { win.applyI18n(); } catch (e) {reportSwallow(e, 'config/providers.syncAppModeUI#3'); }
  }
}

/* Setter for appMode — updates the canonical module state and notifies
   React subscribers. */
function setAppMode(v: AppMode): void {
  appMode = v;
  appModeListeners.forEach((listener) => listener());
}

export function getAppMode(): AppMode {
  return appMode;
}

export function subscribeAppMode(listener: () => void): () => void {
  appModeListeners.add(listener);
  return () => appModeListeners.delete(listener);
}

function setExtensiveThinkingOn(value: unknown): void {
  extensiveThinkingOn = Boolean(value);
}

function syncSidebarForMode(): void {
  const tutorOnly = document.querySelectorAll<HTMLElement>(".tutor-only");
  tutorOnly.forEach(function (el) { el.style.display = appMode === "tutor" ? "" : "none"; });
}

const refreshApiConfig = refreshProviderConfig;

export {
  webSearchOn, setWebSearchOn, extensiveThinkingOn, appMode,
  hasUsableActive, ensureSessionShape,
  syncAppModeUI, syncSidebarForMode, setAppMode, setExtensiveThinkingOn,
  refreshApiConfig,
  LAST_ACTIVE_ID_KEY, saveLastActiveId, loadLastActiveId,
};
