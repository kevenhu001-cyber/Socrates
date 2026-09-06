/* ─── Module imports (Phase 2 split) ─── */
/* P_perf-self-host — bundle the former CDN globals (marked, DOMPurify,
   katex, hljs, Fuse) before any consumer module evaluates. */
import './vendor/init.js';
/* P_perf-react-eager — React compatibility runtime is a static import so
   Vite preloads it (and its Tiptap/React deps) alongside the main entry
   instead of the browser discovering it only after main.js executes. */
/* Side-effect import: forces Vite/esbuild to keep windowExports.js
   (which re-exposes ~75 inline-handler-needed functions on window)
   in the bundle. Without this, esbuild's tree-shaking would drop
   the file because main.js never references its named exports. */
import './windowExports.js';
import './app/legacyBridge.js';
/* P_storage-shim — import before any other module so the in-memory
   localStorage/sessionStorage shim is installed before downstream
   imports (state/store.js, i18n.js, providers.js, displayPrefs.js, …)
   touch storage. Without this ordering, first-party storage calls
   made during module evaluation can fire one
   "Tracking Prevention blocked access to storage" warning each
   before the shim's IIFE kicks in. */
import './batchStorage.js';
import './app/errorGuard.js';
import './render/katexRefresh.js';
import './i18n.js';
import { initCookieConsent } from './cookieConsent.js';
import { toggleComposerTools } from './ui/composerTools.js';
import { toggleEffortPicker } from './ui/effortPicker.js';
import { selectAppMode, toggleMobileModeMenu } from './ui/mobileModeSwitch.js';
import { openFindInSession } from './ui/findInSession.js';
import { initChatComposerReserve } from './ui/scroll.js';
import { initKeyboardViewport } from './ui/keyboardViewport.js';
import './ui/composerAnim.js';
import { installKeyboardShortcuts } from './ui/keyboardShortcuts.js';
import { isNativeApp, setupNativeBridge } from './native/capacitorBridge.js';
import { initSidebarDrag } from './ui/sidebarResize.js';
import { switchTab, toggleSidebarView, initSidebarChrome } from './ui/sidebarChrome.js';
import './ui/suggestions.js';
import './ui/quickChips.js';
import { wireScrollPill } from './ui/scrollPill.js';




import { openShareModal } from './ui/share.js';
import './ui/mobileModeSwitch.js';


/* (side-effect-only import already loaded above; this named-import
   line just keeps the bundler from tree-shaking the module when only
   batchStorage is referenced via the side-effect import above.) */
import { loadMemories } from './storage/memoryStore.js';






import { initArtifactPreview } from './ui/artifactPreview.js';
import { initLinkFavicons } from './ui/linkFavicons.js';
/* ui/searchProgress.js is no longer a live-chat surface: the model announces
   what it is doing through `_liveStatus` (react/tool-run/TurnStatus) instead
   of a step card prepended to the bubble. The module still serves the
   extensions' deep-research surface and the `window.__startSearchProgress`
   e2e hook, both of which import it themselves. */
import { installDiagnosticFlowListeners } from './tutor/diagnosticFlow.js';
import { startSession } from './chat/sessionBootstrap.js';
import { resetApp, toggleIncognito, isInAuthGraceWindow, handleAuthExpired, getUserMemories } from './app/lifecycle.js';
import { deletedSessionGuard } from './session/saveState.js';
import { setRecentsSearch } from './ui/recentsView.js';
import { installLiveTurnRetryListener } from './chat/liveTurn.js';


import {
  configurePromptSuffixes,
} from './chat/promptSuffixes.ts';


/* Cookie consent — shown once on first visit; the choice is persisted in
   localStorage and a shared first-party consent cookie. Non-essential
   client-side cookie writes are gated by cookieConsent.js until the visitor
   accepts them. */
initCookieConsent({ privacyUrl: 'https://topodrive.top/privacy' });
initArtifactPreview();
initLinkFavicons();
import { toggleSidebar } from './sidebar/index.js';


import { initTheme, loadDisplayPrefs, mountDisplayPrefsListeners, setAccentColor, setAccentCustom } from './displayPrefs.js';
import { syncExtensionsUI, syncModelPills, syncWebSearchUI } from './pickers.js';
import { bootstrapApp } from './app/bootstrap.js';
import { installWidgetRuntime } from './app/widgetSetup.js';
import { loadTonePreset } from './config/tonePresets.js';




/* B1: katex/hljs refresh extracted to render/katexRefresh.js (side-effect import at top). */
/* P_batch-storage & localMemory — 已抽到 src/batchStorage.js 与
   src/storage/localMemory.js(顶部 import)。 */

/* ============================================================
   SIDEBAR
   ============================================================ */
/* B6: sidebarOpen state centralized in ui/sidebarChrome.js. */

/* P1.4 — showNewReplyPill / hideNewReplyPill + scroll listener
   extracted to src/ui/scrollPill.js. wireScrollPill() registers
   the global scroll + click listeners; main.js's addStreamingMessage
   (and friends) call show/hide as needed. */
wireScrollPill();

/* ─── DISPLAY PREFERENCES — imported from displayPrefs.js ─── */
/* (functions defined in src/displayPrefs.js — window exports below) */

/* Colors.js utilities consumed by displayPrefs.js */

/* Display-pref functions remain exposed by windowExports.js for legacy
   callers and the typed bridge. Static display controls are mounted by
   displayPrefs.js itself; they no longer need document delegation. */

/* B6: sidebar buttons + persisted state moved to ui/sidebarChrome.js. */
initSidebarChrome();
/* toggleTheme() is imported from displayPrefs.js */
/* Restore the saved theme preference, including the system-following mode.
   The inline boot script has already painted the correct mode; initTheme()
   adds the live OS preference listener and wires the selector in Display
   settings without causing a dark-mode flash on refresh. */
initTheme();
/* Restore saved accent: custom hex takes priority over preset hue,
   since once a user picks a custom color the preset index would
   just point at the nearest hue and overwrite their choice. */
try{
  var savedHex=localStorage.getItem("socrates-accent-hex");
  if(savedHex)setAccentCustom(savedHex);
  else{
    var savedHue=localStorage.getItem("socrates-accent-hue");
    if(savedHue)setAccentColor(parseInt(savedHue,10));
    else setAccentColor(40);
  }
}catch {}
/* Apply text-size / content-width prefs (must run before any layout
   that depends on .main-inner max-width). */
loadDisplayPrefs();
/* M4 step 4.3b — display preferences own their static controls. */
mountDisplayPrefsListeners();

/* Sidebar drag + responsive collapse live in ui/sidebarResize.js.
   Keep initialization here, after the DOM-backed sidebar state is restored. */
initSidebarDrag();
/* B6: global keyboard shortcuts extracted to ui/keyboardShortcuts.js. */
installKeyboardShortcuts();
/* P5.6 — find the most recent user-authored message in
   stateStore.read("messages"). Used by the Up-arrow-in-empty-input
   shortcut to pop the previous prompt back into the input
   for editing. */
/* D 区段(stripMarkdown / findLastUserMessage) 已抽到 src/render/markdown.js,
   顶部 import。 */


/* E 区段(openCheatsheet / buildCheatsheetSection / closeCheatsheet)已抽到
   src/ui/cheatsheet.js,顶部 import。 closeCheatsheet = closeCheatsheet
   仍由 main.js 末尾的 window.* 导出块承担,Phase B 会集中到 windowExports.js。 */
/* Mobile only: tap anywhere outside the sidebar (and outside the toggle
   button) to close it. On desktop the user controls the sidebar with the
   toggle button / ⌘B, and closing it on a click-outside would be
   unexpected. The backdrop is a sibling of the sidebar in the DOM and
   z-index 25; tapping it always closes the drawer on mobile. */
/* B6: mobile drawer listeners moved to ui/sidebarChrome.js (initSidebarChrome). */
/* Mobile keyboard avoidance lives in src/ui/keyboardViewport.js. An older
   imperative scroll-compensation experiment (a visualViewport resize state
   machine mutating scrollTop) used to sit here behind `if(false)`; it was
   removed — the CSS-inset approach below superseded it. */

/* P_composer-fr-anim — the mobile composer's focus-in expansion relies
   on `grid-template-rows: 0fr → 1fr` interpolating smoothly. Modern
   engines (Chrome 102+, Firefox 117+, Safari 17+) interpolate fr
   track sizes; older engines snap, producing the visible "shape
   jump" the user reported. CSS.supports() is the canonical
   feature-detect (browsers without fr interpolation report
   `false` for the value query). We tag <body> so the CSS can
   branch into a min-height + JS-driven animation path on engines
   that do not interpolate fr units. The detection runs once on
   load; CSS does the rest. */
/* B6: composer fr-anim detect moved to ui/composerAnim.js (side-effect import at top). */


/* Use a CSS inset instead of imperative scroll compensation. This keeps the
   composer stable when browsers report VisualViewport measurements differently.
   Track both composers so the data-keyboard-open attribute and
   --keyboard-inset variable reflect whichever input is currently focused —
   critical for the topic-setup view's keyboard-aware layout. */
initKeyboardViewport({
  inputs: [
    document.getElementById('chatComposerRoot'),
    document.getElementById('topicComposerRoot'),
  ].filter(Boolean),
  container: document.getElementById('appShell'),
});

/* Capacitor native bridge — StatusBar theme sync, keyboard signal
   forwarding, hardware back button. No-op when window.Capacitor is
   absent (i.e. regular web browser). */
if (isNativeApp()) {
  setupNativeBridge();
}

/* B6: switchTab moved to ui/sidebarChrome.js (imported at top). */
/* Unified sidebar search state. Read by doRenderRecents() as a
   client-side title/topic filter. The setter keeps the input box in
   sync (so the empty-state "Clear search" link can reset it) and
   re-renders. */
/* B6: sidebar search state moved to ui/recentsView.js (imported at top). */

/* Sidebar view switch used by the tutor-only Knowledge / Mistakes icon
   entries. Clicking an already-active view toggles back to the unified
   Recents list; otherwise it opens the requested view. switchTab owns
   the actual panel show/hide. */
/* B6: toggleSidebarView moved to ui/sidebarChrome.js (imported at top). */

/* ============================================================
   TOPIC SETUP
   ============================================================ */
// autoResize / updateStartBtn / updateSendBtn extracted to
// src/ui/topicSetup.js (Phase C-2.3).

/* ============================================================
   P_ATTACHMENTS — chip strip + button + drag/drop
   The pending attachments live in frontend/src/attachments.js as
   module-level state; we just mirror them into DOM here and wire
   the attach button + drag/drop listeners.
   ============================================================ */

// renderAttachmentChips / setupAttachmentInput extracted to
// src/attachments/render.js. The module auto-wires itself on
// DOMContentLoaded (and on script load if DOM is already ready).
// The attach button + drag/drop + paste handlers all live there now.



/* attachments bridge + renderAttachmentChips + setupAttachmentInput + DOMContentLoaded
   moved to src/attachments/render.js (Phase C-2.4). */

/* Scrollbar fade — hide msg-list scrollbar by default, show it
   during scroll and fade out after 1.5s of inactivity. */
(function initMsgScrollbar(){
  var ml=document.getElementById("msgList");
  if(!ml)return;
  var timer=null;
  ml.addEventListener("scroll",function(){
    ml.classList.add("scrollbar-visible");
    clearTimeout(timer);
    timer=setTimeout(function(){ml.classList.remove("scrollbar-visible")},1500);
  });
})();
initChatComposerReserve();

/* ============================================================
   STATE
   ============================================================ */
/* P1.5 — state is now a multi-namespace object. Each sub-object
   is the source of truth for one concern; cross-namespace writes
   go through the explicit field (e.g. `stateStore.read("topic") = ...`).
   For backward compatibility, `state` itself is a Proxy that
   delegates the legacy flat-field accesses
   (`stateStore.read("topic")`, `stateStore.read("phase")`, `stateStore.read("kbNodes")`, `stateStore.read("mistakes")`,
   `stateStore.read("_userScrolledAway")`, `stateStore.read("searchContext")`, …) to the
   matching sub-namespace. New code should access via
   `stateStore.read("topic")` etc.; the legacy form still works because
   the read/write lookups resolve transparently. */

/* ============================================================
   SESSION PERSISTENCE (Recents)
   ============================================================ */
/* P2.3 — how long the client and server keep an archived
   session before it's permanently erased. The server is the
   source of truth (it runs a daily GC job); we mirror the
   window on the client to keep the Storage modal and the
   Recents list in sync without waiting for the server's
   next sync round. */
/* Server-side session cache. The SPA keeps a copy of the user's chat
   sessions here so the UI can render the Recents / Knowledge / Mistakes
   tabs without a roundtrip on every action. We keep it fresh via
   getRecents() — which now hits the server. */
/* B2: serverCache.sessions/FETCH_FAILED centralized in session/serverCache.js (imported at top; window bridge lives there). */

/* B2/B6: recents fetch + deletion/restore/purge/archive extracted to session/recents.js (imported at top). */
/* P2.1 — Projects were removed; sessions are un-categorized now. */
/* B6: generateId extracted to util/ids.js (imported at top). */


/* P2.2 — filter chip state. `null` = all; otherwise a tag
   string. Persisted in localStorage so the user's last filter
   survives a reload. */
var RECENTS_FILTER_KEY="socrates-recents-filter";
try{window.RECENTS_FILTER_KEY=RECENTS_FILTER_KEY}catch(_){}

/* P2.2 — set of tag strings the user has ever used. Powers
   the autocomplete suggestions in the tag editor popover. */


/* ============================================================
   P1.2 — Global search (Cmd / Ctrl + K)
   Client-side fuzzy index over:
     - session titles + topics (serverCache.sessions)
     - message raw text inside every loaded session
   The index is built on first open and rebuilt whenever
   `saveCurrentSession` runs. When the server-side search endpoint
   (docs/api/openapi.yaml #/paths/~1api~1search) is available, the
   client also fires a `globalSearch` request to extend the
   client-only results with cross-device / cross-account hits.
   ============================================================ */
/* P_main-split — Wave 1b: Cmd-K palette extracted to ui/cmdK.js. */



/* P_dup-session-race — when multiple saveCurrentSession() calls
   fire in quick succession (e.g. the several call sites inside
   askChatTurn at lines 2559 / 2574 / 2588 / 2638 / 2677), each one
   POSTs the same client-side UUID. If the server hasn't committed
   the row yet when the second POST arrives, its existence check
   (server line ~96-104) misses the row, mints a fresh UUID, and
   inserts a SECOND session record. Result: the same chat appears
   twice in Recents.

   Fix: serialize saves through a single in-flight promise. While
   one save is awaiting the server's response, additional calls are
   folded into a "dirty" flag; once the in-flight save finishes,
   one follow-up save fires (if anything queued). Net effect: at
   most TWO POSTs per rapid burst — the original and one trailing
   coalesced one — and both carry the same canonical id (the one
   the server adopted on the first response). */
/* B2: save/load coordination state centralized in session/saveState.js. */
/* P_context-race — guard flag set during loadSession to prevent
   saveCurrentSession() calls during message rebuilding. Without this,
   a saveCurrentSession() triggered by an event handler while
   loadSession() is in progress could capture mismatched state
   (new session ID + old or partially-rebuilt messages). */

/* P_stale-loadSession — tracks the most recently requested
   loadSession target ID. When multiple loadSession() calls race
   (user clicks several sessions in quick succession), the earlier
   fetch may complete AFTER the later one and overwrite state with
   stale data. We check this at the point where state would be
   mutated and skip if another, newer load was already requested. */

/* P_delete-resurrect — every session id the user deleted in the
   current page load. doSave() refuses to POST any payload whose
   sessionId is in here, regardless of stateStore.read("topic")/state.session.
   The server's POST /api/sessions is an UPSERT keyed by id, so
   a stray POST carrying a "deleted" id would silently re-insert
   the row — that's exactly the "deleted session comes back"
   repro. We also drop the entry on a successful refresh after
   deletion (in actuallyDeleteSession's then-callback) so the
   guard doesn't permanently block re-saving a new session with
   a coincidentally-similar id. */
/* B2: deletedSessionGuard + remember/forget centralized in session/saveState.js (imported at top). */
var _deletedSessionGuard=deletedSessionGuard;
/* Returns the saveState.saveInFlight promise when a save was
   initiated/queued, or null if guards bailed. Callers that need to
   wait for the save to complete (e.g. toggleAppMode) can await the
   returned promise. */
/* B2: saveCurrentSession/doSave/unload-beacon extracted to session/persistence.js (imported at top). */
/* P_exam-history — open a previously-saved exam session. Re-uses
 * exam.prepareExamView() to flip the visible view + top-bar state,
 * then rehydrates the in-memory state (questions, answers, lang, etc.)
 * and re-renders the question cards. If the saved exam was already
 * submitted, jump straight to the results view; otherwise show the
 * questions with the user's previous answers already selected/filled.
 *
 * prepareExamView() (not openExamPanel()) is the right entry here:
 * openExamPanel() calls renderExamForm() which would wipe the saved
 * questions before we paint them. */
/* B2: loadExamSession/loadSession/resetSessionTransients/setCurrentSessionId extracted to session/loader.js (imported at top). */
/* P2.2 — open the inline tag editor popover anchored to a
   session row. The popover accepts comma / Enter separated
   tags and persists via PATCH. */
/* B6: tags/context-menu/drag/row-publish extracted to session/organize.js (imported at top). */
/* B6: renderRecents/doRenderRecents moved to ui/recentsView.js (imported at top). */
/* One-shot projects fetch guard (module-local): an empty project list or a
   failed /api/projects call marks the cache as populated so renderRecents
   never re-fetches on every render. */
/* B6: renderRecentsFilterChips moved to ui/recentsView.js (imported at top). */
/* =============================================================
   In production, this would call an LLM API.
   ============================================================ */
/* P_main-split — Wave 0a: detectLanguage + languageDirectiveFor
   extracted to chat/lang.js. No behavior change. */


/* B4 fix: diagnostic abort/retry entry points live on window so the
   extracted tutor/diagnosticFlow.js delegation can reach the per-session
   closures installed by startSession below. */

/* B3: startSession extracted to chat/sessionBootstrap.js (imported at top). */


/* B4: diagnostic nav/results/teaching extracted to tutor/diagnosticFlow.js.
   Imported at top; listener installed via helper to preserve delegation. */
installDiagnosticFlowListeners();

/* ============================================================
   SOCRATIC QUESTIONS
   ============================================================ */
/* B3: toolCallbacksForStream extracted to chat/toolCallbacks.js (imported at top). */
/* B4: askNextQuestion extracted to tutor/socraticTurn.js (imported at top). */
/* ============================================================
   CHAT MODE — plain conversation, no Socratic / KB / mistake book.
   Reuses callAPIStream + addStreamingMessage (single-render path
   that runs formatMsg exactly once — no renderAssistantHTML).
   ============================================================ */
/* P_turn-abort-quiet — lifecycle aborts (auth expiry, session switch,
   turn superseded, …) are intentional control flow, not errors. An
   async turn entry point that lets one escape produces
   `unhandledrejection AbortError: session-expired` + the red
   global-error banner. Every fire-and-forget turn entry in this file
   swallows exactly these and lets real bugs surface. */
/* B5: isExpectedTurnAbort + quietTurn extracted to chat/turnUi.js (imported at top). */
/* B3: askChatTurn extracted to chat/turnController.js (imported at top). */


/* Non-streaming variant of callAPIStream for round-1 detection. Returns
   the same {text,html,widgets,cancelled} shape (or null on failure). */
/* P_main-split — Wave 0b: parseToolCall, formatSourcesBlock,
   handleChatApiResult extracted to chat/format.js. No behavior change. */


/* P_main-split — Wave 0: mocks pool (region 14) extracted. */

/* ============================================================
   CHAT INTERACTION
   Legacy Enter-to-send handler — superseded by the React composer.
   Kept with _ prefix for reference; not wired to any listener.
   ============================================================ */
/* B6: legacy _handleChatKey fast path moved to chat/templateSlash.js (no listeners mounted; reference only). */

/* P5.8 — Prompt templates. Six built-ins plus any user
   customisations. The full list is the union of BUILTIN_TEMPLATES
   and the user-saved ones, with the latter overriding a
   built-in of the same shortcut.
   Storage: localStorage key "socrates-prompt-templates",
   value: Array<{ id, title, description, body, icon,
                   category, shortcut, isBuiltin }>.
   API contract: docs/api/openapi.yaml P5.8 — these mirror
   the server shape; when the backend lands /api/prompts
   the local array becomes the offline cache. */

/* ICON_*, SYSTEM_PROMPT_*, BUILTIN_TEMPLATES, loadPromptTemplates,
   savePromptTemplates, findTemplateByShortcut, upsertCustomTemplate,
   deleteCustomTemplate extracted to src/chat/promptTemplates.js
   (Phase 1E split). Imported at the top. */

/* P5.8 — Slash-command palette overlay. A single instance
   that's lazily created the first time the user types `/`.
   Renders the list filtered by the current input; arrow
   keys move the highlight; Enter inserts the body at the
   cursor position; Esc closes. */
/* B3/B6: template mode + slash palette + blurChatComposer extracted to chat/templateSlash.js (imported at top). */
/* B3: submitChatMessage extracted to chat/sendPipeline.js (imported at top). */

/* P1.1 — per-message action toolbar now lives in React. See
   `frontend/src/react/message-list/useMessageActions.ts` (the `stripHtmlToText`
   + `fallbackCopy` helpers there replace the legacy `buildMessageToolbar`
   family). All call sites in this file consult isMsgListMounted() and skip
   the legacy path while React owns the list. */
/* B5: edit/regenerate/branch extracted to chat/editBranch.js (imported at top). */
/* Restore non-HTML message content that is persisted separately from the
   assistant's markdown. React calls this after a history bubble commits;
   the public-share renderer uses the same helper so both paths stay in
   parity. The data marker makes repeated React renders idempotent. */
/* P1.1 — toast moved to src/ui/toast.js; imported below and still
   mirrored on window for the React legacy gateway and e2e mocks. */

/* B4/B5: addMessage extracted to chat/messages.js (imported at top). */

/* Tool-card restoration helpers live in src/ui/toolCards.js. Live
   tool orchestration is owned by src/chat/toolRuntime.js. */

/* B5: turn/streaming mutable state centralized in chat/turnState.js.
   Turn progress helpers (markTurnInProgress/Ended, resend) extracted to
   chat/turnUi.js (imported at top); window bridge preserved. */
/* B5: extracted to chat/turnUi.js */
/* B5: retry-viewport singleton centralized in chat/turnState.js (imported). */

/* looksLikeMetaInstruction + appendThinking extracted to
   src/ui/thinkingPill.js (Phase 1B split). Imported at the top. */





/* SEARCH_PROGRESS_LABELS, trSearchLabel, _formatEngineBreakdown,
   startSearchProgress live in src/ui/searchProgress.js — no longer used
   here; see the import-site comment for what still consumes them. */

/* beginAgentTextStream, appendRunFooter extracted to
   src/chat/agentStream.js (Phase 1D split). Imported at the top. */

/* scrollMainToBottom/scheduleScrollMainToBottom now live in ui/scroll.js. */

/* Retry-viewport anchoring (consume/measure/capture/prepare/settle) now lives
   in chat/streamRetry.ts behind the streamRetryViewport store above. */

/* Turn anchoring (turnRowFor/scheduleActiveTurnToTop) now lives in
   chat/turnAnchor.ts behind configureTurnAnchor (see the runtime setup). */
/* B5: setChatStopState/handleSendClick/stopChatResponse extracted to chat/turnUi.js. */
/* B5: extracted to chat/turnUi.js */

/* B5: extracted to chat/turnUi.js */

/* Add a streaming assistant message. Returns a controller object:
   { append(delta), finish(), abort() }.
   - append(delta): renders content on the next microtask with try/catch
     fallback, so partial markdown/math never kills the stream.
   - finish(): final render, then saves session & updates stats.
   - abort(): removes the message from the list (used on fallback to mock
     or upstream error). */



/* B5: live-turn registries extracted to chat/liveTurn.js (imported at top). */
installLiveTurnRetryListener();

/* B1: addStreamingMessage/doRender streaming turn extracted to chat/streamingTurn.js (imported at top). */
/* B1: renderAssistantHTML is now buildAssistantHtml re-export (imported at top). */

/* Legacy widget mounts removed: render/widgets.js owns mounting via scheduleWidgetMounts. */
/* B6: widget/mistake-book runtime wiring moved to app/widgetSetup.js. */
/* B6: mistake-book UI fns (renderMistakes/updateMistakesBadge) are bridged
   to window by app/legacyBridge.js via getMistakeBookUI(). */
installWidgetRuntime();
/* P_main-split — Wave 0: handleQuickAction (region 26) extracted. */

/* ============================================================
   KNOWLEDGE BOUNDARY PANEL
   ============================================================ */
/* B6: updateKB extracted to ui/knowledgePanel.js (imported at top). */
/* P_main-split — Wave 0: updateChatStats (region 28) extracted. */

/* ============================================================
   UTILS
   ============================================================ */

/* V 区段(scrollContainer / scrollToBottomIfPinned)已抽到 src/ui/scroll.js,
   顶部 import。两个 ID fallback (#msgList + #mainContent) 是契约,
   保留行为不变。 window.scrollContainer 仍由 main.js 末尾 window.* 桥接
   (Phase B 接管)。 */

/* Format just a prefix of the text — used during the typing
   animation to reveal one chunk at a time. The full formatMsg
   only runs once at the very end; for each animation tick we
   re-render the prefix. This is fast because markdown libs
   handle short inputs in microseconds, and the prefix grows
   linearly. */

/* ============================================================
   VIZ — interactive canvas visualizations for AI explanations.
     The AI outputs raw HTML inside ```viz ... ``` and the frontend
     renders it in a sandboxed iframe. */




/* P_mobile-topbar — incognito ("无痕对话") chat. A temporary session
   that saveCurrentSession() refuses to persist (see the guard there).
   The mobile top-right button toggles it; entering incognito clears the
   current view (via resetApp, which also saves any prior real session)
   so the user starts on a clean, unsaved conversation. */



/* ============================================================
   AUTH GATE — client-side
   - apiFetch: the single point of contact with the server. Always
     includes credentials so the sid cookie travels. Returns parsed
     JSON or throws.
   - checkAuthOnBoot: ping /api/auth/me, branch to gate or app.
   - submitAuthRegister / submitAuthSignin / submitAuthVerify:
     forms wired to the gate UI.
   ============================================================ */


/* Cross-module CURRENT_USER setter — boot.js and auth/index.js
   set window.CURRENT_USER, but main.js functions read the local
   `var CURRENT_USER`. This setter keeps both in sync. */


/* P0.4 — apiFetch / apiFetchRaw / retryApiFetch / makeApiError are
   imported from ./util/api.js. The handleAuthExpired hook is
   installed once at boot via installAuthHooks() — see below.
   apiFetch / getCsrfToken are bridged via windowExports.js;
   apiFetchRaw / retryApiFetch are only used locally. */
import { installAuthHooks } from './util/api.js';

/* Post-auth grace window. Right after a successful register or
 * login the browser hasn't always written the new `sid` cookie to
 * its cookie jar by the time the next fetch() runs, so a 401 on
 * a background call (e.g. refreshServerSessions) doesn't actually
 * mean the session is gone — it's a race. We give the browser ~3
 * seconds to settle, during which 401s from non-auth endpoints are
 * NOT treated as session expiry. */




/* P4.5 — invoked from apiFetch when a 401 comes back. Clears
   in-memory user state, shows the auth gate, and emits a one-time
   event so views that have their own `currentUser` observers (the
   sidebar, settings, etc.) can react. We deliberately do NOT delete
   the sid cookie from the client side — the server is the source of
   truth for session lifetime, and the next successful login will
   set a new one. */


/* Wire the api module's 401 hook to our local handleAuthExpired +
 * grace window. Done after both functions are defined so the closure
 * captures the right references. */
installAuthHooks({ on401: handleAuthExpired, isInGraceWindow: isInAuthGraceWindow });



/* ─── Exam view (standalone page) ─── */
/* P_main-split — Wave 3b: exam generation form extracted to exam.js. */

/* Usage modal — token heatmap & monthly breakdown. */
/* Usage modal — openUsageModal / closeUsageModal / loadUsageData / loadUsageMonth / renderUsageHeatmap / showUsageTip / hideUsageTip — extracted to src/ui/usage.js (Phase C-3.5). */

/* P2.3 — Storage modal. Lists archived sessions with the
   days-remaining countdown, plus a Restore / Delete-forever
   pair per row. The modal is a single instance that gets
   rebuilt every time it opens, so the count is always live. */

/* P5.8 — Prompt templates manager modal. Lists built-ins
   (read-only) and user customs (editable). The 'New
   template' button opens a lightweight editor inline. */


/* P1.3 — Custom Instructions: load/save/serialize.
   Schema (localStorage key "socrates-custom-instructions"):
     { response: "How should I respond?",
       about:    "What do you know about me?",
       savedAt:  ISO-8601 timestamp }
   The two strings are also pushed to the server via
   PATCH /api/users/me.customInstructions so the same value
   flows to the Android client on the next sign-in. */
var _customInstructionsSaveTimer=null;

/* P_main-split — Wave 1a: showConfirm + closeConfirm extracted to ui/confirm.js. */

/* Clear local conversations. */
/* P_main-split — Wave 2a: danger confirms extracted to ui/dangerConfirms.js. */

/* escapeHtml / sanitizeUrl / sanitizeUrls are imported from
 * ./util/safe.js and used locally. The window bridge for these
 * is not needed — no external module reads them via window.X. */

/* P_bleed-v2 — comprehensive per-user client-state cleanup.
   Wipes every module-level cache and localStorage entry that holds
   data scoped to a single user, so the next user on this browser
   starts from a clean slate. Called from:
     - signOut() — when the user clicks "Sign out"
     - handleAuthExpired() — when a 401 fires mid-session
     - afterAuthEnter() — BEFORE the new user's data fetch, so the
       brief "data loading" window doesn't show the previous user's
       sessions / providers / projects in the sidebar or model picker.

   Each clear is wrapped in try{} because some globals may not
   exist in older code paths or future refactors. A throw here
   would abort sign-in / sign-out mid-flight and leave the page
   broken — better to leak one stale field than to break the flow.

   Side-effect: also re-renders the affected UI surfaces so the
   cleared caches show up as empty immediately, rather than waiting
   for the next user-driven render trigger. */

/* Expose so /auth/index.js afterAuthEnter can call it before
 * fetching the new user's data. */



/* Built-in Beagle model — always available, never shown in settings.
   The API key is fetched from the server at boot via GET /api/config
   so it stays out of the source tree. Defined here (before authBoot)
   so the IIFE can reference it without relying on var-hoisting timing. */
/* P_main-split — Wave 3c: provider config extracted to config/providers.js. */
import {
  syncAppModeUI, syncSidebarForMode,
} from './config/providers.js';


/* Expose to other modules — the mode banner in tutorSocratic.js
   calls window.toggleAppMode when the user clicks "Switch to
   Chat/Tutor". */

/* U-H2 — chat-header mode badge. Shows the active mode (Tutor/Chat)
   in the top bar so the user always knows which mode a live
   conversation is in. Called from toggleAppMode(), syncAppModeUI()
   (providers.js) and updateChatStats() (chat/stats.js). Kept separate
   from the retired renderModeBanner() no-op to avoid re-cluttering the
   message list. */


/* P_main-split — Wave 2c: settings + provider management extracted to ui/settings.js. */

/* ============================================================
   API CALL (replaces mock when enabled)
   ============================================================ */

/* ============================================================
   SYSTEM CONTEXT — real-time date, estimated user location
   ============================================================ */
/* B6: _userMemories cache centralized in app/lifecycle.js (getUserMemories imported at top). */
configurePromptSuffixes({ getUserMemories: getUserMemories });

/* Fetch the user's saved memories from the server so memoriesSuffix()
   can inject them as long-term context. Memories are cached globally.

   P_bleed-memories — three safety rules to keep memories from leaking
   between users on the same browser:
     1. Clear _userMemories at the START of every load. The previous
        user's memories must not be visible to the new user for the
        few hundred ms before the new fetch resolves.
     2. Return the Promise so callers can `await` it before unlocking
        the UI. The post-auth flow awaits this; the boot path does not
        (boot fires the fetch in the background and memories appear
        on the next chat turn, which is fine because boot's CURRENT_USER
        was just freshly set and _userMemories was just cleared by
        sign-out).
     3. On fetch failure, leave _userMemories empty. Never keep the
        previous user's data around "for safety" — an empty list is
        safer than stale data. */
/* P_main-split — Wave 2: loadUserMemories extracted to ui/profile.js. */

/* ============================================================
   SYSTEM PROMPTS
   ============================================================ */
/* Chat mode: plain assistant. No quiz/example/practice scaffolding,
   no Socratic questioning, no knowledge-graph awareness. Used when
   the user picks "Chat mode" on the topic-setup screen. */

/* Tutor mode: prompt assembly lives in tutor/flow.ts (buildSocraticPrompt). */

/* I18N — bilingual UI strings (en / zh). Add more entries as
   new surface text is introduced. */

/* Streaming variant. Calls /api/chat/stream (our backend SSE proxy).
   onDelta(text, full) is called for every text chunk the upstream produces.
   Resolves to {text,html,widgets,cancelled} on success, or null on failure.

   Stability features (in order of importance):
   - 120s total budget via AbortController (catches hung streams)
   - Up to 3 automatic retries on 408/429/5xx/network/empty-stream
     with exponential backoff (600ms, 1.5s, 3.5s)
   - 60s heartbeat timeout during streaming (no chunk for 60s aborts
     that attempt and retries — catches connections that go silent)
   - Honors Retry-After header on 429/503
   - UTF-8 safe: TextDecoder with stream:true + final flush
   - SSE frames: supports `data:` only and `event:` + `data:` style frames
   - onDelta errors are swallowed; a render bug never kills the stream
   - Empty delta is OK if backend sent a __FORMATTED__ pre-render
   - Returns cancelled:true if the AbortController fired (caller can
     decide whether to show a "stopped" UI or fall back to mock) */

/* Cycle through active projects. If the current session is in a
   project, move to the next one; if not, pick the first project. */
/* B6: cycleActiveProject moved to session/organize.js (imported at top). */

/* ============================================================
   CHAT HISTORY EXTRACTION
   Pulls the last N user/assistant turns out of the live msgList so
   the model can see the running conversation. Without this every
   API call is a one-shot prompt and the model "resets" each turn.
   ============================================================ */
/* No max_tokens cap — let the model produce as much as it wants.
   Backend (server/src/routes/chat.js) defaults to its model max when omitted. */
/* Bridge to window so other modules (e.g. exam.js) consume the same
   system-configured token policy instead of hardcoding their own cap. */
/* Incognito ("无痕对话") flag — explicitly false until the mobile
   top-bar button flips it on. Initializing here keeps saveCurrentSession()
   and syncIncognitoBtn() reading a deterministic false instead of
   relying on `undefined` coercing to falsy. */

try{window.incognitoOn=false;}catch(_){}
/* ============================================================
   API OVERRIDES — try API first (streaming when possible), fall back to mock.
   Each generator has TWO variants:
     - <name>         : non-streaming, returns full text at once
     - <name>Stream   : streaming, calls onDelta for each token, returns full text
   The chat path uses the *Stream variants; the non-streaming versions are
    kept so the explain / quickAction paths still work.
    ============================================================ */

/* B4 batch 2: socratic execution layer extracted to tutor/socraticTurn.js.
   Imported at top; window.getExplanation bridge preserved below. */
/* Consumed via window.getExplanation by chat/quickActions.ts handleQuickAction('explain'). */


/* ─── Expose main.js-unique onclick-required functions on window ───
   Duplicate bindings for surfaces already exported by
   `frontend/src/windowExports.js` (cmdK, share, profile, usage, settings,
   storage, etc.) live there and are imported by main.js as a side effect.
   This block keeps only what main.js owns locally. */

/* P_apiconfig-bridge — apiConfig / appMode / webSearchOn / thinkingOn
   are declared with `var` further up in main.js (line 10401 etc.)
   but legacy callers + several module scripts (chat/api.js line 83,
   pickers.js syncModelPills/syncChatModel, ui/usage.js, …) read them
   via `window.apiConfig`. The old Phase-A block ended with
   `window.apiConfig = apiConfig;` and a small handful of state var
   mirrors. Restoring those four lines here. CRITICAL: callers MUST
   mutate the object in place (apiConfig.activeId = …) rather than
   reassign `apiConfig = {...}`, otherwise the window ref drifts and
   the model picker silently sticks on "Add a model". */
/* ─── Expose all onclick-required functions on window —── */
/* ─── Inline-handler bridge ───
   Bulk restore for the 119 `window.X = X` bindings that lived in
   the pre-Phase-B AF block at main.js:13060–13176. windowExports.js
   covers Phase-A-extracted modules (auth, render/markdown,
   ui/cheatsheet, ui/scroll, storage/localMemory, chat/offline,
   ui/usage, etc.). Everything below is a main.js-local function
   that can't be imported from a module without circular deps — so
   we re-bind here at the tail of main.js. Inline `onclick="X()"`
   handlers resolve via [[Resolve]] → window.X → this block.
   ─────────────────────────────────────────────────────────── */

/* P_bulk-restore-2026-07-07 — three Phase-A/B regression repairs.
   These were deleted in the move to windowExports.js but main.js
   still emits inline `onclick="X()"` strings that reference them
   (and auth/boot.js reads window.BEAGLE_BUILT_IN to consume the
   /api/config beagleKey/beagleModel payloads). Without these,
   clicking Skip on a diagnostic question, closing template mode,
   or letting boot.js write back the beagle model would all
   ReferenceError. main.js-local `var`s/functions, so we re-bind
   at the tail of the bridge block above rather than
   windowExports.js. */
/* Exposed so windowExports.js composeAction (撰写或编辑) can activate a
   Writing/Editing template on demand, injecting its system prompt. */
/* Mirror of setActiveTemplate — RichComposer's extension-token remove
   button and pickers.js clear it through the window bridge. Was dropped
   when the document-wide data-action dispatcher was deleted. */
/* B6 fix: keyboardShortcuts.js (extracted Esc dispatcher) reaches the tag
   editor via window; previously the dispatcher was inline and called the
   in-scope function directly. */

/* P_bulk-restore-2026-07-07-chat — chat module helpers missing from
   the bridge. stream.js:91 / api.js consume `window.isReasoningProvider`
   and `window.getCustomInstructionsString` — without these bindings
   the callAPIStream path throws "d is not a function" (where `d` is
   the minified isReasoningProvider identifier) and the non-stream
   callAPI drops the user's Custom Instructions preamble. Both are
   main.js-local functions that windowExports.js has not yet picked
   up (Phase C deferral), so re-bind here. */
/* P_minimax-reasoning-split — stream.js checks this to decide whether
   to send `reasoning_split: true` in extra_body for MiniMax models. */
/* P_reasoning_budget — paired with the stream.js call at line 47.
   Without this, reasoning models (DeepSeek R1 / QwQ / MiniMax) hit
   the default 60 s heartbeat mid-think and the stream aborts. */
/* P_share-load-bridge — auth/boot.js:44 calls `loadSharedSession`
   when a visitor opens `?share=TOKEN`, before any auth flow. Without
   this binding, that call throws TypeError, the surrounding try/catch
   silently swallows it, and the shared view never renders — the page
   sits on the boot-loading spinner until the 12s safety net in
   index.html shows the sign-in gate instead. Same for
   loadSharedExamSession, which is referenced from main.js itself
   (loadSharedSession:10922) but kept on window for parity in case a
   later caller invokes it directly. */
/* Agent mode (openAgentView / exitAgentMode / deleteAgentRun) is a
   planned feature that was never implemented — exposing it on
   window would ReferenceError any inline handler that fires before
   the surrounding UI lands. Inline placeholders stay commented until
   the feature is built. */
// window.exitAgentMode = exitAgentMode;   // unimplemented
// window.openAgentView  = openAgentView;  // unimplemented
// window.deleteAgentRun = deleteAgentRun; // unimplemented
/* Agent mode placeholder (paired with the comment above on lines
   13112-13114). */
// window.deleteAgentRun = deleteAgentRun; // unimplemented
/* P_url-pushstate-bridge retired — the URL-id helpers are exported by
   src/session/store.js and consumed via direct imports (main.js,
   exam.js, auth/index.js); no window surface is needed. */
/* P_bulk-restore-2026-07-14 — Phase C module bridges.
   These are main.js-local functions referenced by extracted modules
   (chat/quickActions.js, chat/api.js, chat/format.js, pickers.js,
   ui/promptTemplates.js, ui/storage.js, ui/share.js, auth/boot.js,
   tutorSocratic.js) as window.X. Without these bindings the callers
   throw TypeError at runtime. */

/* React message-list toolbar callbacks. The legacy code remains the
   source of truth for the action side-effects (PATCH/DELETE/regenerate);
   React just dispatches through these globals when its per-message
   toolbar buttons fire. */
/* Post-render hooks called from the React MessageItem useEffect
   after each dangerouslySetInnerHTML commit. processPendingViz and
   processPendingVizActions are re-exported via windowExports.js; the
   other three live as either local helpers (wireCodeBlockHeaders,
   wireMsgBodyImages) or imported-by-name (processPendingMermaid)
   here. Wiring them on window lets the React side re-trigger the
   same idempotent bookkeeping the legacy DOM pipeline runs on every
   bubble mount. */
/* Bridge missing window.* assignments that React reads but were never
   explicitly exported (pre-existing gap). Adding them here so C4-B's
   __socratesLegacy assembly below captures them. */
/* B6 fix: keyboardShortcuts.js (extracted Cmd+Shift+P dispatcher) calls
   window.cycleActiveProject; previously inline and in-scope. */
/* updateSlashSelected is referenced by inline onmouseenter handler
   in the slash command palette HTML (main.js:3666) but was never
   assigned to window — would throw ReferenceError on hover. */
/* C4 — typed legacy gateway for React.  Assembles the structured
   window.__socratesLegacy object from the existing window.* bindings.
   React code reads this via getLegacyActions() from react/legacy/gateway.ts.
   The window.X = X assignments above remain as temporary backward-
   compatibility aliases for legacy JS modules and e2e tests until C5. */
/* B6: window bridges + __socratesLegacy gateway moved to app/legacyBridge.js (side-effect import at top). */
bootstrapApp({
  syncModelPills: syncModelPills,
  syncWebSearchUI: syncWebSearchUI,
  syncExtensionsUI: syncExtensionsUI,
  syncAppModeUI: syncAppModeUI,
  syncSidebarForMode: syncSidebarForMode,
  loadTonePreset: loadTonePreset,
  loadMemories: loadMemories,
  toggleSidebar: toggleSidebar,
  resetApp: resetApp,
  toggleIncognito: toggleIncognito,
  openFind: openFindInSession,
  openShare: openShareModal,
  openSettings: window.openSettings,
  startSession: startSession,
  sendMessage: window.handleSendClick,
  toggleComposerTools: toggleComposerTools,
  toggleEffort: toggleEffortPicker,
  selectMode: selectAppMode,
  toggleMobileMode: toggleMobileModeMenu,
  searchRecents: setRecentsSearch,
  switchTab: switchTab,
  toggleSidebarView: toggleSidebarView,
});
