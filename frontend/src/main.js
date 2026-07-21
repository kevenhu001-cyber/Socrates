/* ─── Module imports (Phase 2 split) ─── */
/* Side-effect import: forces Vite/esbuild to keep windowExports.js
   (which re-exposes ~75 inline-handler-needed functions on window)
   in the bundle. Without this, esbuild's tree-shaking would drop
   the file because main.js never references its named exports. */
import './windowExports.js';
import './state.js';
import './i18n.js';
import { openCheatsheet, closeCheatsheet } from './ui/cheatsheet.js';
import { scrollContainer, scrollToBottomIfPinned } from './ui/scroll.js';
import { initKeyboardViewport } from './ui/keyboardViewport.js';
import { isNativeApp, setupNativeBridge } from './native/capacitorBridge.js';
import { initSidebarDrag } from './ui/sidebarResize.js';
import { showNewReplyPill, hideNewReplyPill, wireScrollPill } from './ui/scrollPill.js';
import { autoResize, updateStartBtn, updateSendBtn } from './ui/topicSetup.js';
import { toggleShareBtn, toggleChatTopBarEls, openShareModal, closeShareModal } from './ui/share.js';
import { renderAttachmentChips, setupAttachmentInput } from './attachments/render.js';
import {
  STREAM_TIMEOUT_MS, STREAM_HEARTBEAT_MS, STREAM_MAX_ATTEMPTS, STREAM_RETRYABLE_STATUS,
  offlineGuard, sleepBackoff, makeAIWatchdog,
} from './chat/offline.js';
import { openUsageModal, closeUsageModal, loadUsageData, loadUsageMonth, renderUsageHeatmap, showUsageTip, hideUsageTip } from './ui/usage.js';
import { createMistakeBook } from './ui/mistakeBook.js';
import { batchSetItem, batchRemoveItem } from './batchStorage.js';
import { LOCAL_MEMORY_MAX, loadLocalMemory, appendLocalMemory, clearLocalMemory, _memKey } from './storage/localMemory.js';
import { formatTickSlice, formatMsgProgressive, formatMsg, stripMarkdown, findLastUserMessage } from './render/markdown.js';
import { getStreamRenderInterval, splitStreamingMarkdown } from './render/streaming.js';
import { SOCRATIC_SYSTEM_PROMPT } from './prompts/socratic.js';
import { VISUALIZATION_ROUTING_PROMPT } from './prompts/visualization.js';
import { fetchGeoInfo, getSystemContext, resetGeoInfo } from './system/context.js';
import {
  getChatIdFromURL, setChatIdInURL, pushChatIdToURL,
  capSessions, getVisibleSessions, getArchivedSessionsFrom,
  sweepExpiredArchivesFrom, createDeletedSessionGuard,
} from './session/store.js';
import { esc, escAttr, escHTML, decodeEntities, stripTags, safeHljsLang } from './render/helpers.js';
import { parseQuizInner, parseExampleInner, parsePracticeInner, parseDefinitionInner, parseFlashcardInner, parseTheoremInner, parseProofInner, parseDerivationInner, parseKeyPointInner } from './render/widgetParsers.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions, renderViz, renderVizLoading, renderMermaid, openVizModal } from './render/viz.js';
import { callAPI, callAPIChat } from './chat/api.js';
import { callAPIStream } from './chat/stream.js';
import { looksLikeUserMentionedSite, extractHttpUrls, fetchPagesForContext } from './chat/webLinks.js';
import { fetchWebContext, shouldRefreshSearch, setSearchPill } from './chat/webSearch.js';
import { generateSessionTitle } from './chat/sessionTitle.js';
import { parseOneDiagResponse } from './chat/diagnosticParser.js';
import { generateDiagnosticQuestions } from './chat/diagnosticGenerator.js';
import { applyDiagnosticResults } from './chat/diagnosticResults.js';
import { generateTopicKBNodes } from './chat/topicKbNodes.js';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from './chat/teachingPlan.js';
import { BASELINE_LEVEL, stageInstruction, fromBasicsDirective } from './chat/socraticDirectives.js';
import { aiGenerate } from './chat/mockDiagnostic.js';
import { extractHistory } from './chat/history.js';
import { CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT } from './chat/systemPrompts.js';
import { appendInlineArtifact } from './ui/toolCards.js';
import { looksLikeMetaInstruction, appendThinking } from './ui/thinkingPill.js';
import { SEARCH_PROGRESS_LABELS, trSearchLabel, _formatEngineBreakdown, startSearchProgress } from './ui/searchProgress.js';
import { createToolRuntime } from './chat/toolRuntime.js';
import { beginAgentTextStream, appendRunFooter } from './chat/agentStream.js';
import { BUILTIN_TEMPLATES, SYSTEM_PROMPT_SUMMARIZE, SYSTEM_PROMPT_TRANSLATE, SYSTEM_PROMPT_EXPLAIN_CODE, SYSTEM_PROMPT_DEBUG, SYSTEM_PROMPT_QUIZ, SYSTEM_PROMPT_SOCRATIC, PROMPT_TEMPLATES_KEY, loadPromptTemplates, savePromptTemplates, findTemplateByShortcut, upsertCustomTemplate, deleteCustomTemplate } from './chat/promptTemplates.js';
import { renderNoUrlHint, renderLinkPreviews } from './ui/linkPreviews.js';
import { renderSourcesCard } from './ui/sourcesCard.js';
import { renderDiagResultsScreen } from './ui/diagnosticResults.js';
import { renderDiagQuestion as renderDiagQuestionUI } from './ui/diagnosticQuestion.js';
import { loadAndRenderCrossSessionKB, resetCrossSessionKBCache } from './ui/knowledgeCrossSession.js';
import { kbNodeHtml, toggleKBDetail } from './ui/knowledgeDetail.js';
import { renderKnowledgeView } from './ui/knowledgeView.js';
import { hideGate, showGate, showAuthView, showAuthSignin, showAuthRegister, switchAuthTab, setAuthError, showAuthForgotPassword, showAuthCodeLogin, submitAuthSignin, submitAuthRegister, submitAuthVerify, submitAuthForgotPassword, submitAuthResetPassword, submitAuthSendCode, submitAuthLoginWithCode, resendVerification, resendAuthCode, afterAuthEnter } from './auth/index.js';
import { SERVER_HAS_BEAGLE_KEY } from './auth/boot.js';
import { toggleSidebar, getRecentsFilter, setRecentsFilter, clearRecentsFilter, onRecentsFilterChipClick } from './sidebar/index.js';
import { stripChatArtifacts } from './util/stripChatArtifacts.js';
import { renderRecentsFilterChips as renderRecentsFilterChipsUI } from './ui/recentsFilterChips.js';
import {
  formatRelativeTime, getKnownTagsFromSessions,
  filterRecentsByChip,
} from './ui/recentsHelpers.js';
import {
  displayPrefs, loadDisplayPrefs, applyDisplayPrefs, saveDisplayPrefs,
  setDisplayFont, setDisplayWidth,
  setBackgroundColor, setBackgroundDark, setBackgroundLight,
  resetBackgroundColor, resetBackgroundDark, resetBackgroundLight,
  toggleGrid, setAccentColor, setAccentCustom, resetAccentColor, toggleDisplayPrefs, toggleTheme
} from './displayPrefs.js';
import {
  getActiveProvider,
  pickActiveProviderById, toggleModelPicker, openModelPicker, closeModelPicker, syncModelPills,
  syncChatModel, toggleChatModelMenu, closeChatModelMenu, pickChatModel,
  renderExtensionsMenu, toggleExtensionByKey, countActiveExtensions, syncExtensionsUI,
  toggleExtensionsPicker, openExtensionsPicker, closeExtensionsPicker,
  toggleWebSearch, syncWebSearchUI,
} from './pickers.js';

/* P_global-error-guard — install one-shot handlers for `error` and
   `unhandledrejection` so a stray throw inside an SSE callback, an
   image upload, or any of the ~140 module-level functions in this
   file doesn't white-screen the SPA. Without these handlers, an
   unhandled rejection in a promise chain (e.g. fetch() returning
   body=null during a flaky mobile network) lands only in the JS
   console; the user sees a frozen UI with no recovery hint. The
   handlers:
     1. log the full reason to console.error so dev tools / future
        remote-error reporters (Sentry etc.) pick it up,
     2. surface a small, sanitized banner with a correlation token
        so the user can copy it into a bug report,
     3. never throw — a re-entrant handler would loop forever,
     4. are installed exactly once even if main.js is re-evaluated
        (module re-imports on Vite HMR).
   The banner deliberately omits the raw stack trace / message: long
   stack frames can leak session ids, file ids, or share tokens from
   the surrounding URL, which is exactly what the prompt-exfil
   threat model tries to surface in logs.
   ─────────────────────────────────────────────────────────────────── */
(function installGlobalErrorGuard(){
  if (typeof window === 'undefined') return;
  if (window.__socratesGlobalErrorHandlerInstalled) return;
  window.__socratesGlobalErrorHandlerInstalled = true;

  // Re-entrancy flag — if our own banner code throws, we MUST NOT
  // dispatch the handler again (would loop and lock the page).
  let inHandler = false;

  function shortCorrel() {
    // 8 hex chars from time + 4 random hex — enough for a user to
    // quote in a bug report; not enough to be a guessable secret.
    return (
      Date.now().toString(36).slice(-6) +
      Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0')
    );
  }

  function ensureBanner() {
    let el = document.getElementById('__socrates_global_err_banner');
    if (el) return el;
    el = document.createElement('div');
    el.id = '__socrates_global_err_banner';
    el.setAttribute('role', 'status');
    el.style.cssText = [
      'position:fixed', 'left:16px', 'right:16px', 'bottom:16px',
      'z-index:2147483647',
      'padding:10px 14px',
      'border-radius:8px',
      'background:rgba(178,34,34,0.92)',
      'color:#fff',
      'font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,0.18)',
      'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:12px',
      'pointer-events:auto',
    ].join(';');
    document.body.appendChild(el);
    return el;
  }

  function showBanner(correl, hint) {
    try {
      const el = ensureBanner();
      // Clear any previous banner content first (multiple errors
      // before the user dismisses — keep the latest).
      while (el.firstChild) el.removeChild(el.firstChild);

      const msg = document.createElement('span');
      msg.textContent = hint;
      const id = document.createElement('code');
      id.textContent = '#' + correl;
      id.style.cssText = 'background:rgba(0,0,0,0.25);padding:2px 6px;border-radius:4px;font-size:12px';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Dismiss';
      btn.style.cssText = 'background:transparent;color:#fff;border:1px solid rgba(255,255,255,0.6);border-radius:4px;padding:3px 8px;cursor:pointer;font-size:12px';
      btn.addEventListener('click', () => {
        if (el.parentNode) el.parentNode.removeChild(el);
      });

      el.appendChild(msg);
      el.appendChild(id);
      el.appendChild(btn);
      // Auto-dismiss after 12 s so it doesn't pile up.
      setTimeout(() => {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 12000);
    } catch (_) { /* banner creation failed — swallow */ }
  }

  function handle(label, payload) {
    if (inHandler) return;
    inHandler = true;
    try {
      const correl = shortCorrel();
      // Full detail to console so dev tools / remote reporters can
      // see the stack; banner shows only the correlation token.
      // eslint-disable-next-line no-console
      console.error('[global-error]', label, correl, payload);
      if (typeof document !== 'undefined' && document.body) {
        const hint = label === 'unhandledrejection'
          ? 'Something went off-script. Try refreshing — if it repeats, share the code below.'
          : 'Something broke. Try refreshing — if it repeats, share the code below.';
        showBanner(correl, hint);
      }
    } finally {
      inHandler = false;
    }
  }

  window.addEventListener('error', (ev) => {
    // ev.error holds the Error object when available; fall back to
    // ev.message for the rare case the browser only reports a string.
    handle('error', ev && (ev.error || ev.message) || 'unknown');
    // Returning true suppresses the browser's default handler so we
    // don't double-report via onerror("…", "…", line, col).
    return true;
  });

  window.addEventListener('unhandledrejection', (ev) => {
    handle('unhandledrejection', ev && (ev.reason || ev) || 'unknown');
    // Don't preventDefault — let the dev tools still flag it.
  });
})();

/* P_hljs-unknown-lang — monkey-patch hljs.highlightElement so the
   model can no longer trigger
   `WARN: Could not find the language 'code_interpreter'`
   by emitting a raw `<code class="language-code_interpreter">`
   block (which the markdown renderer's safeHljsLang helper doesn't
   see, since that path only parses ``` fenced blocks). Before
   handing the element to hljs, we walk the element's `language-*`
   classes through the shared safeHljsLang helper and drop any that
   hljs does not recognise — hljs then falls back to no-highlight
   silently instead of warning. The helper itself lives in
   render/helpers.js and is also used by the markdown renderer. */
(function patchHljsHighlightElement(){
  if (typeof window === 'undefined') return;
  var hl = window.hljs;
  if (!hl || typeof hl.highlightElement !== 'function' || hl.__socratesSafePatched) return;
  var orig = hl.highlightElement.bind(hl);
  hl.highlightElement = function patchedHighlightElement(el){
    try {
      if (el && el.classList && typeof hl.getLanguage === 'function') {
        var classes = Array.prototype.slice.call(el.classList || []);
        for (var i = 0; i < classes.length; i++) {
          var c = classes[i];
          if (c.indexOf('language-') !== 0) continue;
          if (!safeHljsLang(c.slice('language-'.length))) el.classList.remove(c);
        }
      }
    } catch (_) { /* swallow — fall through to the original call */ }
    return orig(el);
  };
  hl.__socratesSafePatched = true;
})();

/* P_batch-storage & localMemory — 已抽到 src/batchStorage.js 与
   src/storage/localMemory.js(顶部 import)。 */

/* ============================================================
   SIDEBAR
   ============================================================ */
var sidebarOpen=true;

/* P1.4 — showNewReplyPill / hideNewReplyPill + scroll listener
   extracted to src/ui/scrollPill.js. wireScrollPill() registers
   the global scroll + click listeners; main.js's addStreamingMessage
   (and friends) call show/hide as needed. */
wireScrollPill();

/* ─── DISPLAY PREFERENCES — imported from displayPrefs.js ─── */
/* (functions defined in src/displayPrefs.js — window exports below) */

/* Colors.js utilities consumed by displayPrefs.js */
import { parseHexColor, applyCustomBg, removeCustomBg } from './util/colors.js';
window.parseHexColor=parseHexColor;window.applyCustomBg=applyCustomBg;window.removeCustomBg=removeCustomBg;

/* Expose display-pref functions to window for onclick handlers */
window.setDisplayFont=setDisplayFont;window.setDisplayWidth=setDisplayWidth;
window.setBackgroundColor=setBackgroundColor;window.setBackgroundDark=setBackgroundDark;window.setBackgroundLight=setBackgroundLight;
window.resetBackgroundColor=resetBackgroundColor;window.resetBackgroundDark=resetBackgroundDark;window.resetBackgroundLight=resetBackgroundLight;
window.toggleGrid=toggleGrid;window.setAccentColor=setAccentColor;window.setAccentCustom=setAccentCustom;window.resetAccentColor=resetAccentColor;
window.toggleDisplayPrefs=toggleDisplayPrefs;window.toggleTheme=toggleTheme;

/* Expose main.js functions to window for inline onclick handlers.
   These are still in main.js (not yet extracted to modules), but
   in ESM they're module-scoped, so inline onclick="X()" can't find
   them without an explicit window bridge. */
function bridgeMainJsFunctions(){
  window.switchTab=switchTab;
  window.setRecentsSearch=setRecentsSearch;
  window.toggleSidebarView=toggleSidebarView;
  window.resetApp=resetApp;
  window.submitChatMessage=submitChatMessage;
  window.startSession=startSession;
  window.signOut=signOut;
  window.showToast=showToast;
}
bridgeMainJsFunctions();

function syncSidebarBtns(){
  var ob=document.getElementById("sidebarOpenBtn");
  var cb=document.getElementById("sidebarCloseBtn");
  /* Derive from the DOM (.collapsed) — toggleSidebar() lives in
     sidebar/index.js and can't write this module's `sidebarOpen`
     var, so reading the var here would desync after the first toggle. */
  var s=document.getElementById("sidebar");
  var open=s?!s.classList.contains("collapsed"):sidebarOpen;
  /* Keep the top-bar toggle button hidden when sidebar is open
     (the close button inside the sidebar header is visible then).
     Show the toggle button only when sidebar is collapsed so the
     user always has an obvious way to re-open it. */
  if(ob){
    ob.style.display=open?"none":"";
    ob.setAttribute("aria-expanded",open?"true":"false");
    ob.setAttribute("aria-label",open?"Collapse sidebar":"Expand sidebar");
    ob.setAttribute("title",open?"Collapse sidebar (⌘B)":"Expand sidebar (⌘B)");
  }
  /* The close button inside the sidebar header is only useful when
     the sidebar is open. Hidden when collapsed so it drops out of
     the tab order. */
  if(cb){
    cb.style.display=open?"":"none";
    if(open)cb.removeAttribute("aria-hidden");
    else cb.setAttribute("aria-hidden","true");
  }
}
try{
  var sbPref=localStorage.getItem("socrates-sb");
  if(sbPref==="0"||(sbPref===null&&window.innerWidth<768)){
    sidebarOpen=false;document.getElementById("sidebar").classList.add("collapsed")
  }
}catch(e){}
syncSidebarBtns();
window.sidebarOpen=sidebarOpen;
/* toggleTheme() is imported from displayPrefs.js */
function toggleAppLang(){
  var next=_currentLang==="en"?"zh":"en";
  setLang(next);
  var lbl=document.getElementById("langToggleLabel");
  if(lbl)lbl.textContent=next==="en"?"EN":"中";
  showToast(next==="en"?"Language: English":"语言: 中文",1800);
}
try{
  var savedTheme=localStorage.getItem("socrates-theme");
  if(savedTheme==="light"||savedTheme==="dark")document.documentElement.setAttribute("data-mode",savedTheme);
}catch(e){}
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
}catch(e){}
/* Apply text-size / content-width prefs (must run before any layout
   that depends on .main-inner max-width). */
loadDisplayPrefs();
/* Wire the segmented buttons inside the popover. */
(function wireDisplayPrefsSegs(){
  var fw=document.getElementById("displayPrefsFontSegs");
  if(fw)Array.from(fw.children).forEach(function(b){
    b.onclick=function(){setDisplayFont(parseFloat(b.dataset.font))};
  });
  var ww=document.getElementById("displayPrefsWidthSegs");
  if(ww)Array.from(ww.children).forEach(function(b){
    b.onclick=function(){setDisplayWidth(parseFloat(b.dataset.width))};
  });
})();

/* Sidebar drag + responsive collapse live in ui/sidebarResize.js.
   Keep initialization here, after the DOM-backed sidebar state is restored. */
initSidebarDrag();
document.addEventListener("keydown",function(e){if(e.key==="\\"&&e.ctrlKey){e.preventDefault();toggleSidebar()}});
/* P1.2 — Cmd/Ctrl+K opens the global search modal. The
   listener is intentionally registered at module scope so it
   works from any focus context, including inside the chat
   textarea (we preventDefault to swallow the default browser
   behaviour of focusing the address bar). */
document.addEventListener("keydown",function(e){
  var k=(e.key||"").toLowerCase();
  if(k==="k"&&(e.metaKey||e.ctrlKey)&&!e.altKey&&!e.shiftKey){
    e.preventDefault();
    if(typeof openCmdK==="function")openCmdK();
  }
});

/* P5.6 — single global keydown dispatcher for the full
   keyboard-shortcut set. Replaces the four ad-hoc keydown
   listeners previously scattered around the file. The
   handler is registered last so it has the highest priority
   (when a shortcut fires we preventDefault and the original
   listeners never run for that key).

   Shortcut table (showing Mac keys; on Windows/Linux Cmd is
   Ctrl):
     ⌘ K         open search
     ⌘ /         open shortcut cheatsheet
     ⌘ B         toggle sidebar
     ⌘ .         toggle settings / profile modal
     ⌘ ⇧ O       new chat (resetApp)
     ⌘ ⇧ S       share current session
     ⌘ ⇧ A       open projects picker
     ⌘ ⇧ P       cycle active project
     ⌘ ⇧ T       toggle theme
     ⌘ ⇧ F       toggle web search (extension)
     ⌘ ⇧ M       toggle "show AI thinking"
     Esc         close any open modal
     ↑ (empty)   edit last user message
     ⌘ ⏎         send (alternative to Enter)
     ⇧ ⏎         newline (the default) */
document.addEventListener("keydown",function(e){
  var cmd=e.metaKey||e.ctrlKey;
  var key=(e.key||"").toLowerCase();
  var k=e.key;
  /* Esc — close any open modal that has its own close
     function. We look for a stack of known modal IDs.
     P-arch: extended to cover settingsOverlay, cheatsheetOverlay,
     examOverlay, usageOverlay, promptTemplatesOverlay, and
     tagEditorPopover (the last two are dynamically created). */
  if(k==="Escape"){
    if(!document.getElementById("cmdKOverlay").classList.contains("hidden")){
      e.preventDefault();closeCmdK();return;
    }
    if(document.getElementById("storageModalOverlay")&&!document.getElementById("storageModalOverlay").classList.contains("hidden")){
      e.preventDefault();closeStorageModal();return;
    }
    if(document.getElementById("promptTemplatesOverlay")&&!document.getElementById("promptTemplatesOverlay").classList.contains("hidden")){
      e.preventDefault();closePromptTemplatesModal();return;
    }
    if(document.getElementById("profileOverlay")&&!document.getElementById("profileOverlay").classList.contains("hidden")){
      e.preventDefault();closeProfile();return;
    }
    if(document.getElementById("settingsOverlay")&&!document.getElementById("settingsOverlay").classList.contains("hidden")){
      e.preventDefault();closeSettings();return;
    }
    if(document.getElementById("cheatsheetOverlay")&&!document.getElementById("cheatsheetOverlay").classList.contains("hidden")){
      e.preventDefault();closeCheatsheet();return;
    }
    if(document.getElementById("examOverlay")&&!document.getElementById("examOverlay").classList.contains("hidden")){
      e.preventDefault();closeExamModal();return;
    }
    if(document.getElementById("usageOverlay")&&!document.getElementById("usageOverlay").classList.contains("hidden")){
      e.preventDefault();closeUsageModal();return;
    }
    if(document.getElementById("tagEditorPopover")&&!document.getElementById("tagEditorPopover").classList.contains("hidden")){
      e.preventDefault();closeTagEditor();return;
    }
    if(!document.getElementById("shareOverlay").classList.contains("hidden")){
      e.preventDefault();closeShareModal();return;
    }
  }
  /* Cmd+K — global search. (Already handled above; re-check
     here to keep the cheatsheet in sync.) */
  if(cmd&&!e.altKey&&!e.shiftKey&&key==="k"){
    e.preventDefault();
    if(typeof openCmdK==="function")openCmdK();
    return;
  }
  /* Cmd+/ — shortcut cheatsheet. Some keyboards send "?" for
     Shift+/; we accept both. */
  if(cmd&&!e.altKey&&(key==="/"||k==="?")){
    e.preventDefault();
    openCheatsheet();
    return;
  }
  /* Cmd+B — toggle sidebar. */
  if(cmd&&!e.altKey&&!e.shiftKey&&key==="b"){
    e.preventDefault();
    if(typeof toggleSidebar==="function")toggleSidebar();
    return;
  }
  /* Cmd+. — toggle settings/profile. */
  if(cmd&&!e.altKey&&!e.shiftKey&&key==="."){
    e.preventDefault();
    if(typeof openProfile==="function"){
      if(document.getElementById("profileOverlay")&&!document.getElementById("profileOverlay").classList.contains("hidden")){
        closeProfile();
      }else{
        openProfile();
      }
    }
    return;
  }
  /* Cmd+Shift+O — new chat. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="o"){
    e.preventDefault();
    if(typeof resetApp==="function")resetApp();
    return;
  }
  /* Cmd+Shift+S — share. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="s"){
    e.preventDefault();
    if(typeof openShareModal==="function"&&state.session.currentSessionId){
      openShareModal();
    }else{
      showToast("Start a chat first to share it");
    }
    return;
  }
  /* Cmd+Shift+T — toggle theme. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="t"){
    e.preventDefault();
    if(typeof toggleTheme==="function")toggleTheme();
    return;
  }
  /* Cmd+Shift+F — toggle web search extension. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="f"){
    e.preventDefault();
    toggleProfileWebSearch();
    return;
  }
  /* Cmd+Shift+M — toggle "show AI thinking" preference. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="m"){
    e.preventDefault();
    if(typeof window.thinkingOn!=="undefined"){
      window.thinkingOn=!window.thinkingOn;
      try{localStorage.setItem("socrates-thinking",JSON.stringify(window.thinkingOn))}catch(_){}
    }
    return;
  }
  /* Cmd+Enter — send (alternative). The textarea's keydown
     handler already calls submitChatMessage on Enter, so we
     only need this for non-textarea contexts (e.g. the
     topic input). */
  if(cmd&&!e.altKey&&!e.shiftKey&&(key==="enter"||k==="Enter")){
    var t=e.target;
    if(t&&t.tagName!=="TEXTAREA"){
      e.preventDefault();
      if(t&&t.id==="topicInput"&&typeof startTopic==="function")startTopic();
      else if(typeof submitChatMessage==="function")submitChatMessage();
    }
    return;
  }
  /* Cmd+Shift+A — open projects picker. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="a"){
    e.preventDefault();
    if(typeof openNav==="function"){
      openNav("projects");
    }else if(typeof openProjects==="function"){
      openProjects();
    }
    return;
  }
  /* Cmd+Shift+P — cycle active project. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="p"){
    e.preventDefault();
    cycleActiveProject();
    return;
  }
  /* Up arrow in an empty textarea — load the last user
     message into the input for editing. Skipped when the
     textarea has text (so the user can still navigate within
     a multi-line draft). */
  if(k==="ArrowUp"&&!cmd&&!e.altKey&&!e.shiftKey){
    var ta=e.target;
    if(ta&&ta.id==="chatInputArea"&&!ta.value){
      var lastUser=findLastUserMessage();
      if(lastUser){
        e.preventDefault();
        ta.value=lastUser;
        ta.dispatchEvent(new Event("input"));
      }
    }
  }
});

/* P5.6 — find the most recent user-authored message in
   state.session.messages. Used by the Up-arrow-in-empty-input
   shortcut to pop the previous prompt back into the input
   for editing. */
/* D 区段(stripMarkdown / findLastUserMessage) 已抽到 src/render/markdown.js,
   顶部 import。 */


/* E 区段(openCheatsheet / buildCheatsheetSection / closeCheatsheet)已抽到
   src/ui/cheatsheet.js,顶部 import。 window.closeCheatsheet = closeCheatsheet
   仍由 main.js 末尾的 window.* 导出块承担,Phase B 会集中到 windowExports.js。 */
/* Mobile only: tap anywhere outside the sidebar (and outside the toggle
   button) to close it. On desktop the user controls the sidebar with the
   toggle button / ⌘B, and closing it on a click-outside would be
   unexpected. The backdrop is a sibling of the sidebar in the DOM and
   z-index 25; tapping it always closes the drawer on mobile. */
function isMobileViewport(){return window.innerWidth<768;}
document.addEventListener("click",function(e){
  var sbEl=document.getElementById("sidebar");
  if(!sbEl||sbEl.classList.contains("collapsed"))return;
  /* Clicks inside the sidebar or on the toggle button are not "outside". */
  if(e.target.closest("#sidebar"))return;
  if(e.target.closest(".toggle-sidebar"))return;
  /* If the context menu is open (long-press on a recent item), do NOT
     close the sidebar. The context menu popover lives outside #sidebar
     (appended to document.body), so it is not caught by the #sidebar
     guard above. Tapping on the context menu or its label input should
     not collapse the sidebar. */
  if(e.target.closest("#sessionContextMenu"))return;
  /* If ctx-menu-block is active, the user just long-pressed a recent
     item. The synthetic click event that follows has its target resolved
     outside .recent-item (because pointer-events:none), so the #sidebar
     guard above does not catch it. Ignore all clicks while the block
     class is present. */
  if(sbEl.classList.contains("ctx-menu-block"))return;
  /* Don't fight the user when they're interacting with form fields, the
     model picker, the extensions picker, or any other transient menu.
     If the click target is inside an open dropdown / form / modal
     overlay, leave the sidebar alone — the user is clearly in
     a nested interaction. */
  if(e.target.closest(".model-picker-menu"))return;
  if(e.target.closest(".extensions-menu"))return;
  if(e.target.closest(".model-picker, .extensions-picker"))return;
  if(e.target.closest("input, textarea, select, button, a, [role=button], [role=option]")){
    /* It's a control that may have its own click handler. Don't second-guess
       it. The sidebar will close naturally if the tap ends up doing nothing. */
    return;
  }
  if(isMobileViewport())toggleSidebar();
});
/* Backdrop tap on mobile also closes. The document-level handler above
   already handles backdrop clicks (the backdrop is outside #sidebar, not
   a form control, and is inside the mobile viewport's click region), so
   this listener is intentionally a no-op for non-backdrop targets and
   simply guarded against double-firing. */
var sbBackdrop=document.getElementById("sidebarBackdrop");
if(sbBackdrop)sbBackdrop.addEventListener("click",function(e){e.stopPropagation();var sbEl=document.getElementById("sidebar");if(isMobileViewport()&&sbEl&&!sbEl.classList.contains("collapsed"))toggleSidebar();});

/* Mobile keyboard avoidance — robust approach.

   On mobile the visualViewport shrinks when the soft keyboard opens, and
   the browser shifts the visual viewport scroll offset to keep the focused
   textarea visible. The input bar (#chatInputBar, position:absolute;
   bottom:0) moves up, but the scrollable content above it stays put,
   creating a visual gap.

   Our compensation: when the keyboard opens, scroll #msgList (or whichever
   scrollContainer() returns) downward by the same pixel amount the
   viewport lost — i.e. the keyboard height. This keeps the relative visual
   position between the content and the input bar stable.

   When the keyboard closes, restore the exact scrollTop that was captured
   at focus time.

   We use only visualViewport.resize to detect open/close transitions (a
   simple state machine), and we do NOT use blur — the focus event just
   records the baseline scrollTop. This avoids platform-specific timing
   races (iOS fires blur before the close-resize; Android fires it after). */
if(false && window.visualViewport){
  (function(){
    var input=document.getElementById("chatInputArea");
    if(!input)return;
    var _kbSavedTop=0;
    var _kbOpen=false;
    /* Threshold: ignore address-bar toggles (typically ~60-80 px) and
       visual-viewport initialization on page load. */
    var KB_THRESHOLD=100;

    input.addEventListener("focus",function(){
      var sc=scrollContainer();
      if(sc)_kbSavedTop=sc.scrollTop;
      /* Reset the open flag so that the next resize event that crosses
         the threshold reliably triggers the open transition. This covers
         the case where the user re-focuses the input while the keyboard
         is already showing — the flag is already true, so we need a way
         to re-apply the compensation. We set it to false so the resize
         handler sees shouldBeOpen=true and re-computes scrollTop. */
      _kbOpen=false;
    });

    window.visualViewport.addEventListener("resize",function(){
      var vh=window.visualViewport.height;
      var kbHeight=Math.round(window.innerHeight-vh);
      var shouldOpen=kbHeight>KB_THRESHOLD;

      /* Only act on a transition: closed → open or open → closed.
         All intermediate resize events during the keyboard animation
         are ignored. */
      if(shouldOpen===_kbOpen)return;
      _kbOpen=shouldOpen;

      var sc=scrollContainer();
      if(!sc)return;

      if(shouldOpen){
        /* Keyboard opened: shift the content down by the keyboard
           height so it visually stays in the same place relative to
           the (now-raised) input bar. */
        sc.scrollTop=Math.max(0,Math.min(
          _kbSavedTop+kbHeight,
          sc.scrollHeight
        ));
      }else{
        /* Keyboard closed: restore the original reading position. */
        sc.scrollTop=_kbSavedTop;
      }
    });
  })();
}

/* Use a CSS inset instead of imperative scroll compensation. This keeps the
   composer stable when browsers report VisualViewport measurements differently. */
initKeyboardViewport({
  input: document.getElementById('chatInputArea'),
  container: document.getElementById('appShell'),
});

/* Capacitor native bridge — StatusBar theme sync, keyboard signal
   forwarding, hardware back button. No-op when window.Capacitor is
   absent (i.e. regular web browser). */
if (isNativeApp()) {
  setupNativeBridge();
}

function switchTab(tab){
  var tk=document.getElementById("tabKnowledge");if(tk)tk.classList.toggle("active",tab==="knowledge");
  var tr=document.getElementById("tabRecents");if(tr)tr.classList.toggle("active",tab==="recents");
  var mt=document.getElementById("tabMistakes");
  if(mt)mt.classList.toggle("active",tab==="mistakes");
  var kp=document.getElementById("knowledgePanel");if(kp)kp.classList.toggle("hidden",tab!=="knowledge");
  var rp=document.getElementById("recentsPanel");if(rp)rp.classList.toggle("hidden",tab!=="recents");
  var mp=document.getElementById("mistakesPanel");
  if(mp)mp.classList.toggle("hidden",tab!=="mistakes");
  if(tab==="recents")renderRecents();
  if(tab==="mistakes")renderMistakes();
  /* Task 3.3 — refresh the teaching-plan view whenever the
     Knowledge tab is shown, so the stage / current sub-topic
     stay in sync after in-chat advances. */
  if(tab==="knowledge")renderKnowledgeView();
}

/* Unified sidebar search state. Read by doRenderRecents() as a
   client-side title/topic filter. The setter keeps the input box in
   sync (so the empty-state "Clear search" link can reset it) and
   re-renders. */
var RECENTS_SEARCH_QUERY="";
function setRecentsSearch(q){
  RECENTS_SEARCH_QUERY=q||"";
  var input=document.getElementById("sidebarSearch");
  if(input&&input.value!==RECENTS_SEARCH_QUERY)input.value=RECENTS_SEARCH_QUERY;
  renderRecents();
}

/* Sidebar view switch used by the tutor-only Knowledge / Mistakes icon
   entries. Clicking an already-active view toggles back to the unified
   Recents list; otherwise it opens the requested view. switchTab owns
   the actual panel show/hide. */
function toggleSidebarView(view){
  var el=document.getElementById(view==="knowledge"?"tabKnowledge":"tabMistakes");
  var isActive=el&&el.classList.contains("active");
  switchTab(isActive?"recents":view);
}

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

import {
  attachments, addFiles, removeAttachment, resetAttachments,
  buildMessageContent, MAX_TOTAL_ATTACHMENTS,
} from './attachments.js';

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

/* ============================================================
   STATE
   ============================================================ */
/* P1.5 — state is now a multi-namespace object. Each sub-object
   is the source of truth for one concern; cross-namespace writes
   go through the explicit field (e.g. `state.session.topic = ...`).
   For backward compatibility, `state` itself is a Proxy that
   delegates the legacy flat-field accesses
   (`state.topic`, `state.phase`, `state.kbNodes`, `state.mistakes`,
   `state._userScrolledAway`, `state.searchContext`, …) to the
   matching sub-namespace. New code should access via
   `state.session.topic` etc.; the legacy form still works because
   the read/write lookups resolve transparently. */

/* ============================================================
   SESSION PERSISTENCE (Recents)
   ============================================================ */
var RECENTS_KEY="socrates-sessions-v2";
var RECENTS_KEY_OLD="socrates-sessions";
/* P2.3 — how long the client and server keep an archived
   session before it's permanently erased. The server is the
   source of truth (it runs a daily GC job); we mirror the
   window on the client to keep the Storage modal and the
   Recents list in sync without waiting for the server's
   next sync round. */
/* Server-side session cache. The SPA keeps a copy of the user's chat
   sessions here so the UI can render the Recents / Knowledge / Mistakes
   tabs without a roundtrip on every action. We keep it fresh via
   getRecents() / setRecents() — which now hit the server. */
var SERVER_SESSIONS=[];
/* P_recents-fetch-fail — tracks whether the last refreshServerSessions()
   fetch failed. When true, doRenderRecents shows a "couldn't load" empty
   state with a Retry button instead of the misleading "No recent sessions
   yet." message. This is the root cause of "Recent list empty on some
   devices": devices with network issues, ad blockers, proxies, or hitting
   a transient 5xx saw an empty list with no indication that their data
   was still on the server. */
var SERVER_SESSIONS_FETCH_FAILED=false;
try{
  Object.defineProperty(window,"SERVER_SESSIONS",{
    configurable:true,
    get:function(){return SERVER_SESSIONS},
    set:function(v){SERVER_SESSIONS=capSessions(v)}
  });
  Object.defineProperty(window,"SERVER_SESSIONS_FETCH_FAILED",{
    configurable:true,
    get:function(){return SERVER_SESSIONS_FETCH_FAILED}
  });
}catch(_){}

/* P2.1 — Projects were removed; sessions are un-categorized now. */
function generateId(){
  /* Use the standard UUIDv4 when the browser supports it — the
   * server's `sessions.id` column is typed as `uuid`, so anything
   * that isn't a real UUID is rejected and the save 500s. The
   * fallback below generates a string that MATCHES the UUID format
   * so the server's isUuid() check (and the upsert's onConflictDoUpdate)
   * operate correctly even in insecure contexts or old browsers. */
  try{
    if(typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"){
      return crypto.randomUUID();
    }
  }catch(_){}
  /* Fallback: produce a UUIDv4-compatible string so the server
     recognises it. Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
     where x is random hex and y is 8, 9, a, or b. */
  function h(){return Math.floor(Math.random()*65536).toString(16).padStart(4,'0')}
  return h()+h()+'-'+h()+'-4'+h().slice(1)+'-'+(8+Math.floor(Math.random()*4)).toString(16)+h().slice(1)+'-'+h()+h()+h();
}
function getRecents(){
  /* P2.3 — sweep local expired archives first so the Recents
     list and the Storage modal never disagree. */
  sweepExpiredArchives();
  /* P2.3 — archived sessions are hidden from the default
     Recents list. Users restore them from the Storage modal. */
  return getVisibleSessions(SERVER_SESSIONS);
}
function setRecents(arr){SERVER_SESSIONS=capSessions(arr)}

/* P2.2 — filter chip state. `null` = all; otherwise a tag
   string. Persisted in localStorage so the user's last filter
   survives a reload. */
var RECENTS_FILTER_KEY="socrates-recents-filter";
try{window.RECENTS_FILTER_KEY=RECENTS_FILTER_KEY}catch(_){}

/* Session custom labels, stored client-side (keyed by session id).
   Displayed prominently in the recent-item row next to the title. */
var SESSION_LABELS_KEY="socrates-session-labels";
function getSessionLabel(id){
  if(!id)return"";
  try{var m=JSON.parse(localStorage.getItem(SESSION_LABELS_KEY)||"{}");return m[id]||""}catch(e){return""}
}
function setSessionLabelStore(id,label){
  if(!id)return;
  try{
    var m=JSON.parse(localStorage.getItem(SESSION_LABELS_KEY)||"{}");
    if(label){m[id]=label}else{delete m[id]}
    localStorage.setItem(SESSION_LABELS_KEY,JSON.stringify(m));
  }catch(e){}
}

/* P2.2 — set of tag strings the user has ever used. Powers
   the autocomplete suggestions in the tag editor popover. */
function getKnownTags(){
  return getKnownTagsFromSessions(SERVER_SESSIONS);
}
async function refreshServerSessions(){
  if(!CURRENT_USER)return[];
  /* P_delbug-cleanup — the previous `console.warn("[DEL-BUG] ...")`
     tracing logs (incl. a `new Error().stack` capture on every call)
     were left over from a delete-flow debugging session and flooded
     the console on every login / save / delete. Demoted to
     console.debug so they stay available under Verbose level without
     polluting the default console. */
  var ok=false;
  try{
    var r=await apiFetch("/api/sessions?limit=200");
    SERVER_SESSIONS=Array.isArray(r&&r.sessions)?r.sessions:[];
    ok=true;
  }catch(e){
    /* P_recents-fetch-fail — retry ONCE on transient failures (network
       blip, 5xx, 429). This covers the "some devices" report where a
       flaky connection or a momentary 502/503 left the user with an
       empty Recents list. Non-retryable errors (401/403/404) skip the
       retry so we don't waste a roundtrip on a definitely-broken
       request. The original bug silently swallowed ALL errors here,
       leaving SERVER_SESSIONS=[] and showing "No recent sessions yet."
       even when the user had sessions on the server. */
    var status=e&&e.status;
    var retryable = status===0 || status===408 || status===429 ||
                    (typeof status==="number" && status>=500 && status<600);
    if(retryable){
      try{
        await new Promise(function(res){setTimeout(res,400)});
        var r2=await apiFetch("/api/sessions?limit=200");
        SERVER_SESSIONS=Array.isArray(r2&&r2.sessions)?r2.sessions:[];
        ok=true;
      }catch(e2){/* still failing — surface below */}
    }
  }
  SERVER_SESSIONS_FETCH_FAILED=!ok;
  return SERVER_SESSIONS.slice();
}
/* P_recents-fetch-fail — manual retry entry point bound from the
   "Couldn't load sessions — Retry" empty state. Re-runs the fetch,
   then re-renders so the user sees the result immediately. */
async function retryRecentsFetch(){
  try{showToast("Loading sessions…")}catch(_){}
  try{await refreshServerSessions()}catch(_){}
  try{renderRecents()}catch(_){}
}
try{window.retryRecentsFetch=retryRecentsFetch}catch(_){}
/* ============================================================
   P1.2 — Global search (Cmd / Ctrl + K)
   Client-side fuzzy index over:
     - session titles + topics (SERVER_SESSIONS)
     - message raw text inside every loaded session
   The index is built on first open and rebuilt whenever
   `saveCurrentSession` runs. When the server-side search endpoint
   (docs/api/openapi.yaml #/paths/~1api~1search) is available, the
   client also fires a `globalSearch` request to extend the
   client-only results with cross-device / cross-account hits.
   ============================================================ */
/* P_main-split — Wave 1b: Cmd-K palette extracted to ui/cmdK.js. */
import {
  rebuildCmdKIndex, openCmdK, closeCmdK, onCmdKInput, onCmdKKey,
  renderCmdKResults, renderCmdKResultsHits, renderCmdKResultsHTML,
  openCmdKResult, updateCmdKSelected,
} from './ui/cmdK.js';

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
var _saveInFlight=null;
var _saveDirty=false;
/* P_context-race — guard flag set during loadSession to prevent
   saveCurrentSession() calls during message rebuilding. Without this,
   a saveCurrentSession() triggered by an event handler while
   loadSession() is in progress could capture mismatched state
   (new session ID + old or partially-rebuilt messages). */
var _loadingSession=false;
/* P_stale-loadSession — tracks the most recently requested
   loadSession target ID. When multiple loadSession() calls race
   (user clicks several sessions in quick succession), the earlier
   fetch may complete AFTER the later one and overwrite state with
   stale data. We check this at the point where state would be
   mutated and skip if another, newer load was already requested. */
var _loadSessionId=null;
/* P_delete-resurrect — every session id the user deleted in the
   current page load. doSave() refuses to POST any payload whose
   sessionId is in here, regardless of state.topic/state.session.
   The server's POST /api/sessions is an UPSERT keyed by id, so
   a stray POST carrying a "deleted" id would silently re-insert
   the row — that's exactly the "deleted session comes back"
   repro. We also drop the entry on a successful refresh after
   deletion (in actuallyDeleteSession's then-callback) so the
   guard doesn't permanently block re-saving a new session with
   a coincidentally-similar id. */
var _deletedSessionGuard=createDeletedSessionGuard();
function rememberDeletedSession(id){
  _deletedSessionGuard.remember(id);
}
function forgetDeletedSession(id){_deletedSessionGuard.forget(id)}
function saveCurrentSession(){
  if(!state.topic)return;
  if(!CURRENT_USER)return; /* not signed in; do nothing */
  /* P_context-race — discard saves during session loading. The
     loadSession function is in the middle of rebuilding state and
     any intercepted save would capture mismatched sessionId vs
     messages, causing "会话串台" (context cross-contamination). */
  if(_loadingSession) return;
  /* If a save is already running, mark dirty and let it coalesce. */
  if(_saveInFlight){
    _saveDirty=true;
    return;
  }
  _saveDirty=false;
  doSave();
}

function doSave(){
  /* Guard against saving after state has been reset — the
     _saveDirty cascade in saveCurrentSession bypasses the
     state.topic check after the first in-flight save finishes.
     Without this guard, deleting a session while a save is
     in-flight causes the queued doSave() to POST empty state
     to the server, creating a ghost session. */
  /* P_delete-resurrect — refuse to POST a session the user has
     already deleted on this page. The check fires BEFORE the
     state.topic guard (which is the original guard) because a
     session whose topic was retained after delete (e.g. the
     "give it back so the user can re-create it" UX I'd half-
     designed at one point) would otherwise bypass the topic
     check and silently re-insert the deleted row. */
  var sid=state.session.currentSessionId;
  if(_deletedSessionGuard.has(sid)){
    _saveInFlight=null;
    _saveDirty=false;
    return;
  }
  if(!state.topic)return;
  var now=Date.now();
  /* P1.1 — read from the authoritative state.messages list, NOT
     from the live DOM. The DOM may still hold a half-rendered
     streaming bubble (text content only, no KaTeX), and reading
     partial innerHTML was a known source of "messages got mangled"
     reports on reload. We render once at finish() time and store
     both rawText and html.

     P_streaming-save — EXCLUDE messages whose `type` is "streaming"
     (the in-progress placeholder that addStreamingMessage pushes into
     state.messages). If we save while a stream is in flight, the
     placeholder gets committed to the messages table with an empty /
     partial rawText. The server-side deduplication by clientId is
     insert-only and has no update path, so the final content from
     finish() never overwrites the placeholder — the AI response is
     permanently lost on reload. Filtering streaming placeholders here
     is the root fix; they are only persisted after finish() flips
     type to "assistant". */
  var messages=state.messages
    .filter(function(m){return m.type!=="streaming"})
    .map(function(m){
    return {
      clientId:m.clientId||null,
      role:m.role,
      html:m.html,
      rawText:m.rawText||null,
      type:m.type||null,
      reasoningContent:m.reasoningContent||null,
      /* P_attachments — round-trip the inlined image dataUrl /
       * parsed text body so reloads restore thumbnails without a
       * re-upload. The server caps to 20 in sessions.js; we
       * trim here too to keep payloads small. */
      attachments:Array.isArray(m.attachments)?m.attachments.slice(0,20):[],
      /* P_tool-history — persist tool-call cards (including artifact
       * image IDs) so session reload re-renders the cards and their
       * images. Without this, toolCalls are silently dropped at save
       * time and never restored on reload. */
      toolCalls:Array.isArray(m.toolCalls)?m.toolCalls.slice(0,20):[],
    };
  });
  var sessionId=state.session.currentSessionId||generateId();
  /* P_context-race — snapshot the session ID at capture time so the
     POST callback can detect whether a session switch happened while
     the request was in-flight. If the active session changed, the
     POST response (server-adopted id) must NOT overwrite the new
     session's URL / state. */
  var capturedSessionId=sessionId;
  var payload={
    id:sessionId,
    topic:state.session.topic,
    title:state.session.sessionTitle||state.session.topic,
    domain:state.session.domain||state.session.topic,
    projectId:state.currentProjectId||null,
    mode:appMode,
    messages:messages,
    kbNodes:state.kb.kbNodes,
    mistakes:state.kb.mistakes||[],
    currentNode:state.kb.currentNode,
    totalQ:state.session.totalQ,
    phase:state.phase,
    /* Task 2.4 — persist the teaching-stage state machine so a
       reloaded session resumes at the right stage. The backend
       sessions.js uses .passthrough() so these extra fields are
       accepted without schema changes. */
    teachingStage:state.session.teachingStage||"motivate",
    currentExampleIdx:state.session.currentExampleIdx||0,
    practiceAttempts:state.session.practiceAttempts||0,
    practicePhase:state.session.practicePhase||"foundation",
    teachingPlan:state.session.teachingPlan||null,
    /* v3.0 design — knowledge boundary history (snapshots) and
       mistake filter are also persisted so the sidebar state
       survives reloads. */
    boundariesHistory:state.kb.boundariesHistory||[],
    mistakeFilter:state.kb.mistakeFilter||"all",
    updatedAt:now,
  };
  state.currentSessionId=sessionId;
  /* P_dup-session — sync the namespace mirror too. Without this,
     a second saveCurrentSession in the same tick reads
     state.session.currentSessionId (still null because line 1228
     only fires after the server responds), regenerates a new id,
     and the server creates a SECOND session record — the user
     sees the same chat appear twice in Recents. The two fields
     have to stay in lock-step synchronously, not just on the
     async POST response. */
  state.session.currentSessionId=sessionId;
  toggleShareBtn();
  /* Kick off AI title generation based on the user's first input. */
  if(!state.sessionTitle)generateSessionTitle();
  /* P1.2 — rebuild the Cmd-K search index after every save so the
     user can immediately find the message they just sent.
     P_lag-fix — Fuse builds over SERVER_SESSIONS + state.messages
     and can stall the click→paint path on the new-session click by
     100-500ms when there are many sessions. Defer to idle time so
     the greeting stream starts unblocked; Cmd-K still rebuilds
     synchronously the first time it's opened (lazy guard at line 893). */
  if(typeof requestIdleCallback==="function"){
    requestIdleCallback(function(){rebuildCmdKIndex()},{timeout:2000});
  }else{
    setTimeout(function(){rebuildCmdKIndex()},0);
  }
  /* Fire-and-forget write to server. The local SERVER_SESSIONS cache is
     refreshed on next renderRecents; we don't block the UI on the roundtrip.
     P0.0 — adopt the server's canonical session id when it differs
     from what we sent. Pre-UUID fix the client generated identifiers
     like "mq61wc16-ayb8j6" and the server swapped in a fresh UUID
     before inserting. Without this adoption step, every subsequent
     save kept sending the original (rejected) id, breaking the upsert
     and producing duplicate rows. */
  _saveInFlight=apiFetch("/api/sessions",{method:"POST",body:payload}).then(function(r){
    /* P_delete-resurrect — if this session was deleted while the
       POST was in-flight (rememberDeletedSession set a tombstone),
       do NOT adopt the server's id or update state. The server may
       have processed this upsert after the DELETE (race), potentially
       resurrecting the row. Instead, just refresh the server list
       which will reflect the DELETE (or the next DELETE cycle). */
    if(_deletedSessionGuard.has(capturedSessionId)){
      return refreshServerSessions();
    }
    /* P_context-race — if the user switched to a different session
       while this POST was in-flight, do NOT adopt the server's id
       (it belongs to the old session) and do NOT update the URL. */
    if(state.session.currentSessionId!==capturedSessionId)return refreshServerSessions();
    if(r&&r.id&&r.id!==sessionId){
      state.currentSessionId=r.id;
      if(state.session)state.session.currentSessionId=r.id;
      pushChatIdToURL(r.id);
    }
    return refreshServerSessions();
  }).then(function(){
    /* P_streaming-survival — after a successful save (the stream
       completed normally), clear the server-side streaming_text
       so a reload doesn't show partial content. Fire-and-forget;
       failure is harmless. */
    var curSid=state.session.currentSessionId||state.currentSessionId;
    if(curSid){
      apiFetch("/api/sessions/"+encodeURIComponent(curSid),{
        method:"PATCH",
        body:{streamingText:null,streamingReasoning:null},
        timeoutMs:5000,
      }).catch(function(){});
    }
    renderRecents();}).catch(function(e){
    /* F1a — surface the save failure so the user knows their
       conversation isn't being persisted. Without this the recent
       list can silently lose new entries (Bug1). showToast lives at
       main.js:5226 (signature: msg only); t() is window.t set by
       i18n.js. The default 1800ms timeout is too short for an error
       toast, so we re-implement a longer-lived variant inline. */
    try{
      var el=document.createElement("div");
      el.className="msg-toast msg-toast-error";
      el.textContent=t("sessions.save_failed","Save failed")+": "+e.message;
      document.body.appendChild(el);
      requestAnimationFrame(function(){el.classList.add("visible")});
      setTimeout(function(){
        el.classList.remove("visible");
        setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el)},300);
      },5000);
    }catch(_){}
  }).then(function(){
    /* Clear the in-flight flag BEFORE re-checking dirty so a
       queued save picks up the latest state (and the just-adopted
       server id, if any) instead of re-sending a stale id. */
    _saveInFlight=null;
    if(_saveDirty){
      _saveDirty=false;
      doSave();
    }
  });
}

/* P_save-on-unload — page lifecycle handlers that prevent loss of
 * the latest AI response when the user refreshes or closes the tab
 * before the async saveCurrentSession() POST completes.
 *
 * beforeunload: Shows a "Leave site?" confirmation dialog if a save
 *   is still in-flight, giving it time to complete. The user can
 *   choose to stay (letting the save finish) or leave anyway.
 *
 * pagehide: Fires after beforeunload, right before the page is torn
 *   down. Uses fetch(keepalive:true) as a last-chance save attempt
 *   so the server receives the session data even if the page unloads. */
(function(){
  /* P_save-unload-ref — read CSRF token synchronously from the cookie
     (available during page teardown). Same pattern as getCsrfToken in
     util/api.js but inlined to avoid an import dependency. */
  function _beaconCsrf(){
    var m=document.cookie.match(/\bcsrf=([^;]+)/);
    return m?m[1]:null;
  }
  function _beaconSave(){
    /* Only fire if we have data worth saving and a save is pending. */
    if(!_saveInFlight||!state.session.currentSessionId||!CURRENT_USER)return;
    /* Snapshot only the data we need — rawText and role are enough
       for recovery; html is regenerated client-side on load. */
    var snapshot=state.messages
      .filter(function(m){return m.type!=="streaming"})
      .map(function(m){return{
        clientId:m.clientId||null,
        role:m.role,
        rawText:m.rawText||null,
        reasoningContent:m.reasoningContent||null,
        attachments:Array.isArray(m.attachments)?m.attachments.slice(0,20):[],
        toolCalls:Array.isArray(m.toolCalls)?m.toolCalls.slice(0,20):[],
      }});
    if(!snapshot.length)return;
    var payload={
      id:state.session.currentSessionId,
      topic:state.session.topic||state.topic||"",
      title:state.session.sessionTitle||state.session.topic||"",
      mode:appMode,
      messages:snapshot,
    };
    var csrf=_beaconCsrf();
    try{
      fetch("/api/v2/sessions",{
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          ...(csrf?{"X-CSRF-Token":csrf}:{}),
        },
        body:JSON.stringify(payload),
        credentials:"include",
        keepalive:true,
      }).catch(function(){});
    }catch(_){}
  }
  /* beforeunload — show confirmation if a save is in-flight. */
  window.addEventListener("beforeunload",function(e){
    if(_saveInFlight){
      e.preventDefault();
      e.returnValue="";
    }
  });
  /* pagehide — last-chance keepalive fetch (fires before the page is
     torn down). Also fire on visibilitychange as a secondary guard. */
  window.addEventListener("pagehide",_beaconSave);
  window.addEventListener("visibilitychange",function(){
    if(document.visibilityState==="hidden")_beaconSave();
  });
})();

/* P_exam-history — open a previously-saved exam session. Re-uses
 * openExamModal() to flip the visible view, then rehydrates the
 * in-memory state (questions, answers, lang, etc.) and re-renders
 * the question cards. If the saved exam was already submitted, jump
 * straight to the results view; otherwise show the questions with
 * the user's previous answers already selected/filled. */
async function loadExamSession(s){
  var ev=document.getElementById("examView");
  var others=["topicSetup","diagnosticView","chatView"];
  others.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add("hidden");});
  ev.classList.remove("hidden");
  state._examInView=true;
  state.currentSessionId=s.id;
  state.examCancel=false;
  state.examTopic=(s.examData&&s.examData.topic)||s.topic||"";
  state.examCount=(s.examData&&s.examData.count)||((s.examData&&s.examData.questions&&s.examData.questions.length)||0);
  state.examLang=(s.examData&&s.examData.lang)||"English";
  state.examDifficulty=(s.examData&&s.examData.difficulty)||"intermediate";
  state.examTypes=Array.isArray(s.examData&&s.examData.types)?s.examData.types:[];
  state.examQuestions=Array.isArray(s.examData&&s.examData.questions)?s.examData.questions.map(function(q,i){
    var c=Object.assign({},q);
    c._idx=i;
    return c;
  }):[];
  state.examAnswers=(s.examData&&s.examData.answers)||{};
  state.examSubmitted=!!(s.examData&&s.examData.submitted);
  _examTitle().textContent=state.examSubmitted?("Exam Results: "+state.examTopic):(state.examTopic);
  var body=_examBody();
  var footer=_examFooter();
  /* Build the same DOM that a fresh generation would build, but
     skip the streaming cards and use the saved data. The unified
     paintQuestionCard helper handles the option pre-selection /
     answer pre-fill needed for restored sessions. */
  body.innerHTML='<div id="examQuestionsContainer"></div>';
  state.examQuestions.forEach(function(q,idx){
    var card=document.createElement("div");
    card.className="exam-q-card";
    card.id="examQ"+idx;
    card.setAttribute("data-idx",idx);
    body.querySelector("#examQuestionsContainer").appendChild(card);
    paintRestoredQuestionCard(idx,q);
  });
  /* Mount the nav bar (and make the active pill match whatever the
     first question is on load). */
  renderExamNav();
  /* Footer actions depend on whether the exam is already submitted. */
  if(state.examSubmitted){
    renderExamResults();
  }else{
    footer.innerHTML='<button class="exam-btn primary" onclick="submitExam()">Submit for Grading</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
  }
  toggleShareBtn();
  renderRecents();
  /* Wire the scroll listener once per open so the active nav pill
     tracks the viewport. */
  if(!state._examScrollBound){
    var bindCont=document.getElementById("examViewBody");
    if(bindCont){
      bindCont.addEventListener("scroll",function(){
        if(state._examInView)syncExamNav();
      });
    }
    state._examScrollBound=true;
  }
  var sc=document.getElementById("scrollContainer")||document.getElementById("msgScroll");
  if(sc)sc.scrollTop=0;
}

/* Helper for loadExamSession — fill a single .exam-q-card with the
 * saved question and the user's saved answer (option pre-selected for
 * multiple-choice, value prefilled for fill-blank / short-answer).
 * Wraps paintQuestionCard and adds the "selected" / "value" overrides. */
function paintRestoredQuestionCard(idx,q){
  var ph=document.getElementById("examQ"+idx);
  if(!ph)return;
  paintQuestionCard(idx,q,ph);
  var saved=state.examAnswers&&state.examAnswers[idx];
  if(q.type==="multiple-choice"&&q.opts&&saved!==undefined){
    var btns=ph.querySelectorAll(".exam-q-opt");
    btns.forEach(function(b,i){if(i===saved)b.classList.add("selected")});
  }else if(q.type==="fill-blank"||q.type==="short-answer"){
    var input=ph.querySelector(".exam-q-fill-input");
    if(input&&typeof saved==="string")input.value=saved;
  }
}

/* F2c — clear every cross-round transient so a previous session's
   web-search cache, call metadata, composer draft, plan fields, or
   pending-chat payload cannot leak into the next one. Called from
   loadSession() (server-driven switch) and startSession() (user
   clicks Begin with a new topic). */
function resetSessionTransients(s){
  s.search.context=null;
  s.search.results=[];
  s.search.contextAt=0;
  s.search.contextCount=0;
  s.search.contextQuery=null;
  s.search.error=null;
  s.call.source=null;
  s.call.error=null;
  s.session.sessionTitle=null;
  try{var ci=document.getElementById("chatInputArea");if(ci){ci.value="";autoResize(ci);}}catch(_){}
  try{updateSendBtn();}catch(_){}
  try{if(window._pendingChatContent!==undefined)window._pendingChatContent=null;}catch(_){}
  try{if(window._pendingAttachments!==undefined)window._pendingAttachments=null;}catch(_){}
  /* F2a-ext — clear the active template so a slash-command template
     (/quiz, /summarize, etc.) from the previous session doesn't
     inject its systemPrompt into the new session's LLM call via
     injectTemplateSystemPrompt (main.js:3910). The template is a
     user-level tool, not a session-scoped state; resetting it on
     session switch prevents the #1 cross-session context leak. */
  try{if(typeof clearActiveTemplate==="function")clearActiveTemplate()}catch(_){}
}

/* F2d — write the active session id to every place it's mirrored
   (state.currentSessionId, state.session.currentSessionId, window
   mirror). The Proxy state.js already syncs the top-level ↔ namespace
   via the lookup table, but the explicit triple-write keeps window
   readers in lock-step and removes the four manual duplications
   scattered through loadSession / startSession / resetState. */
function setCurrentSessionId(id){
  state.currentSessionId=id;
  state.session.currentSessionId=id;
  try{window._currentSessionId=id;}catch(_){}
}

async function loadSession(id){
  /* Guard: if the context menu is open for this session, suppress
     navigation (synthetic click from mobile long-press). */
  if(_ctxMenuSessionId===id)return;
  /* P_context-race — prevent saveCurrentSession() during session
     loading. Set BEFORE draining _saveInFlight so no new save can
     sneak in during the drain window. Without this, a save that
     fires between the drain and _loadingSession=true would capture
     mismatched state (sessionId vs messages), causing "会话串台". */
  _loadingSession=true;
  /* Drain the entire save pipeline — including the _saveDirty
     cascade. Loop because the cascade may fire a new doSave()
     after the current one completes; the _loadingSession guard
     above prevents any new saves from being initiated during
     this drain, so the loop terminates when the cascade is fully
     exhausted. */
  while(_saveInFlight){
    try{await _saveInFlight}catch(_){}
  }
  /* Abort any active chat stream so its onDelta/finish callbacks
     don't write to state.messages after we replace them. */
  if(window._activeChatAbort){try{window._activeChatAbort("session-switch")}catch(_){}}
  if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
  window._activeChatCtl=null;
  window._activeChatAbort=null;
  _chatStreaming=false;
  _chatStopMode=false;
  /* P_stale-loadSession — record the target id before the async
     fetch. If another loadSession() call races ahead and completes
     first, _loadSessionId will have moved past ours; we check
     below and bail before touching state. */
  _loadSessionId=id;
  try{
    var s=await apiFetch("/api/sessions/"+encodeURIComponent(id));
    ensureSessionShape(s);
    /* P_stale-loadSession — if a newer loadSession() was already
       requested while this fetch was in-flight, skip the stale
       response so we don't overwrite the newer session's state. */
    if(_loadSessionId!==id) return;
    state.topic=s.topic;
    state.domain=s.domain;
    state.kbNodes=s.kbNodes||[];
    state.currentNode=s.currentNode||0;
    state.totalQ=s.totalQ||0;
    state.phase=s.phase||"chat";
    state.currentProjectId=s.projectId||null;
    if(s.projectId){
      apiFetch("/api/projects").then(function(r){
        var rows=(r&&r.projects)||[];
        window.__activeProject=rows.filter(function(p){return p.id===s.projectId})[0]||null;
      }).catch(function(){});
    }else{ window.__activeProject=null; }
    /* P_context-race — currentSessionId and URL are set DEFERRED
       after messages are rebuilt below. Setting currentSessionId before
       messages creates a window where state.session.currentSessionId
       points to the NEW session but state.messages still holds the OLD
       session's data. Any saveCurrentSession() that fires during this
       window (called from 23+ places) would capture mismatched state,
       causing "会话串台" (context cross-contamination). Both fields
       are set together at the end of the message-rebuild block. */
    // state.currentSessionId = s.id; ← MOVED DOWN
    toggleShareBtn();
    state.mistakes=s.mistakes||[];
    /* F2a — flush transients BEFORE setting sessionTitle so the
       helper's reset (sessionTitle=null) can't race with the assignment
       below. Order matters: resetSessionTransients clears
       search/call/composer/plan, then this block restores sessionTitle
       + teachingStage + plan fields from the loaded session. */
    resetSessionTransients(state);
    state.sessionTitle=s.title||null;
    /* Update the URL to reflect the current chat session.
       MOVED DOWN — see comment above. */
    // pushChatIdToURL(s.id); ← MOVED DOWN
    state.substantiveCount=0;
    state.stuckCount=0;
    state.diagIndex=0;
    state.diagAnswers=[];
    state.diagQuestions=[];
    state.explaining=false;
    /* Task 2.4 — restore the teaching-stage state machine. Default
       to motivate / 0 / null for sessions saved before Task 2.1. */
    state.teachingStage=s.teachingStage||"motivate";
    state.currentExampleIdx=s.currentExampleIdx||0;
    state.practiceAttempts=s.practiceAttempts||0;
    state.practicePhase=s.practicePhase||"foundation";
    state.teachingPlan=s.teachingPlan||null;
    /* Restore KB boundary history and mistake filter. */
    state.kb.boundariesHistory=Array.isArray(s.boundariesHistory)?s.boundariesHistory:[];
    state.kb.mistakeFilter=s.mistakeFilter||"all";
    /* Restore the mode the session was started in. Only override when the
       session has an explicit mode field — sessions without one (older
       rows where the DB defaulted to 'tutor') keep the current appMode
       so a chat user doesn't get silently switched to tutor mode. */
    if(s.mode==="chat"||s.mode==="tutor"){window.appMode=s.mode;}
    /* P_tutor-sync — keep window.appMode in lock-step. */
    try{window.appMode=appMode}catch(_){}
    syncAppModeUI();
    syncSidebarForMode();
    /* P_exam-history — exam sessions are persisted to the same
     * /api/sessions table but with kind='exam'. When the user clicks
     * one in Recents, route them straight into the exam view with
     * the saved questions, answers, and language restored — instead
     * of the chat-view message renderer which would show nothing
     * useful (exam sessions have no chat-style messages). */
    if(s.kind==="exam"&&s.examData){
      loadExamSession(s);
      return;
    }
    document.getElementById("topicSetup").classList.add("hidden");
    document.getElementById("diagnosticView").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    if (typeof window.hideMainPages === "function") window.hideMainPages();
    toggleChatTopBarEls(true);
    syncChatModel();
    var msgList=document.getElementById("msgList");
    if(typeof window.disposeVisualizations === "function") window.disposeVisualizations(msgList);
    msgList.innerHTML="";
    // P-arch context-resume — reset the authoritative message list so
    // extractHistory() sees the loaded history when the user sends
    // the next turn. Without this, the user opens an old session,
    // types a new message, and the LLM only sees the new question
    // — the prior conversation context is dropped because
    // state.messages was still pointing at the previous (or empty)
    // session's list.
    state.messages.length = 0;
    (s.messages||[]).forEach(function(m){
      var div=document.createElement("div");
      div.className="msg "+m.role;
      var body=document.createElement("div");
      body.className="msg-body";
      // P-arch — re-render from rawText so the latest renderer
      // (auto-wrap bare [...] math, \[...\] support, stray-$ escape,
      // etc.) applies to OLD messages whose stored `html` was
      // rendered with an older renderer. User messages also go
      // through formatMsg so markdown formatting (backticks, **bold**,
      // lists, math) in user text renders properly, and so any
      // legacy payloads where `rawText` was stored as the rendered
      // HTML (e.g. "<p>讲解一下高斯定理</p>") are handled — formatMsg
      // runs preprocessMarkdown which strips the stray <p>/<br> and
      // re-renders cleanly. The previous code path of
      //   body.innerHTML = "<p>"+esc(m.rawText)+"</p>"
      // visibly displayed the literal tag text for such payloads.
      var _userRaw = m.rawText;
      if(m.role === "user" && _userRaw) {
        // Strip a leading/trailing <p>...</p> wrapper that older
        // code paths may have stored as rawText. This is a no-op
        // for clean text like "讲解一下高斯定理".
        _userRaw = String(_userRaw).replace(/^\s*<p>\s*/i, "").replace(/\s*<\/p>\s*$/i, "").trim();
      }
      var renderHtml = "";
      if(_userRaw && m.role === "user") {
        renderHtml = formatMsg(_userRaw);
      } else if(m.role==="assistant" && m.rawText){
        /* renderAssistantHTML parses <quiz>/<example>/<practice>
           scaffold blocks, runs formatMsg, and queues async widget
           mount in setTimeout(0). On reload this guarantees the
           interactive widgets re-appear (not the raw <quiz> XML). */
        try {
          renderHtml = renderAssistantHTML(m.rawText);
        } catch (_) {
          renderHtml = formatMsg(m.rawText);
        }
      } else if(m.html){
        renderHtml = m.html;
      }
      body.innerHTML = renderHtml;
      // Reuse the server-side UUID as the clientId so edit/delete
      // can address the real DB row; fall back to a synthetic id
      // for messages that lack a server id (older payloads).
      var clientId = m.id || ("loaded-"+(m.clientId || generateId()));
      div.dataset.clientId = clientId;
      // Mirror into the authoritative state.messages so the next
      // chat turn sends the full history to the LLM via
      // extractHistory(). `rawText` is the canonical source for
      // history (the LLM context is plain text); `html` is what
      // we just rendered. type/actions are unused on load.
      /* P_tool-history — restore tool-call records so the cards
         (including artifact images) re-appear on session reload. */
      const restoredToolCalls = Array.isArray(m.toolCalls)
        ? m.toolCalls.map(function(tc) {
            return {
              id: String(tc.id || ''),
              name: String(tc.name || ''),
              input: tc.input == null ? null : tc.input,
              output: tc.output == null ? null : tc.output,
              isError: tc.isError === true,
              artifacts: Array.isArray(tc.artifacts)
                ? tc.artifacts.map(function(a) {
                    return { id: String(a.id || ''), mimeType: a.mimeType || null, name: a.name || null };
                  })
                : [],
              results: Array.isArray(tc.results) ? tc.results.slice(0, 20) : [],
            };
          })
        : [];
      state.messages.push({
        clientId: clientId,
        role: m.role,
        rawText: m.rawText || "",
        html: renderHtml,
        type: m.type || null,
        /* P_reasoning-persist — restore chain-of-thought text so it
           can be passed back to the LLM on the next turn. */
        reasoningContent: m.reasoning_content || null,
        /* P_attachments — restore the persisted array so the bubble
         * re-renders the chip strip AND so a future save round-trips
         * them again. */
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        toolCalls: restoredToolCalls,
        actions: null
      });

      /* P_attachments — render the chip strip below the text body
       * so reloads show the same thumbnails the user saw originally.
       * Same shape as addMessage()'s renderer; lives here so legacy
       * history reloads don't go through addMessage (which would
       * also append to state.messages and double-count). */
      if(m.role === "user" && Array.isArray(m.attachments) && m.attachments.length){
        var strip=document.createElement("div");
        strip.className="msg-attachments";
        m.attachments.forEach(function(a){
          if(!a)return;
          var chip=document.createElement("div");
          chip.className="msg-attachment";
          if(a.kind==="image" && a.dataUrl){
            var img=document.createElement("img");
            img.className="msg-attachment-thumb";
            img.src=a.dataUrl;
            img.alt=a.name||"";
            chip.appendChild(img);
          }else{
            var icon=document.createElement("span");
            icon.className="msg-attachment-thumb";
            icon.style.display="inline-flex";
            icon.style.alignItems="center";
            icon.style.justifyContent="center";
            icon.style.borderRadius="12px";
            icon.style.background="hsl(var(--bg-300))";
            icon.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
            chip.appendChild(icon);
          }
          var nm=document.createElement("span");
          nm.className="msg-attachment-name";
          nm.textContent=a.name||"file";
          chip.appendChild(nm);
          if(a.error){
            var err=document.createElement("span");
            err.className="msg-attachment-error";
            err.textContent="!";
            err.title=a.error;
            chip.appendChild(err);
          }
          strip.appendChild(chip);
        });
        body.appendChild(strip);
      }
      /* P_reasoning-persist — render the thinking pill if the loaded
         message has saved reasoning_content and thinking is on. */
      if(m.role==="assistant" && m.reasoning_content && window.thinkingOn){
        var tp=appendThinking(m.reasoning_content||"");
        if(tp&&typeof tp.finalize==="function"){
          try{setTimeout(function(){tp.finalize()},0)}catch(_){}
        }
      }
      div.appendChild(body);
      /* P_tool-history-restore — on page refresh, restore ONLY the
         user-visible output of each past tool call. We deliberately
         skip the `.agent-tool-card` chrome (the "Code · Done · 12s"
         header and collapsible body) because that chrome is meant
         for live streaming where the user wants to watch the
         transcript in real time. After refresh, the conversation
         is in a settled state and the LLM has already summarised
         the result in its prose — the chrome would just be
         duplicated visual noise on top of that summary.

         What we KEEP:
         - render_visualization → mountVisualization() mounts a
           fresh .visualization-card directly in `body` (line below).
           The user sees the chart exactly as it was.
         - code_interpreter image artifacts → appendInlineArtifact()
           with the message body mounts the <img> in `body` so
           matplotlib PNGs / chart exports appear inline.
         - web_search → sources are already cited inline in the
           LLM's reply as [1], [2], so no separate card is needed.

         What we DROP:
         - The .agent-tool-card chrome itself (no header, no status
           pill, no collapsible body).
         - Non-image artifacts (CSV exports, JSON dumps, etc.) —
           these previously lived inside the tool card body and have
           no equivalent inline mount point. The LLM's prose
           usually names the file and purpose, which is enough.
         - renderToolTextOutput's stdout — same reasoning: the
           LLM has already quoted the relevant numbers / errors in
           its reply. Re-rendering the full transcript is noise.

         The original toolCalls array on the message is untouched
         (restoredToolCalls is still pushed onto state.messages),
         so a future code path that wants the chrome back has
         everything it needs. */
      if(restoredToolCalls.length && m.role==="assistant"){
        for(var tci=0;tci<restoredToolCalls.length;tci++){
          var rtc=restoredToolCalls[tci];
          /* render_visualization: mount directly into the body so
             the chart reappears. The tool's own mountVisualization
             writes into the supplied host (body), NOT into a tool
             card, so the viz card is independent of the chrome. */
          if(rtc.name === "render_visualization" && rtc.input && rtc.input.version === 1 && typeof window.mountVisualization === "function"){
            try { window.mountVisualization(rtc.input,body,{toolCallId:rtc.id}); } catch(_) {}
          }
          /* code_interpreter (and any tool with image artifacts):
             render images inline in the message body. Non-image
             artifacts (CSV / JSON) are skipped — they previously
             lived inside the .agent-tool-card body that we no
             longer render. */
          if(Array.isArray(rtc.artifacts) && rtc.artifacts.length){
            for(var ai=0;ai<rtc.artifacts.length;ai++){
              var art=rtc.artifacts[ai];
              if(art && art.id && art.mimeType && art.mimeType.indexOf("image/")===0){
                try { appendInlineArtifact(art.id, art.mimeType, body, art.name); } catch(_) {}
              }
            }
          }
        }
      }
      msgList.appendChild(div);
    });
    /* P_viz-resume — after the loop rebuilds every assistant bubble,
       wire up viz cards + action buttons. addMessage() does this per
       message via its tail call, but the legacy session-reload path
       mounts all bubbles synchronously and never went through
       addMessage, so viz cards in restored sessions never got their
       load listeners / data-action bindings. Run the post-process
       pass once after the loop to cover everything. */
    try{processPendingMermaid()}catch(_){}
    try{processPendingViz()}catch(_){}
    try{processPendingVizActions()}catch(_){}
    try{
      var _bodies=msgList.querySelectorAll(".msg-body");
      for(var _bi=0;_bi<_bodies.length;_bi++){
        wireCodeBlockHeaders(_bodies[_bi]);
        wireMsgBodyImages(_bodies[_bi]);
      }
    }catch(_){}
    /* P_recover-local-fallback — if the server response is missing
       the last assistant message (because the user refreshed before
       saveCurrentSession()'s async POST completed), try to recover it
       from the localStorage mirror that appendLocalMemory writes
       synchronously in finishAfterRender().

       Count server messages vs localStorage messages; if localStorage
       has more, the extras are unpersisted and we add them. */
    try{
      var localRec=loadLocalMemory(s.id);
      if(localRec&&Array.isArray(localRec.messages)&&localRec.messages.length>(s.messages||[]).length){
        var serverCount=(s.messages||[]).length;
        var extras=localRec.messages.slice(serverCount);
        for(var ei=0;ei<extras.length;ei++){
          var em=extras[ei];
          if(!em||!em.content)continue;
          /* Only recover assistant messages (user messages are always
             persisted immediately via addMessage → saveCurrentSession). */
          if(em.role!=="assistant")continue;
          var extraDiv=document.createElement("div");
          extraDiv.className="msg assistant";
          var extraBody=document.createElement("div");
          extraBody.className="msg-body";
          var extraHtml;
          try{extraHtml=renderAssistantHTML(em.content)}catch(_){extraHtml=formatMsg(em.content)}
          extraBody.innerHTML=extraHtml;
          extraDiv.appendChild(extraBody);
          msgList.appendChild(extraDiv);
          state.messages.push({
            clientId:"local-recovered-"+generateId(),
            role:"assistant",
            rawText:em.content,
            html:extraHtml,
            type:"assistant",
            reasoningContent:null,
            attachments:[],
            toolCalls:[],
            actions:null,
          });
        }
      }
    }catch(_){}
    /* P_streaming-survival — if the server has saved streaming_text
        (the previous stream was interrupted before completion), render
        it as a partial assistant message with a Retry button so the
        user can resume the interrupted response. */
    if(s.streamingText){
      var partialMsg=document.createElement("div");
      partialMsg.className="msg assistant";
      var partialBody=document.createElement("div");
      partialBody.className="msg-body content";
      var partialText=s.streamingText||"(partial content)";
      var partialRendered=s.streamingText;
      /* Try to render the partial text so it looks as good as possible. */
      try{partialRendered=formatMsg(partialText)}catch(_){partialRendered="<p>"+esc(partialText)+"</p>"}
      partialBody.innerHTML='<div class="msg-content">'+partialRendered+'</div>'+
        '<div class="msg-error" style="margin-top:8px">'+
          '<span class="msg-error-text">(response interrupted — tap Retry to continue)</span>'+
          '<button type="button" class="msg-retry-btn stream-retry-btn">Retry</button>'+
        '</div>';
      partialMsg.appendChild(partialBody);
      msgList.appendChild(partialMsg);
      /* Also push into state.messages so it participates in
         extractHistory(). The type is "assistant" so doSave()
         persists it. The user can delete it manually. */
      var partialIdx2=state.messages.push({
        role:"assistant",
        clientId:"stream-recovered-"+Date.now(),
        rawText:partialText,
        html:partialBody.innerHTML,
        type:"assistant",
      })-1;
      /* Wire the retry button */
      var retryBtn=partialBody.querySelector('.stream-retry-btn');
      if(retryBtn){
        retryBtn.addEventListener("click",function(){
          /* Remove this partial message from state so it doesn't
             appear in the next history extract. */
          if(partialIdx2>=0&&state.messages[partialIdx2]){
            state.messages.splice(partialIdx2,1);
          }
          /* Also clear the server's streaming_text tombstone. */
          apiFetch("/api/sessions/"+encodeURIComponent(s.id),{
            method:"PATCH",
            body:{streamingText:null,streamingReasoning:null},
            timeoutMs:5000,
          }).catch(function(){});
          /* Scroll away this partial bubble visually. */
          partialMsg.remove();
          /* Call askChatTurn with the last user message. */
          var lastUserMsg=null;
          for(var ui=state.messages.length-1;ui>=0;ui--){
            if(state.messages[ui]&&state.messages[ui].role==="user"){
              lastUserMsg=state.messages[ui].rawText||state.messages[ui].content;
              break;
            }
          }
          if(lastUserMsg&&typeof window.askChatTurn==="function"){
            window.askChatTurn(lastUserMsg);
          }else{
            showToast("No previous user message to retry.");
          }
        });
      }
      /* Also clear the server-side streaming_text so a second reload
         doesn't show the same partial content again. */
      apiFetch("/api/sessions/"+encodeURIComponent(s.id),{
        method:"PATCH",
        body:{streamingText:null,streamingReasoning:null},
        timeoutMs:5000,
      }).catch(function(){});
    }
    /* P_context-race — currentSessionId and URL are set HERE, AFTER
       state.messages has been fully rebuilt. Setting them earlier
       (before the forEach rebuild loop) left a window where
       state.session.currentSessionId pointed to the new session but
       state.messages still held old data — any saveCurrentSession()
       firing in that window would cross-contaminate contexts. */
    setCurrentSessionId(s.id);
    pushChatIdToURL(s.id);
    /* Mirror the server history into the localStorage cache so the
       next chat turn can read it via extractHistory() (fast path) instead
       of falling back to the slower DOM scrape. Skip if the local cache
       already has something (don't clobber a fresher copy). */
    if(!loadLocalMemory(s.id)){
      try{
        var rec={topic:s.topic||"",ts:Date.now(),messages:[]};
        (s.messages||[]).forEach(function(m){
          // Prefer rawText (the source markdown) over html (a rendered
          // snapshot) so the LLM context gets clean content without
          // embedded HTML tags.
          var txt="";
          if(m.rawText){
            txt=m.rawText;
          }else if(m.html){
            var body=document.createElement("div");
            body.innerHTML=m.html;
            txt=(body.innerText||body.textContent||"").trim();
          }
          txt=txt.replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
          if(!txt)return;
          rec.messages.push({role:m.role,content:txt});
        });
        if(rec.messages.length)batchSetItem(_memKey(s.id),JSON.stringify(rec));
      }catch(e){/* mirror failed */}
    }
    updateKB();
    updateChatStats();
    renderRecents();
    renderMistakes();
    updateMistakesBadge();
    /* P_node-sync — rebuild the teaching plan from the restored kbNodes
       so the sorted order matches the current node states. The saved
       plan snapshot may be stale (e.g., nodes were internalized after
       the plan was last saved). Then sync currentNode with the plan's
       first non-internalized sub-topic, matching proceedToTeaching. */
    if(appMode!=="chat"&&state.kbNodes&&state.kbNodes.length){
      state.teachingPlan=buildTeachingPlanFromKB(state);
      syncCurrentNodeFromTeachingPlan(state);
    }
    var sc=scrollContainer();
    sc.scrollTop=sc.scrollHeight;
  }catch(e){
    /* P_stale-loadSession — if a newer loadSession was requested
       while this one was in-flight, the error (if any) belongs to
       the stale request; don't disrupt the newer session's state. */
    if(_loadSessionId!==id) return;
    
    /* Distinguish session-not-found (404) from transient errors
       (429 rate limit, 5xx server error, network failure) so we
       don't show "Link expired" and blow away the UI on every hiccup.
       For transient errors, just show a toast and keep the current
       view intact — the user can try again later. */
    var errStatus = (e && typeof e.status === 'number') ? e.status : 0;
    var isNotFound = (errStatus === 404);
    
    if (!isNotFound) {
      /* Transient error — don't destroy the current session UI.
         Silently log and return so the user stays where they are. */
      console.warn('[loadSession] transient error loading session', id, 'status=' + errStatus, e && e.message);
      showToast('Failed to load session: ' + (e && e.message || 'temporary error') + '. Please try again.');
      return;
    }
    
    showToast("Session not found or could not be loaded.");
    /* The URL had ?chat=<id> pointing to a session that doesn't exist
       on the server (404). This happens when the user bookmarks a
       chat link on one device, then opens it on another device where
       the session never synced; or after a long absence, server-side
       pruning, or DB reset. Either way, the URL is now stale and
       confusing the user — clear it and let them start a new topic
       rather than showing a blank chat panel.
       
        P_loadSession-404 — also clean up when the failing session
        matches the URL even if another session is already loaded,
        so clicking a stale/deleted entry in Recents gives visual
        feedback instead of silently doing nothing.

        P_404-splice-guard — only splice when `id` is a well-formed
        UUID. A 404 can ALSO be returned by GET /api/sessions/:id when
        the id is NOT a UUID (the server's uuid guard rejects the
        format before even hitting the DB). That happens whenever the
        client's cached `s.id` drifted from the server's canonical id
        (e.g. an older session saved with a non-UUID client id, or a
        generateId() fallback that wasn't a UUID). In that case the
        session is STILL valid server-side under a different id — it is
        NOT "deleted", so removing it from SERVER_SESSIONS would make a
        real history entry vanish from Recents the moment the user
        clicks it ("点开历史会话就从列表消失"). For malformed ids we skip
        the splice and re-sync from the server instead, which corrects
        the stale cache. */
    var _idIsUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||"");
    try{
      if(_idIsUuid){
        for(var si=0; si<SERVER_SESSIONS.length; si++){
          if(SERVER_SESSIONS[si].id===id){
            SERVER_SESSIONS.splice(si,1);
            break;
          }
        }
      }
    }catch(_){}
    /* Re-sync the cache from the server so the Recents list reflects
       the authoritative state (drops genuinely-gone rows, restores
       any id-mismatched rows under their real ids). Fire-and-forget;
       failure is harmless — the list simply keeps its current shape. */
    try{refreshServerSessions().then(function(){renderRecents()}).catch(function(){})}catch(_){}
    var isUrlMatch=typeof location!=="undefined"&&location.search.indexOf("chat="+encodeURIComponent(id))>=0;
    if(state.currentSessionId===id||!state.currentSessionId||isUrlMatch){
      /* Only if no other session was loaded in the meantime. */
      try{
        if(/[?&]chat=/i.test(location.search)){
          var u=new URL(location.href);
          u.searchParams.delete("chat");
          history.replaceState(history.state,"",u.pathname+(u.search?u.search.replace(/^\?/,"?"):"")+u.hash);
        }
      }catch(_){}
      try{
        var list=document.getElementById("msgList");
        if(list)list.innerHTML="";
        state.currentSessionId=null;
        state.topic="";
        state.kbNodes=[];
        state.phase="topic";
        document.getElementById("chatView").classList.add("hidden");
        toggleChatTopBarEls(false);
        document.getElementById("topicSetup").classList.remove("hidden");
        if (typeof window.hideMainPages === "function") window.hideMainPages();
        /* Friendly notice so the user knows what just happened. */
        try{
          var pill=document.getElementById("searchPill");
          if(pill){
            pill.textContent=t("share.linkExpired");
            pill.classList.remove("hidden");
          }
        }catch(_){}
      }catch(_){}
    }
  } finally {
    _loadingSession = false;
  }
}

/* ============================================================
   CLIENT-SIDE CONVERSATION MEMORY
   K 区段(LOCAL_MEMORY_MAX / _memKey / loadLocalMemory /
   appendLocalMemory / clearLocalMemory) 已抽到 src/storage/localMemory.js,
   顶部 import。
   ============================================================ */

/* P4.1 — two-step delete to prevent accidental loss of a session.
   The user must press-and-hold the delete button for 600ms (mouse
   / touch), OR press Enter / Space when focused, before the
   inline confirmation bar appears. The bar is rendered inline
   within the recent-item row, so the user can read the session
   title they're about to delete. */
var _deleteConfirmTimers={};   /* clientId → setTimeout handle */
var _deleteConfirmStates={};   /* clientId → true while showing */

function startDeleteConfirm(clientId,evOrBtn){
  if(_deleteConfirmStates[clientId])return;
  if(evOrBtn&&evOrBtn.stopPropagation)evOrBtn.stopPropagation();
  /* Support both direct call (from legacy deleteSession) and event call. */
  var btnEl=evOrBtn&&evOrBtn.currentTarget?evOrBtn.currentTarget:evOrBtn;
  if(btnEl&&btnEl.classList)btnEl.classList.add("holding");
  showDeleteConfirm(clientId);
}
function clearDeleteConfirmTimer(clientId){
  if(_deleteConfirmTimers[clientId]){
    clearTimeout(_deleteConfirmTimers[clientId]);
    delete _deleteConfirmTimers[clientId];
  }
}
function cancelDeleteConfirm(clientId){
  clearDeleteConfirmTimer(clientId);
  var row=document.querySelector('[data-recent-id="'+clientId+'"]');
  if(!row)return;
  var bar=row.querySelector(".recent-item-confirm");
  if(bar)bar.remove();
  var btn=row.querySelector(".recent-item-del");
  if(btn){btn.classList.remove("holding");btn.style.display=""}
  _deleteConfirmStates[clientId]=false;
}
function showDeleteConfirm(clientId){
  _deleteConfirmStates[clientId]=true;
  clearDeleteConfirmTimer(clientId);
  var row=document.querySelector('[data-recent-id="'+clientId+'"]');
  if(!row){_deleteConfirmStates[clientId]=false;return}
  var btn=row.querySelector(".recent-item-del");
  if(btn){btn.style.display="none"}
  var bar=document.createElement("div");
  bar.className="recent-item-confirm";
  bar.innerHTML=
    '<span class="recent-item-confirm-text">Delete this session?</span>'+
    '<button class="recent-item-confirm-cancel" type="button">Cancel</button>'+
    '<button class="recent-item-confirm-delete" type="button">Delete</button>';
  row.appendChild(bar);
  bar.querySelector(".recent-item-confirm-cancel").onclick=function(ev){
    ev.stopPropagation();
    cancelDeleteConfirm(clientId);
  };
  bar.querySelector(".recent-item-confirm-delete").onclick=function(ev){
    ev.stopPropagation();
    /* Extract the original session id (the data-recent-id is the
       safe version; the actual id is in the data-recent-actual
       attribute we set in renderRecents). */
    var id=row.getAttribute("data-recent-actual")||clientId;
    actuallyDeleteSession(id);
  };
  /* Auto-dismiss after 5s of no decision, to avoid a stuck
     confirm bar if the user walks away. */
  setTimeout(function(){
    if(_deleteConfirmStates[clientId])cancelDeleteConfirm(clientId)}
  ,5000);
}
/* P2.2 — open the inline tag editor popover anchored to a
   session row. The popover accepts comma / Enter separated
   tags and persists via PATCH. */
function openTagEditor(id,e){
  if(e){e.stopPropagation();e.preventDefault()}
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  /* Reuse a singleton popover; positioning is recomputed each
     time so the popover lands next to the row the user clicked. */
  var pop=document.getElementById("tagEditorPopover");
  if(!pop){
    pop=document.createElement("div");
    pop.id="tagEditorPopover";
    pop.className="tag-editor-popover";
    document.body.appendChild(pop);
  }
  pop.dataset.sessionId=id;
  var known=getKnownTags().filter(function(t){return!(s.tags||[]).indexOf(t)>=0});
  pop.innerHTML=
    '<div class="tag-editor-head">Tags for this session</div>'+
    '<div class="tag-editor-current">'+
      ((s.tags||[]).map(function(t){
        return '<span class="tag-pill removable" data-tag="'+esc(t)+'">'+esc(t)+
          '<button class="tag-pill-x" data-tag-remove="'+esc(t)+'" title="Remove">×</button>'+
        '</span>';
      }).join("")||'<span class="tag-editor-empty">No tags yet</span>')+
    '</div>'+
    '<div class="tag-editor-input-row">'+
      '<input class="tag-editor-input" id="tagEditorInput" placeholder="'+t("tag.placeholder")+'" maxlength="30" autocomplete="off">'+
      '<button class="tag-editor-add" id="tagEditorAdd">Add</button>'+
    '</div>'+
    (known.length?'<div class="tag-editor-suggest"><div class="tag-editor-suggest-label">Suggested</div>'+
      known.slice(0,12).map(function(t){
        return '<button class="tag-editor-suggest-btn" data-tag-suggest="'+esc(t)+'">'+esc(t)+'</button>';
      }).join("")+
    '</div>':'')+
    '<div class="tag-editor-foot">'+
      '<button class="tag-editor-done" onclick="closeTagEditor()">Done</button>'+
    '</div>';
  /* Position. */
  var row=(e&&e.currentTarget&&e.currentTarget.closest(".recent-item"))||null;
  if(row){
    var r=row.getBoundingClientRect();
    pop.style.top=Math.min(window.innerHeight-300,r.bottom+6)+"px";
    pop.style.left=Math.max(8,Math.min(window.innerWidth-340,r.right-340))+"px";
  }else{
    pop.style.top="20vh";
    pop.style.left="50%";
    pop.style.transform="translateX(-50%)";
  }
  pop.classList.add("visible");
  /* Wire up handlers. */
  var input=pop.querySelector("#tagEditorInput");
  var addBtn=pop.querySelector("#tagEditorAdd");
  function commitInput(){
    var v=(input.value||"").trim();
    if(!v)return;
    /* Accept comma-separated multi-add. */
    v.split(/[,,]/).forEach(function(part){
      var t=part.trim().slice(0,30);
      if(t)addTagToSession(id,t);
    });
    input.value="";
  }
  input.onkeydown=function(ev){
    if(ev.key==="Enter"){ev.preventDefault();commitInput()}
    else if(ev.key==="Escape"){ev.preventDefault();closeTagEditor()}
  };
  addBtn.onclick=commitInput;
  pop.querySelectorAll("[data-tag-remove]").forEach(function(b){
    b.onclick=function(){
      removeTagFromSession(id,b.getAttribute("data-tag-remove"));
    };
  });
  pop.querySelectorAll("[data-tag-suggest]").forEach(function(b){
    b.onclick=function(){
      addTagToSession(id,b.getAttribute("data-tag-suggest"));
    };
  });
  /* Click-outside dismiss. */
  setTimeout(function(){
    if(!document.body._tagEditorClickBound){
      document.body._tagEditorClickBound=true;
      document.addEventListener("click",function(ev){
        var p=document.getElementById("tagEditorPopover");
        if(p&&p.classList.contains("visible")&&!p.contains(ev.target)&&!ev.target.closest("[data-tag-open]")){
          closeTagEditor();
        }
      });
    }
  },0);
  setTimeout(function(){input.focus()},0);
}
function closeTagEditor(){
  var pop=document.getElementById("tagEditorPopover");
  if(pop)pop.classList.remove("visible");
}
function addTagToSession(id,tag){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  s.tags=Array.isArray(s.tags)?s.tags.slice():[];
  if(s.tags.indexOf(tag)>=0)return;
  if(s.tags.length>=12){
    showToast("Maximum 12 tags per session");
    return;
  }
  s.tags.push(tag);
  apiFetch("/api/sessions/"+encodeURIComponent(id)+"/tags",{
    method:"PUT",
    body:{tags:s.tags},
    timeoutMs:8000
  }).catch(function(err){
    console.debug("[tags] server sync failed:",err&&err.message);
  });
  renderRecents();
  /* Re-open the popover with the updated state. */
  openTagEditor(id,{stopPropagation:function(){},preventDefault:function(){},currentTarget:document.querySelector('.recent-item[data-recent-actual="'+id+'"] .tag-btn')});
}
function removeTagFromSession(id,tag){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  s.tags=(s.tags||[]).filter(function(t){return t!==tag});
  apiFetch("/api/sessions/"+encodeURIComponent(id)+"/tags",{
    method:"PUT",
    body:{tags:s.tags},
    timeoutMs:8000
  }).catch(function(err){
    /* tags sync failed */
  });
  renderRecents();
  openTagEditor(id,{stopPropagation:function(){},preventDefault:function(){},currentTarget:document.querySelector('.recent-item[data-recent-actual="'+id+'"] .tag-btn')});
}
function findServerSessionIndex(id){
  for(var i=0;i<SERVER_SESSIONS.length;i++){
    if(SERVER_SESSIONS[i].id===id)return i;
  }
  return -1;
}

async function actuallyDeleteSession(id,ev){
  if(!CURRENT_USER)return;
  /* Helper declared first so the click-log below can read it. */
  function inFlightId(){try{return _saveInFlight?"in-flight":null}catch(e){return null}}
  /* P_delete-stale-click — the trash button lives inside
     `.recent-item` which has onclick="loadSession(...)". Without
     stopping propagation here, clicking delete would ALSO trigger
     loadSession(deletedId): state.currentSessionId would flip to the
     about-to-be-deleted id, the chat panel would re-render its
     messages, and the user would see "the deleted session's records"
     (verbatim bug report) until the async GET returned 404 and the
     cleanup branch fired. */
  if(ev&&ev.stopPropagation)ev.stopPropagation();
  if(ev&&ev.preventDefault)ev.preventDefault();
  /* P_serialize-delete — await any in-flight save before sending
     the DELETE. Without this, a concurrent saveCurrentSession()
     POST could land on the server AFTER the DELETE has committed,
     and the upsert would silently re-insert the deleted row —
     the session "comes back to life". Drain the pipeline first
     (including the _saveDirty cascade), then register the tombstone
     so no subsequent save can race with the delete. */
  if(_saveInFlight){
    try{await _saveInFlight}catch(_){}
  }
  /* P_delete-stale — bounce the user out of the chat view if the
     deleted session is EITHER (a) the one currently on screen
     (state.session.currentSessionId) OR (b) referenced by the
     top-level state.currentSessionId mirror. Without checking
     both, a session whose currentSessionId drifted onto the
     top-level mirror (the duplicate-session bug we fixed) would
     get deleted but the chat view would keep rendering its
     messages because the bounce never fired. Also cancel any
     in-flight chat stream so a half-written reply doesn't
     resurface after the delete. */
  
  var wasActive=state.session.currentSessionId===id||state.currentSessionId===id;
  if(wasActive){
    if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
    if(window._activeChatAbort){try{window._activeChatAbort("session-deleted")}catch(_){}}
    bounceOutOfArchivedSession();
  }
  /* Drop the session from the local cache immediately so the UI
     updates without waiting for the round-trip. If the server
     call fails, the catch handler re-fetches and re-renders. */
  SERVER_SESSIONS=SERVER_SESSIONS.filter(function(s){return s.id!==id;});
  clearLocalMemory(id);
  renderRecents();
  /* P_delete-resurrect — register this id with the doSave()
     tombstone set BEFORE the network round-trip. Any POST that
     arrives during the flight window, or any post-flight
     `_saveDirty` cascade triggered by a streaming callback, will
     see the tombstone and bail instead of re-inserting the row.
     We register both the canonical id and any alias we may have
     had for it (defence against the duplicate-session drift that
     made state.session.currentSessionId / state.currentSessionId
     disagree in past incidents). */
  rememberDeletedSession(id);
  /* Single-step: server's DELETE /api/sessions/:id now deletes
     directly without requiring archive first. */
  apiFetch("/api/sessions/"+encodeURIComponent(id),{
    method:"DELETE",
    timeoutMs:8000
  }).then(function(){
    showToast("Session deleted");
    /* P_delete-stale — if no sessions remain, make sure the
       chat view is hidden and the topic-setup is showing so the
       user lands on a clean "start a new conversation" surface
       instead of a blank / stale chat panel. */
    refreshServerSessions().then(function(){
      /* P_delete-resurrect — the server has now confirmed the
         row is gone. From this point on, a streaming-callback
         POST that happens to carry this same id is no longer
         a "resurrection" risk (the row is genuinely deleted),
         and the very next saveCurrentSession() that creates a
         NEW session with a coincidentally-equivalent id would
         be falsely blocked. Lift the tombstone. */
      forgetDeletedSession(id);
      var remaining=getRecents().length;
      if(remaining===0){
        bounceOutOfArchivedSession();
      }else if(wasActive){
        renderRecents();
      }
    });
  }).catch(function(err){
    /* delete sync failed */
    try{showToast("Delete failed: "+(err&&err.message||"server error")+" - refreshing.",4000)}catch(_){}
    /* P_delete-resurrect — keep the tombstone on failure. The
       local mirror no longer has the row (we filtered it at
       t≈0) and the server claim is "404 / error", so any
       pending POST is at best a useless retry and at worst a
       resurrection. Lift it only after a refresh confirms the
       server really is consistent. */
    refreshServerSessions().then(function(){
      var idx=findServerSessionIndex(id);
      if(idx<0)forgetDeletedSession(id);
    });
  });
}

/* P2.3 — record the archive timestamp locally. The local copy
   is the source of truth for the UI (filtered out of
   Recents, surfaced in the Storage modal). The server mirrors
   it via the POST /api/sessions/<id>/archive call in
   actuallyDeleteSession. */
function archiveSessionLocal(id,when){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  SERVER_SESSIONS[idx].archivedAt=when||Date.now();
}
function restoreSession(id){
  if(!CURRENT_USER)return;
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  SERVER_SESSIONS[idx].archivedAt=null;
  apiFetch("/api/sessions/"+encodeURIComponent(id)+"/archive",{
    method:"DELETE",
    timeoutMs:8000
  }).catch(function(err){
    /* archive sync failed */
  });
  renderRecents();
}
/* P2.3 — permanent erase. Two-step: only available from the
   Storage modal (not the long-press delete), and requires
   typing the session title. Mirrors the backend's "must be
   archived first" constraint documented in
   docs/api/openapi.yaml P2.3 (409 on active session). */
function confirmPurgeSession(id){
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  if(!s.archivedAt){
    showToast("Archive the session first (long-press → Delete).");
    return;
  }
  showConfirm(
    "Delete this session forever?",
    "This permanently erases \""+(s.title||s.topic||"this session")+"\". "+
    "Messages, knowledge graph, and mistake book entries are gone. "+
    "This cannot be undone.",
    true
  ).then(function(yes){
    if(!yes)return;
    apiFetch("/api/sessions/"+encodeURIComponent(id),{
      method:"DELETE",
      timeoutMs:8000
    }).then(function(){
      /* P_purge-bounce — if the purged session is the active one,
         bounce out to the topic-setup screen so stale content isn't
         shown. without this, the chat view continues displaying the
         deleted session's messages, topic badge, and knowledge
         graph until the user manually navigates away. */
      var wasActive=state.session.currentSessionId===id||state.currentSessionId===id;
      if(wasActive){
        if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
        if(window._activeChatAbort){try{window._activeChatAbort("session-purged")}catch(_){}}
        bounceOutOfArchivedSession();
      }
      SERVER_SESSIONS=SERVER_SESSIONS.filter(function(r){return r.id!==id});
      clearLocalMemory(id);
      renderArchivedList();
      renderRecents();
      showToast("Session deleted");
    }).catch(function(err){
      showToast("Delete failed: "+(err&&err.message||"server error"));
    });
  });
}

/* P2.3 — return a list of archived sessions, sorted newest
   first, with entries older than 30 days filtered out (the
   server is expected to GC them too, but we mirror the
   policy client-side so the Storage modal doesn't show
   ghost rows). */
function getArchivedSessions(){
  return getArchivedSessionsFrom(SERVER_SESSIONS);
}
/* P2.3 — the localStorage mirror is swept the same way the
   server is expected to. Called from refreshServerSessions
   and on every read of getArchivedSessions. */
function sweepExpiredArchives(){
  var result=sweepExpiredArchivesFrom(SERVER_SESSIONS);
  SERVER_SESSIONS=result.sessions;
  return result.changed;
}

/* P2.3 — bounce the user out of an archived session. Used by
   actuallyDeleteSession when the active session is the one
   being archived; the chat view collapses back to the topic
   screen. */
function bounceOutOfArchivedSession(){
  window._shareToken=null;
  resetState();
  toggleShareBtn();
  setChatIdInURL(null);
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  if (typeof window.hideMainPages === "function") window.hideMainPages();
  toggleChatTopBarEls(false);
  document.getElementById("msgList").innerHTML="";
  document.getElementById("topicInput").value="";
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">'+(typeof t==="function"?t("tutor.kbTopicFirst"):"Set a topic to build your knowledge map.")+'</div>';
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc=document.getElementById("teachingPlanContent");if(_tpc)_tpc.innerHTML="";
  document.getElementById("chatStats").textContent="";
  var badge=document.getElementById("chatApiBadge");
  if(badge){badge.textContent="";badge.classList.remove("on");badge.title="";}
  updateStartBtn();
}

/* Backwards-compatible alias — now deletes immediately. */
function deleteSession(id,e){
  if(e){e.stopPropagation();e.preventDefault()}
  if(!CURRENT_USER)return;
  /* Find the row in the DOM and get the actual session ID. */
  var row=(e&&e.currentTarget&&e.currentTarget.closest(".recent-item"))||null;
  var actualId=row?row.getAttribute("data-recent-actual"):id;
  actuallyDeleteSession(actualId);
}

/* ─── Session context menu (long-press / right-click) ───
   Delete, pin/unpin, and custom label via a floating popover.
   Uses touch timer for mobile, contextmenu for desktop. */

/* When non-null, the context menu is open for this session id.
   While set, click events on the corresponding .recent-item are
   blocked via pointer-events:none on the row element, preventing
   the synthetic click from navigating. */
var _ctxMenuSessionId = null;

function attachLongPress(el){
  if(!el||el.dataset._lpAttached)return;
  el.dataset._lpAttached="1";
  var sid=el.getAttribute("data-recent-actual");
  if(!sid)return;
  var timer=null;

  function touchStart(ev){
    if(ev.target.closest("button"))return;
    if(timer)return;
    timer=setTimeout(function(){
      timer=null;
      openSessionContextMenu(sid,el);
    },600);
  }
  function touchEnd(){
    if(timer){clearTimeout(timer);timer=null}
  }
  function touchMove(){
    if(timer){clearTimeout(timer);timer=null}
  }

  el.addEventListener("touchstart",touchStart,{passive:true});
  el.addEventListener("touchend",touchEnd,{passive:true});
  el.addEventListener("touchmove",touchMove,{passive:true});

  el.addEventListener("contextmenu",function(ev){
    if(ev.target.closest("button"))return;
    ev.preventDefault();
    openSessionContextMenu(sid,el);
  });
}

/* Delegated click handler on #recentsList for navigation.
   Replaces the previous inline onclick="loadSession()" on each
   .recent-item. While the context menu is open, all .recent-item
   have pointer-events:none (via #sidebar.ctx-menu-block), so
   synthetic clicks from mobile long-press never reach here.
   Setup is called from doRenderRecents (DOM is definitely ready). */
var _recentsListDelegated = false;
function setupRecentsListDelegated(){
  if(_recentsListDelegated)return;
  var listEl=document.getElementById("recentsList");
  if(!listEl)return;
  _recentsListDelegated=true;
  listEl.addEventListener("click",function(ev){
    if(ev.target.closest("button"))return;
    var row=ev.target.closest(".recent-item");
    if(!row)return;
    var sid=row.getAttribute("data-recent-actual");
    if(sid)loadSession(sid);
  });
}

/* Open the context menu popover anchored near the clicked row. */
function openSessionContextMenu(id,rowEl){
  /* Close any existing menu first. */
  closeSessionContextMenu();
  /* Block all recent-item pointer events via a CSS class on #sidebar.
     This physically prevents the synthetic click (from mobile
     long-press) from reaching any .recent-item, at the browser
     compositor level — before any JS runs. */
  var sb=document.getElementById("sidebar");
  if(sb)sb.classList.add("ctx-menu-block");
  _ctxMenuSessionId=id;
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  if(!s)return;

  var pop=document.createElement("div");
  pop.id="sessionContextMenu";
  pop.className="session-context-menu";
  pop.dataset.sessionId=id;

  var label=getSessionLabel(id);
  var isPinned=!!s.pinned;

  pop.innerHTML=
    '<div class="session-context-head">'+
      '<div class="session-context-title">'+esc(s.title||s.topic||"(untitled)")+'</div>'+
    '</div>'+
    '<div class="session-context-body">'+
      /* Pin / Unpin */
      '<button class="session-context-btn" data-action="pin">'+
        '<span class="session-context-icon">'+(isPinned?unpinSvg():pinSvg())+'</span>'+
        '<span>'+(isPinned?"Unpin":"Pin to top")+'</span>'+
      '</button>'+
      /* Custom label */
      '<div class="session-context-label-row">'+
        '<div class="session-context-label-input-wrap">'+
          '<span class="session-context-icon">'+labelSvg()+'</span>'+
          '<input class="session-context-label-input" id="sessionCtxLabelInput" type="text" placeholder="Custom label…" maxlength="30" value="'+esc(label)+'">'+
        '</div>'+
        '<button class="session-context-label-set" id="sessionCtxLabelSet">Set</button>'+
      '</div>'+
      /* Move to project */
      '<div class="session-context-move-to-project">'+
        '<div class="session-context-move-header">Move to project</div>'+
        '<div class="session-context-project-list" id="sessionCtxProjectList"></div>'+
      '</div>'+
      /* Delete */
      '<button class="session-context-btn session-context-btn-danger" data-action="delete">'+
        '<span class="session-context-icon">'+deleteSvg()+'</span>'+
        '<span>Delete session</span>'+
      '</button>'+
    '</div>';

  document.body.appendChild(pop);

  /* Position near the row. The element is in the DOM but hidden
     (CSS display:none), so getBoundingClientRect works. */
  var r=rowEl.getBoundingClientRect();
  var popW=260;
  var left=r.left+window.scrollX;
  var top=r.bottom+window.scrollY+4;
  /* Keep within viewport. */
  if(left+popW>window.innerWidth-8)left=window.innerWidth-popW-8;
  if(left<8)left=8;
  pop.style.left=left+"px";
  pop.style.top=top+"px";
  /* Make visible synchronously so click events occurring in the same
     event-loop iteration (e.g. synthetic clicks after long-press on
     mobile) see the menu and are suppressed. */
  pop.classList.add("visible");

  /* Wire handlers. */
  pop.querySelector("[data-action='pin']").onclick=function(ev){
    ev.stopPropagation();
    togglePinSession(id);
    closeSessionContextMenu();
  };
  pop.querySelector("[data-action='delete']").onclick=function(ev){
    ev.stopPropagation();
    closeSessionContextMenu();
    actuallyDeleteSession(id);
  };
  var input=pop.querySelector("#sessionCtxLabelInput");
  var setBtn=pop.querySelector("#sessionCtxLabelSet");
  function commitLabel(){
    var v=(input.value||"").trim().slice(0,30);
    setSessionLabel(id,v||"");
    closeSessionContextMenu();
  }
  setBtn.onclick=commitLabel;
  input.onkeydown=function(ev){
    if(ev.key==="Enter"){ev.preventDefault();commitLabel()}
    else if(ev.key==="Escape"){ev.preventDefault();closeSessionContextMenu()}
  };
  /* Populate the "Move to project" list. */
  populateProjectList(id);
  /* Focus the label input after a short delay. */
  setTimeout(function(){input.focus();input.select()},100);
}

function closeSessionContextMenu(){
  _ctxMenuSessionId=null;
  var sb=document.getElementById("sidebar");
  if(sb)sb.classList.remove("ctx-menu-block");
  var pop=document.getElementById("sessionContextMenu");
  if(pop){pop.classList.remove("visible");setTimeout(function(){if(pop&&pop.parentNode)pop.parentNode.removeChild(pop)},200)}
}

/* Populate the "Move to project" sub-list in the session context menu. */
function populateProjectList(sessionId){
  var list = document.getElementById("sessionCtxProjectList");
  if(!list) return;
  var projects = window.__projectsCache || [];
  if(!projects.length){
    /* Fetch projects first. */
    if(typeof apiFetch === "function"){
      apiFetch("/api/projects").then(function(r){
        window.__projectsCache = (r && r.projects) || [];
        renderProjectListItems(list, sessionId);
      }).catch(function(){});
    }
    list.innerHTML = '<div class="session-context-project-item">Loading projects...</div>';
    return;
  }
  renderProjectListItems(list, sessionId);
}
function renderProjectListItems(list, sessionId){
  var projects = window.__projectsCache || [];
  var currentProjectId = state ? state.currentProjectId : null;
  list.innerHTML = projects.map(function(p){
    var active = p.id === currentProjectId;
    var color = /^#[0-9a-f]{3,8}$/i.test(p.color || "") ? p.color : "hsl(var(--accent-000))";
    return '<button class="session-context-project-item' + (active ? ' active' : '') +
      '" data-project-id="' + esc(p.id) + '" onclick="moveSessionToProject(\'' + esc(sessionId) + '\',\'' + esc(p.id) + '\')">' +
      '<span class="project-swatch" style="background:' + esc(color) + '"></span>' +
      '<span>' + esc(p.name) + '</span>' +
      (active ? '<span class="session-context-project-check">✓</span>' : '') +
      '</button>';
  }).join("");
}
/* Drag-and-drop session onto a project. */
var _dragSessionId = null;
/* eslint-disable no-unused-vars */
function onSessionDragStart(event, sessionId){
  _dragSessionId = sessionId;
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", sessionId);
  /* Add a class to the dragged element. */
  event.target.classList.add("dragging");
}
function onSessionDragEnd(event){
  event.target.classList.remove("dragging");
  _dragSessionId = null;
}
/* Drop handler for project rows. This is called from the spaces panel. */
function onProjectDrop(event, projectId){
  event.preventDefault();
  event.stopPropagation();
  var sessionId = _dragSessionId || event.dataTransfer.getData("text/plain");
  if(!sessionId || !projectId) return;
  moveSessionToProject(sessionId, projectId);
}
/* eslint-enable no-unused-vars */

/* Move a session to a project. */
function moveSessionToProject(sessionId, projectId){
  var projects = window.__projectsCache || [];
  var project = projects.filter(function(p){ return p.id === projectId; })[0];
  if(!project) return;
  /* Update the session on the server. */
  if(typeof apiFetch === "function"){
    apiFetch("/api/sessions/" + encodeURIComponent(sessionId), { method: "PATCH", body: { projectId: projectId } })
      .then(function(){
        /* Update local state. */
        if(state && state.currentSessionId === sessionId){
          state.currentProjectId = projectId;
          window.__activeProject = project;
        }
        closeSessionContextMenu();
        if(typeof refreshServerSessions === "function") refreshServerSessions();
        if(typeof renderRecents === "function") renderRecents();
        if(typeof showToast === "function") showToast("Moved to " + project.name);
      })
      .catch(function(){
        if(typeof showToast === "function") showToast("Could not move session");
      });
  }
}
/* Click-outside dismiss for context menu.
   When ctx-menu-block is active (synthetic click from long-press),
   clicks inside #sidebar are ignored — they passed through the
   pointer-events:none barrier and are not intentional. */
;(function(){
  document.addEventListener("click",function(ev){
    var pop=document.getElementById("sessionContextMenu");
    if(!pop||!pop.classList.contains("visible"))return;
    if(pop.contains(ev.target))return;
    var sb=document.getElementById("sidebar");
    if(sb){
      /* If the block class is active and the click is inside the
         sidebar, it's a synthetic click from long-press — ignore. */
      if(sb.classList.contains("ctx-menu-block")&&sb.contains(ev.target))return;
    }
    closeSessionContextMenu();
  });
})();

/* Toggle the pinned state of a session via PATCH. */
async function togglePinSession(id){
  if(!id||!CURRENT_USER)return;
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  var nextPinned=!s.pinned;
  /* Optimistic update. */
  s.pinned=nextPinned;
  if(nextPinned)s.pinnedAt=Date.now();
  renderRecents();
  try{
    await apiFetch("/api/sessions/"+encodeURIComponent(id),{
      method:"PATCH",
      body:{pinned:nextPinned},
      timeoutMs:5000,
    });
  }catch(e){
    /* Revert on failure. */
    s.pinned=!nextPinned;
    if(!nextPinned)delete s.pinnedAt;
    renderRecents();
  }
}

/* Set a custom display label for a session (client-side). */
function setSessionLabel(id,label){
  if(!id)return;
  setSessionLabelStore(id,label);
  renderRecents();
}

/* SVG icons for the context menu. */
function pinSvg(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 2v10l4 4v2H8v-2l4-4V2"/><line x1="12" y1="18" x2="12" y2="22"/></svg>';
}
function unpinSvg(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 2v10l4 4v2H8v-2l4-4V2"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
}
function labelSvg(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
}
function deleteSvg(){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';
}

/* P_render-throttle — coalesce rapid renderRecents() calls into a
   single animation frame. Without this, saveCurrentSession (called
   3-5x per chat turn) triggers 3-5 full list rebuilds, causing
   visible stutter with 20+ sessions. */
var _renderRecentsPending = false;
function renderRecents(){
  if (_renderRecentsPending) return;
  _renderRecentsPending = true;
  requestAnimationFrame(function () {
    _renderRecentsPending = false;
    doRenderRecents();
  });
}
function doRenderRecents(){
  var cont=document.getElementById("recentsList");
  if(!cont)return;
  var recents=getRecents();
  /* P2.2 — apply the persistent tag filter. */
  var recentsFilter=getRecentsFilter();
  recents=filterRecentsByChip(recents,recentsFilter);
  /* Unified sidebar search — client-side title/topic match layered on
     top of the chip filters. Complements (does not replace)
     the global Cmd-K fuse search. Empty query is a no-op. */
  var searchQ=(RECENTS_SEARCH_QUERY||"").trim().toLowerCase();
  if(searchQ){
    recents=recents.filter(function(s){
      var hay=((s.title||"")+" "+(s.topic||"")).toLowerCase();
      return hay.indexOf(searchQ)!==-1;
    });
  }
  if(recents.length===0){
    /* Three distinct empty states so the user never sees a misleading
       "No recent sessions yet." when the real cause is something else:
         0) fetch failed — the user HAS sessions on the server, we just
            couldn't load them (network blip, ad blocker, 5xx, proxy).
            Show a "Couldn't load sessions" message with a Retry button.
            This is the root cause of the "Recent list empty on some
            devices" report: devices with network issues silently saw
            an empty list with no indication that their data existed.
         1) no fetch failure, but a tag filter is active
            and matched zero rows — surface the filter name and a
            one-click clear action so the user isn't left thinking
            their data is gone.
         2) no filter at all — the truly-empty state. */
    var emptyMsg;
    if(searchQ){
      emptyMsg='<div class="recents-empty">No sessions match <strong>&ldquo;'+esc(searchQ)+'&rdquo;</strong>.<br>'+
        '<a href="#" onclick="setRecentsSearch(\'\');return false">Clear search</a> to see all sessions.</div>';
    }else if(SERVER_SESSIONS_FETCH_FAILED && !recentsFilter){
      /* P_recents-fetch-fail — only show the failure state when no
         filter is active. The Retry button re-runs
         refreshServerSessions() and re-renders. */
      emptyMsg='<div class="recents-empty">Couldn\'t load sessions. Check your connection and try again.<br>'+
        '<a href="#" onclick="retryRecentsFetch();return false">Retry</a></div>';
    }else if(recentsFilter){
      var filterLabel = recentsFilter.indexOf("project:") === 0 ? "Project" : "#" + recentsFilter;
      emptyMsg='<div class="recents-empty">No sessions match the <strong>'+esc(filterLabel)+'</strong> filter.<br>'+
        '<a href="#" onclick="clearRecentsFilter();return false">Clear filter</a> to see all sessions.</div>';
    }else{
      emptyMsg='<div class="recents-empty">No recent sessions yet.<br>Start a topic to begin.</div>';
    }
    cont.innerHTML=emptyMsg;
    /* Still render the chip row so the active filter is visible
       and dismissible even when the list is empty. */
    renderRecentsFilterChips();
    return;
  }
  var html="";
  recents.forEach(function(s){
    var active=s.id===state.session.currentSessionId;
    var meta=[];
    meta.push(formatRelativeTime(s.updated_at||s.updatedAt||s.created_at||s.createdAt||Date.now()));
    if(s.total_q||s.totalQ)meta.push((s.total_q||s.totalQ)+" Qs");
    /* Resolve the displayed mode. Always reflect the SESSION's own
       persisted mode, never the global appMode — otherwise clicking a
       Chat session while the app is in Tutor mode would flip its dot to
       amber, misrepresenting the session type. Sources, in order:
         1) the session's persisted s.mode  (truthful for sessions saved
            after we added the field)
         2) the persisted s.phase === "chat" hint (older sessions that
            had no mode field but did have phase) */
    var resolvedMode=s.mode;
    if(resolvedMode!=="chat"&&resolvedMode!=="tutor"){
      if(s.phase==="chat"){resolvedMode="chat"}
    }
    /* P_exam-history — exam sessions get their own label and CSS
     * class on the recent-row badge. We check s.kind first because
     * a user-created exam session also has mode='chat' (the front-end
     * used chat-mode for the underlying row) — kind is the truth. */
    var isExam=s.kind==="exam";
    var modeLabel=isExam?"Exam":(resolvedMode==="chat"?"Chat":"Tutor");
    var modeCls=isExam?"mode-exam":(resolvedMode==="chat"?"mode-chat":"mode-tutor");
    var safeId="r-"+Math.abs((s.id||"").split("").reduce(function(a,b){a=(a<<5)-a+b.charCodeAt(0);return a&a},0));
    var sessionLabel=getSessionLabel(s.id);
    html+='<div class="recent-item'+(active?" active":"")+(s.pinned?" pinned":"")+'" data-recent-id="'+safeId+'" data-recent-actual="'+esc(s.id)+'" draggable="true" ondragstart="onSessionDragStart(event,\''+esc(s.id)+'\')" ondragend="onSessionDragEnd(event)">';
    /* P2.2 — mode-coloured dot. The visible text is hidden via CSS
       (font-size:0; overflow:hidden) so the span is just a 6 px circle;
       the title attribute provides a hover tooltip. */
    html+='<span class="recent-mode-badge '+modeCls+'" title="'+modeLabel+'">'+modeLabel+'</span>';
    html+='<div class="recent-item-main">';
    html+='<div class="recent-item-title-row">';
    /* Pin indicator for pinned sessions. */
    if(s.pinned){
      html+='<span class="recent-item-pin-icon" title="Pinned">'+
        '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 2v10l4 4v2H8v-2l4-4V2"/></svg></span>';
    }
    html+='<div class="recent-item-text">'+esc(s.title||s.topic||"(untitled)")+'</div>';
    /* Custom label badge. */
    if(sessionLabel){
      html+='<span class="recent-item-label">'+esc(sessionLabel)+'</span>';
    }
    html+='</div>';
    html+='<div class="recent-item-meta">'+meta.map(function(m){return"<span>"+esc(m)+"</span>"}).join('<span class="dot"></span>')+'</div>';
    /* P2.2 — tag pills row. Tapping the row's tag button
       opens the tag editor popover; clicking an individual
       tag pill filters the list to that tag. */
    var tags=Array.isArray(s.tags)?s.tags:[];
    if(tags.length){
      html+='<div class="recent-item-tags">';
      tags.forEach(function(t){
        html+='<button class="recent-tag-pill" onclick="setRecentsFilter(\''+esc(t)+'\')" title="Filter by tag: '+esc(t)+'">#'+esc(t)+'</button>';
      });
      html+='</div>';
    }
    html+='</div>';
    html+='<div class="recent-item-actions">';
    /* Tag editor trigger. */
    html+='<button class="recent-item-tag-btn" data-tag-open="1" title="Edit tags" onclick="openTagEditor(\''+esc(s.id)+'\',event)">';
    html+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';
    html+='</button>';
    /* Delete — click deletes immediately (no confirm). */
    html+='<button class="recent-item-del" title="Delete session" aria-label="Delete session"';
    html+=' onclick="actuallyDeleteSession(\''+esc(s.id)+'\',event)">';
    html+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
    html+='</button>';
    html+='</div>';
    html+='</div>';
  });
  cont.innerHTML=html;
  /* Attach long-press listeners to each recent item. */
  cont.querySelectorAll(".recent-item").forEach(function(el){attachLongPress(el)});
  /* Ensure the delegated navigation click handler is set up (lazy, one-time). */
  setupRecentsListDelegated();
  /* P2.2 — render the secondary filter chip row. "All" is the
     default; the user's most-used tags are surfaced as chips.
     The active chip is highlighted; clicking a chip toggles
     its filter state. */
  renderRecentsFilterChips();
}

function renderRecentsFilterChips(){
  /* Fetch projects for the filter chips if not cached. */
  var projects = window.__projectsCache || [];
  if (!projects.length && typeof apiFetch === "function") {
    apiFetch("/api/projects").then(function(r){
      window.__projectsCache = (r && r.projects) || [];
      renderRecentsFilterChips();
    }).catch(function(){});
  }
  renderRecentsFilterChipsUI({
    currentFilter:getRecentsFilter(),
    tags:getKnownTags().slice(0,8),
    projects: projects
  });
}

/* =============================================================
   In production, this would call an LLM API.
   ============================================================ */
/* P_main-split — Wave 0a: detectLanguage + languageDirectiveFor
   extracted to chat/lang.js. No behavior change. */
import { detectLanguage, languageDirectiveFor } from './chat/lang.js';


async function startSession(){
  /* P_slash-topic — if the slash command palette is open, don't
     start a session; the Enter key will be handled by the palette's
     keydown listener to insert the selected template. */
  if(isSlashCommandPaletteOpen()) return;
  var input=document.getElementById("topicInput");
  var topic=input.value.trim();
  if(!topic)return;

  state.topic=topic;
  state.diagIndex=0;
  state.diagAnswers=[];

  var lang=detectLanguage(topic);

  /* Always generate nodes and fallback questions */
  var gen=aiGenerate(topic);
  state.kbNodes=gen.nodes;
  state.domain=gen.domain;

  state.currentNode=0;
  state.stuckCount=0;
  state.totalQ=0;
  state.explaining=false;
  state.lastCallSource=null;

  /* User clicked Begin — this is when the session officially starts. */
  var newSessId=generateId();
  /* P_dup-session — mirror into the namespaced field too so the
     first saveCurrentSession after Begin uses this id rather than
     re-generating its own (which the previous code did, creating
     a duplicate session on the server). setCurrentSessionId writes
     to both fields + window mirror in one call. */
  setCurrentSessionId(newSessId);
  pushChatIdToURL(state.currentSessionId);
  /* P_new-session-context-leak — startSession() must NOT inherit the
     previous session's message history. The Begin button calls
     startSession() directly (no resetApp() in between when the user
     just edits the topic input and clicks Begin again from the
     topic-setup screen), so state.messages can still hold the prior
     chat's turns. extractHistory() in askChatTurn() would then feed
     the LLM the old conversation + the new topic, producing the
     "AI kept answering along the old session's context" cross-talk.

     P_recents-pollution — clearing messages here is also what makes
     the P_recents-auto save below safe to run BEFORE the chat starts.
     Without this ordering, saveCurrentSession() would POST the prior
     session's turns under the NEW session id; the server would UPSERT
     them onto the new row, and every other device that syncs
     /api/sessions would see a polluted session whose title is "new
     topic" but whose messages are "old conversation". Clearing state
     first guarantees the Begin-time POST carries an empty message
     array regardless of which path called us. The DOM msgList is
     cleared per-branch below (chat / tutor). */
  state.session.messages=[];
  state.diagQuestions=[];
  state.diagAnswers=[];
  state.diagIndex=0;
  state.substantiveCount=0;
  state.stuckCount=0;
  state.session.stuckCheckOffered=false;
  state.session.stuckCheckRejected=0;
  state.session.fourOptionDialog=null;
  /* P_recents-auto — save the session to the server immediately so it
     appears in the Recent sessions list as soon as the user clicks
     Begin, without waiting for the first AI response to finish. The
     initial save carries the topic but no messages; subsequent saves
     (from finishAfterRender / proceedToTeaching) fill in the content.
     MUST run AFTER the message-clearing block above so the empty
     state is what gets persisted. */
  saveCurrentSession();
  /* F2b — flush cross-round transients (search cache, call metadata,
     composer draft, plan fields, _pendingChat*). Placed BEFORE the
     new-session abort so even if the abort fires during the helper,
     we never carry the previous session's web-search result into the
     new chat. */
  resetSessionTransients(state);
  /* P_new-session-context-leak — also abort any in-flight stream from
     a previous session so its late onDelta/finish callbacks can't
     write into the freshly-cleared state.messages. */
  if(window._activeChatAbort){try{window._activeChatAbort("new-session")}catch(_){}}
  if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
  window._activeChatCtl=null;
  window._activeChatAbort=null;
  _chatStreaming=false;
  _chatStopMode=false;

/* Chat mode: skip diagnostic, KB, mistake book. Go straight to chat
      with a plain-conversation prompt. The first AI turn is a greeting
      so the user sees something without having to type. */
  if(appMode==="chat"){
    
    state.kbNodes=[];
    /* diagQuestions/diagAnswers/diagIndex/substantiveCount already
        cleared by the P_new-session-context-leak block above. */
    state.domain=state.topic;
    state.phase="chat";
    document.getElementById("topicSetup").classList.add("hidden");
    document.getElementById("diagnosticView").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    if (typeof window.hideMainPages === "function") window.hideMainPages();
    toggleChatTopBarEls(true);
    document.getElementById("msgList").innerHTML="";
    /* P_attachments-start — assemble the first user message the same
       way submitChatMessage does, so an attachment dropped onto the
       topic-setup screen travels with the very first chat turn (not
       just follow-up messages). buildMessageContent may call
       /api/vision/describe for image attachments; await it here so
       the multimodal content is fully assembled before askChatTurn
       picks up _pendingChatContent. */
    var startBuilt = (typeof buildMessageContent === "function")
      ? await buildMessageContent(state.topic)
      : { rawText: state.topic, parts: state.topic, attachmentList: [] };
    var startChatContent = startBuilt.parts;
    var startPersistText = startBuilt.rawText;
    var startAttList = startBuilt.attachmentList || [];
    window._pendingChatContent = startChatContent;
    window._pendingAttachments = startAttList;
    addMessage("user", startPersistText, null, null, startAttList);
    /* Consume the pending attachments now that the message is committed
       to the DOM. Re-render chips so both composers' strips empty out. */
    if(typeof resetAttachments === "function") resetAttachments();
    if(typeof renderAttachmentChips === "function") renderAttachmentChips();
    if(typeof updateSendBtn === "function") updateSendBtn();
    updateKB();
    updateChatStats();
    /* Fire the greeting stream on the NEXT task (deferred). Do NOT call
       askChatTurn synchronously inside the Begin click handler:
       addStreamingMessage() captures ownerSessionId immediately, but
       several still-pending microtasks from the topic-setup screen can
       touch state.messages or state.session.currentSessionId in the same
       task. If any of them land AFTER the placeholder is pushed but
       before stillOwnsSlot() checks it, the placeholder's slot identity
       becomes stale and stillOwnsSlot() drops every incoming delta —
       the bubble then hangs on the "Connecting…" placeholder. The manual
       Send path (submitChatMessage) wraps askChatTurn in setTimeout(…,0),
       so the same code path works for follow-up messages. Mirror that
       here so the first chat turn behaves identically — including the
       async wrapper that ensures proper microtask ordering. */
    setTimeout(async function(){ await askChatTurn(state.topic); }, 0);
    return;
  }

  /* Show diagnostic view with loading animation immediately */
  document.getElementById("topicSetup").classList.add("hidden");
  document.getElementById("diagnosticView").classList.remove("hidden");
  document.getElementById("chatView").classList.add("hidden");
  toggleChatTopBarEls(false);
    syncChatModel();

  /* P_attachments-tutor-persist — copy any pending attachments from
     the topic-setup screen onto the session state so subsequent tutor
     calls (diagnostic, first teaching turn) can pick them up. The
     chat-mode branch above already consumes pendingAttachments into
     the first chat bubble; tutor mode goes through a diagnostic
     detour first, so we stash the list on state for the LLM calls
     ahead. After this snapshot, the pending chips are cleared so
     the chat composer (visible after diagnostic) starts empty. */
  var tutorBuilt = null;
  if(typeof buildMessageContent === "function"){
    try{ tutorBuilt = await buildMessageContent(topic); }catch(_){ tutorBuilt = null; }
  }
  state.tutorAttachments = (tutorBuilt && tutorBuilt.attachmentList) || [];
  state.tutorPartsTemplate = (tutorBuilt && tutorBuilt.parts) || topic;
  if(typeof resetAttachments === "function") resetAttachments();
  if(typeof renderAttachmentChips === "function") renderAttachmentChips();
  if(typeof updateStartBtn === "function") updateStartBtn();
  if(typeof updateSendBtn === "function") updateSendBtn();
  /* U-H3 — reusable loading markup (initial render + retry re-render).
     Includes a cancel button so the user can bail out of a slow
     generation instead of watching the spinner indefinitely. */
  function diagLoadingHTML(){
    return '<div class="diag-loading"><div class="loading"><span></span><span></span><span></span></div><p class="diag-loading-text">'+t("tutor.loading")+'</p><div class="diag-progress"><div class="diag-progress-bar"><div class="diag-progress-fill" id="diagProgressFill"></div></div><div class="diag-progress-step" id="diagProgressStep"><span class="diag-progress-spin"></span>'+t("diag.analyzingTopic")+'</div></div><button type="button" class="diag-cancel-btn" onclick="cancelDiagnostic()">'+t("diag.cancel")+'</button></div>';
  }
  /* U-H3 — cancel handler: raise the cancel flag (checked inside
     generateDiagnosticQuestions) and return to the topic-setup screen. */
  window.cancelDiagnostic=function(){
    state.diagCancel=true;
    var dv=document.getElementById("diagnosticView");
    if(dv){dv.classList.add("hidden");dv.innerHTML="";}
    var ts=document.getElementById("topicSetup");
    if(ts)ts.classList.remove("hidden");
    var inp=document.getElementById("topicInput");
    if(inp){try{inp.focus();}catch(_){}}
  };
  document.getElementById("diagnosticView").innerHTML=diagLoadingHTML();

  /* Phase 3 — create the search-progress log up front so the user sees
   * the activity feed while the search runs in the background.
   * The fire-and-forget pattern avoids blocking diagnostic questions
   * on the 12s search timeout — results arrive before teaching starts. */
  var diagSearchLog=null;
  if(webSearchOn){
    try{
      var diagLoading=document.querySelector("#diagnosticView .diag-loading");
      diagSearchLog=startSearchProgress(topic,{mount:diagLoading});
      /* Background search — don't await. Diagnostic questions start
         immediately; search context is ready by the teaching phase. */
      fetchWebContext(topic,{onStep:function(ev){if(diagSearchLog)diagSearchLog.onStep(ev)}}).then(function(sc){
        state.searchContext=sc.context||"";
        if(diagSearchLog){
          try{
            var finalEngines=sc&&sc.sources?sc.sources.reduce(function(acc,s){var k=s.source||"web";acc[k]=(acc[k]||0)+1;return acc;},{}):{};
            var fetchedN=sc&&sc.sources?sc.sources.filter(function(x){return!!x.fullContent}).length:0;
            if(sc&&sc.ok&&sc.results){
              diagSearchLog.finalize({state:"ok",finalCount:sc.results,fetchedCount:fetchedN,engines:finalEngines});
            }else{
              diagSearchLog.finalize({state:"err",message:(sc&&sc.reason)||"no results"});
            }
          }catch(_){}
        }
      }).catch(function(){});
    }catch(_){diagSearchLog=null}
  }

  /* Progress bar helper — updates fill width and step text. */
  function diagProgress(pct, label) {
    var fill = document.getElementById('diagProgressFill');
    var step = document.getElementById('diagProgressStep');
    if (fill) fill.style.width = pct + '%';
    if (step) step.innerHTML = '<span class="diag-progress-spin"></span>' + label;
  }

/* P_cold-start-coverage — generate topic-specific KB node names so
      the knowledge dimensions are tailored to the subject. Falls back
      to the generic skeleton from aiGenerate() on any failure. */
  try{
    diagProgress(10, t("diag.analyzingTopic"));
    var topicNodes=await generateTopicKBNodes(topic,lang);
    if(topicNodes&&topicNodes.length>=3){
      while(topicNodes.length<state.kbNodes.length)topicNodes.push(state.kbNodes[topicNodes.length].name);
      for(var ni=0;ni<state.kbNodes.length;ni++){
        if(topicNodes[ni])state.kbNodes[ni].name=topicNodes[ni];
      }
      diagProgress(15, (window._currentLang==="zh"
        ? "已识别 "+state.kbNodes.length+" 个知识点"
        : "Identified "+state.kbNodes.length+" knowledge points"));
    }else{
      diagProgress(15, t("chat.knowledgeReady"));
    }
  }catch(e){
    diagProgress(15, t("chat.knowledgeReady"));
  }

  /* KB nodes ready — advance to question generation.
     U-H3 — generation is wrapped in a retryable closure so the
     timeout/failure prompt can re-run it, and a cancel flag lets the
     user bail out mid-generation (see cancelDiagnostic above). */
  function renderDiagFailure(fallbackErr){
    var dv=document.getElementById("diagnosticView");
    if(!dv)return;
    var _esc=(typeof window.esc==="function")?window.esc:function(x){return String(x==null?"":x)};
    var reason=state.lastCallError||fallbackErr||"";
    dv.classList.remove("hidden");
    dv.innerHTML='<div class="diag-error">'
      +'<p class="diag-error-title">'+_esc(t("diag.timeoutTitle"))+'</p>'
      +(reason?'<p class="diag-error-reason">'+_esc(reason)+'</p>':'')
      +'<div class="diag-error-actions">'
      +'<button type="button" class="diag-error-retry" onclick="retryDiagnostic()">'+_esc(t("diag.retry"))+'</button>'
      +'<button type="button" class="diag-error-builtin" onclick="useBuiltinDiagnostic()">'+_esc(t("diag.useBuiltin"))+'</button>'
      +'</div></div>';
  }
  async function attemptDiagGeneration(reinjectLoading){
    state.diagCancel=false;
    if(reinjectLoading){
      var dvl=document.getElementById("diagnosticView");
      if(dvl){dvl.classList.remove("hidden");dvl.innerHTML=diagLoadingHTML();}
    }
    diagProgress(20, t("chat.generatingQuestions"));
    var diagQs=null;
    var diagErr=null;
    try {
      diagQs = await generateDiagnosticQuestions(topic, lang, function(step, total, q) {
        var pct = 20 + Math.round(75 * step / total);
        if (q) {
          diagProgress(pct, t("chat.generatedQ").replace("{n}", step).replace("{total}", total));
        } else {
          diagProgress(pct, t("chat.generatingQ").replace("{n}", step).replace("{total}", total));
        }
      }, function(){ return !!state.diagCancel; });
    } catch (e) {
      diagErr = (e && e.message) || String(e);
    }
    /* User cancelled — cancelDiagnostic() already restored topic-setup. */
    if (state.diagCancel) return;
    if (diagQs && diagQs.length) {
      state.diagQuestions = diagQs;
      state.lastCallSource = 'real';
      updateChatStats();
      diagProgress(100, t("diag.ready"));
      renderDiagQuestion();
      updateKB();
      return;
    }
    /* Generation failed (not a user cancel). Synthesise a reason for the
       api-badge, then show an explicit retry / use-built-in prompt
       instead of silently falling back to the mock questions. */
    if (!state.lastCallError) {
      var ap = (typeof getActiveProvider === "function") ? getActiveProvider() : null;
      if (!ap) state.lastCallError = "no provider configured";
      else if (!ap.model) state.lastCallError = "active provider missing model";
      else if (ap.isBuiltIn) state.lastCallError = "built-in provider call failed (network or server error)";
      else state.lastCallError = "active provider '"+(ap.label||ap.id)+"' call failed";
    }
    updateChatStats();
    renderDiagFailure(diagErr);
  }
  /* U-H3 — retry re-runs generation from scratch; use-built-in accepts
     the mock questions the caller already prepared (gen.diagQuestions). */
  window.retryDiagnostic = function(){ attemptDiagGeneration(true); };
  window.useBuiltinDiagnostic = function(){
    state.diagQuestions = gen.diagQuestions;
    state.lastCallSource = 'mock';
    if (!state.lastCallError) state.lastCallError = "Using built-in questions";
    updateChatStats();
    var dv = document.getElementById("diagnosticView");
    if (dv) dv.classList.remove("hidden");
    renderDiagQuestion();
    updateKB();
  };

  await attemptDiagGeneration(false);
}

function renderDiagQuestion(){
  renderDiagQuestionUI(state,t,formatMsg);
}
function skipDiagQuestion(){
  state.diagAnswers[state.diagIndex]=-1;
  if(state.diagIndex<state.diagQuestions.length-1){
    state.diagIndex++;
    renderDiagQuestion();
  }else{
    finishDiagnostic();
  }
}

function selectDiag(idx){
  state.diagAnswers[state.diagIndex]=idx;
  renderDiagQuestion();
}
function prevDiagQuestion(){
  if(state.diagIndex>0){state.diagIndex--;renderDiagQuestion()}
}
function nextDiagQuestion(){
  if(state.diagAnswers[state.diagIndex]===undefined)return;
  state.diagIndex++;
  renderDiagQuestion();
}

function finishDiagnostic(){
  if(state.diagAnswers[state.diagIndex]===undefined)return;

  applyDiagnosticResults(state);

  renderDiagResultsScreen(state,_currentLang==="zh");
}

  /* P_test-interpretation — proceed from the results screen to the actual
   teaching phase. Separated from finishDiagnostic so the user has a
   moment to read the interpretation before teaching begins. */
function proceedToTeaching(){
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.remove("hidden");
  toggleChatTopBarEls(true);
  updateKB();
  updateChatStats();

  /* P_teaching-plan — generate the structured teaching plan from the
     freshly-populated KB. Sub-topics are sorted so blank nodes come
     first (teach the gaps), then fuzzy nodes, with all nodes taught
     from basics regardless of diagnostic result. currentSubtopicIdx
     always points to the first node so teaching starts from the
     foundation. */
  state.teachingPlan=buildTeachingPlanFromKB(state);
  syncCurrentNodeFromTeachingPlan(state);
  /* Task 2.1 — start the new session at the motivate stage. */
  state.teachingStage="motivate";
  state.currentExampleIdx=0;
  state.practiceAttempts=0;

  saveCurrentSession();

  /* First Socratic question */
  setTimeout(function(){
    askNextQuestion();
  },400);
}

/* ============================================================
   SOCRATIC QUESTIONS
   ============================================================ */
async function askNextQuestion(){
  var node=state.kbNodes[state.currentNode];
  if(hasUsableActive()){
    var ctl=addStreamingMessage({onRetry:function(){askNextQuestion()}});
    var result=await generateSocraticQuestionStream(node,state.domain,function(delta){ctl.append(delta)},function(t){ctl.appendThinking(t)});
    /* User explicitly clicked Stop on the bubble — clean it up
       silently. Don't fall back to mock (the user wanted to STOP,
       not get a different question), don't show an error. */
    if(result&&result.cancelled){
      ctl.abort();
      return;
    }
    if(result!=null){
      ctl.finish();
      state.stuckCount=0;
      state.totalQ++;
      updateChatStats();
      return;
    }
    /* Distinguish upstream error (show retry) from "API returned null
       but no error" (e.g. malformed response) — only show the retry
       button if we have a real lastCallError to surface. */
    if(state.lastCallError){
      ctl.replaceWithError("No response: "+state.lastCallError,function(){
        askNextQuestion();
      });
      return;
    }
    ctl.abort();
  }
  /* fallback: mock or pre-stream API path */
  var q=await generateSocraticQuestion(node,state.domain);
  addMessage("assistant",q.text);
  state.stuckCount=0;
  state.totalQ++;
  updateChatStats();
}

/* ============================================================
   CHAT MODE — plain conversation, no Socratic / KB / mistake book.
   Reuses callAPIStream + addStreamingMessage (single-render path
   that runs formatMsg exactly once — no renderAssistantHTML).
   ============================================================ */
async function askChatTurn(userText){
  /* Abort the previous in-flight chat stream, if any. Without this the
     old streamCtl stays in "正在思考…" until its own 45 s timer fires,
     which makes the UI feel frozen when the user fires a follow-up
     while the previous reply is still in flight. */
  if(window._activeChatCtl){try{_activeChatCtl.abort()}catch(_){}}
  if(window._activeChatAbort){try{_activeChatAbort("superseded")}catch(_){}}
  /* No API configured: provide a minimal local echo so the chat panel
     is not dead. Tells the user how to enable a real model. */
  if(!hasUsableActive()){
    var fallback=userText
      ?"You said: \""+userText+"\". I can't actually reply yet because no model is configured — open Settings and add a provider to enable Chat mode."
      :"I'm in Chat mode but no model is configured. Open Settings to add a provider, and I'll be able to talk about \""+state.topic+"\" for real.";
    addMessage("assistant",fallback);
    return;
  }
  /* Offline precheck — surface a clear "you're offline" message instead
     of waiting 120s for the stream to fail. */
  if(offlineGuard()){
    var ctlOff=addStreamingMessage({onRetry:function(){askChatTurn(userText)}});
    ctlOff.replaceWithError("You appear to be offline — check your connection and retry.",function(){
      askChatTurn(userText);
    });
    return;
  }
  var history=extractHistory();
  /* P_crosstalk-diag — temporary diagnostic for "new session inherits
     old context" bug. Logs the history length, state.messages length,
     current session id, and a short preview of each history entry so
     we can see exactly where the stale context comes from. */
  
  /* The "user" message we feed the model: if the user just opened the
     chat and hasn't typed anything, synthesize a short opener so the
     model has something to greet them with. */
  var userMsg=userText||("Let's talk about "+state.topic+".");
  /* P_attachments — submitChatMessage stores the assembled LLM
   * content (text string OR multimodal parts array) on
   * window._pendingChatContent. Prefer it when present so images
   * flow through to vision-capable upstreams. */
  var pendingContent = window._pendingChatContent;
  /* The fallback `userMsg` (synthesized opener) is plain text — if
   * there's no pending content we keep using it. */
  var userContent = (pendingContent !== undefined && pendingContent !== null)
    ? pendingContent
    : userMsg;
  /* If the user's message contains any http(s) URL, fetch each one and
     append the page text to the prompt as a [Referenced page] block.
     This gives the assistant the ability to read links the user
     pastes in — same as agent mode. We cap at 3 URLs to keep the
     prompt sane; each fetch is bounded by 8 s server-side. Failures
     fall back gracefully (just skip the block). */
  var urls=extractHttpUrls(userMsg);
  var pageBlocks=[];
  var pageResults=[];
  if(urls.length){
    try{setSearchPill("loading",0,"Reading "+urls.length+" link"+(urls.length>1?"s":""))}catch(_){}
    try{
      var fetched=await fetchPagesForContext(urls);
      pageBlocks=fetched.blocks||[];
      pageResults=fetched.results||[];
    }catch(_){pageBlocks=[];pageResults=[]}
    try{setSearchPill("ok",urls.length,urls.length+" link"+(urls.length>1?"s":""))}catch(_){}
    /* Surface the URL previews inside the user's bubble so the user
       sees exactly what the model is reading. The most recently
       appended <div class="msg user"> is the bubble for this turn. */
    try{
      var list=document.getElementById("msgList");
      var last=list&&list.lastElementChild;
      if(last&&last.classList.contains("user")){
        renderLinkPreviews(last,urls,pageResults);
      }
    }catch(_){}
  }else if(looksLikeUserMentionedSite(userMsg)){
    /* User talked about a site but we couldn't pull a clean URL. Show
       a small inline reminder card so they know to paste a full URL
       (with https://) on the next turn. The model-side hint below
       makes the assistant ask the same thing in prose. */
    try{
      var list2=document.getElementById("msgList");
      var last2=list2&&list2.lastElementChild;
      if(last2&&last2.classList.contains("user")){
        renderNoUrlHint(last2);
      }
    }catch(_){}
  }
  var sysCtx=getSystemContext();
  /* P_lang-directive — inject a strong language directive at the very
   * top of the system message, derived from the user's actual input.
   * Earlier the prompt itself only said "match the user's language",
   * which the model frequently ignored (Chinese input would still get
   * a mostly-English reply). The directive is the FIRST thing the
   * model reads, so it gets priority over the rest of the system
   * prompt and any tendency to default to the prompt's own language. */
  var langDir=languageDirectiveFor(userText||(state.topic||""));
  /* P_chat-prompt-switch — chat-mode prompt is one of two siblings:
   * CHAT_SYSTEM_PROMPT (default, "Extensive thinking" on) — verbose
   * scholar voice + <think> suffix requested; or CHAT_CONCISE_PROMPT
   * (toggle off) — direct, no preamble, no thinking block requested.
   * The thinkingSuffix is also suppressed in concise mode so the
   * model emits a plain reply without an opening <think> scratch
   * block. The beagle identity and memories still apply in both
   * modes (they're orthogonal to verbosity). */
  var chatPrompt = window.extensiveThinkingOn ? CHAT_SYSTEM_PROMPT : CHAT_CONCISE_PROMPT;
  var thinkSuffix = window.extensiveThinkingOn ? thinkingSuffix() : "";
  var toneSuffix = toneVoiceSuffix();
  var msgs=[{role:"system",content:langDir+sysCtx+"\n\n"+chatPrompt+toneSuffix+beagleSuffix()+thinkSuffix+memoriesSuffix()+projectContextSuffix()}];
  /* P5.8 — active prompt template: inject the template's
     specialized system prompt as a fresh system message so
     the model commits to that role for this turn. */
  msgs=injectTemplateSystemPrompt(msgs);
  /* Skip a trailing user message in history — `state.messages` already
     holds the just-added (or just-edited) user entry, and the explicit
     `msgs.push({role:"user",content:userMsg})` below carries it. Without
     this filter the model sees the user message twice on every turn
     (and again on every edit-and-resend). */
  if(history.length&&history[history.length-1].role==="user"){
    history=history.slice(0,-1);
  }
  msgs=msgs.concat(history);
  /* P_attachments — append the user turn using userContent (which is
   * the multimodal parts array when attachments are present, or the
   * plain text otherwise). Page blocks and the URL-mention hint are
   * appended as additional text parts so multimodal content stays
   * a flat array of parts rather than getting coerced back to a
   * string (which would drop the image parts). */
  if(pageBlocks.length){
    var pagesText=userMsg+"\n\n"+pageBlocks.join("\n\n");
    msgs.push({role:"user",content:Array.isArray(userContent)?userContent.concat({type:"text",text:pagesText}):pagesText});
  }else if(looksLikeUserMentionedSite(userMsg)){
    /* The user said something like "look up topodrive.top" or "看看
       example.com 的首页" but we couldn't extract a URL. Inject a
       short hint to the model so it asks for the full URL with an
       http(s):// prefix instead of guessing. */
    var hintText=userMsg+"\n\n[System] The user appears to be referring to a website, but no complete URL was provided in this turn (the system only auto-fetches text that contains a full http(s):// link or a recognizable bare domain like example.com / www.foo.bar). Reply briefly asking them to paste the full URL — including the https:// prefix — so you can read the page. Do NOT invent or guess the page contents.";
    msgs.push({role:"user",content:Array.isArray(userContent)?userContent.concat({type:"text",text:hintText}):hintText});
  }else{
    msgs.push({role:"user",content:userContent});
  }

  /* Unified streaming path with native tool-calling. The former
     legacy round-1 text-parsing branch was removed because it
     conflicted with the backend's function-calling tool interface. */
  /* P_crosstalk-diag — log the FULL message array sent to the LLM so
     we can see exactly what context the model receives. If the model
     "continues an old session", the stale content must be in here.
     Spread the preview as individual console.warn lines so they show
     in the text output without needing to expand Array(2). */
  
  var ctl=addStreamingMessage({onRetry:function(){askChatTurn(userText)}});
  var result=await callAPIStream(msgs,MAX_TOKENS_CHAT,function(delta){ctl.append(delta)},function(t){ctl.appendThinking(t)},{
    onToolUse:function(calls){for(var i=0;i<calls.length;i++){var c=calls[i];ctl.recordToolUse(c)}},
    onToolResult:function(r){ctl.recordToolResult(r)},
    onToolProgress:function(p){if(ctl.recordToolProgress)ctl.recordToolProgress(p)},
    onExecutionStart:function(ev){if(ctl.recordExecutionStart)ctl.recordExecutionStart(ev)},
    /* P_tool_stream — forward the live tool_call_delta frames to
       the streaming controller so the code / query inside each
       tool card streams in real time, instead of appearing all at
       once when the upstream signals finish_reason='tool_calls'. */
    onToolCallDelta:function(d){
      if(!d)return;
      if(typeof ctl.recordToolCallDelta==="function")ctl.recordToolCallDelta(d);
    }
  });
  handleChatApiResult(result,ctl,userText);
  updateChatStats();
  if(state.phase==="chat"||(state.topic&&state.kbNodes.length))saveCurrentSession();
}

/* Non-streaming variant of callAPIStream for round-1 detection. Returns
   the same {text,html,widgets,cancelled} shape (or null on failure). */
/* P_main-split — Wave 0b: parseToolCall, formatSourcesBlock,
   handleChatApiResult extracted to chat/format.js. No behavior change. */
import { parseToolCall, formatSourcesBlock, handleChatApiResult } from './chat/format.js';


/* P_main-split — Wave 0: mocks pool (region 14) extracted. */
import { _origGenerateSocraticQuestion, _origGenerateFollowUp, extractKeyPhrase, _origGetExplanation } from './chat/mocks.js';

/* ============================================================
   CHAT INTERACTION
   ============================================================ */
function handleChatKey(e){
  if(e.key==="Enter"&&!e.shiftKey){
    e.preventDefault();
    if(isSlashCommandPaletteOpen())closeSlashCommandPalette();
    submitChatMessage();
    return;
  }
  /* P5.8 — Slash-command palette. The heavy lifting (open,
     filter, close on leading-slash removal) lives in the
     input-event listener attached below. This keydown path
     is a fast path for the Enter key so the palette doesn't
     swallow the send action — Enter closes the palette
     first and the subsequent submitChatMessage() runs
     against the (unchanged) textarea value. */
}

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
var _slashSelected=0;
var _slashList=[];
var _slashQuery="";
/* P5.8 — Active template state. When the user picks a template
   from the palette we stash it here so the chat pipeline can
   inject the template's `systemPrompt` as a fresh system message
   on every turn while the template is active. The chip in the
   input bar shows the current mode; clicking × clears it. */
var _activeTemplate=null;
function isActiveTemplate(){return !!_activeTemplate;}
function getActiveTemplateSystemPrompt(){
  return(_activeTemplate&&_activeTemplate.systemPrompt)||"";
}
/* Strip the template body's leading prefix from the user-typed
   text, so the LLM sees only the user's actual content instead
   of "Paste the text you want summarized:\n\n<their text>".
   Whitespace-trimmed comparison so a stray newline from the
   cursor position doesn't throw the match off. */
function stripTemplateBodyPrefix(text){
  if(!_activeTemplate||!_activeTemplate.body)return text;
  var body=(_activeTemplate.body||"").replace(/\s+$/,"");
  if(!body)return text;
  /* Try to find the body's end, accounting for the user having
     deleted some chars from the start. We match the LARGEST
     prefix of the body that's still present at the start of
     the typed text, then drop everything up to the user's
     first non-body character. */
  var i=0;
  while(i<body.length && i<text.length && text.charAt(i)===body.charAt(i)) i++;
  if(i===0)return text; // user has wiped the placeholder
  return text.slice(i).replace(/^\s+/,"");
}
function setActiveTemplate(t){
  _activeTemplate=t?{
    id:t.id,title:t.title,shortcut:t.shortcut,
    systemPrompt:t.systemPrompt||"",body:t.body||"",
    icon:t.icon
  }:null;
  renderTemplateModeChip();
}
function clearActiveTemplate(){setActiveTemplate(null);}
/* Surface the active template as a chip above the input so
   the user always knows the system is in a specialized mode.
   Clicking × clears it; the click handler is wired inline. */
/* P_slash-topic — also render the chip in the topic setup area. */
function renderTemplateModeChip(){
  var chip=document.getElementById("templateModeChip");
  var topicChip=document.getElementById("topicTemplateModeChip");
  if(!_activeTemplate){
    if(chip){chip.classList.add("hidden");chip.innerHTML="";}
    if(topicChip){topicChip.classList.add("hidden");topicChip.innerHTML="";}
    return;
  }
  var iconHtml=_activeTemplate.icon&&_activeTemplate.icon.indexOf("<svg")===0
    ? _activeTemplate.icon
    : esc(_activeTemplate.icon||"");
  var html=
    '<span class="template-mode-chip-icon">'+iconHtml+'</span>'+
    '<span class="template-mode-chip-label">Mode: <strong>'+esc(_activeTemplate.title)+'</strong></span>'+
    '<span class="template-mode-chip-hint">System prompt is set for this turn</span>'+
    '<button class="template-mode-chip-close" type="button" onclick="clearActiveTemplate()" aria-label="Exit template mode" title="Exit template mode">×</button>';
  if(chip){chip.innerHTML=html;chip.classList.remove("hidden");}
  if(topicChip){topicChip.innerHTML=html;topicChip.classList.remove("hidden");}
}
/* Inject the active template's system prompt as a fresh
   system message right after the base system message.
   Returns the original array unchanged if no template is
   active. Idempotent — calling this twice doesn't stack
   the prompt (we tag it with a marker so the second call
   is a no-op). */
function injectTemplateSystemPrompt(messages){
  if(!_activeTemplate||!_activeTemplate.systemPrompt)return messages;
  var marker="[template:"+_activeTemplate.id+"]";
  /* If we already injected this template's prompt on a
     prior call in the same array, skip — keeps the
     conversation history from getting polluted with
     duplicate system messages. */
  for(var i=0;i<messages.length;i++){
    var m=messages[i];
    if(m&&m.role==="system"&&typeof m.content==="string"&&m.content.indexOf(marker)>=0){
      return messages;
    }
  }
  var stamped=_activeTemplate.systemPrompt+"\n\n"+marker;
  var cloned=messages.slice();
  /* Find first system message and inject after it; if no
     system message, prepend. */
  for(var j=0;j<cloned.length;j++){
    if(cloned[j]&&cloned[j].role==="system"){
      cloned.splice(j+1,0,{role:"system",content:stamped});
      return cloned;
    }
  }
  cloned.unshift({role:"system",content:stamped});
  return cloned;
}
/* Parse the slash command from the input. Returns null if
   the input doesn't start with `/`, otherwise:
     { raw: "/sum",    — the `/query` chunk we will replace
       query:"sum",    — lowercased, no leading slash
       tail: " foo",   — what comes after the first whitespace
       end:  4 }       — character index where tail begins
   Used both for filtering and for the insert step (so the
   user's ` foo` argument survives the click). */
/* P_slash-topic — also support slash commands in the topic-setup
   textarea (#topicInput), not just the chat composer. */
function _getSlashInput(){
  var input = document.getElementById("chatInputArea");
  if(input && input.value && input.value.charAt(0)==="/") return input;
  input = document.getElementById("topicInput");
  if(input && input.value && input.value.charAt(0)==="/") return input;
  return null;
}
var _slashActiveInput = null;
function _currentSlashQuery(){
  var input=_getSlashInput();
  if(!input) return null;
  _slashActiveInput = input;
  var v=input.value;
  if(!v || v.charAt(0)!=="/") return null;
  var i=1;
  while(i<v.length && !/\s/.test(v.charAt(i))) i++;
  return { raw:v.slice(0,i), query:v.slice(1,i).toLowerCase(), tail:v.slice(i), end:i };
}
/* Filter the unified command list by the current query. The list
   is connected apps first (so `/github` lands on the app, not a
   template that mentions github), then prompt templates. Each entry
   carries a `_kind` tag ('app' | 'template') so the renderer can
   group them and the insert step can branch. Substring match against
   shortcut, title, and description. */
function _slashAppEntries(){
  var apps=(typeof window.getSlashApps==="function")?window.getSlashApps():[];
  return (apps||[]).map(function(a){
    return { _kind:"app", id:a.id, title:a.title, shortcut:a.shortcut, description:a.description, icon:a.icon, insert:a.insert };
  });
}
function _filterSlashList(query){
  var apps=_slashAppEntries();
  var templates=loadPromptTemplates().map(function(t){
    return { _kind:"template", id:t.id, title:t.title, shortcut:t.shortcut, description:t.description, icon:t.icon, body:t.body, systemPrompt:t.systemPrompt };
  });
  var list=apps.concat(templates);
  if(!query) return list;
  return list.filter(function(t){
    var s=(t.shortcut||"").toLowerCase();
    var title=(t.title||"").toLowerCase();
    var desc=(t.description||"").toLowerCase();
    return s.indexOf(query)>=0 || title.indexOf(query)>=0 || desc.indexOf(query)>=0;
  });
}
function openSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(!p){
    p=document.createElement("div");
    p.id="slashCommandPalette";
    p.className="slash-command-palette";
    document.body.appendChild(p);
  }
  var q=_currentSlashQuery();
  _slashQuery=q?q.query:"";
  _slashList=_filterSlashList(_slashQuery);
  _slashSelected=0;
  renderSlashCommandPalette();
  positionSlashCommandPalette();
  p.classList.add("visible");
  /* Lazily fetch the connector list the first time the palette
     opens, then re-filter so connected apps appear inline. */
  if(typeof window.ensureSlashApps==="function"){
    window.ensureSlashApps().then(function(){
      if(isSlashCommandPaletteOpen()) updateSlashCommandPaletteFilter();
    });
  }
}
function isSlashCommandPaletteOpen(){
  var p=document.getElementById("slashCommandPalette");
  return !!(p && p.classList && p.classList.contains("visible"));
}
function closeSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(p)p.classList.remove("visible");
}
/* Anchor the palette to the chat input bar. Computing on
   open + on every filter change means the palette stays
   flush against the textarea even if the user resizes the
   window or scrolls. Falls back to the original centred-
   bottom layout if the input element can't be measured. */
function positionSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(!p) return;
  /* P_slash-topic — anchor to the active input's wrapper. */
  var anchor=null;
  if(_slashActiveInput && _slashActiveInput.id==="topicInput"){
    anchor=document.getElementById("topicInputWrap");
  }
  if(!anchor) anchor=document.getElementById("chatInputWrap")||document.getElementById("chatInputArea");
  if(!anchor){
    p.style.left="50%";
    p.style.right="";
    p.style.width="";
    p.style.bottom="120px";
    p.style.transform="translateX(-50%)";
    return;
  }
  var rect=anchor.getBoundingClientRect();
  p.style.left=rect.left+"px";
  p.style.right="";
  p.style.width=rect.width+"px";
  p.style.bottom=(window.innerHeight-rect.top+6)+"px";
  p.style.transform="translateY(0)";
}
/* Re-filter without closing. Called on every input event
   while the palette is open. Tries to keep the current
   selection stable if the highlighted template still
   matches, so arrow-keys feel natural while typing. */
function updateSlashCommandPaletteFilter(){
  if(!isSlashCommandPaletteOpen()) return;
  var q=_currentSlashQuery();
  _slashQuery=q?q.query:"";
  var prevShortcut=(_slashList[_slashSelected]||{}).shortcut||"";
  _slashList=_filterSlashList(_slashQuery);
  if(prevShortcut){
    var newIdx=-1;
    for(var i=0;i<_slashList.length;i++){
      if(_slashList[i].shortcut===prevShortcut){ newIdx=i; break; }
    }
    if(newIdx>=0) _slashSelected=newIdx;
    else _slashSelected=Math.min(_slashSelected,Math.max(0,_slashList.length-1));
  }else{
    _slashSelected=0;
  }
  renderSlashCommandPalette();
  positionSlashCommandPalette();
}
function renderSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(!p)return;
  var html=[];
  html.push('<div class="slash-command-head">Commands'
             +(_slashQuery?' — filter: /'+esc(_slashQuery):"")
             +'</div>');
  if(!_slashList.length){
    var emptyMsg=_slashQuery
      ? 'No commands matching "/'+esc(_slashQuery)+'". Press Esc to close.'
      : 'No templates yet. Connect an app in Plugins or add a template in Profile → Data.';
    html.push('<div class="slash-command-empty">'+emptyMsg+'</div>');
  }else{
    var lastKind="";
    _slashList.forEach(function(t,i){
      if(t._kind!==lastKind){
        lastKind=t._kind;
        html.push('<div class="slash-command-group">'+(t._kind==="app"?"Connected apps":"Prompt templates")+'</div>');
      }
      html.push(
        '<div class="slash-command-row '+(i===_slashSelected?"selected":"")+'" onclick="onSlashRowClick('+i+')" onmouseenter="_slashSelected='+i+';updateSlashSelected()">'+
          '<span class="slash-command-icon">'+(t.icon&&t.icon.indexOf("<svg")===0?t.icon:esc(t.icon||"pg"))+'</span>'+
          '<div class="slash-command-main">'+
            '<div class="slash-command-title">'+esc(t.title)+' <span class="slash-command-shortcut">'+esc(t.shortcut)+'</span></div>'+
            '<div class="slash-command-desc">'+esc(t.description||"")+'</div>'+
          '</div>'+
        '</div>'
      );
    });
  }
  html.push('<div class="slash-command-foot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> insert</span><span><kbd>esc</kbd> close</span></div>');
  p.innerHTML=html.join("");
}
function updateSlashSelected(){
  var rows=document.querySelectorAll("#slashCommandPalette .slash-command-row");
  rows.forEach(function(r,i){
    r.classList.toggle("selected",i===_slashSelected);
    if(i===_slashSelected)r.scrollIntoView({block:"nearest"});
  });
}
function onSlashRowClick(i){_slashSelected=i;insertSelectedSlashTemplate()}
function insertSelectedSlashTemplate(){
  if(!_slashList.length)return;
  var t=_slashList[_slashSelected];
  if(!t)return;
  /* P_slash-topic — use whichever input triggered the palette
     (chatInputArea or topicInput) instead of always chatInputArea. */
  var input=_slashActiveInput;
  if(!input) return;
  var q=_currentSlashQuery();
  var tail=q?q.tail:"";
  if(t._kind==="app"){
    /* Connected app: drop a natural-language directive into the
       composer and place the cursor at the end so the user can type
       the specifics (e.g. "Search arXiv for |"). The model auto-calls
       the matching connector tool via tool_choice:'auto' — no template
       mode is activated, so follow-up turns stay unconstrained. */
    var directive=t.insert||"";
    input.value=directive+tail;
    input.focus();
    var pos=directive.length;
    try{input.setSelectionRange(pos,pos)}catch(_){}
  }else{
    /* Replace ONLY the leading `/query` chunk with the
       template body, preserving any text the user typed
       after the first whitespace. This matters because
       users often type `/explain this code` and expect
       ` this code` to survive the click. */
    var body=t.body||"";
    input.value=body+tail;
    input.focus();
    /* Place cursor at end of body, so the user lands on
       the placeholder line (e.g. just before the code
       fence of /explain) instead of at the end of the
       pasted tail. */
    var end=body.length;
    try{input.setSelectionRange(end,end)}catch(_){}
    /* Activate the template so the next LLM call gets the
       specialized system prompt. The chip surfaces the
       mode so the user can see (and dismiss) what's
       happening — without the chip, the model would
       silently switch modes and the user would have no
       idea why the response shape changed. */
    setActiveTemplate(t);
  }
  /* Trigger autoResize so the textarea grows. */
  if(typeof autoResize==="function")autoResize(input);
  if(typeof updateSendBtn==="function")updateSendBtn();
  /* P_slash-topic — also sync the Begin button when on topic input. */
  if(input.id==="topicInput" && typeof updateStartBtn==="function") updateStartBtn();
  closeSlashCommandPalette();
}
/* Wire arrow / Enter / Esc handling for the palette itself. */
document.addEventListener("keydown",function(e){
  if(!isSlashCommandPaletteOpen())return;
  var k=e.key;
  if(k==="ArrowDown"){
    e.preventDefault();
    _slashSelected=(_slashSelected+1)%Math.max(1,_slashList.length);
    updateSlashSelected();
  }else if(k==="ArrowUp"){
    e.preventDefault();
    _slashSelected=(_slashSelected-1+_slashList.length)%Math.max(1,_slashList.length);
    updateSlashSelected();
  }else if(k==="Enter"&&!e.shiftKey){
    e.preventDefault();
    insertSelectedSlashTemplate();
  }else if(k==="Escape"){
    e.preventDefault();
    closeSlashCommandPalette();
  }
});
/* Re-filter the palette on every input change. Catches
   the common case of typing `/sum` and expecting the
   list to narrow live. Also closes the palette when the
   leading `/` is gone (e.g. user backspaces past it or
   pastes over it). */
document.addEventListener("input",function(e){
  /* P_slash-topic — also listen for slash commands on the topic input. */
  var t=e.target;
  if(!t || (t.id!=="chatInputArea" && t.id!=="topicInput")) return;
  var v=t.value;
  if(v.charAt(0)==="/"){
    if(!isSlashCommandPaletteOpen()) openSlashCommandPalette();
    else updateSlashCommandPaletteFilter();
  }else if(isSlashCommandPaletteOpen()){
    closeSlashCommandPalette();
  }
});
/* Reposition on resize/scroll so the palette stays flush
   with the input bar. */
window.addEventListener("resize",function(){
  if(isSlashCommandPaletteOpen()) positionSlashCommandPalette();
});

async function submitChatMessage(textOverride,opts){
  opts=opts||{};
  var input=document.getElementById("chatInputArea");
  var rawText=(textOverride!=null?textOverride:input.value);
  var text=rawText.trim();
  /* P5.8 — if a template is active, strip its body prefix
     from the user text. The body is a placeholder the user
     sees in the input ("Paste the text you want summarized:
     ") but should NOT be sent to the LLM or shown in the
     user bubble. We strip on the WAY in so both paths see
     the cleaned text. The template itself stays active so
     the system prompt keeps injecting on follow-up turns. */
  if(_activeTemplate && textOverride==null){
    text=stripTemplateBodyPrefix(rawText).trim();
    if(!text){
      /* User sent the placeholder without typing anything
         real. Bail with a hint instead of firing an empty
         request at the model. */
      try{showToast("Type or paste the text to process, then send.");}catch(_){}
      return;
    }
  }
  /* P_attachments — allow sending if there are attachments even when
   * the text is empty (e.g. just a single image with no caption). */
  var hasAtt = Array.isArray(window.attachments) && window.attachments.length>0;
  if(!text && !hasAtt)return;
  /* P_attachments — assemble the multimodal content (parts array)
   * and the persistence list before we add the user bubble.
   * buildMessageContent is async because it may call /api/vision/describe
   * to get a text description for each attached image (so non-vision
   * upstreams still get image context). */
  var built = (typeof buildMessageContent==="function")
    ? await buildMessageContent(text)
    : { rawText: text, parts: text, attachmentList: [] };
  var chatContent = built.parts;       // string OR parts array — what the LLM sees
  var persistText = built.rawText;     // user-visible bubble text (with placeholders)
  var attList = built.attachmentList;   // what we save to the DB
  /* Stash the chat content for askChatTurn to pick up. askChatTurn is
   * not parameterized; this is the lowest-friction wiring. */
  window._pendingChatContent = chatContent;
  window._pendingAttachments = attList;
  if(textOverride==null){
    addMessage("user",persistText,null,null,attList);
    input.value="";autoResize(input);updateSendBtn();
    scheduleScrollMainToBottom({force:true});
    input.focus();
  }else{
    /* Origin: quiz — synthetic message from a quiz pick. */
    addMessage("user",persistText,null,null,attList);
  }
  /* P_attachments — clear the pending chips after the message is
   * committed to the DOM. Render an empty strip so the UI updates. */
  if(typeof resetAttachments==="function")resetAttachments();
  if(typeof renderAttachmentChips==="function")renderAttachmentChips();
  if(typeof updateSendBtn==="function")updateSendBtn();

  /* AI processes the answer */
  /* Background web-search refresh for tutor follow-ups. Same 5-turn
     rule as chat mode. We do not block the turn on this — the previous
     context stays in state.searchContext until the new one arrives. */
  if(webSearchOn&&state.topic&&shouldRefreshSearch()){
    fetchWebContext(state.topic,{background:true});
  }
  setTimeout(async function(){
    /* Chat mode: plain conversation, no Socratic / KB / mistake book.
       Just stream a reply and save. */
    if(appMode==="chat"){
      await askChatTurn(text);
      return;
    }

    var node=state.kbNodes[state.currentNode];
    state.stuckCount++;

    /* §8.5 — increment the practice-attempt counter when the
       student answers during the exercise stage. The chip in
       the mode banner reads from this. */
    if(state.teachingStage==="exercise"){
      state.practiceAttempts=(state.practiceAttempts||0)+1;
    }

    /* Check if the answer seems substantive.
       P_quiz-count — quiz-origin answers (synthesised by handleQuizPick
       as "I chose A. ... (Result: correct.)") always exceed the length
       threshold. If we count them toward substantiveCount, 3 quiz picks
       would silently bring the user to the advance threshold, letting
       them "master" a node by clicking quiz options without any real
       free-form reasoning. Skip the count for quiz and practice-origin
       answers; they have their own advancement paths (handleQuizPick
       for quiz, the practice widget for practice). */
    var isSubstantive=text.length>40&&text.split(/\s+/).length>8;
    if(isSubstantive&&opts.origin!=="quiz"&&opts.origin!=="practice")state.substantiveCount++;

    var ADVANCE_THRESHOLD=3;

    /* Task 2.3 — advance the explicit teaching-stage state machine
       one step per substantive free-form answer. Quiz-origin
       answers (opts.origin==="quiz") are stage-driven by
       handleQuizPick and don't bump the stage here. We advance
       motivate → define → develop → illustrate → exercise → check
       and stop at check (the check stage is quiz-driven). */
    if(isSubstantive&&state.teachingStage!=="check"&&opts.origin!=="quiz"){
      var order=["motivate","define","develop","illustrate","exercise","check"];
      var curIdx=order.indexOf(state.teachingStage||"motivate");
      if(curIdx>=0&&curIdx<order.length-1){
        state.teachingStage=order[curIdx+1];
        if(state.teachingStage==="exercise"){
          state.practiceAttempts=0;
          state.practicePhase="foundation";
        }
      }
    }
    /* Practice-progress chip — update after every answer so the
       user sees their attempt count climb. */
    if(typeof tutorSocratic==="object"&&tutorSocratic
       &&typeof tutorSocratic.renderPracticeProgress==="function"){
      try{tutorSocratic.renderPracticeProgress()}catch(_){}
    }

    /* P_stage-gate — a node is only internalized when the user has
       progressed far enough in the teaching stage machine AND shown
       sustained engagement. The old logic (3 substantive answers
       regardless of stage) let a user "master" a node during the
       motivate phase — before any definition, example, or practice
       was even presented. Now we require:
       1. At least ADVANCE_THRESHOLD substantive free-form answers
          (proves sustained engagement, not just a one-liner).
       2. The teaching stage has reached at least "exercise" — meaning
          the model has already motivated, defined, developed, and
          illustrated the concept, AND the user has attempted a
          practice problem.
       3. Not a quiz-origin turn (quiz has its own advancement path).
       This ensures the user actually went through the full teaching
       arc before the node is marked internalized. */
    var stageOrder=["motivate","define","develop","illustrate","exercise","check"];
    var curStageIdx=stageOrder.indexOf(state.teachingStage||"motivate");
    var reachedExercise=curStageIdx>=stageOrder.indexOf("exercise");
    if(state.substantiveCount>=ADVANCE_THRESHOLD&&!opts.origin&&reachedExercise){
      /* User has shown depth on this node AND reached the exercise
         stage — advance to internalized. */
      node.status="internalized";
      node.questions=(node.questions||0)+1;
      state.substantiveCount=0;
      /* P_node-sync — find the next sub-topic using the teaching
         plan's SORTED order, NOT the raw kbNodes order. The plan
         sorts blank → fuzzy → internalized so we teach the biggest
         gaps first. We also sync currentSubtopicIdx so the plan
         sidebar stays consistent with what we're actually teaching. */
      var nextKbIdx=-1;
      var planSubs=(state.teachingPlan&&state.teachingPlan.subtopics)||[];
      if(planSubs.length){
        /* Find current sub-topic's position in the sorted plan */
        var curPlanIdx=-1;
        for(var pi=0;pi<planSubs.length;pi++){
          if(planSubs[pi].name===node.name){curPlanIdx=pi;break}
        }
        /* Walk forward in the sorted plan to find the next non-internalized */
        var nextPlanIdx=-1;
        for(var pi2=curPlanIdx+1;pi2<planSubs.length;pi2++){
          if(planSubs[pi2].status!=="internalized"){nextPlanIdx=pi2;break}
        }
        if(nextPlanIdx>=0){
          var nextSub=planSubs[nextPlanIdx];
          /* Find the kbNode index matching this sub-topic's name */
          for(var kni=0;kni<state.kbNodes.length;kni++){
            if(state.kbNodes[kni].name===nextSub.name){nextKbIdx=kni;break}
          }
          state.teachingPlan.currentSubtopicIdx=nextPlanIdx;
        }
      }
      /* Fallback: if the plan-based lookup failed (no plan, or name
         mismatch), use the old raw-order scan as a safety net. */
      if(nextKbIdx<0){
        for(var i=state.currentNode+1;i<state.kbNodes.length;i++){
          if(state.kbNodes[i].status!=="internalized"){nextKbIdx=i;break}
        }
      }
      updateKB();
      if(nextKbIdx<0){
        addMessage("assistant","Nice work — you've explored all the key areas of "+state.domain+". Feel free to revisit any node on the left, or start a new topic.");
      }else{
        state.currentNode=nextKbIdx;
        state.stuckCount=0;
        /* Task 2.3 — reset the teaching-stage state machine for
           the new sub-topic. The new node starts at motivate with
           no examples shown and no practice attempts. */
        state.teachingStage="motivate";
        state.currentExampleIdx=0;
        state.practiceAttempts=0;
        var prevName=node.name;
        var nextName=state.kbNodes[nextKbIdx].name;
        addMessage("assistant","Good depth on **"+prevName+"**. Let's move to the next area: **"+nextName+"**.");
        setTimeout(function(){askNextQuestion()},900);
      }
      saveCurrentSession();
    }else if(isSubstantive||state.stuckCount<3||opts.origin==="quiz"){
      /* Defensive: if the user is in tutor mode but the KB is empty
         (e.g. they just switched modes, or the session was loaded
         without KB nodes), fall through to chat-style handling. This
         avoids a downstream "Cannot read properties of undefined
         (reading 'status')" in buildFollowUpMessages. */
      if(!node){
        await askChatTurn(text);
        state.totalQ++;
        updateChatStats();
        return;
      }
      /* Follow up within same node — streamed */
      var streamCtl=null;
      if(hasUsableActive()){
        streamCtl=addStreamingMessage({onRetry:function(){submitChatMessage(text,opts)}});
        var fu=await generateFollowUpStream(text,node,state.domain,function(delta){streamCtl.append(delta)},function(t){streamCtl.appendThinking(t)});
        if(fu!=null){
          streamCtl.finish();
        }else{
          if(state.lastCallError){
            /* Keep the placeholder visible with a retry button instead
               of silently swapping to a mock answer — the user just
               spent keystrokes and deserves to see what went wrong. */
            streamCtl.replaceWithError("No response: "+state.lastCallError,function(){
              submitChatMessage(text,opts);
            });
          }else{
            streamCtl.abort();
            addMessage("assistant",_origGenerateFollowUp(text,node,state.domain));
          }
        }
      }else{
        addMessage("assistant",_origGenerateFollowUp(text,node,state.domain));
      }
      state.stuckCount=0;
      state.totalQ++;
    }else{
      /* v3.0 design — §8.2 first offer the "讲解一下 / 再想想"
         two-choice prompt, then escalate to the §8.6 four-option
         dialog if the user keeps refusing. Audit U-H3 noted the
         old path was a one-shot "explain/skip/retry" with no
         escape valve. */
      if(state.stuckCount>=3){
        if(state.stuckCheckOffered&&state.stuckCheckRejected>=1){
          /* Two "再想想" rejections in a row → §8.2 forces the
             four-option dialog (per design). */
          if(typeof tutorSocratic==="object"&&tutorSocratic
             &&typeof tutorSocratic.showFourOptionDialog==="function"){
            try{tutorSocratic.showFourOptionDialog(text)}catch(_){}
          }else{
            addMessage("assistant","Let's try a different approach.","suggest",[
              {text:t("tutor.explain"),action:"explain",primary:true},
              {text:t("tutor.skip"),action:"skip"},
              {text:t("tutor.thinkMore"),action:"retry"}
            ]);
          }
          state.stuckCount=0;
          state.stuckCheckOffered=false;
          state.stuckCheckRejected=0;
        }else if(!state.stuckCheckOffered){
          /* First time on this node: ask permission to explain
             instead of dumping a textbook at the user. */
          if(typeof tutorSocratic==="object"&&tutorSocratic
             &&typeof tutorSocratic.showExplainPrompt==="function"){
            try{tutorSocratic.showExplainPrompt(node&&node.name||"")}catch(_){}
          }else{
            addMessage("assistant","Let's try a different approach.","suggest",[
              {text:t("tutor.explain"),action:"explain",primary:true},
              {text:t("tutor.skip"),action:"skip"},
              {text:t("tutor.thinkMore"),action:"retry"}
            ]);
          }
          state.stuckCheckOffered=true;
          state.stuckCount=0;
        }else{
          state.stuckCheckRejected=(state.stuckCheckRejected||0)+1;
          state.stuckCount=0;
          addMessage("assistant",t("tutor.takeTime"));
        }
      }else{
        addMessage("assistant",t("tutor.takeTime"));
      }
    }
    updateChatStats();
  },0);
}

/* P1.1 — per-message action toolbar. The toolbar is a small
   <div> with icon buttons (Copy / Edit / Regenerate / Thumbs /
   Delete) and lives outside the message body so listeners survive
   re-renders. The button set is role-dependent:
     user       → copy / edit / delete
     assistant  → copy / regenerate / thumbs up / thumbs down
   Each click fires both:
     1. an immediate local action (clipboard / DOM mutation /
        localStorage feedback), and
     2. a fire-and-forget API call to the corresponding
        `/api/messages/<id>/...` endpoint documented in
        `docs/api/openapi.yaml` (P1.1). API failures are logged
        but never block the user.
   The toolbar is hidden until the message is hovered (desktop)
   or long-pressed (mobile). The CSS is at .msg-toolbar / .msg-
   toolbar-btn; buttons render as 18×18 SVG icons. */
function buildMessageToolbar(opts){
  var role=opts.role;            /* "user" | "assistant" */
  var entry=opts.entry||null;    /* state.messages entry */
  var readOnly=!!opts.readOnly;
  if(!entry)return null;
  var messageId=entry.id||entry.clientId;
  var bar=document.createElement("div");
  bar.className="msg-toolbar";
  bar.dataset.role=role;
  bar.dataset.messageId=messageId;
  function addBtn(action,title,svgInner,onClick,extraClass){
    var b=document.createElement("button");
    b.type="button";
    b.className="msg-toolbar-btn"+(extraClass?" "+extraClass:"");
    b.title=title;
    b.setAttribute("aria-label",title);
    b.dataset.action=action;
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+svgInner+"</svg>";
    b.addEventListener("click",function(ev){
      ev.stopPropagation();
      try{onClick(ev)}catch(e){/* msg-toolbar action failed */}
    });
    bar.appendChild(b);
    return b;
  }
  /* Copy — works for both roles. Uses navigator.clipboard with a
     legacy fallback to a hidden textarea + execCommand.

     P_copy-strip-html — prefer the plain `entry.rawText` (what the
     user actually typed or what the model emitted before being
     markdown-rendered). Fall back to `entry.html` ONLY by parsing
     it through a detached DOM node and taking textContent — never
     copying the HTML string verbatim. The previous fallback
     `entry.rawText || entry.html` would dump marked's `<p>...</p>`
     wrapper into the clipboard whenever rawText happened to be
     empty (a real occurrence on session reload of older payloads
     and on any entry that round-tripped through the server without
     a rawText column populated). */
  function doCopy(){
    var txt="";
    if(typeof entry.rawText==="string"&&entry.rawText.length>0){
      txt=entry.rawText;
    }else if(typeof entry.html==="string"&&entry.html.length>0){
      txt=stripHtmlToText(entry.html);
    }
    if(!txt){
      showToast("Nothing to copy");
      return;
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        showToast("Copied to clipboard");
      },function(){
        legacyCopy(txt);
      });
    }else{
      legacyCopy(txt);
    }
    /* P1.1 — copy is a purely local action (clipboard write + toast).
       It used to also fireFeedback(messageId, "copy", null), but the
       /api/messages/<id>/feedback endpoint expects rating in
       {up, down, none} — sending "copy" produced a 400 with the
       unhelpful message "rating must be up/down/none" in the console.
       The two thumbs buttons (line ~5037 / ~5043) remain the only
       callers of fireFeedback. */
  }
  /* Parse an HTML fragment and return its visible text. Used by the
     copy handler when rawText is unavailable so the clipboard doesn't
     pick up `<p>`, `<br>`, `<strong>` and other markup as literal
     angle-bracket noise. */
  function stripHtmlToText(html){
    try{
      var d=document.implementation.createHTMLDocument("");
      var c=d.createElement("div");
      c.innerHTML=html;
      /* <br> → newline so multi-paragraph content pastes with
         paragraph breaks preserved; block elements get a trailing
         newline by appendChild below. */
      var brs=c.querySelectorAll("br");
      for(var i=0;i<brs.length;i++){
        brs[i].parentNode.replaceChild(d.createTextNode("\n"),brs[i]);
      }
      var blocks=c.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6,blockquote,pre,tr");
      for(var j=blocks.length-1;j>=0;j--){
        /* Append a trailing newline text node to each block-level
           element so paragraph / list / heading boundaries survive
           the textContent flatten. Without this, "<p>a</p><p>b</p>"
           pastes as "ab" instead of "a\nb". */
        el.appendChild(d.createTextNode("\n"));
      }
      return (c.textContent||"").replace(/\n{3,}/g,"\n\n").trim();
    }catch(e){
      /* Last-ditch: strip tags with a regex so the user still gets
         something rather than seeing "<p>...</p>" verbatim. */
      return String(html||"").replace(/<[^>]+>/g,"").replace(/&nbsp;/g," ").trim();
    }
  }
  function legacyCopy(txt){
    try{
      var ta=document.createElement("textarea");
      ta.value=txt;
      ta.style.position="fixed";
      ta.style.opacity="0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      showToast("Copied");
    }catch(e){
      showToast("Copy failed");
    }
  }
  addBtn("copy","Copy",
    '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
    doCopy
  );
  /* Shared-view mode returns Copy only; edit/delete/regenerate have
     no meaning on someone else's read-only session. */
  if(readOnly){
    return bar;
  }
  if(role==="user"){
    /* Edit — switch the bubble into a contenteditable, save on
       blur or Cmd/Ctrl+Enter. On save, call PATCH
       /api/messages/<id>?regenerate=true to re-run the model
       from this user turn (the assistant reply that followed
       is replaced by a fresh stream). */
    addBtn("edit","Edit message",
      '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/>',
      function(){
        editUserMessage(messageId,bar);
      }
    );
    /* Delete — soft-delete via DELETE /api/messages/<id> and
       remove from state.messages + the DOM. */
    addBtn("delete","Delete message",
      '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
      function(){
        deleteUserMessage(messageId,bar);
      }
    );
  }else{
    /* Share the conversation (not just this message) — reuses the
       existing share modal. */
    addBtn("share","Share conversation",
      '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>',
      function(){
        if(typeof openShareModal==="function")openShareModal();
      }
    );
    /* Regenerate — re-run the model. POST
       /api/messages/<id>/regenerate streams a fresh reply. */
    addBtn("regenerate","Regenerate response",
      '<path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v6h-6"/>',
      function(){
        regenerateAssistantMessage(messageId,bar);
      }
    );
    /* Thumbs up. Optimistic — flips the icon immediately,
       persists in /api/messages/<id>/feedback. */
    addBtn("thumbs-up","Helpful",
      '<path d="M7 10v11"/><path d="M15 5l-1 5h5a2 2 0 0 1 2 2l-2 7a2 2 0 0 1-2 2H7V10l4-7a2 2 0 0 1 3 2v3z"/>',
      function(ev){
        sendFeedback(messageId,"up",bar);
      }
    );
    addBtn("thumbs-down","Not helpful",
      '<path d="M17 14V3"/><path d="M9 19l1-5H5a2 2 0 0 1-2-2l2-7a2 2 0 0 1 2-2h10v11l-4 7a2 2 0 0 1-3-2v-3z"/>',
      function(){
        sendFeedback(messageId,"down",bar);
      }
    );
    /* Branch — fork the conversation from this message. Creates a
       new session whose history starts from the beginning of the
       current conversation and ends at the branched message. The
       current session is saved first; the new session opens in
       place so the user can explore a different direction without
       polluting the main thread. */
    addBtn("branch","Branch from here",
      '<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 8h8a2 2 0 0 1 2 2v4"/><path d="M6 16h8a2 2 0 0 0 2-2v-4"/><path d="M16 10l3 3-3 3"/>',
      function(){
        branchFromMessage(messageId);
      }
    );
  }
  return bar;
}

/* P1.1 — fire a POST /api/messages/<id>/feedback with the
   `copy` synthetic event. Backend may ignore unknown events. */
function fireFeedback(messageId,rating,categories){
  try{
    if(!messageId)return;
    apiFetch("/api/messages/"+encodeURIComponent(messageId)+"/feedback",{
      method:"PUT",
      body:{rating:rating,categories:categories||null},
      timeoutMs:8000
    }).catch(function(e){
      /* Telemetry failures are non-fatal. */
      console.debug("[msg-feedback] not sent");
    });
  }catch(_){}
}
function sendFeedback(messageId,rating,bar){
  fireFeedback(messageId,rating,null);
  /* Optimistic UI: highlight the chosen button, dim the other. */
  if(bar){
    var up=bar.querySelector('[data-action="thumbs-up"]');
    var down=bar.querySelector('[data-action="thumbs-down"]');
    if(up)up.classList.toggle("active",rating==="up");
    if(down)down.classList.toggle("active",rating==="down");
  }
  showToast(rating==="up"?"Thanks for the feedback":"Got it — we'll improve");
}
function editUserMessage(messageId,bar){
  var idx=findMessageIndex(messageId);
  if(idx<0){showToast("Message not found");return}
  var entry=state.messages[idx];
  var div=document.querySelector('[data-client-id="'+messageId+'"]');
  if(!div){return}
  var body=div.querySelector(".msg-body");
  if(!body){return}
  /* Swap the rendered body for a textarea, preserving width.
     Show plain text only — strip markdown formatting symbols so
     the user edits clean content without **bold**, *italic*, etc. */
  var ta=document.createElement("textarea");
  ta.className="msg-edit-area";
  ta.value=stripMarkdown(entry.rawText||"");
  body.innerHTML="";
  body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(ta.value.length,ta.value.length);
  function commit(){
    var next=ta.value.trim();
    if(!next||next===entry.rawText){
      /* No change — restore. */
      restoreMessageBody(entry,body);
      return;
    }
    /* P_edit — "edit a message" means "roll the conversation back
       to here and replay from this turn". Any assistant / user /
       system messages that followed this turn no longer make sense
       once the user turn is different, so we drop them from the
       authoritative state + the DOM before re-sending. */
    var editedText=next;
    entry.rawText=editedText;
    entry.html=null;
    restoreMessageBody(entry,body);
    rollbackMessagesAfter(messageId);
    /* PATCH /api/messages/<id>?regenerate=true&discardFollowing=true
       — server updates the user turn in place AND deletes any later
       assistant / user rows it had previously stored, so a hard
       reload after the edit doesn't surface stale replies. The
       local state is already trimmed; this keeps the server in
       sync. We don't wait for the PATCH before re-asking the model
       (the user wants to see the new answer immediately), but the
       promise is surfaced so a failure can show a toast. */
    var patchPromise=apiFetch("/api/messages/"+encodeURIComponent(messageId),{
      method:"PATCH",
      body:{content:editedText,regenerate:true,discardFollowing:true},
      timeoutMs:15000
    }).catch(function(e){
      console.log("[msg-edit] PATCH failed");
      showToast("Saved locally — will sync when back online");
    });
    /* Replay from the edited turn. askChatTurn writes a fresh
       streaming assistant bubble into the now-empty tail of the
       conversation. */
    if(typeof window.askChatTurn==="function"){
      try{
        /* If a stream is already in flight (e.g. user clicked edit
           while the previous reply was still arriving), abort it
           first so the new turn isn't racing the old one. */
        if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
        if(window._activeChatAbort){try{window._activeChatAbort("msg-edit")}catch(_){}}
        window.askChatTurn(editedText);
      }catch(e){/* msg-edit replay failed */}
    }
    /* Avoid leaving the patch promise dangling — reference it so
       linters don't drop it. */
    void patchPromise;
  }
  ta.addEventListener("blur",commit);
  ta.addEventListener("keydown",function(ev){
    if(ev.key==="Enter"&&(ev.metaKey||ev.ctrlKey)){
      ev.preventDefault();
      ta.blur();
    }else if(ev.key==="Escape"){
      ev.preventDefault();
      restoreMessageBody(entry,body);
    }
  });
}

/* P_edit — remove every message whose position in state.messages
   is greater than `userMessageId`. Removes both the state entry
   and its DOM node. Returns the number of messages dropped.
   Used by editUserMessage so the conversation "rewinds" to the
   edited turn before the new answer is generated. */
function rollbackMessagesAfter(userMessageId){
  var startIdx=findMessageIndex(userMessageId);
  if(startIdx<0)return 0;
  /* Snapshot ids first — splicing the array while iterating
     backwards is safe, but collecting the list up front keeps the
     DOM removal straightforward. */
  var toDrop=[];
  for(var i=startIdx+1;i<state.messages.length;i++){
    toDrop.push(state.messages[i]);
  }
  state.messages.splice(startIdx+1,toDrop.length);
  toDrop.forEach(function(m){
    if(!m||!m.clientId)return;
    var div=document.querySelector('[data-client-id="'+m.clientId+'"]');
    if(div&&div.parentNode)div.parentNode.removeChild(div);
  });
  return toDrop.length;
}
function deleteUserMessage(messageId,bar){
  var idx=findMessageIndex(messageId);
  if(idx<0)return;
  state.messages.splice(idx,1);
  var div=document.querySelector('[data-client-id="'+messageId+'"]');
  if(div)div.remove();
  apiFetch("/api/messages/"+encodeURIComponent(messageId),{
    method:"DELETE",
    timeoutMs:8000
  }).catch(function(e){
    console.log("[msg-delete] not synced");
  });
}
function regenerateAssistantMessage(messageId,bar){
  /* Hook into the existing streaming pipeline. The simplest
     path: clear this bubble and the user message that precedes
     it, then call askChatTurn on the user text. The full
     backend integration (POST /api/messages/<id>/regenerate)
     streams a fresh reply; once that endpoint is live, replace
     this body with a SseFactory.open call. */
  var assistantIdx=findMessageIndex(messageId);
  if(assistantIdx<0)return;
  var userIdx=assistantIdx-1;
  while(userIdx>=0&&state.messages[userIdx].role!=="user")userIdx--;
  var userEntry=userIdx>=0?state.messages[userIdx]:null;
  var userText=userEntry&&userEntry.rawText;
  if(!userText)return;
  /* Splice out the assistant bubble from state + DOM. */
  state.messages.splice(assistantIdx,1);
  var div=document.querySelector('[data-client-id="'+messageId+'"]');
  if(div)div.remove();
  if(typeof window.askChatTurn==="function"){
    try{window.askChatTurn(userText)}catch(e){/* regen failed */}
  }
}
/* Branch from a message — fork the conversation at this point.
   Saves the current session first, then creates a new session
   whose history only includes messages up to and including the
   branched message. The user can then continue in a different
   direction without affecting the original thread. */
function branchFromMessage(messageId){
  var branchIdx=findMessageIndex(messageId);
  if(branchIdx<0){showToast("Message not found");return}
  /* Save the current session first so the original branch is
     persisted. */
  saveCurrentSession();
  /* Build the new session state from messages up to this point.
     We copy the relevant fields from the current state. */
  var branchMessages=state.messages.slice(0,branchIdx+1).map(function(m){
    return {clientId:m.clientId,role:m.role,rawText:m.rawText,html:m.html,type:m.type,attachments:Array.isArray(m.attachments)?m.attachments.slice(0,20):[]};
  });
  var branchTopic=state.session.topic||state.topic||"";
  var branchTitle=(state.session.sessionTitle||branchTopic)+" (branch)";
  /* Reset the app to a clean state, then inject the branched
     messages. We set a flag so the new session starts with the
     branch context instead of a blank topic. */
  var _branchContext={messages:branchMessages,topic:branchTopic,title:branchTitle};
  window._pendingBranchContext=_branchContext;
  /* Navigate to a new session. resetApp clears state, then we
     re-hydrate from the branch context. */
  resetApp().then(function(){
    /* After resetApp completes, restore the branch context. */
    if(window._pendingBranchContext){
      var ctx=window._pendingBranchContext;
      window._pendingBranchContext=null;
      state.messages=ctx.messages;
      state.session.topic=ctx.topic;
      state.session.sessionTitle=ctx.title;
      /* Re-render the branched messages in the DOM. */
      var list=document.getElementById("msgList");
      if(list){
        list.innerHTML="";
        state.messages.forEach(function(msg){
          var div=document.createElement("div");
          div.className="msg "+msg.role;
          div.dataset.clientId=msg.clientId;
          var body=document.createElement("div");
          body.className="msg-body";
          body.innerHTML=msg.html||formatMsg(msg.rawText||"");
          div.appendChild(body);
          /* Attach toolbar for each message. */
          var toolbar=buildMessageToolbar({role:msg.role,entry:msg});
          if(toolbar)div.appendChild(toolbar);
          list.appendChild(div);
        });
      }
      /* Clear the greeting/topic setup so the user sees the
         branched conversation immediately. */
      var ts=document.getElementById("topicSetup");
      if(ts)ts.classList.add("hidden");
      var cv=document.getElementById("chatView");
      if(cv)cv.classList.remove("hidden");
      saveCurrentSession();
      showToast("Branched from previous conversation");
    }
  });
}
function restoreMessageBody(entry,body){
  if(entry.rawText){
    /* Re-render so the latest renderer (KaTeX, weak-model fixes,
       scaffold widgets) applies to every message — not the frozen
       html from when it was first saved. */
    var raw = entry.rawText;
    if(entry.role === "assistant" && /<(quiz|example|practice|definition|step|flashcard)\b/i.test(raw)){
      try { body.innerHTML = renderAssistantHTML(raw); try{processPendingMermaid()}catch(_){} try{processPendingViz()}catch(_){} try{processPendingVizActions()}catch(_){} return; } catch(_) {}
    }
    body.innerHTML = formatMsg(raw);
  }else if(entry.html){
    body.innerHTML = entry.html;
  }else{
    body.innerHTML = "";
  }
  try{processPendingMermaid()}catch(_){}
  try{processPendingViz()}catch(_){}
  try{processPendingVizActions()}catch(_){}
  try{wireCodeBlockHeaders(body)}catch(_){}
  try{wireMsgBodyImages(body)}catch(_){}
}
function findMessageIndex(messageId){
  return state.messages.findIndex(function(m){
    return m.clientId===messageId||m.id===messageId;
  });
}
function findFollowingAssistantId(userMessageId){
  var idx=findMessageIndex(userMessageId);
  if(idx<0)return null;
  for(var i=idx+1;i<state.messages.length;i++){
    if(state.messages[i].role==="assistant")return state.messages[i].clientId;
  }
  return null;
}
function showToast(msg){
  /* P1.1 — minimal toast for action confirmations. Distinct
     from the chatStatus pill and the share link toast. */
  try{
    var el=document.createElement("div");
    el.className="msg-toast";
    el.textContent=msg;
    document.body.appendChild(el);
    requestAnimationFrame(function(){el.classList.add("visible")});
    setTimeout(function(){
      el.classList.remove("visible");
      setTimeout(function(){if(el&&el.parentNode)el.parentNode.removeChild(el)},300);
    },1800);
  }catch(_){}
}

function addMessage(role,text,type,actions,attachmentsArg){
  /* User sending a message = explicitly wants to follow the conversation. */
  if(role==="user"){state._userScrolledAway=false;hideNewReplyPill()}
  /* P1.1 — push to the authoritative state.messages first; the DOM
     is just a downstream view. */
  var clientId="msg-"+generateId();
  /* Use renderAssistantHTML for assistant messages containing scaffold
     XML tags so <quiz>/<example>/<practice>/<definition>/<step>/<flashcard>
     are converted to interactive widgets instead of raw XML text. */
  var html;
  if(role==="assistant"&&/<(quiz|example|practice|definition|step|flashcard)\b/i.test(text)){
    try{html=renderAssistantHTML(text)}catch(_){html=formatMsg(text)}
  }else{
    html=formatMsg(text);
  }
  var modelInfo=null;
  if(role==="assistant"){
    var mp=getActiveProvider();
    if(mp)modelInfo={label:mp.label||mp.model||"",model:mp.model||""};
  }
  /* P_attachments — keep the attachments array on the in-memory entry
   * so saveCurrentSession round-trips it. We normalise to the same
   * shape persistMessageList() expects. */
  var atts = Array.isArray(attachmentsArg) ? attachmentsArg.slice(0, 20) : [];
  var entry={clientId:clientId,role:role,rawText:String(text||""),html:html,type:type||null,actions:actions||null,modelInfo:modelInfo,attachments:atts};
  state.messages.push(entry);

  var list=document.getElementById("msgList");
  var div=document.createElement("div");
  div.className="msg "+role;
  div.dataset.clientId=clientId;

  var body=document.createElement("div");
  body.className="msg-body";

  if(type==="suggest"){
    body.innerHTML=html;
    var optsDiv=document.createElement("div");
    optsDiv.className="quick-opts";
    actions.forEach(function(a){
      var btn=document.createElement("button");
      btn.className="quick-opt"+(a.primary?" primary":"");
      btn.textContent=a.text;
      btn.onclick=function(){handleQuickAction(a.action)};
      optsDiv.appendChild(btn);
    });
    body.appendChild(optsDiv);
  }else{
    body.innerHTML=html;
  }

  /* P_attachments — render the chip strip inside the user bubble so
   * the user sees what they attached. Image thumbnails use the
   * inlined dataUrl; text/PDF chips show the filename and (for
   * PDFs) the page count. Pure presentation; never replaces
   * body.innerHTML. */
  if(role==="user" && atts.length){
    var strip=document.createElement("div");
    strip.className="msg-attachments";
    atts.forEach(function(a){
      if(!a)return;
      var chip=document.createElement("div");
      chip.className="msg-attachment";
      if(a.kind==="image" && a.dataUrl){
        var img=document.createElement("img");
        img.className="msg-attachment-thumb";
        img.src=a.dataUrl;
        img.alt=a.name||"";
        chip.appendChild(img);
      }else{
        var icon=document.createElement("span");
        icon.className="msg-attachment-thumb";
        icon.style.display="inline-flex";
        icon.style.alignItems="center";
        icon.style.justifyContent="center";
        icon.style.borderRadius="12px";
        icon.style.background="hsl(var(--bg-300))";
        icon.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';
        chip.appendChild(icon);
      }
      var nm=document.createElement("span");
      nm.className="msg-attachment-name";
      nm.textContent=a.name||"file";
      chip.appendChild(nm);
      if(a.error){
        var err=document.createElement("span");
        err.className="msg-attachment-error";
        err.textContent="!";
        err.title=a.error;
        chip.appendChild(err);
      }
      strip.appendChild(chip);
    });
    body.appendChild(strip);
  }

  div.appendChild(body);
  /* P1.1 — inject the per-message action toolbar (Copy/Edit/
     Regenerate/Thumbs). Hover-revealed; the toolbar lives in a
     dedicated <div> so we never replace body.innerHTML (which
     would wipe the listeners). The action set is role-dependent:
       user       → copy / edit / delete
       assistant  → copy / regenerate / thumbs up / thumbs down
     `feedback` is optimistic; the server call is fire-and-forget
     and failures are logged. The OpenAPI spec at
     docs/api/openapi.yaml documents the message-actions endpoints
     that this UI will exercise. */
  var toolbar=buildMessageToolbar({role:role,entry:entry});
  if(toolbar)div.appendChild(toolbar);
  /* Show model info on assistant messages */
  if(role==="assistant"&&entry.modelInfo){
    var modelEl=document.createElement("div");
    modelEl.className="msg-model";
    modelEl.textContent=entry.modelInfo.label;
    div.appendChild(modelEl);
  }
  list.appendChild(div);
  try{processPendingMermaid()}catch(_){}
  try{processPendingViz()}catch(_){}
  try{processPendingVizActions()}catch(_){}
  try{wireCodeBlockHeaders(body)}catch(_){}
  try{wireMsgBodyImages(body)}catch(_){}

  var sc=scrollContainer();
  requestAnimationFrame(function(){sc.scrollTop=sc.scrollHeight});

  /* Update KB: if user is answering substantive questions, mark current node progress */
  if(role==="user"&&state.kbNodes[state.currentNode]&&state.kbNodes[state.currentNode].status==="blank"){
    state.kbNodes[state.currentNode].status="fuzzy";
    state.kbNodes[state.currentNode].questions++;
    updateKB();
  }
  /* Mirror this turn into the local memory cache so a hard refresh
     (or this-tab crash) still leaves the model with the real raw text. */
  if(role==="user"||role==="assistant"){
    appendLocalMemory(role,text);
  }
  /* Persist session to Recents */
  if(state.phase==="chat"||(state.topic&&state.kbNodes.length)){
    saveCurrentSession();
  }
  /* Update API/mock indicator badge */
  if(role==="assistant")updateChatStats();
}

/* P1.1 — DOM → state sync. If a DOM mutation happened outside of
   addMessage (e.g. mistake-redo rebuilt a widget), update the
   authoritative entry's html to match. The DOM remains the rendered
   view; state is what we save + send to the model. */
function syncMessageFromDom(clientId){
  if(!clientId)return;
  var idx=state.messages.findIndex(function(m){return m.clientId===clientId});
  if(idx<0)return;
  var el=document.querySelector('[data-client-id="'+clientId+'"] .msg-body');
  if(el){
    var clone=el.cloneNode(true);
    var opts=clone.querySelectorAll(".quick-opts");
    opts.forEach(function(o){o.remove()});
    state.messages[idx].html=clone.innerHTML;
  }
}


/* Tool-card restoration helpers live in src/ui/toolCards.js. Live
   tool orchestration is owned by src/chat/toolRuntime.js. */

var _chatStopMode=false;
var _chatStreaming=false;

/* looksLikeMetaInstruction + appendThinking extracted to
   src/ui/thinkingPill.js (Phase 1B split). Imported at the top. */





/* SEARCH_PROGRESS_LABELS, trSearchLabel, _formatEngineBreakdown,
   startSearchProgress extracted to src/ui/searchProgress.js
   (Phase 1C split). Imported at the top. */

/* beginAgentTextStream, appendRunFooter extracted to
   src/chat/agentStream.js (Phase 1D split). Imported at the top. */

function scrollMainToBottom(opts){
  opts=opts||{};
  if(!opts.force&&state._userScrolledAway)return;
  var sc=scrollContainer();
  if(!sc)return;
  var slack=64;
  var atBottom=sc.scrollHeight-sc.scrollTop-sc.clientHeight<=slack;
  if(opts.force||atBottom)sc.scrollTop=sc.scrollHeight;
}

function scheduleScrollMainToBottom(opts){
  requestAnimationFrame(function(){
    scrollMainToBottom(opts);
    requestAnimationFrame(function(){
      scrollMainToBottom(opts);
    });
  });
}

/* Add a minimal header bar atop .msg-body <pre> blocks with
   a language label and an expand-to-fullscreen button.
   Skips blocks that already have a header (re-entrant safe). */
function wireCodeBlockHeaders(body){
  if(!body)return;
  var pres=body.querySelectorAll(".msg-body pre,.think-content pre");
  for(var pi=0;pi<pres.length;pi++){
    var pre=pres[pi];
    if(pre.previousElementSibling&&pre.previousElementSibling.matches(".code-block-header"))continue;
    if(pre.closest&&(pre.closest(".exec-artifact")||pre.closest(".agent-tool-card")||pre.closest(".viz")))continue;
    var code=pre.querySelector("code");
    if(!code)continue;
    var lang="";
    var cls=(code.className||"");
    var lm=cls.match(/language-(\w+)/);
    if(lm)lang=lm[1];
    else{
      var txt=(code.textContent||"").trimStart();
      if(/^</.test(txt))lang="html";
      else if(/^{/.test(txt))lang="json";
      else if(/^from\s|^import\s/.test(txt))lang="python";
      else if(/^function\s|^const\s|^let\s|^var\s/.test(txt))lang="js";
    }
    var header=document.createElement("div");
    header.className="code-block-header";
    var langLabel=document.createElement("span");
    langLabel.className="code-block-header-lang";
    langLabel.textContent=lang||"code";
    header.appendChild(langLabel);
    var expandBtn=document.createElement("button");
    expandBtn.type="button";
    expandBtn.className="code-block-expand";
    expandBtn.setAttribute("aria-label","Expand code");
    expandBtn.title="Expand";
    expandBtn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><path d="M9 21 3 21 3 15"/><path d="M21 3 14 10"/><path d="M3 21 10 14"/></svg>';
    expandBtn.addEventListener("click",function(ev){
      ev.stopPropagation();
      var rawCode=code.textContent||"";
      var codeHtml='<pre style="margin:0;border:0;background:transparent;padding:18px 20px;font-family:var(--font-mono);font-size:13px;line-height:1.6;color:hsl(var(--text-200));white-space:pre-wrap;word-break:break-word;max-height:calc(100vh - 120px);overflow:auto"><code>'+esc(rawCode)+'</code></pre>';
      if(typeof window.__vizOpenModalRaw==="function"){
        window.__vizOpenModalRaw(codeHtml,(lang||"code")+" source");
      }
    });
    header.appendChild(expandBtn);
    pre.parentNode.insertBefore(header,pre);
  }
}

/* Wire .msg-body img (outside artifacts) to open the viz-modal
   fullscreen lightbox on click. Artifact images already have
   their own lightbox handler in toolCards.js. */
function wireMsgBodyImages(body){
  if(!body)return;
  var imgs=body.querySelectorAll(".msg-body img:not(.exec-artifact-image)");
  for(var ii=0;ii<imgs.length;ii++){
    var img=imgs[ii];
    if(img.dataset.lightboxWired)continue;
    img.dataset.lightboxWired="1";
    img.addEventListener("click",function(ev){
      ev.preventDefault();
      var src=this.getAttribute("src")||"";
      if(!src)return;
      if(typeof window.__vizOpenModalRaw!=="function")return;
      var html='<div class="img-lightbox"><img src="'+esc(src)+'" alt="" style="max-width:100%;max-height:calc(100vh - 140px);object-fit:contain;border-radius:6px"/></div>';
      window.__vizOpenModalRaw(html,"Image");
    });
  }
}



/* Morph the send button into a red Stop button during streaming,
   or restore it to the normal send arrow when idle. */
var _stopIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>';
var _sendIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
function setChatStopState(active){
  var btn=document.getElementById("sendBtn");
  if(!btn)return;
  if(active){
    btn.classList.add("chat-stop");
    btn.innerHTML=_stopIcon;
    btn.dataset.stop="1";
  }else{
    btn.classList.remove("chat-stop");
    btn.innerHTML=_sendIcon;
    btn.dataset.stop="0";
  }
}
window.setChatStopState=setChatStopState;
/* Wrapper for the send/stop button click. When a stream is active,
   clicking stops it; otherwise it sends the message. */
window.handleSendClick=function(){
  var btn=document.getElementById("sendBtn");
  if(btn&&btn.dataset.stop==="1"){
    if(window._activeChatCtl){
      window._activeChatCtl.abort();
    }
  }else{
    submitChatMessage();
  }
};

/* Add a streaming assistant message. Returns a controller object:
   { append(delta), finish(), abort() }.
   - append(delta): renders content on the next microtask with try/catch
     fallback, so partial markdown/math never kills the stream.
   - finish(): final render, then saves session & updates stats.
   - abort(): removes the message from the list (used on fallback to mock
     or upstream error). */



function addStreamingMessage(opts){
  opts=opts||{};
  var onRetry=opts.onRetry;
  var onThinking=opts.onThinking;
  /* P1.4 — a new bubble starts with the user "at bottom" again.
     Suppress the pill for this stream and let the scroll listener
     re-enable it only if the user moves away during streaming. */
  state._userScrolledAway=false;
  hideNewReplyPill();
  var list=document.getElementById("msgList");
  var div=document.createElement("div");
  div.className="msg assistant";
  var body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  list.appendChild(div);
  /* P1.1/P1.2 — push a placeholder into the authoritative
     state.messages list. While streaming, `rawText` is updated on
     every delta and `html` is set to null. At finish() time we
     do a single formatMsg pass and write `html`. The DOM bubble
     is the rendered view, not the source. */
  var clientId="msg-"+generateId();
  div.dataset.clientId=clientId;
  var msgIdx=state.messages.push({
    clientId:clientId,
    role:"assistant",
    rawText:"",
    html:null,
    type:"streaming",
    actions:null
  })-1;
  var full="";
  /* P_reasoning-persist — accumulate reasoning_content deltas so we
     can save them to state.messages at finish() and include them in
     the session-save payload. Without this, chain-of-thought text
     from DeepSeek / QwQ / o1-style models is rendered in the DOM
     during streaming but lost on reload. */
  var fullReasoning="";
  var finished=false;
  /* P_session-stream-dispose — when resetApp() or loadSession() aborts
     an in-flight stream, already-queued delta chunks from the response
     body can still reach append()/finish() callbacks via stream.js's
     ReadableStream reader (AbortController only aborts the fetch, not
     chunks already buffered in the reader's queue). Without this flag,
     those stale callbacks would write `state.messages[msgIdx].rawText =
     full` into whatever object now sits at the same numeric index in
     the cleared/replaced array — polluting the new session's slot
     ("会话串台": AI answers based on the previous session's content).

     abort() and finish() flip this to true; every public entry point
     and every `state.messages[msgIdx]` write site checks it before
     touching state. _disposed is sticky (no resurrection) so even if
     abort races with a late finish callback, the writes stay inert. */
  var _disposed=false;
  /* P_session-cross-talk — capture the session identity at the moment
     this streaming bubble is created (synchronously, before any await).
     All async callbacks (onDelta / onThinking / doRender / finish /
     recordToolUse ...) hold this closure; if the user switches sessions
     mid-stream, state.session.currentSessionId flips to the new session
     while the old stream's reader is still draining its SSE buffer.
     _disposed blocks most late writes, but abort() and the natural
     [DONE] frame can race: a finish() that already passed its _disposed
     check, or an abort()'s splice, can still land on state.messages[msgIdx]
     — and msgIdx is a numeric index that the new session may now reuse
     for a different message. stillOwnsSlot() verifies BOTH that we're
     still on the same session AND that the slot at msgIdx still holds
     OUR placeholder (by clientId), so no cross-session pollution is
     possible even in the race window. */
  var ownerSessionId=state.session.currentSessionId||null;
  function stillOwnsSlot(){
    if(_disposed||finished)return false;
    if(state.session.currentSessionId!==ownerSessionId)return false;
    if(msgIdx<0||!state.messages[msgIdx])return false;
    if(state.messages[msgIdx].clientId!==clientId)return false;
    return true;
  }
  var pendingRender=null;
  var pendingRenderTimer=null;
  /* Adaptive perceptual cadence: the first screen can paint at ~20fps,
     while very long answers progressively back off to protect input and
     scrolling. A timer sleeps until the next useful paint rather than
     waking the main thread on every animation frame. */
  var _lastRenderAt=0;
  function cancelScheduledRender(){
    if(pendingRender){cancelAnimationFrame(pendingRender);pendingRender=null}
    if(pendingRenderTimer){clearTimeout(pendingRenderTimer);pendingRenderTimer=null}
  }
  /* P-H4 — skip an entire render pass when no new characters have
     arrived since the last one (e.g. the trailing rAF the throttle
     schedules after the stream goes idle). */
  var _lastParsedLen=-1;
  /* P-H4 — stable-prefix cache for the no-think branch. Everything up to
     the last blank line is treated as settled markdown blocks: parsed
     once and cached here, so each frame only re-parses the unfinished
     tail block instead of the whole accumulated response. */
  var _stablePrefixText=null;
  var _stablePrefixHtml="";
  /* Thinking pill (for chat-mode reasoning_content). Lazily created on
     the first onThinking(delta) callback so we don't add a pill for
     models that don't produce reasoning. Hidden when the user has
     toggled "Show AI thinking" off. */
  var thinkCtl=null;
  /* P_tool_in_think — cached container for tool cards inside
     the think-block. Lazily created by _ensureToolContainer(). */
  var _toolCardContainer=null;
  function _toolRunList(host){
    var group=host.querySelector('.tool-run-group');
    if(!group){
      group=document.createElement('section');
      group.className='tool-run-group';
      group.innerHTML='<button type="button" class="tool-run-summary" aria-expanded="false">'+
        '<span class="tool-run-summary-dot" aria-hidden="true"></span>'+
        '<span class="tool-run-summary-label">Working</span>'+
        '<span class="tool-run-summary-meta"></span>'+
        '<span class="tool-run-summary-chev" aria-hidden="true">⌄</span>'+
        '</button><div class="tool-run-list" hidden></div>';
      var trigger=group.querySelector('.tool-run-summary');
      var list=group.querySelector('.tool-run-list');
      trigger.addEventListener('click',function(){
        var open=group.classList.toggle('open');
        trigger.setAttribute('aria-expanded',open?'true':'false');
        list.hidden=!open;
      });
      host.appendChild(group);
    }
    return group.querySelector('.tool-run-list');
  }
  function _ensureToolContainer(){
    if(_toolCardContainer&&_toolCardContainer.isConnected)return _toolCardContainer;
    /* Try to reuse an existing think-block's .think-tools slot.
       When both thinking content and tool cards arrive, they share
       the same collapsible block — the tool cards go in .think-tools
       and the reasoning text goes in .think-content. */
    var tb=body.querySelector('.think-block');
    if(tb){
      _toolCardContainer=tb.querySelector('.think-tools');
      if(!_toolCardContainer){
        _toolCardContainer=document.createElement("div");
        _toolCardContainer.className="think-tools";
        var tc=tb.querySelector('.think-content');
        if(tc)tc.after(_toolCardContainer);
        else tb.appendChild(_toolCardContainer);
      }
      _toolCardContainer=_toolRunList(_toolCardContainer);
      return _toolCardContainer;
    }
    /* No think-block yet (thinking content hasn't arrived, or won't
       arrive at all — e.g. tool-only responses). Place tool cards
       directly in the bubble body without a wrapper. They'll be
       preserved by the finish() path which saves and re-inserts
       orphaned .agent-tool-card elements. */
    _toolCardContainer=body.querySelector('.think-tools');
    if(!_toolCardContainer){
      _toolCardContainer=document.createElement("div");
      _toolCardContainer.className="think-tools";
      body.appendChild(_toolCardContainer);
    }
    _toolCardContainer=_toolRunList(_toolCardContainer);
    return _toolCardContainer;
  }
  function ensureThinkCtl(){
    if(thinkCtl)return thinkCtl;
    /* P0.8 — The placeholder ("正在思考…") is no longer needed once
       real reasoning_content arrives. Remove it here so the user
       sees only the thinking pill ("正在思考"), not both. */
    try{placeholder.remove()}catch(_){}
    if(!window.thinkingOn){
      /* P_thinking-off-indicator — even when "Show AI thinking" is
         off, show a minimal "正在思考…" badge so the user knows the
         AI is reasoning. When thinking finishes it switches to
         "思考过程" (static, no spinner). */
      var _dot=document.createElement("span");
      _dot.className="thinking-dot thinking-off-indicator";
      _dot.style.cssText="display:inline-flex;align-items:center;gap:6px;padding:6px 10px;margin:2px 0;border-radius:6px;background:hsl(var(--bg-200)/0.3);font-size:calc(12px * var(--app-font-scale,1));color:hsl(var(--text-400))";
      _dot.innerHTML='<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>'+esc(t("think.thinking"));
      body.appendChild(_dot);
      thinkCtl={
        append:function(){},
        finalize:function(){
          try{
            _dot.innerHTML=esc(t("think.title"));
            _dot.style.background="transparent";
            _dot.style.padding="2px 10px";
          }catch(_){}
        },
        remove:function(){
          try{if(_dot.parentNode)_dot.parentNode.removeChild(_dot)}catch(_){}
        }
      };
      return thinkCtl;
    }
    thinkCtl=appendThinking("");
    /* If appendThinking returned null (DOM not ready), fall back to no-op. */
    if(!thinkCtl)thinkCtl={append:function(){},finalize:function(){},remove:function(){}};
    return thinkCtl;
  }
  /* Unique ID for the retry button so we can attach a click handler after
     setting innerHTML (innerHTML wipes previous listeners). */
  var retryBtnId="retry-"+Math.random().toString(36).slice(2,10);
  /* Snapshot the search results at message START so a background
     refresh that lands mid-stream doesn't change which sources the
     user sees under this bubble. */
  var sourcesSnapshot=Array.isArray(state.searchResults)?state.searchResults.slice():[];
  var hasSources=sourcesSnapshot.length>0;
  /* Show a "thinking" placeholder until the first delta arrives.
     FIRST_DELTA_TIMEOUT_MS is set to the same value as the stream
     timeout so there is effectively one timeout — the model can take
     up to 120s to start generating without a false expiry. The
     data-mode attribute lets CSS style the chat-mode placeholder
     more prominently (chat mode has no KB / diagnostic to give
     the user context that work is happening).

     P_paint-race — the placeholder used to be installed by setting
     body.innerHTML = "<span class=thinking-dot>...</span>" in the
     same task that called append(). On a fast path (cached response,
     healthy proxy, hot upstream) the first onDelta could fire before
     the browser had a chance to commit a paint, in which case the
     placeholder text never actually appeared on screen — the user
     would see only the streamed content, looking exactly like "no
     streaming, no thinking pill, just the answer".

     Switching to a real child node created via createElement gives
     us a guaranteed paint opportunity for the placeholder before
     any future mutation can race with it. The 5-second elapsed tick
     now mutates only the placeholder's text node (not the whole
     body's innerHTML), which has the side benefit of NOT clobbering
     the .think-block pill if a reasoning model emits
     reasoning_content before the first text delta. The 120 s
     timeout swaps placeholder for the error block via replaceChild
     so other children survive. */
  var FIRST_DELTA_TIMEOUT_MS=120000;
  /* A compact status row avoids the large height collapse caused by the
     old five-line skeleton when the first real token arrived. */
  var placeholder=document.createElement("div");
  placeholder.className="thinking-placeholder";
  var placeholderRow=document.createElement("span");
  placeholderRow.className="thinking-dot";
  placeholderRow.setAttribute("data-mode",appMode);
  var placeholderRing=document.createElement("span");
  placeholderRing.className="thinking-ring thinking-ring-sm";
  var placeholderText=document.createTextNode(appMode==="chat"?t("think.thinking"):t("common.generating"));
  placeholderRow.appendChild(placeholderRing);
  placeholderRow.appendChild(placeholderText);
  placeholder.appendChild(placeholderRow);
  body.appendChild(placeholder);
  function setPlaceholderText(label){
    /* Fast text-node rewrite — no DOM rebuild, no parse, no
       layout reflow beyond the badge's own intrinsic box. Safe to
       call many times per second. */
    placeholderText.data=label;
  }
  /* Morph the send button into a red Stop so the user can abort
     the stream. setChatStopState(false) on finish/abort. */
  _chatStreaming=true;
  try{setChatStopState(true)}catch(_){}
  var thinkStarted=Date.now();
  /* Elapsed-second counter so the user sees progress while waiting. */
  var _elapsedTick=null;
  _elapsedTick=setInterval(function(){
    if(finished||!firstDelta)return;
    var sec=Math.round((Date.now()-thinkStarted)/1000);
    setPlaceholderText((appMode==="chat"?t("think.thinking"):t("common.generating"))+" "+sec+"s");
  },5000);
  var firstDeltaTimer=setTimeout(function(){
    if(finished||!firstDelta)return;
    if(_elapsedTick)clearInterval(_elapsedTick);
    finished=true;
    if(toolRuntime)toolRuntime.dispose();
    cancelScheduledRender();
    state.lastCallError="No response for "+Math.round(FIRST_DELTA_TIMEOUT_MS/1000)+"s";
    /* Cancel the underlying stream so it doesn't keep running in the
       background holding resources for the full timeout window. */
    try{if(window._activeChatAbort)window._activeChatAbort("first-delta-timeout")}catch(_){}
    /* P_paint-race — swap placeholder for the error block via
       replaceChild so other children (in practice the reasoning
       pill if reasoning_content arrived first) survive. */
    var err=document.createElement("div");
    err.className="msg-error";
    var errText=document.createElement("span");
    errText.className="msg-error-text";
    errText.textContent=t("common.noResponseTimeout").replace("{sec}",Math.round(FIRST_DELTA_TIMEOUT_MS/1000));
    var errBtn=document.createElement("button");
    errBtn.type="button";
    errBtn.className="msg-retry-btn";
    errBtn.id=retryBtnId;
    errBtn.textContent=t("common.retry");
    err.appendChild(errText);
    err.appendChild(errBtn);
    if(placeholder.parentNode===body){
      body.replaceChild(err,placeholder);
    }else{
      body.appendChild(err);
    }
    var btn=body.querySelector("#"+retryBtnId);
    if(btn){
      btn.addEventListener("click",function(){
        /* P_no_retry_loading — fire onRetry() directly so the new
           streaming bubble appears immediately. Previously we showed
           a transient "Retrying…" pill for 120ms before invoking
           onRetry, which the user found noisy and confusing — the
           pill sat there loading, then a new conversation bubble
           appeared below, looking like two separate events. The
           new bubble's own thinking state is enough indication. */
        if(typeof onRetry==="function"){try{onRetry()}catch(e){/* retry handler threw */}}
      });
    }
    updateChatStats();
  },FIRST_DELTA_TIMEOUT_MS);

  function highlightClosedCode(){
    /* highlight.js — only on <pre><code> blocks that have BOTH opening
       and closing fences. Unclosed blocks are skipped so we don't
       mis-parse mid-stream. */
    if(typeof hljs==="undefined")return;
    var blocks=body.querySelectorAll("pre code");
    for(var i=0;i<blocks.length;i++){
      var code=blocks[i];
      if(code.dataset.hljsDone)continue;
      var raw=code.textContent||"";
      /* Heuristic: an unclosed fence still ends with "```" on its own line
         OR ends mid-word. Skip in that case. */
      if(/```\s*$/.test(raw))continue;
      try{hljs.highlightElement(code);code.dataset.hljsDone="1"}catch(_){}
    }
  }

  /* P0.7 — streaming state for inline <think>…</think> blocks.
     Reasoning models stream the chain-of-thought in-band with the
     final answer. We want to route the in-think content into a
     collapsible <details> as soon as <think> arrives (even before
     it closes), and keep routing content into the right section
     until </think> is seen. The block is collapsed by default;
     the summary pulses "Thinking…" while the model is still
     reasoning, and switches to a static "Thinking" label once
     the think is closed. The final answer after </think> is
     rendered as a regular text node. The cursor is always at the
     end of the body so the user sees it after the active section. */
  var thinkState={
    /* -1 until a <think> has been seen in `full`. */
    startIdx:-1,
    /* index just past the closing </think>, or -1 if still open. */
    endIdx:-1,
    /* DOM nodes for the three sections; null until laid out. */
    beforeNode:null,
    details:null,
    summary:null,
    thinkDiv:null,
    afterNode:null,
    cursorNode:null,
    /* Cached last think content so we can skip the formatMsg
       pass (which is expensive — marked + KaTeX) when nothing
       has changed. */
    lastRenderedThink:null,
    /* P1.4 — same idea for the pre-think and post-think slices.
       The renderer (formatMsgProgressive) is cheap but the
       string-compare lets us skip the innerHTML write entirely
       on frames where the slice didn't grow — which is most
       frames after <think> closes, since only the think content
       keeps streaming. */
    lastRenderedBefore:null,
    lastRenderedAfter:null
  };

  function ensureThinkStructure(){
    if(thinkState.beforeNode)return;
    /* P_tool_preserve — save tool cards before body.innerHTML=""
       wipes them, so tools called before the <think> marker are
       preserved inside the new think-block structure. */
    var _savedTools=body.querySelector('.think-tools');
    if(_savedTools)_savedTools.parentNode.removeChild(_savedTools);
    body.innerHTML="";
    /* P1.4 — pre-think text is a block-level container that holds
       rendered markdown HTML, NOT a text node. The previous design
       used document.createTextNode and wrote the raw slice via
       nodeValue, which made "# Title" / "- item" / code fences
       appear as raw symbols mid-stream, and HTML's whitespace
       handling collapsed every "\n" to a single space — so the
       user saw one run-on blob of unparsed markdown. */
    thinkState.beforeNode=document.createElement("div");
    thinkState.beforeNode.className="think-prefix";
    body.appendChild(thinkState.beforeNode);

    var det=document.createElement("details");
    det.className="think-block think-block-streaming";
    /* P_thinking-collapsed-default — think-block is folded by default
     * on this path too (matches appendThinking() above). window.thinkingOn
     * still controls whether reasoning content is generated at all
     * (system prompt suffix in buildSocraticPrompt, see thinkingSuffix()),
     * but no longer auto-expands the UI block. The user clicks the
     * summary to expand if they want to read the live reasoning stream. */
    det.open=false;
    var sum=document.createElement("summary");
    sum.className="think-summary think-summary-streaming";
    var _streamingLabel=(typeof window!=="undefined"&&window.t)?window.t("think.thinking"):"Thinking…";
    sum.innerHTML='<span class="thinking-ring thinking-ring-sm" aria-hidden="true"></span>'+
      '<span class="think-summary-label">'+esc(_streamingLabel)+'</span>'+
      '<span class="think-summary-chevron" aria-hidden="true"></span>';
    det.appendChild(sum);

    var td=document.createElement("div");
    td.className="think-content";
    det.appendChild(td);
    body.appendChild(det);

    /* P1.4 — post-think text gets the same block-level container
       treatment; empty until </think> arrives, then populated by
       doRender via formatMsgProgressive. */
    thinkState.afterNode=document.createElement("div");
    thinkState.afterNode.className="think-suffix";
    body.appendChild(thinkState.afterNode);

    var cur=document.createElement("span");
    cur.className="stream-cursor";
    cur.textContent="▍";
    body.appendChild(cur);
    thinkState.cursorNode=cur;

    thinkState.details=det;
    thinkState.summary=sum;
    thinkState.thinkDiv=td;
    thinkState.cursorNode=cur;
    /* Re-insert saved tool cards after the think-content so they
       appear inside the collapsible thinking block. */
    if(_savedTools)td.parentNode.appendChild(_savedTools);
    /* Clear the cached tool container — the think-block was rebuilt
       and _toolCardContainer points to the old disconnected element. */
    _toolCardContainer=null;
    /* The old single-text-node + cursor are no longer in use. */
    streamContent=null;
    cursor=null;
  }

function teardownThinkStructure(){
    /* Roll back to the simple [text][cursor] layout. Called when
       the user / 答案 boundary was a false alarm (e.g. the
       model wrote the literal text 答案 somewhere) and the
       marker actually never closes — in that case we collapse
       the think block and stream the raw text as a normal
       answer. Currently we do not roll back automatically;
       finish() always re-runs formatMsg which is the source of
       truth. */
    body.innerHTML="";
    streamContent=document.createElement("div");
    streamContent.className="stream-content";
    streamContent.innerHTML=formatMsgProgressive(full);
    try{processPendingMermaid()}catch(_){}
    try{processPendingViz()}catch(_){}
    try{processPendingVizActions()}catch(_){}
    body.appendChild(streamContent);
    cursor=document.createElement("span");
    cursor.className="stream-cursor";
    cursor.textContent="▍";
    /* Cursor is a child of streamContent (see note in the other
       appendChild(cursor) callsites). */
    streamContent.appendChild(cursor);
    thinkState.beforeNode=null;
    thinkState.details=null;
    thinkState.summary=null;
    thinkState.thinkDiv=null;
    thinkState.afterNode=null;
    thinkState.cursorNode=null;
    thinkState.startIdx=-1;
    thinkState.endIdx=-1;
    thinkState.lastRenderedThink=null;
    thinkState.lastRenderedBefore=null;
    thinkState.lastRenderedAfter=null;
  }

  function doRender(){
    pendingRender=null;
    /* P_session-stream-dispose — rAF guard. cancelAnimationFrame in
       abort()/finish() usually wins, but a doRender body may already
       be running on this very tick. Bail before touching state.messages. */
    if(finished||_disposed)return;

    _lastRenderAt=performance.now();

    /* Measure pinning BEFORE the DOM grows. Measuring afterwards made a
       single tall Markdown/code update look like a manual scroll-away,
       so streaming abruptly stopped following the answer. */
    /* Keep using the message list even on the exact frame where it grows
       from non-scrollable to scrollable; scrollContainer() otherwise
       switches surfaces at that boundary and loses the bottom anchor. */
    var _streamScroller=list||scrollContainer();
    var _wasPinned=!state._userScrolledAway&&!!_streamScroller&&
      (_streamScroller.scrollHeight-_streamScroller.scrollTop-_streamScroller.clientHeight<=96);

    /* P0 — chat-template artifact strip. The upstream LLM (Beagle,
     * DeepSeek, MiniMax M2, etc.) can leak <|im_start|>...<|im_end|>,
     * [INST]...[/INST], <s>, <|endoftext|>, etc. into the streamed
     * tokens. The final formatMsg pass strips them, but mid-stream
     * the user would see them as raw text in the live bubble. Strip
     * once per render so all downstream slicing (think-block
     * detection, beforeText/thinkContent/afterText, the no-think
     * text node) operates on the cleaned version. The raw `full`
     * is still kept in state.messages[msgIdx].rawText for save /
     * history so a later formatMsg can re-process it. */
    var displayFull=stripChatArtifacts(full);

    /* P-H4 — nothing new since the last render; skip the whole parse. */
    if(displayFull.length===_lastParsedLen)return;

    /* Locate <think> / </think> in the accumulated stream. The
       startIdx is only set the first time we see <think> so the
       text-before-think doesn't get re-laid out on every delta
       (which would wipe the user's cursor position). */
    if(thinkState.startIdx===-1){
      var s=displayFull.indexOf("<think>");
      if(s!==-1)thinkState.startIdx=s;
    }
    if(thinkState.startIdx!==-1&&thinkState.endIdx===-1){
      var e=displayFull.indexOf("</think>",thinkState.startIdx);
      if(e!==-1)thinkState.endIdx=e+"</think>".length;
    }

    if(thinkState.startIdx===-1){
      /* P_arch streaming-render — run formatMsgProgressive on every
         rAF tick so the user sees real-time markdown + math rendering
         as the model streams (not waiting until finish()).

         Why formatMsgProgressive and not formatMsg?
           - formatMsgProgressive handles UNCLOSED $$...$$ and ```...```
             with subtle placeholders ("…"), so a half-arrived math
             formula never leaks raw LaTeX source into the live bubble.
           - formatMsg assumes closed pairs; on partial input it falls
             back to escaping and the user sees "$$\frac{" raw.
           - preprocessMarkdownForStreaming is the streaming-safe
             preprocessor: idempotent on repeated calls (the
             stray-$ escape, lone-$ promote, and unclosed-fence
             append rules are skipped — those break on re-entry).

         Why no chunked boundaries?
           - The previous chunked-fade split on `\n\n` or sentence
             ends and called formatMsg on each slice. A chunk that
             landed inside an open `\[...\]` rendered a half-complete
             slice as broken KaTeX. Without chunking, formatMsgProgressive
             handles the partial state itself; nothing splits mid-token.
           - The user's complaint was "渲染失败" — broken rendering.
             The streaming-safe renderer preserves the typewriter feel
             (text appears char-by-char as deltas arrive) while making
             sure markdown and math render correctly in real time. */
      if(!streamContent){
        /* Save the thinking pill AND any tool cards before clearing —
           body.innerHTML="" destroys all children. We re-insert them
           after setting up the streaming DOM so the pill and tool
           cards survive when the first text delta arrives (including
           the case where the LLM called a tool before producing any
           text — the tool cards were added during SSE parsing and
           must not be wiped). */
        var savedPill=body.querySelector('.think-block');
        var savedToolContainer=body.querySelector('.think-tools');
        var savedToolCardArr=[];
        /* P_inline-artifact-survival — inline artifacts (matplotlib PNGs,
           native visualization cards, CSV links, etc.) mounted on the
           message body are critical rich-media UX. Without saving them,
           body.innerHTML="" reset would silently drop them when the
           first text delta arrives after a tool result, producing
           the "image appeared once then vanished" pattern. */
        var savedArtifacts=[];
        var artifactNodes=body.querySelectorAll('.exec-artifact,.visualization-card');
        for(var ai=0;ai<artifactNodes.length;ai++){
          savedArtifacts.push(artifactNodes[ai]);
          artifactNodes[ai].parentNode.removeChild(artifactNodes[ai]);
        }
        /* If cards live inside the think-block (the normal case now),
           saving the pill already captures them. Only extract when
           there's no pill to host them. */
        if(!savedPill){
          /* Prefer saving the whole .think-tools container so the
             wrapper and its children survive intact. */
          if(savedToolContainer){
            savedToolContainer.parentNode.removeChild(savedToolContainer);
            savedToolCardArr.push(savedToolContainer);
          }else{
            /* No wrapper — save individual cards. */
            var savedToolCards=body.querySelectorAll('.agent-tool-card');
            for(var sci=0;sci<savedToolCards.length;sci++){
              savedToolCardArr.push(savedToolCards[sci]);
              savedToolCards[sci].parentNode.removeChild(savedToolCards[sci]);
            }
          }
        }
        try{placeholder.remove()}catch(_){}
        body.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        body.appendChild(streamContent);
        settledContent=document.createElement("div");
        settledContent.className="stream-settled-content";
        liveContent=document.createElement("div");
        liveContent.className="stream-live-content";
        streamContent.appendChild(settledContent);
        streamContent.appendChild(liveContent);
        cursor=document.createElement("span");
        cursor.className="stream-cursor";
        cursor.textContent="▍";
        /* Keep the cursor outside the frequently replaced live tail. */
        streamContent.appendChild(cursor);
        if(savedPill)body.insertBefore(savedPill,body.firstChild);
        for(var sci2=0;sci2<savedToolCardArr.length;sci2++){
          body.appendChild(savedToolCardArr[sci2]);
        }
        /* Re-append saved artifacts AFTER streamContent + tool cards so
           they appear in the order: pill → text → tool cards → images.
           Visually this matches "tool produced this artifact" — the
           image lands at the bottom of the message, which is where
           users expect generated plots to appear. */
        for(var ai2=0;ai2<savedArtifacts.length;ai2++){
          body.appendChild(savedArtifacts[ai2]);
        }
      }
      /* P-H4 — stable-prefix incremental render. Split displayFull at the
         last blank line: the part before it is settled markdown blocks
         (parsed once, cached in _stablePrefixHtml) and only the trailing
         unfinished block is re-parsed each frame. This turns the old
         O(n²) "re-parse the whole accumulated text every frame" into an
         O(tail) pass. The split is only trusted when the prefix has
         balanced code fences / math delimiters (see splitStreamingMarkdown);
         otherwise we fall back to a full parse for this frame. finish()
         always re-runs the full formatMsg, so any streaming-time seam is
         corrected once the message completes. */
      var rendered;
      var _parts=splitStreamingMarkdown(displayFull);
      var _prefix=_parts.prefix;
      if(_prefix){
        if(_prefix!==_stablePrefixText){
          _stablePrefixHtml=formatMsgProgressive(_prefix);
          _stablePrefixText=_prefix;
          settledContent.innerHTML=_stablePrefixHtml;
        }
        rendered=_parts.tail?formatMsgProgressive(_parts.tail):"";
      }else{
        rendered=formatMsgProgressive(displayFull);
        if(_stablePrefixText!==null){
          _stablePrefixText=null;
          _stablePrefixHtml="";
          settledContent.innerHTML="";
        }
      }
      if(liveContent.dataset.lastRendered!==rendered){
        liveContent.innerHTML=rendered;
        liveContent.dataset.lastRendered=rendered;
        /* Wire viz/mermaid iframes that were just injected by the
           streaming renderer so the loading spinner is hidden and
           the card transitions to the "ready" state. */
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
      }
    }else{
      /* Think block is in play. Lay out the three-section
         structure once, then update the text nodes and the
         think content incrementally. */
      ensureThinkStructure();
      var beforeText=displayFull.slice(0,thinkState.startIdx);
      var thinkClosed=thinkState.endIdx!==-1;
      var thinkContent=thinkClosed
        ?displayFull.slice(thinkState.startIdx+"<think>".length,thinkState.endIdx-"</think>".length)
        :displayFull.slice(thinkState.startIdx+"<think>".length);
      var afterText=thinkClosed?displayFull.slice(thinkState.endIdx):"";
      /* P_arch streaming-render — pre-think and post-think slices
         use formatMsgProgressive (streaming-safe) for real-time
         rendering. formatMsgProgressive handles partial $$ and ```
         with placeholders, so a half-arrived formula doesn't leak
         raw LaTeX into the live bubble. */
      if(thinkState.beforeNode.dataset.lastRendered!==beforeText){
        thinkState.beforeNode.innerHTML=beforeText?formatMsgProgressive(beforeText):"";
        thinkState.beforeNode.dataset.lastRendered=beforeText;
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
      }
      if(thinkState.afterNode.dataset.lastRendered!==afterText){
        thinkState.afterNode.innerHTML=afterText?formatMsgProgressive(afterText):"";
        thinkState.afterNode.dataset.lastRendered=afterText;
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
      }
      /* When </think> has been seen, swap the summary to a
         static label and drop the pulse — the model is done
         thinking. */
      if(thinkClosed&&thinkState.summary.innerHTML.indexOf("thinking-ring")!==-1){
        var _doneLabel=(typeof window!=="undefined"&&window.t)?window.t("think.title"):"Thought";
        thinkState.summary.innerHTML='<span class="think-summary-label">'+esc(_doneLabel)+'</span><span class="think-summary-chevron" aria-hidden="true"></span>';
      }
      /* Re-render the think content only if it changed. The
         recursive formatMsg call is the same code path used by
         the final render at finish(), so the live and final
         look match exactly. */
      if(thinkState.lastRenderedThink!==thinkContent){
        if(thinkContent){
          try{
            thinkState.thinkDiv.innerHTML=formatMsg(thinkContent.replace(/<\/?think>/g,""));
            try{processPendingMermaid()}catch(_){}
            try{processPendingViz()}catch(_){}
            try{processPendingVizActions()}catch(_){}
            if(typeof hljs!=="undefined"){
              thinkState.thinkDiv.querySelectorAll("pre code").forEach(function(c){
                if(c.dataset&&c.dataset.hljsDone)return;
                if(/```\s*$/.test(c.textContent||""))return;
                try{hljs.highlightElement(c);c.dataset.hljsDone="1"}catch(_){}
              });
            }
          }catch(e){
            thinkState.thinkDiv.textContent=thinkContent;
          }
        }else{
          thinkState.thinkDiv.innerHTML="";
        }
        thinkState.lastRenderedThink=thinkContent;
      }
    }

    /* P-H4 — remember the length we just rendered so an idle trailing
       frame with no new characters short-circuits at the top. */
    _lastParsedLen=displayFull.length;

    /* P1.1 — mirror rawText to state.messages so extractHistory
       and saveCurrentSession see the latest text. html is left
       null until finish() so the saved session never holds a
       half-rendered string.
       P_session-cross-talk — stillOwnsSlot() guards the write so a
       late doRender (rAF queued before abort() but firing after a
       session switch) can't smear the old stream's `full` into the
       new session's messages[msgIdx]. */
    if(stillOwnsSlot()){
      state.messages[msgIdx].rawText=full;
    }
    if(_wasPinned&&_streamScroller){
      _streamScroller.scrollTop=_streamScroller.scrollHeight;
    }else if(state._userScrolledAway){
      showNewReplyPill();
    }
  }
  var streamContent=null;
  var settledContent=null;
  var liveContent=null;
  var cursor=null;
  /* P_arch typewriter — no chunked bookkeeping needed. The streaming
     surface is a single text node; new deltas are appended by
     overwriting streamContent.textContent on each rAF frame. */
  function scheduleRender(){
    if(pendingRender||pendingRenderTimer||finished)return;
    var elapsed=performance.now()-_lastRenderAt;
    var wait=Math.max(0,getStreamRenderInterval(full.length)-elapsed);
    if(wait<=1){
      pendingRender=requestAnimationFrame(function(){doRender()});
      return;
    }
    pendingRenderTimer=setTimeout(function(){
      pendingRenderTimer=null;
      if(finished||_disposed)return;
      pendingRender=requestAnimationFrame(function(){doRender()});
    },wait);
  }

  /* First delta renders immediately so the user sees content right away */
  var firstDelta=true;

  /* Phase 3 — search-progress log attached to this bubble. The chat
   * path (line 2707) creates a startSearchProgress() instance up front
   * (so the log can prepend to the bubble's body even before the first
   * delta) and then drives it via the prependSearchStep / finalize
   * methods below. We keep a single closure ref so the methods can
   * detach, finalize, and feed it without re-querying the DOM. */
  var _searchProgress = null;

  var toolRuntime=createToolRuntime({
    body:body,
    stillOwnsSlot:stillOwnsSlot,
    getMessage:function(){
      return msgIdx>=0?(state.messages[msgIdx]||null):null;
    },
    ensureToolContainer:_ensureToolContainer,
    onToolActivity:function(){
      /* A tool call counts as first visible activity, so retire the
         waiting placeholder before execution progress begins. */
      if(firstDelta&&!finished){
        firstDelta=false;
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        pendingRender=requestAnimationFrame(function(){doRender()});
      }
    }
  });
  var ret={
    recordToolUse:toolRuntime.recordToolUse,
    recordToolProgress:toolRuntime.recordToolProgress,
    recordToolCallDelta:toolRuntime.recordToolCallDelta,
    recordExecutionStart:toolRuntime.recordExecutionStart,
    recordToolResult:toolRuntime.recordToolResult,
    append:function(delta){
      /* P_session-stream-dispose — primary entry-point guard. The
         stream.js reader keeps draining already-buffered SSE chunks
         for one or two ticks after AbortController.abort(); without
         this check, late append() callbacks would push `full += delta`
         into a stream that no longer owns this `msgIdx` slot, then
         write the polluted text to state.messages[msgIdx].rawText
         (which now belongs to the new session).
         P_session-cross-talk — stillOwnsSlot() supersedes the bare
         _disposed check: it also returns false when the session has
         switched (state.session.currentSessionId !== ownerSessionId)
         even if abort() hasn't propagated yet, closing the race
         window where a delta lands between session-switch and abort. */
      if(!stillOwnsSlot())return;
      var wasFirst=firstDelta;
      if(wasFirst){
        firstDelta=false;
        /* First delta arrived — stop the watchdog and elapsed counter. */
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
      }
      full+=delta;
      if(wasFirst){
        /* Schedule on rAF so the msg element is definitely in the DOM */
        cancelScheduledRender();
        pendingRender=requestAnimationFrame(function(){doRender()});
      }else{
        scheduleRender();
      }
    },
    /* Append reasoning deltas (DeepSeek R1 / QwQ style
       reasoning_content). Routed to a thinking pill (rendered with
       Markdown/LaTeX) and only when the user has thinking mode on. */
    appendThinking:function(delta){
      /* P_session-stream-dispose — same guard as append().
         P_session-cross-talk — stillOwnsSlot() closes the race window. */
      if(!stillOwnsSlot())return;
      if(typeof delta==="string")fullReasoning+=delta;
      try{ensureThinkCtl().append(delta||"")}catch(_){}
    },
    finalizeThinking:function(){
      if(thinkCtl&&typeof thinkCtl.finalize==="function"){
        try{thinkCtl.finalize()}catch(_){}
      }
    },
    finish:function(){
      /* P_session-stream-dispose — once an abort() has fired, never
         let a late natural-finish callback (the LLM may flush a
         final "data: [DONE]" right before ac.abort propagates) write
         to state.messages. Set _disposed=true on natural completion
         too, so any queued microtask racing the close can't sneak in
         a stale write between finish()'s reads of `full` and the
         actual state.messages[msgIdx].html assignment. */
      if(_disposed)return;
      /* P_session-cross-talk — verify slot ownership BEFORE flipping
         _disposed/finished. If the user switched sessions while the
         stream was wrapping up, the natural [DONE] frame would
         otherwise: (1) write the old session's `full` into the new
         session's state.messages[msgIdx].html, (2) call
         saveCurrentSession() which persists the old answer under the
         NEW session's id, and (3) appendLocalMemory("assistant", full)
         polluting the new session's memory. Abandon silently instead.
         We don't call abort() here because loadSession already called
         it; we just refuse to commit the stale write. */
      if(state.session.currentSessionId!==ownerSessionId
         || msgIdx<0
         || !state.messages[msgIdx]
         || state.messages[msgIdx].clientId!==clientId){
        finished=true;
        _disposed=true;
        /* Still tear down timers / SSE so nothing leaks. */
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        toolRuntime.dispose();
        return;
      }
      if(finished)return;
      finished=true;
      _disposed=true;
      toolRuntime.dispose();
      clearTimeout(firstDeltaTimer);
      if(_elapsedTick)clearInterval(_elapsedTick);
      cancelScheduledRender();
      /* Cancel any active typewriter animation on tool cards so the
         setTimeout chain doesn't keep updating detached DOM nodes. */
      var _twCards=div.querySelectorAll('.agent-tool-card');
      for(var _twi=0;_twi<_twCards.length;_twi++){
        if(typeof _twCards[_twi]._cancelTypewriter==='function'){
          try{_twCards[_twi]._cancelTypewriter()}catch(_){}
        }
      }
      /* P1.2 — single formatMsg pass at finish time, write to
         state.messages[i].html, and replace the streaming nodes
         with the final innerHTML (which includes the cursor removal).
         This is the only place marked + KaTeX run for the FINAL render; doRender above
         now also uses marked + KaTeX via formatMsgProgressive for live streaming. */
      var total=full.length;
      var firstChunkDuration=Date.now()-(thinkStarted||Date.now());
      var _finishScroller=list||scrollContainer();
      var _finishWasPinned=!state._userScrolledAway&&!!_finishScroller&&
        (_finishScroller.scrollHeight-_finishScroller.scrollTop-_finishScroller.clientHeight<=96);
      /* Skip the char-by-char animation when the response contains
       * a <think> marker. The animation writes formatted HTML into
       * a text node, so mid-stream the user would see literal
       * `<details class="think-block">` tags flicker by. The final
       * formatMsg pass renders properly, but going straight there
       * is cleaner. */
      var hasThinkMarker=full.indexOf("<think>")!==-1;
      /* P_chunked-fade — the chunk-by-chunk fade-in during streaming
         is already the "animation". Running typeTick on top of it
         would replay the same content with a second typewriter pass
         on top of the chunks the user just watched appear, which
         looks stuttery. Skip typeTick and go straight to the final
         formatMsg pass. */
      var needsAnimation=false;
      if(needsAnimation){
        /* P1.3 — character-by-character animation driven by a
           single rAF loop with a 16ms budget per frame. Replaces
           the recursive setTimeout(typeTick, 10) which could
           build a long task queue. */
        var savedPill3=body.querySelector('.think-block');
        body.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        cursor=document.createElement("span");
        cursor.className="stream-cursor";
        body.appendChild(streamContent);
        if(savedPill3)body.insertBefore(savedPill3,body.firstChild);
        streamContent.appendChild(cursor);
        var pos=0;
        var CHARS_PER_TICK=4;        /* P1.3 — wider slice per rAF */
        var MAX_MS_PER_FRAME=16;
        var maxTicks=Math.ceil(total/CHARS_PER_TICK);
        var ticks=0;
        var lastTime=0;
        function typeTick(now){
          try{
            if(pos>=total||ticks>=maxTicks){
              /* Final render: renderAssistantHTML parses <quiz>/<example>/<practice>
                 scaffold blocks (replaces them with slot divs), runs formatMsg,
                 then asynchronously mounts interactive widgets in setTimeout(0).
                 Without this, the raw <quiz>…</quiz> XML was either dumped as
                 escaped text or stripped by markdown — the user saw no
                 interactive widgets in live tutor mode. */
              var finalHtml;
              try{finalHtml=renderAssistantHTML(full)}catch(e){
                console.log("[typeTick] render error");
                finalHtml="<p>"+esc(full)+"</p>";
              }
              body.innerHTML=finalHtml;
              if(msgIdx>=0&&state.messages[msgIdx]){
                state.messages[msgIdx].html=finalHtml;
                state.messages[msgIdx].type="assistant";
                /* P_reasoning-persist — preserve chain-of-thought. */
                state.messages[msgIdx].reasoningContent=fullReasoning||null;
              }
              finishAfterRender();
              return;
            }
            var budget=lastTime?(now-lastTime):MAX_MS_PER_FRAME;
            lastTime=now;
            var step=Math.max(1,Math.floor((budget/MAX_MS_PER_FRAME)*CHARS_PER_TICK));
            pos=Math.min(total,pos+step);
            /* P1.3 — incremental slice; use formatTickSlice to
               preserve markdown boundaries. */
            streamContent.innerHTML=formatTickSlice(full,pos);
            if(msgIdx>=0&&state.messages[msgIdx]){
              state.messages[msgIdx].rawText=full.slice(0,pos);
            }
            ticks++;
            /* Scroll along only if the user hasn't scrolled away. */
            if(!state._userScrolledAway){
              var sc=scrollContainer();
              if(sc&&sc.scrollHeight-sc.scrollTop-sc.clientHeight<=64){
                sc.scrollTop=sc.scrollHeight;
              }
            }
            requestAnimationFrame(typeTick);
          }catch(e){
            console.log("[typeTick] render error");
            try{
              var fb=renderAssistantHTML(full);
              body.innerHTML=fb;
              if(msgIdx>=0&&state.messages[msgIdx]){state.messages[msgIdx].html=fb}
            }catch(_){
              body.innerHTML="<p>"+esc(full)+"</p>";
            }
            finishAfterRender();
          }
        }
        requestAnimationFrame(typeTick);
        return; /* finishAfterRender runs from inside typeTick */
      }
      try{
        /* P_arch typewriter — at finish, the in-progress raw text is
           sitting in streamContent as a single text node. Replace the
           bubble body with a single renderAssistantHTML pass on the full
           text. renderAssistantHTML internally calls formatMsg, then
           injects <quiz>/<example>/<practice> scaffold slots, then
           asynchronously mounts the interactive widgets in setTimeout(0).
           Without this, no scaffold widgets ever rendered in live mode. */
        var finalHtml;
        try{
          finalHtml=renderAssistantHTML(full);
        }catch(e){
          console.log("[finish] render error");
          finalHtml="<p>"+esc(full)+"</p>";
        }
        /* P_stop-spinner — finalize the thinking pill BEFORE saving
           it so the spinner stops spinning once the response is
           complete. Without this, the pill is re-inserted with its
           streaming summary (thinking-ring) and keeps animating. */
        if(thinkCtl&&typeof thinkCtl.finalize==="function"){
          try{thinkCtl.finalize()}catch(_){}
        }
        /* P_tool_card_preserve — save BOTH the thinking pill and
           any tool cards we appended via recordToolUse, then
           re-insert them after the formatted HTML. Cards now live
           inside the pill, so saving the pill is sufficient — only
           extract individual cards when there's no pill to host them. */
        var savedPill=body.querySelector('.think-block');
        var savedToolGroup=body.querySelector('.tool-run-group');
        var savedToolCards=body.querySelectorAll('.agent-tool-card');
        var savedToolCardArr=[];
        /* P_inline-artifact-survival-finish — the final render at
           finish() rewrites body's innerHTML. Tool cards are saved
           and re-mounted above, but inline artifacts (plots and native
           visualization cards) need the same treatment or they silently
           vanish at the streaming→final boundary. Save them here
           too so the image is visible in the finalized bubble. */
        var savedArtifacts=[];
        var artifactNodes=body.querySelectorAll('.exec-artifact,.visualization-card');
        for(var ai=0;ai<artifactNodes.length;ai++){
          savedArtifacts.push(artifactNodes[ai]);
          artifactNodes[ai].parentNode.removeChild(artifactNodes[ai]);
        }
        if(!savedPill&&!savedToolGroup){
          for(var sci=0;sci<savedToolCards.length;sci++){
            savedToolCardArr.push(savedToolCards[sci]);
            savedToolCards[sci].parentNode.removeChild(savedToolCards[sci]);
          }
        }
        body.innerHTML=finalHtml;
        if(savedPill)body.insertBefore(savedPill,body.firstChild);
        else if(savedToolGroup)body.appendChild(savedToolGroup);
        for(var sci2=0;sci2<savedToolCardArr.length;sci2++){
          body.appendChild(savedToolCardArr[sci2]);
        }
        /* Re-mount saved artifacts AFTER the final HTML + tool cards so
           they sit at the bottom of the bubble (matching the streaming
           layout). */
        for(var ai2=0;ai2<savedArtifacts.length;ai2++){
          body.appendChild(savedArtifacts[ai2]);
        }
        if(cursor){cursor.remove();cursor=null}
        if(msgIdx>=0&&state.messages[msgIdx]){
          state.messages[msgIdx].html=finalHtml;
          state.messages[msgIdx].rawText=full;
          state.messages[msgIdx].type="assistant";
          /* P_reasoning-persist — preserve chain-of-thought text so it
             survives session save/load. */
          state.messages[msgIdx].reasoningContent=fullReasoning||null;
        }
      }catch(e){
        console.log("[finish] formatMsg error");
        var fb="<p>"+esc(full)+"</p>";
        var savedPill2=body.querySelector('.think-block');
        var savedToolGroup2=body.querySelector('.tool-run-group');
        var savedTC2=body.querySelectorAll('.agent-tool-card');
        var savedTCArr2=[];
        if(!savedPill2&&!savedToolGroup2){
          for(var sci3=0;sci3<savedTC2.length;sci3++){
            savedTCArr2.push(savedTC2[sci3]);
            savedTC2[sci3].parentNode.removeChild(savedTC2[sci3]);
          }
        }
        body.innerHTML=fb;
        if(savedPill2)body.insertBefore(savedPill2,body.firstChild);
        else if(savedToolGroup2)body.appendChild(savedToolGroup2);
        for(var sci4=0;sci4<savedTCArr2.length;sci4++){
          body.appendChild(savedTCArr2[sci4]);
        }
        if(msgIdx>=0&&state.messages[msgIdx]){
          state.messages[msgIdx].html=fb;
          state.messages[msgIdx].reasoningContent=fullReasoning||null;
        }
      }
      finishAfterRender();

      function finishAfterRender(){
        try{processPendingMermaid()}catch(_){}
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
        try{wireCodeBlockHeaders(body)}catch(_){}
        try{wireMsgBodyImages(body)}catch(_){}
        /* Source Card. The mid-stream snapshot is kept so a fresh
           background fetch that lands while the model is still streaming
           can't silently swap the cards underneath the user. But the
           snapshot is captured at addStreamingMessage() time — for the
           FIRST message of a session (or after any state reset) the
           background fetchWebContext hasn't completed yet, so
           state.searchResults is still [] and the snapshot is empty
           even though the fetch will populate it a beat later. Falling
           back to the live state at finish-time is safe because we
           only render once here: after this card is appended, no later
           render path will mutate it. */
        var liveResults=Array.isArray(state.searchResults)?state.searchResults:[];
        var sourcesToRender=hasSources?sourcesSnapshot:liveResults;
        if(sourcesToRender.length){
          var card=renderSourcesCard(sourcesToRender);
          if(card)div.appendChild(card);
        }
        /* Streaming AI bubbles skip addMessage(), so attach the
           toolbar here. Guarded against duplicate stacking. */
        if(!div.querySelector(".msg-toolbar")&&msgIdx>=0&&state.messages[msgIdx]){
          var toolbar=buildMessageToolbar({role:"assistant",entry:state.messages[msgIdx]});
          if(toolbar)div.appendChild(toolbar);
        }
        try{appendLocalMemory("assistant",full)}catch(_){}
        requestAnimationFrame(function(){
          if(_finishWasPinned&&_finishScroller){
            _finishScroller.scrollTop=_finishScroller.scrollHeight;
          }
        });
        if(state.phase==="chat"||(state.topic&&state.kbNodes.length)){
          saveCurrentSession();
        }
        updateChatStats();
        /* P0.0 — only reset the global streaming flags if THIS
         * controller is still the active one. When the user
         * interrupts a stream with a new message, a fresh
         * addStreamingMessage has already flipped _chatStreaming
         * back to true; the old controller's teardown must not
         * clobber that, or the next "Stop" click would think no
         * stream is running. */
        if(window._activeChatCtl===ret){
          _chatStreaming=false;
          try{setChatStopState(false)}catch(_){}
          /* P1.4 — clearing the global abort handle on natural finish
             keeps the closure (and DOM refs) eligible for GC. */
          window._activeChatCtl=null;
        }
      }
    },
    abort:function(){
      /* P_session-stream-dispose — flip the sticky flag FIRST so any
         in-flight append()/recordToolUse()/finish() callbacks that
         are already scheduled in the microtask queue (the stream.js
         reader keeps draining the SSE buffer for one or two ticks
         after AbortController.abort()) will short-circuit on their
         own _disposed checks and never touch state.messages. */
      if(_disposed)return;
      if(finished)return;
      finished=true;
      _disposed=true;
      clearTimeout(firstDeltaTimer);
      if(_elapsedTick)clearInterval(_elapsedTick);
      cancelScheduledRender();
      /* Restore the send button — but only if no new stream has
       * already taken over (the new wrapper cancels the OLD
       * controller when the user sends a follow-up, and the new
       * addStreamingMessage has already raised _chatStreaming). */
      if(window._activeChatCtl===ret){
        _chatStreaming=false;
        try{setChatStopState(false)}catch(_){}
      }
      /* Stop the independent execution stream and any queued delta
         frame before this message can lose ownership of its slot. */
      toolRuntime.cancel();
      /* Clean up incomplete placeholder message from state.messages
       * to prevent saving empty/partial AI responses to the database.
       * Only remove if still in streaming state with no content.
       * P_session-cross-talk — verify the slot still holds OUR placeholder
       * (by clientId) before splicing. If the user switched sessions,
       * state.messages was replaced and msgIdx now points at the new
       * session's message — splicing here would delete the new session's
       * message. The abandoned placeholder is harmless (it's not in the
       * new session's array), so just skip the splice. */
      if(msgIdx>=0&&state.messages[msgIdx]&&state.messages[msgIdx].clientId===clientId){
        if(state.messages[msgIdx].type==="streaming"&&!state.messages[msgIdx].rawText){
          state.messages.splice(msgIdx,1);
        }
      }
      /* Cancel any active typewriter animation on tool cards */
      var _twCardsAb=div.querySelectorAll('.agent-tool-card');
      for(var _twAb=0;_twAb<_twCardsAb.length;_twAb++){
        if(typeof _twCardsAb[_twAb]._cancelTypewriter==='function'){
          try{_twCardsAb[_twAb]._cancelTypewriter()}catch(_){}
        }
      }
      /* Keep partial content if the stream produced any text —
         otherwise remove the placeholder bubble entirely. */
      if(state.messages[msgIdx]&&state.messages[msgIdx].type==="streaming"&&state.messages[msgIdx].rawText){
        state.messages[msgIdx].type="text";
        state.messages[msgIdx].state="done";
        try{formatChatMsg(msgIdx,div,!0)}catch(_){}
      }else{
        requestAnimationFrame(function(){div.remove()});
      }
    },
    /* Show an inline error state with a retry button so the user can
       recover from a transient failure (network, 429, 5xx) without
       retyping. onRetry() is invoked when the button is clicked. */
      replaceWithError:function(errMsg,onRetry){
        if(finished)return;
        finished=true;
        toolRuntime.cancel();
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
        cancelScheduledRender();
        /* Cancel typewriter animations before replacing body content */
        var _twErr=div.querySelectorAll('.agent-tool-card');
        for(var _te=0;_te<_twErr.length;_te++){
          if(typeof _twErr[_te]._cancelTypewriter==='function'){try{_twErr[_te]._cancelTypewriter()}catch(_){}}
        }
       try{
         body.innerHTML=
           '<div class="msg-error">'+
             '<span class="msg-error-text">'+(errMsg||'Generation failed')+'</span>'+
              '<button type="button" class="msg-retry-btn" id="'+retryBtnId+'">Retry</button>'+
            '</div>';
          var btn=body.querySelector("#"+retryBtnId);
          if(btn&&typeof onRetry==="function"){
            btn.addEventListener("click",function(){
              /* P_no_retry_loading — fire onRetry() immediately so the
                 new streaming bubble appears in one step. The previous
                 implementation flashed a "Retrying…" pill for 120ms
                 before invoking the handler, but the user found it
                 noisy and confusing — the pill just sat there loading
                 while a new conversation bubble appeared below. The
                 new bubble's own thinking state is enough. */
              try{
                var ret=onRetry();
                if(ret&&typeof ret.then==="function"){
                  ret.catch(function(e){/* retry async handler failed */});
                }
              }catch(e){/* retry handler threw */}
           });
         }
       }catch(e){
         body.innerHTML='<p>'+esc(errMsg||'Generation failed')+'</p>';
       }
       updateChatStats();
       /* Restore the send button — even error paths end the stream.
        * Guarded on the active controller so a new stream that
        * supersedes this one is not clobbered. */
       if(window._activeChatCtl===ret){
         _chatStreaming=false;
         try{setChatStopState(false)}catch(_){}
       }
     },
    /* Phase 3 — attach a search-progress controller to this bubble.
     * `progress` is the object returned by startSearchProgress(). The
     * log was already prepended to `body`; we just stash the ref so
     * prependSearchStep / finalizeSearchProgress can drive it. */
    attachSearchProgress:function(progress){
      _searchProgress=progress;
    },
    /* Phase 3 — feed one fetchWebContext step event to the search
     * log attached to this bubble. No-op if none attached. */
    prependSearchStep:function(event){
      try{if(_searchProgress)_searchProgress.onStep(event)}catch(_){}
    },
    /* Phase 3 — feed a synthetic step (used by webSearchWithRetry for
     * judge + retry messages). */
    prependSearchStepText:function(text,kind){
      try{if(_searchProgress)_searchProgress.appendStep(text,kind||'running')}catch(_){}
    },
    /* Phase 3 — finalize the search log with a summary (or 'err' /
     * 'warn'). Safe to call multiple times — only the first sticks. */
    finalizeSearchProgress:function(summary){
      try{if(_searchProgress){_searchProgress.finalize(summary||{});_searchProgress=null}}catch(_){}
    },
    /* Phase 3 — detach the search log entirely (used on cancel / when
     * the user sends a new message mid-search). */
    removeSearchProgress:function(){
      try{if(_searchProgress){_searchProgress.remove();_searchProgress=null}}catch(_){}
    }
  };
  /* Publish this controller on window so a subsequent turn in the same
     chat can call _activeChatCtl.abort() to evict the "正在思考…"
     bubble immediately instead of leaving it pinned until its 45 s
     first-delta timer fires. The next addStreamingMessage() call will
     overwrite _activeChatCtl with its own controller. */
  window._activeChatCtl=ret;
  return ret;
}

/* Take the raw text the assistant produced and convert it into the
   final message-body HTML, including stripping <quiz>, <example>, and
   <practice> blocks from the prose and injecting interactive/static
   widgets in their place.

   IMPORTANT: we embed the empty slot divs directly into the markdown
   source (not as __PLACEHOLDER__ text) because GitHub-Flavored Markdown
   interprets __...__ as <strong>...</strong>, which would silently
   destroy our placeholders. Empty <div> blocks are passed through by
   marked unchanged. */
function renderAssistantHTML(rawText){
  var text=rawText||"";
  /* Chat mode: strip the citation apparatus so the Source Card (added
     at finish()) is the SOLE source view. Two passes:

       (a) a trailing "Sources: …" block — the model often generates
           its own markdown list of cited URLs ([1] title (url) …) at
           the end of its answer. Matched to end-of-text ([\s\S]*$),
           so it never accidentally removes a mid-prose mention; it
           runs unconditionally in chat mode so the block is gone
           regardless of whether the Source Card actually fires
           (e.g. when state.searchResults is still empty at render
           time but a Source Card is appended afterwards — see the
           finishAfterRender fallback).

       (b) inline [N] markers like "[1]", "[1, 2]", "[1][2]" — only
           when state.searchResults has results, so we don't chew
           through legit numeric references in a chat turn that has
           no sources to point at. */
  if(appMode==="chat"){
    text=text.replace(
      /(?:^|\n)\s*(?:Sources?|参考来源|来源|参考资料|参考文献|引用|参考)\s*[:：][\s\S]*$/i,
      ""
    );
  }
  if(appMode==="chat" && Array.isArray(state.searchResults) && state.searchResults.length){
    text=text.replace(/\[\s*\d+(?:\s*,\s*\d+)*\s*\]/g,"");
  }
  /* All placeholder lists — collected during the scan, mounted at the end. */
  var quizPH=[];
  var examplePH=[];
  var practicePH=[];
  var definitionPH=[];
  var stepPH=[];
  var flashcardPH=[];
  var derivationPH=[];
  var proofPH=[];
  var theoremPH=[];
  var keyPointPH=[];

  /* Pass 1: <quiz>…</quiz> → interactive multiple-choice widget.
     One-question-per-turn rule: only the FIRST <quiz> block becomes a
     tappable widget; any extra <quiz> blocks the model emitted are
     stripped to escaped plain text so they read as prose instead of
     trying to mount a second widget. */
  var quizRe=/<quiz\b[^>]*>([\s\S]*?)<\/quiz>/gi;
  var m,qi=0,quizCount=0;
  while((m=quizRe.exec(text))!==null){
    var raw=m[0];
    if(quizCount>=1){
      /* Convert to escaped plain text — show the question stem, not
         the answer options, so the user can read what the model said
         without seeing answer choices hanging in the air. */
      var parsedLate=parseQuizInner(m[1]);
      var replacement=parsedLate&&parsedLate.q
        ? esc(parsedLate.q)
        : esc(raw);
      text=text.slice(0,m.index)+"\n\n"+replacement+"\n\n"+text.slice(quizRe.lastIndex);
      quizRe.lastIndex=m.index+replacement.length+4;
      continue;
    }
    var parsed=parseQuizInner(m[1]);
    if(!parsed){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(m[1])+'</pre></div>';
      text=text.slice(0,m.index)+"\n\n"+fbHtml+"\n\n"+text.slice(quizRe.lastIndex);
      quizRe.lastIndex=m.index+fbHtml.length+4;
      continue;
    }
    var id="quiz-"+(++qi)+"-"+Math.random().toString(36).slice(2,7);
    var slot='<div class="quiz-slot" data-quiz-id="'+id+'"></div>';
    text=text.slice(0,m.index)+"\n\n"+slot+"\n\n"+text.slice(quizRe.lastIndex);
    quizRe.lastIndex=m.index+slot.length+4;
    quizPH.push({id:id,parsed:parsed});
    quizCount++;
  }

  /* Pass 2: <example>…</example> → worked-example card with hidden solution
     behind a reveal button (added in change 3). */
  var exampleRe=/<example\b[^>]*>([\s\S]*?)<\/example>/gi;
  var em,ei=0;
  while((em=exampleRe.exec(text))!==null){
    var parsedEx=parseExampleInner(em[1]);
    if(!parsedEx){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(em[1])+'</pre></div>';
      text=text.slice(0,em.index)+"\n\n"+fbHtml+"\n\n"+text.slice(exampleRe.lastIndex);
      exampleRe.lastIndex=em.index+fbHtml.length+4;
      continue;
    }
    var eId="ex-"+(++ei)+"-"+Math.random().toString(36).slice(2,7);
    var eSlot='<div class="example-slot" data-example-id="'+eId+'"></div>';
    text=text.slice(0,em.index)+"\n\n"+eSlot+"\n\n"+text.slice(exampleRe.lastIndex);
    exampleRe.lastIndex=em.index+eSlot.length+4;
    examplePH.push({id:eId,parsed:parsedEx});
  }

  /* Pass 3: <practice>…</practice> → interactive practice card with a
     textarea + Submit button (added in change 2). The optional
     `correct="…"` attribute on the opening tag enables self-grading
     and a Reveal-answer button.
     One-question-per-turn rule: only the FIRST <practice> block becomes
     a tappable widget; extras are stripped to escaped plain text. */
  var practiceRe=/<practice\b([^>]*)>([\s\S]*?)<\/practice>/gi;
  var pm,pi=0,practiceCount=0;
  while((pm=practiceRe.exec(text))!==null){
    var pAttrs=pm[1]||"";
    var pCorrectM=pAttrs.match(/correct="([^"]+)"/i);
    if(practiceCount>=1){
      var parsedLate=parsePracticeInner(pm[2]);
      var replacement=parsedLate&&parsedLate.problem
        ? esc(parsedLate.problem)
        : esc(pm[0]);
      text=text.slice(0,pm.index)+"\n\n"+replacement+"\n\n"+text.slice(practiceRe.lastIndex);
      practiceRe.lastIndex=pm.index+replacement.length+4;
      continue;
    }
    var parsedPr=parsePracticeInner(pm[2]);
    if(!parsedPr){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(pm[2])+'</pre></div>';
      text=text.slice(0,pm.index)+"\n\n"+fbHtml+"\n\n"+text.slice(practiceRe.lastIndex);
      practiceRe.lastIndex=pm.index+fbHtml.length+4;
      continue;
    }
    if(pCorrectM){parsedPr.correct=pCorrectM[1]}
    var pId="pr-"+(++pi)+"-"+Math.random().toString(36).slice(2,7);
    var pSlot='<div class="practice-slot" data-practice-id="'+pId+'"></div>';
    text=text.slice(0,pm.index)+"\n\n"+pSlot+"\n\n"+text.slice(practiceRe.lastIndex);
    practiceRe.lastIndex=pm.index+pSlot.length+4;
    practicePH.push({id:pId,parsed:parsedPr});
    practiceCount++;
  }

  /* Pass 4: <mistake>…</mistake> → record to mistake book, strip from prose. */
  var mistakeRe=/<mistake\b([^>]*)>([\s\S]*?)<\/mistake>/gi;
  var mm;
  while((mm=mistakeRe.exec(text))!==null){
    var attrs=mm[1]||"";
    var typeM=attrs.match(/type="([^"]+)"/i);
    var correctM=attrs.match(/correct="([^"]+)"/i);
    var mistakeType=typeM?typeM[1]:"practice";
    var correctVal=correctM?correctM[1]:"";
    if(mistakeType==="practice"&&correctVal){
      recordMistake({
        type:"practice",
        q:"Practice problem (auto-captured)",
        options:[],
        correct:correctVal,
        userAnswer:null,
        judgedAnswer:correctVal
      });
    }
    text=text.slice(0,mm.index)+text.slice(mistakeRe.lastIndex);
    mistakeRe.lastIndex=mm.index;
  }

  /* Pass 5: <definition>…</definition> → vocabulary card. Sibling
     scaffolds (definition / step / flashcard) added in change 4. */
  var definitionRe=/<definition\b[^>]*>([\s\S]*?)<\/definition>/gi;
  var dm,di=0;
  while((dm=definitionRe.exec(text))!==null){
    var parsedDef=parseDefinitionInner(dm[1]);
    if(!parsedDef){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(dm[1])+'</pre></div>';
      text=text.slice(0,dm.index)+"\n\n"+fbHtml+"\n\n"+text.slice(definitionRe.lastIndex);
      definitionRe.lastIndex=dm.index+fbHtml.length+4;
      continue;
    }
    var dId="def-"+(++di)+"-"+Math.random().toString(36).slice(2,7);
    var dSlot='<div class="definition-slot" data-definition-id="'+dId+'"></div>';
    text=text.slice(0,dm.index)+"\n\n"+dSlot+"\n\n"+text.slice(definitionRe.lastIndex);
    definitionRe.lastIndex=dm.index+dSlot.length+4;
    definitionPH.push({id:dId,parsed:parsedDef});
  }

  /* Pass 6: <step n="…">…</step> (one or more) → numbered procedure list.
     Adjacent <step> blocks are merged into a single list with shared
     styling; an empty n="" defaults to the position in the sequence. */
  var stepRe=/<step\b([^>]*?)>([\s\S]*?)<\/step>/gi;
  var sm,si=0;
  while((sm=stepRe.exec(text))!==null){
    var sAttrs=sm[1]||"";
    var sNM=sAttrs.match(/n="([^"]+)"/i);
    var sIdx=sNM?parseInt(sNM[1],10):(si+1);
    if(!isFinite(sIdx)||sIdx<1){sIdx=si+1}
    var parsedStep={n:sIdx,body:stripTags(decodeEntities(sm[2].trim()))};
    if(!parsedStep.body){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(sm[2])+'</pre></div>';
      text=text.slice(0,sm.index)+"\n\n"+fbHtml+"\n\n"+text.slice(stepRe.lastIndex);
      stepRe.lastIndex=sm.index+fbHtml.length+4;
      continue;
    }
    var sId="step-"+(++si)+"-"+Math.random().toString(36).slice(2,7);
    var sSlot='<div class="step-slot" data-step-id="'+sId+'"></div>';
    text=text.slice(0,sm.index)+"\n\n"+sSlot+"\n\n"+text.slice(stepRe.lastIndex);
    stepRe.lastIndex=sm.index+sSlot.length+4;
    stepPH.push({id:sId,parsed:parsedStep});
  }

  /* Pass 7: <flashcard>…</flashcard> → click-to-flip recall card. */
  var flashcardRe=/<flashcard\b[^>]*>([\s\S]*?)<\/flashcard>/gi;
  var fm,fi=0;
  while((fm=flashcardRe.exec(text))!==null){
    var parsedFc=parseFlashcardInner(fm[1]);
    if(!parsedFc){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(fm[1])+'</pre></div>';
      text=text.slice(0,fm.index)+"\n\n"+fbHtml+"\n\n"+text.slice(flashcardRe.lastIndex);
      flashcardRe.lastIndex=fm.index+fbHtml.length+4;
      continue;
    }
    var fId="fc-"+(++fi)+"-"+Math.random().toString(36).slice(2,7);
    var fSlot='<div class="flashcard-slot" data-flashcard-id="'+fId+'"></div>';
    text=text.slice(0,fm.index)+"\n\n"+fSlot+"\n\n"+text.slice(flashcardRe.lastIndex);
    flashcardRe.lastIndex=fm.index+fSlot.length+4;
    flashcardPH.push({id:fId,parsed:parsedFc});
  }

  /* Pass 8: <derivation>…</derivation> → multi-line worked algebra.
     Math-book scaffolds (theorem / proof / key-point / derivation)
     were emitted by the model but never wired to a widget — they fell
     through to markdown.js's strip-everything fallback, so the user
     saw "[Theorem] <truncated plain text>…". This pass extracts title
     + body and mounts a typed card. */
  var derivationPH=[];
  var derivationRe=/<derivation\b[^>]*>([\s\S]*?)<\/derivation>/gi;
  var dm2,di2=0;
  while((dm2=derivationRe.exec(text))!==null){
    var parsedDv=parseDerivationInner(dm2[1]);
    if(!parsedDv){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(dm2[1])+'</pre></div>';
      text=text.slice(0,dm2.index)+"\n\n"+fbHtml+"\n\n"+text.slice(derivationRe.lastIndex);
      derivationRe.lastIndex=dm2.index+fbHtml.length+4;
      continue;
    }
    var dId2="der-"+(++di2)+"-"+Math.random().toString(36).slice(2,7);
    var dSlot='<div class="derivation-slot" data-derivation-id="'+dId2+'"></div>';
    text=text.slice(0,dm2.index)+"\n\n"+dSlot+"\n\n"+text.slice(derivationRe.lastIndex);
    derivationRe.lastIndex=dm2.index+dSlot.length+4;
    derivationPH.push({id:dId2,parsed:parsedDv});
  }

  /* Pass 9: <proof>…</proof> standalone proof block. Matched BEFORE
     <theorem> so an inline <proof> nested inside a theorem is captured
     by the theorem pass as a child rather than as a sibling widget.
     The theorem pass strips inner <proof> tags from its content first;
     any <proof> still present in the surrounding text after that pass
     is treated as a standalone proof block. */
  var proofPH=[];
  var proofRe=/<proof\b[^>]*>([\s\S]*?)<\/proof>/gi;
  var pm2,pi2=0;
  while((pm2=proofRe.exec(text))!==null){
    var parsedPrf=parseProofInner(pm2[1]);
    if(!parsedPrf){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(pm2[1])+'</pre></div>';
      text=text.slice(0,pm2.index)+"\n\n"+fbHtml+"\n\n"+text.slice(proofRe.lastIndex);
      proofRe.lastIndex=pm2.index+fbHtml.length+4;
      continue;
    }
    var pId2="prf-"+(++pi2)+"-"+Math.random().toString(36).slice(2,7);
    var pSlot='<div class="proof-slot" data-proof-id="'+pId2+'"></div>';
    text=text.slice(0,pm2.index)+"\n\n"+pSlot+"\n\n"+text.slice(proofRe.lastIndex);
    proofRe.lastIndex=pm2.index+pSlot.length+4;
    proofPH.push({id:pId2,parsed:parsedPrf});
  }

  /* Pass 10: <theorem>…</theorem> → formal result card.
     Inner <proof> tags are stripped from the captured inner string
     BEFORE parseTheoremInner runs, so the theorem pass never trips on
     a nested proof block. The standalone-proof pass already ran above
     and would have left them in place otherwise. */
  var theoremPH=[];
  var theoremRe=/<theorem\b[^>]*>([\s\S]*?)<\/theorem>/gi;
  var tm,ti=0;
  while((tm=theoremRe.exec(text))!==null){
    var thmInner=tm[1];
    /* Strip any <proof>…</proof> child block before re-parsing, so the
       theorem parser sees only <title>/<statement> children. The proof
       content is hoisted onto parsed.proofBody so the theorem widget
       renders both statement and (collapsed) proof in one card. */
    var innerProof=thmInner.match(/<proof\b[^>]*>([\s\S]*?)<\/proof>/i);
    var hoistedProof=innerProof?parseProofInner(innerProof[1]):null;
    var theoremInnerStripped=thmInner.replace(/<proof\b[^>]*>[\s\S]*?<\/proof>/gi,"");
    var parsedThm=parseTheoremInner(theoremInnerStripped);
    if(!parsedThm){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(tm[1])+'</pre></div>';
      text=text.slice(0,tm.index)+"\n\n"+fbHtml+"\n\n"+text.slice(theoremRe.lastIndex);
      theoremRe.lastIndex=tm.index+fbHtml.length+4;
      continue;
    }
    if(hoistedProof){
      parsedThm.proofTitle=hoistedProof.title;
      parsedThm.proofBody=hoistedProof.body;
    }
    var thId="thm-"+(++ti)+"-"+Math.random().toString(36).slice(2,7);
    var tSlot='<div class="theorem-slot" data-theorem-id="'+thId+'"></div>';
    text=text.slice(0,tm.index)+"\n\n"+tSlot+"\n\n"+text.slice(theoremRe.lastIndex);
    theoremRe.lastIndex=tm.index+tSlot.length+4;
    theoremPH.push({id:thId,parsed:parsedThm});
  }

  /* Pass 11: <key-point>…</key-point> → single boxed emphasis card.
     <key-point> is a leaf (no children) and may contain $...$ / $$...$$
     math; formatMsg is used at mount time so the math renders. */
  var keyPointPH=[];
  var keyPointRe=/<key-point\b[^>]*>([\s\S]*?)<\/key-point>/gi;
  var kpm,kpi=0;
  while((kpm=keyPointRe.exec(text))!==null){
    var parsedKp=parseKeyPointInner(kpm[1]);
    if(!parsedKp){
      var fbHtml='<div class="inline-block-fallback"><div class="inline-block-fallback-label">'+t("tutor.fallbackWarn")+'</div><pre class="inline-block-fallback-content">'+esc(kpm[1])+'</pre></div>';
      text=text.slice(0,kpm.index)+"\n\n"+fbHtml+"\n\n"+text.slice(keyPointRe.lastIndex);
      keyPointRe.lastIndex=kpm.index+fbHtml.length+4;
      continue;
    }
    var kId="kp-"+(++kpi)+"-"+Math.random().toString(36).slice(2,7);
    var kSlot='<div class="key-point-slot" data-key-point-id="'+kId+'"></div>';
    text=text.slice(0,kpm.index)+"\n\n"+kSlot+"\n\n"+text.slice(keyPointRe.lastIndex);
    keyPointRe.lastIndex=kpm.index+kSlot.length+4;
    keyPointPH.push({id:kId,parsed:parsedKp});
  }

  /* formatMsg uses marked.parse, which passes raw <div> blocks through
     untouched. The slots will land in the final HTML intact. */
  var html=formatMsg(text);

  /* Defer DOM mount until the html is actually inserted. */
  if(quizPH.length||examplePH.length||practicePH.length||definitionPH.length||stepPH.length||flashcardPH.length||derivationPH.length||proofPH.length||theoremPH.length||keyPointPH.length){
    setTimeout(function(){
      quizPH.forEach(function(p){
        var slot=document.querySelector('[data-quiz-id="'+p.id+'"]');
        if(slot)mountQuizWidget(slot,p.parsed);
      });
      examplePH.forEach(function(p){
        var slot=document.querySelector('[data-example-id="'+p.id+'"]');
        if(slot)mountExampleWidget(slot,p.parsed);
      });
      practicePH.forEach(function(p){
        var slot=document.querySelector('[data-practice-id="'+p.id+'"]');
        if(slot)mountPracticeWidget(slot,p.parsed);
      });
      definitionPH.forEach(function(p){
        var slot=document.querySelector('[data-definition-id="'+p.id+'"]');
        if(slot)mountDefinitionWidget(slot,p.parsed);
      });
      /* Steps are merged into one list under the first slot; remaining
         step slots are removed so the surrounding markdown is clean. */
      if(stepPH.length){
        var firstSlot=document.querySelector('[data-step-id="'+stepPH[0].id+'"]');
        if(firstSlot)mountStepList(firstSlot,stepPH.map(function(s){return s.parsed}));
        stepPH.slice(1).forEach(function(p){
          var slot=document.querySelector('[data-step-id="'+p.id+'"]');
          if(slot)slot.remove();
        });
      }
      flashcardPH.forEach(function(p){
        var slot=document.querySelector('[data-flashcard-id="'+p.id+'"]');
        if(slot)mountFlashcardWidget(slot,p.parsed);
      });
      derivationPH.forEach(function(p){
        var slot=document.querySelector('[data-derivation-id="'+p.id+'"]');
        if(slot)mountDerivationWidget(slot,p.parsed);
      });
      proofPH.forEach(function(p){
        var slot=document.querySelector('[data-proof-id="'+p.id+'"]');
        if(slot)mountProofWidget(slot,p.parsed);
      });
      theoremPH.forEach(function(p){
        var slot=document.querySelector('[data-theorem-id="'+p.id+'"]');
        if(slot)mountTheoremWidget(slot,p.parsed);
      });
      keyPointPH.forEach(function(p){
        var slot=document.querySelector('[data-key-point-id="'+p.id+'"]');
        if(slot)mountKeyPointWidget(slot,p.parsed);
      });
      /* Wire any viz/mermaid blocks that may have been injected during
         widget mounting. */
      try{processPendingMermaid()}catch(_){}
      try{processPendingViz()}catch(_){}
      try{processPendingVizActions()}catch(_){}
    },0);
  }
  return html;
}

function mountExampleWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-example";
  if(parsed.title){
    var tEl=document.createElement("div");
    tEl.className="inline-example-title";
    /* Title may carry $..$ LaTeX (e.g. "Example: $E=mc^2$"). Run it
       through formatMsg so the math renders instead of leaking
       literal dollar signs into the card heading. */
    tEl.innerHTML=formatMsg(parsed.title);
    el.appendChild(tEl);
  }
  if(parsed.problem){
    var pEl=document.createElement("div");
    pEl.className="inline-example-problem";
    pEl.innerHTML=formatMsg(parsed.problem);
    el.appendChild(pEl);
  }
  /* Hide the solution behind a reveal link so students can self-test
     before peeking. Persist the reveal state on parsed so subsequent
     re-renders (e.g. after Reload Session) keep the same view. */
  if(parsed.solution){
    var revealBtn=document.createElement("button");
    revealBtn.type="button";
    revealBtn.className="inline-example-reveal";
    revealBtn.textContent=parsed._revealed?t("tutor.hideSolution"):t("tutor.showSolution");
    el.appendChild(revealBtn);
    var sEl=document.createElement("div");
    sEl.className="inline-example-solution";
    if(!parsed._revealed){sEl.setAttribute("hidden","")}
    sEl.innerHTML=formatMsg(parsed.solution);
    el.appendChild(sEl);
    revealBtn.onclick=function(){
      var hidden=sEl.hasAttribute("hidden");
      if(hidden){
        sEl.removeAttribute("hidden");
        revealBtn.textContent=t("tutor.hideSolution");
        parsed._revealed=true;
      }else{
        sEl.setAttribute("hidden","");
        revealBtn.textContent=t("tutor.showSolution");
        parsed._revealed=false;
      }
    };
  }
  slot.replaceWith(el);
}

/* Interactive practice widget — the old read-only card has been replaced
   with a tappable card that contains:
   - The problem statement (markdown-rendered).
   - Optional hint, hidden behind a toggle.
   - A textarea + Submit button. Submit pipes the typed attempt through
     submitChatMessage so the existing practiceAttempts / mistake-book
     / stage-advancement logic in submitChatMessage applies unchanged.
   - Optional Reveal-answer button shown only when the AI emitted
     <practice correct="…">. Clicking reveals the answer in the
     feedback area and disables the textarea + Submit.
   This is the primary "scaffolding for displaying 试题/例题/练习题"
   feature that was previously missing — students used to have to scroll
   to the bottom chat composer and re-type context. */
function mountPracticeWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-practice";
  var pEl=document.createElement("div");
  pEl.className="inline-practice-problem";
  pEl.innerHTML=formatMsg(parsed.problem);
  el.appendChild(pEl);
  var hintToggle=null,hEl=null;
  if(parsed.hint){
    hintToggle=document.createElement("button");
    hintToggle.type="button";
    hintToggle.className="inline-practice-hint-toggle";
    hintToggle.textContent=t("tutor.showHint");
    el.appendChild(hintToggle);
    hEl=document.createElement("div");
    hEl.className="inline-practice-hint";
    hEl.setAttribute("hidden","");
    hEl.innerHTML=formatMsg(parsed.hint);
    el.appendChild(hEl);
    hintToggle.onclick=function(){
      var hidden=hEl.hasAttribute("hidden");
      if(hidden){
        hEl.removeAttribute("hidden");
        hintToggle.textContent=t("tutor.hideHint");
      }else{
        hEl.setAttribute("hidden","");
        hintToggle.textContent=t("tutor.showHint");
      }
    };
  }
  var formEl=document.createElement("form");
  formEl.className="inline-practice-form";
  formEl.onsubmit=function(){return false};
  var taEl=document.createElement("textarea");
  taEl.className="inline-practice-textarea";
  taEl.rows=3;
  taEl.placeholder=t("tutor.practicePlaceholder");
  formEl.appendChild(taEl);
  var actionsEl=document.createElement("div");
  actionsEl.className="inline-practice-actions";
  var revealBtn=null;
  if(parsed.correct){
    revealBtn=document.createElement("button");
    revealBtn.type="button";
    revealBtn.className="inline-practice-reveal";
    revealBtn.textContent=t("tutor.revealAnswer");
    actionsEl.appendChild(revealBtn);
  }
  var submitBtn=document.createElement("button");
  submitBtn.type="button";
  submitBtn.className="inline-practice-submit";
  submitBtn.textContent=t("tutor.submitAnswer");
  actionsEl.appendChild(submitBtn);
  formEl.appendChild(actionsEl);
  var feedbackEl=document.createElement("div");
  feedbackEl.className="inline-practice-feedback";
  formEl.appendChild(feedbackEl);
  el.appendChild(formEl);
  /* Stash slot id so practice mistakes can be cleared on a future correct
     attempt — mirrors the parsed.slotId pattern in mountQuizWidget. */
  if(slot&&slot.getAttribute&&!parsed.slotId){
    parsed.slotId=slot.getAttribute("data-practice-id");
  }
  submitBtn.onclick=function(){
    var text=(taEl.value||"").trim();
    if(!text){
      feedbackEl.className="inline-practice-feedback bad";
      feedbackEl.textContent=t("tutor.practiceEmpty");
      return;
    }
    submitBtn.disabled=true;
    if(revealBtn)revealBtn.disabled=true;
    taEl.disabled=true;
    /* Pipe the attempt through the existing chat send path so the
       stage-advancement + practiceAttempts bump logic in submitChatMessage
       (line ~3730) fires unchanged. origin:"practice" is informational
       only — the existing logic doesn't gate on it. */
    var sentText=t("tutor.practicePrefix")+text;
    submitChatMessage(sentText,{origin:"practice"});
    /* Self-grade against the optional <practice correct="…"> attribute. */
    if(parsed.correct){
      var norm=function(s){return String(s).toLowerCase().replace(/[\s.,;:!?\(\)\[\]'"]/g,"").trim()};
      var isRight=norm(text)===norm(parsed.correct);
      feedbackEl.className="inline-practice-feedback "+(isRight?"ok":"bad");
      feedbackEl.textContent=isRight
        ? t("tutor.practiceSelfCorrect")
        : (t("tutor.practiceSelfWrong")+" "+parsed.correct);
      if(isRight){
        /* Reset practiceAttempts to 0 (mirrors quiz-correct path at
           main.js ~6358). A future mistake book entry shouldn't pile up
           if the student nailed the self-graded one. */
        if(typeof state!=="undefined"){state.practiceAttempts=0}
      }else{
        recordMistake({
          type:"practice",
          q:parsed.problem,
          options:[],
          correct:parsed.correct,
          userAnswer:text,
          judgedAnswer:parsed.correct,
          practiceSlotId:parsed.slotId||null
        });
      }
    }else{
      feedbackEl.className="inline-practice-feedback recorded";
      feedbackEl.textContent=t("tutor.practiceSent");
    }
  };
  if(revealBtn){
    revealBtn.onclick=function(){
      revealBtn.disabled=true;
      submitBtn.disabled=true;
      taEl.disabled=true;
      feedbackEl.className="inline-practice-feedback recorded";
      feedbackEl.innerHTML=formatMsg(parsed.correct);
    };
  }
  slot.replaceWith(el);
}

/* Vocabulary card — term prominent, body in standard reading weight.
   Mirrors the inline-example / inline-practice pattern. */
function mountDefinitionWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-definition";
  if(parsed.term){
    var tEl=document.createElement("div");
    tEl.className="inline-definition-term";
    /* term may carry LaTeX (e.g. "<term>Group $G$</term>"). formatMsg
       gives us the same markdown → HTML pipeline the body uses, so a
       dollar-delimited symbol inside the term renders instead of
       appearing as literal `$G$` text. */
    tEl.innerHTML=formatMsg(parsed.term);
    el.appendChild(tEl);
  }
  if(parsed.body){
    var bEl=document.createElement("div");
    bEl.className="inline-definition-body";
    bEl.innerHTML=formatMsg(parsed.body);
    el.appendChild(bEl);
  }
  slot.replaceWith(el);
}

/* Stepped procedure list. Multiple <step> blocks are collected by
   renderAssistantHTML into a single ordered list. We render them as
   a plain list of numbered rows. The first slot is replaced with
   the list; subsequent slots are removed by renderAssistantHTML. */
function mountStepList(slot,steps){
  var el=document.createElement("div");
  el.className="inline-step-list";
  steps.forEach(function(s){
    var row=document.createElement("div");
    row.className="inline-step";
    var nChip=document.createElement("span");
    nChip.className="inline-step-n";
    nChip.textContent=String(s.n)+".";
    row.appendChild(nChip);
    var body=document.createElement("div");
    body.className="inline-step-body";
    body.innerHTML=formatMsg(s.body);
    row.appendChild(body);
    el.appendChild(row);
  });
  slot.replaceWith(el);
}

/* Click-to-flip recall card. Front shows by default; clicking the card
   swaps to the back. Two quiet prose blocks — no extra chrome. */
function mountFlashcardWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-flashcard";
  el.setAttribute("role","button");
  el.setAttribute("tabindex","0");
  el.setAttribute("aria-label",t("tutor.flashcardAria"));
  var frontEl=document.createElement("div");
  frontEl.className="inline-flashcard-front";
  frontEl.innerHTML=formatMsg(parsed.front||"");
  el.appendChild(frontEl);
  var backEl=document.createElement("div");
  backEl.className="inline-flashcard-back";
  backEl.setAttribute("hidden","");
  backEl.innerHTML=formatMsg(parsed.back||"");
  el.appendChild(backEl);
  function flip(){
    var showingBack=!backEl.hasAttribute("hidden");
    if(showingBack){
      backEl.setAttribute("hidden","");
      frontEl.removeAttribute("hidden");
    }else{
      frontEl.setAttribute("hidden","");
      backEl.removeAttribute("hidden");
    }
  }
  el.onclick=flip;
  el.onkeydown=function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();flip()}};
  slot.replaceWith(el);
}

/* Theorem card: title (optional) + statement. If a child <proof> was
   hoisted into parsed.proofBody, render it as a collapsible block
   below the statement so the student can self-test before peeking.
   Both title and statement go through formatMsg so $...$ / $$...$$
   renders — that fixes the "title doesn't render LaTeX" complaint
   that applied to every scaffold tag here, not just theorem. */
function mountTheoremWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-theorem";
  if(parsed.title){
    var tEl=document.createElement("div");
    tEl.className="inline-theorem-title";
    tEl.innerHTML=formatMsg(parsed.title);
    el.appendChild(tEl);
  }
  if(parsed.statement){
    var sEl=document.createElement("div");
    sEl.className="inline-theorem-statement";
    sEl.innerHTML=formatMsg(parsed.statement);
    el.appendChild(sEl);
  }
  if(parsed.proofBody){
    var toggleBtn=document.createElement("button");
    toggleBtn.type="button";
    toggleBtn.className="inline-theorem-proof-toggle";
    toggleBtn.textContent=t("tutor.showProof");
    el.appendChild(toggleBtn);
    var pEl=document.createElement("div");
    pEl.className="inline-theorem-proof collapsed";
    if(parsed.proofTitle){
      var ptEl=document.createElement("div");
      ptEl.className="inline-proof-title";
      ptEl.innerHTML=formatMsg(parsed.proofTitle);
      pEl.appendChild(ptEl);
    }
    var pbEl=document.createElement("div");
    pbEl.className="inline-proof-body";
    pbEl.innerHTML=formatMsg(parsed.proofBody);
    pEl.appendChild(pbEl);
    el.appendChild(pEl);
    toggleBtn.onclick=function(){
      var collapsed=pEl.classList.contains("collapsed");
      if(collapsed){
        pEl.classList.remove("collapsed");
        toggleBtn.textContent=t("tutor.hideProof");
      }else{
        pEl.classList.add("collapsed");
        toggleBtn.textContent=t("tutor.showProof");
      }
    };
  }
  slot.replaceWith(el);
}

/* Standalone <proof> block: title (optional) + body. Same widget as
   the theorem-child proof but rendered at the slot's own position. */
function mountProofWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-proof";
  if(parsed.title){
    var tEl=document.createElement("div");
    tEl.className="inline-proof-title";
    tEl.innerHTML=formatMsg(parsed.title);
    el.appendChild(tEl);
  }
  if(parsed.body){
    var bEl=document.createElement("div");
    bEl.className="inline-proof-body";
    bEl.innerHTML=formatMsg(parsed.body);
    el.appendChild(bEl);
  }
  slot.replaceWith(el);
}

/* Derivation card: title (optional) + body. The body is multi-line
   algebra that the SOCRATIC_SYSTEM_PROMPT template writes line by
   line — preserve the line structure by going through formatMsg,
   which keeps <br>/\n inside $$...$$ display math intact. */
function mountDerivationWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-derivation";
  if(parsed.title){
    var tEl=document.createElement("div");
    tEl.className="inline-derivation-title";
    tEl.innerHTML=formatMsg(parsed.title);
    el.appendChild(tEl);
  }
  if(parsed.body){
    var bEl=document.createElement("div");
    bEl.className="inline-derivation-body";
    bEl.innerHTML=formatMsg(parsed.body);
    el.appendChild(bEl);
  }
  slot.replaceWith(el);
}

/* Key-point card: gold-tinted single boxed emphasis. The leaf body is
   run through formatMsg so the LaTeX in formulas like
   "$$\sum_{i=1}^{n} i = \frac{n(n+1)}{2}$$" actually renders. */
function mountKeyPointWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-key-point";
  var labelEl=document.createElement("div");
  labelEl.className="inline-key-point-label";
  labelEl.textContent=t("tutor.keyPointLabel")||"Key Point";
  el.appendChild(labelEl);
  var bodyEl=document.createElement("div");
  bodyEl.className="inline-key-point-body";
  bodyEl.innerHTML=formatMsg(parsed.body);
  el.appendChild(bodyEl);
  slot.replaceWith(el);
}


function mountQuizWidget(slot,parsed){
  /* Record the slot id on the parsed object so handleQuizPick can later
     attribute the choice to a specific mistake. */
  if(slot&&slot.getAttribute&&!parsed.slotId){
    parsed.slotId=slot.getAttribute("data-quiz-id");
  }
  var el=document.createElement("div");
  el.className="inline-quiz";
  var qEl=document.createElement("div");
  qEl.className="inline-quiz-q";
  /* The question text may contain $...$ LaTeX, **bold**, *italic*, `code`,
     etc. — run it through formatMsg so it actually renders. */
  qEl.innerHTML=formatMsg(parsed.q);
  el.appendChild(qEl);
  var optsEl=document.createElement("div");
  optsEl.className="inline-quiz-opts";
  var btns=[];
  parsed.options.forEach(function(o){
    var b=document.createElement("button");
    b.className="inline-quiz-opt";
    b.setAttribute("data-letter",o.letter);
    b.innerHTML='<span class="inline-quiz-opt-letter">'+o.letter+'.</span><span class="inline-quiz-opt-text">'+formatMsg(o.text)+'</span>';
    b.onclick=function(){handleQuizPick(el,optsEl,feedback,btns,o,parsed)};
    optsEl.appendChild(b);
    btns.push(b);
  });
  el.appendChild(optsEl);
  var feedback=document.createElement("div");
  feedback.className="inline-quiz-feedback";
  el.appendChild(feedback);
  slot.replaceWith(el);
}

function handleQuizPick(cardEl,optsEl,feedback,btns,picked,parsed){
  btns.forEach(function(b){b.disabled=true});
  var chosenBtn=btns.find(function(b){return b.getAttribute("data-letter")===picked.letter});
  if(chosenBtn)chosenBtn.classList.add("selected");
  var correct=parsed.correct;
  var isRight=!!correct&&picked.letter===correct;
  if(chosenBtn){
    chosenBtn.classList.add(isRight?"correct":"wrong");
  }
  if(correct&&!isRight){
    var realBtn=btns.find(function(b){return b.getAttribute("data-letter")===correct});
    if(realBtn)realBtn.classList.add("correct");
  }
  if(correct){
    feedback.classList.add(isRight?"ok":"bad");
    var safeCor=esc(correct);
    feedback.textContent=isRight
      ?t("tutor.quizCorrect").replace("{answer}",safeCor)
      :t("tutor.quizWrong").replace("{answer}",safeCor);
  }else{
    feedback.textContent=t("tutor.quizRecorded").replace("{letter}",picked.letter);
  }
  /* Record the mistake in the mistake book. */
  if(correct&&!isRight){
    recordMistake({
      type:"quiz",
      q:parsed.q,
      options:parsed.options.map(function(o){return{letter:o.letter,text:o.text}}),
      correct:correct,
      userAnswer:picked.letter,
      quizSlotId:parsed.slotId||null
    });
  }else if(isRight&&parsed.slotId){
    /* A correct pick on a redo'd mistake clears that mistake from the book. */
    removeMistakeForQuizSlot(parsed.slotId);
  }
  /* Task 2.3 — advance the teaching-stage state machine based on
     the quiz outcome. Only the exercise / check stages are
     quiz-driven; in other stages the quiz is informational and we
     leave the stage alone. Node advancement on a correct `check`
     answer is handled by submitChatMessage's substantiveCount /
     stuckCount logic, so we don't touch it here. */
  if(state.teachingStage==="exercise"){
    if(isRight){
      state.teachingStage="check";
      state.practiceAttempts=0;
    }else{
      state.practiceAttempts=(state.practiceAttempts||0)+1;
    }
  }else if(state.teachingStage==="check"){
    /* A wrong check answer keeps us in check so the model can
       re-quiz; a correct one leaves node advancement to the
       existing submitChatMessage flow. */
    if(!isRight){
      state.practiceAttempts=(state.practiceAttempts||0)+1;
    }else{
      state.practiceAttempts=0;
    }
  }
  /* Synthesise a user message + chat turn so the AI gets a real follow-up
     opportunity that references the choice. */
  var text="I chose "+picked.letter+". "+picked.text;
  if(correct)text+=" (Result: "+(isRight?"correct":"incorrect, correct is "+correct)+".)";
  submitChatMessage(text,{origin:"quiz"});
}

/* P_main-split - Wave 2: mistake-book runtime extracted. */
const mistakeBook = createMistakeBook({
  state: state,
  apiFetch: apiFetch,
  saveCurrentSession: saveCurrentSession,
  mountQuizWidget: mountQuizWidget,
  scrollContainer: scrollContainer,
  getTutorSocratic: function(){ return window.tutorSocratic; },
});
const { recordMistake, removeMistakeForQuizSlot, updateMistakesBadge, renderMistakes } = mistakeBook;

/* P_main-split — Wave 0: handleQuickAction (region 26) extracted. */
import { handleQuickAction } from './chat/quickActions.js';

/* ============================================================
   KNOWLEDGE BOUNDARY PANEL
   ============================================================ */
function updateKB(){
  /* Task 3.3 — keep the teaching-plan view in sync with the KB.
     renderKnowledgeView is a no-op when there's no plan, so
     callers that don't have one yet (chat mode, pre-diagnostic)
     are unaffected. */
  renderKnowledgeView();
  /* v3.0 design — knowledge-boundary file rendering lives in
     tutorSocratic.js. The renderer reads state.kbNodes directly
     and shows the [系统]/[我] annotation lines from §6.3 plus
     the snapshot history from §6.5. We delegate the entire
     #kbContent body to that renderer. */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.renderKnowledgeBoundaryFile==="function"){
    try{tutorSocratic.renderKnowledgeBoundaryFile()}catch(e){/* kb boundary render failed */}
  }
  /* Mode banner and teaching plan re-render in the new module. */
  if(typeof tutorSocratic==="object"&&tutorSocratic){
    try{tutorSocratic.renderTeachingPlan()}catch(_){}
  }
  var cont=document.getElementById("kbContent");
  if(!cont)return;
  if(!state.kbNodes.length){
    cont.innerHTML='<div class="kb-empty">'+(typeof t==="function"
      ?t("tutor.kbTopicFirst")
      :"Set a learning topic to build your knowledge map.")+'</div>';
    return
  }

  var sections={internalized:[],fuzzy:[],blank:[]};
  state.kbNodes.forEach(function(n,i){
    var cls=n.status==="internalized"?"internalized":n.status==="fuzzy"?"fuzzy":"blank";
    sections[cls].push({name:n.name,questions:n.questions||0,idx:i});
  });

  var html="";
  if(sections.internalized.length){
    html+='<div class="kb-section-title">Internalized <span class="kb-section-count">'+sections.internalized.length+'</span></div>';
    sections.internalized.forEach(function(n){html+=kbNodeHtml(n,"internalized")});
  }
  if(sections.fuzzy.length){
    html+='<div class="kb-section-title">Exploring <span class="kb-section-count">'+sections.fuzzy.length+'</span></div>';
    sections.fuzzy.forEach(function(n){html+=kbNodeHtml(n,"fuzzy")});
  }
  if(sections.blank.length){
    html+='<div class="kb-section-title">Not yet reached <span class="kb-section-count">'+sections.blank.length+'</span></div>';
    sections.blank.forEach(function(n){html+=kbNodeHtml(n,"blank")});
  }
  cont.innerHTML=html;
}

/* Task 3.3 — render the structured teaching plan into the
   #teachingPlanContent container at the top of the Knowledge
   sidebar. Shows the ordered list of sub-topics with their
   status, highlights the current sub-topic, and shows the
   current teaching stage next to it. Completed (internalized)
   sub-topics get a text "[done]" marker — no emoji per the
   design constraints. Called from updateKB() and from
   switchTab('knowledge') so it stays in sync. */
/* P_main-split — Wave 0: updateChatStats (region 28) extracted. */
import { updateChatStats } from './chat/stats.js';

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


async function resetApp(){
  if(state.topic||state.kbNodes.length>0||document.getElementById("msgList").children.length>0){
    var ok=await showConfirm("Start a new session?","You have an active session. Starting a new one will save your progress to Recents.",false);
    if(!ok){ window._nextProjectId=null; return; }
  }
  /* Drain any previous in-flight save first so the dirty cascade
     fires before resetState. Then fire the new save with the current
     snapshot — don't block the UI on the network roundtrip. */
  if (_saveInFlight) {
    try { await _saveInFlight; } catch (_) {}
  }
  saveCurrentSession();
  /* P5.8 — clear the active prompt template. A new session
     is a fresh context; carrying over "summarize mode" from
     the previous chat would silently shape the first
     response of the new session. */
  clearActiveTemplate();
  /* Abort any in-flight chat stream so its callbacks don't write to
     state.messages after we reset them. */
  if(window._activeChatAbort){try{window._activeChatAbort("session-reset")}catch(_){}}
  if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
  window._activeChatCtl=null;
  window._activeChatAbort=null;
  _chatStreaming=false;
  _chatStopMode=false;
  window._shareToken=null;
  resetState();
  /* Preserve a project selected immediately before a fresh chat. */
  if(window._nextProjectId){
    state.currentProjectId=window._nextProjectId;
    window._nextProjectId=null;
  }

  toggleShareBtn();
  /* Go back to the main page — no chat session yet. */
  setChatIdInURL(null);
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  if (typeof window.hideMainPages === "function") window.hideMainPages();
  toggleChatTopBarEls(false);
  document.getElementById("msgList").innerHTML="";
  document.getElementById("topicInput").value="";
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">'+(typeof t==="function"?t("tutor.kbTopicFirst"):"Set a topic to build your knowledge map.")+'</div>';
  document.getElementById("chatStats").textContent="";
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc2=document.getElementById("teachingPlanContent");if(_tpc2)_tpc2.innerHTML="";
  /* Refresh the API badge so it doesn't show the previous session's source. */
  var badge=document.getElementById("chatApiBadge");
  if(badge){badge.textContent="";badge.classList.remove("on");badge.title="";}
  updateStartBtn();
  renderRecents();
  renderMistakes();
  updateMistakesBadge();
  scrollContainer().scrollTop=0;
  /* Mobile: close the drawer if it's open, and persist so a
     subsequent refresh doesn't re-open it. */
  if(window.innerWidth<768){
    var sb=document.getElementById("sidebar");
    var bd=document.getElementById("sidebarBackdrop");
    if(sb&&!sb.classList.contains("collapsed")){
      sb.classList.add("collapsed");
      sidebarOpen=false;
      if(bd)bd.classList.remove("show");
      try{localStorage.setItem("socrates-sb","0")}catch(e){}
    }
  }
  syncSidebarBtns();
  /* Focus the topic input so the user can start typing right away. */
  setTimeout(function(){
    var ti=document.getElementById("topicInput");
    if(ti&&!ti.closest(".hidden")){ti.focus()}
  },50);
}

/* ============================================================
   AUTH GATE — client-side
   - apiFetch: the single point of contact with the server. Always
     includes credentials so the sid cookie travels. Returns parsed
     JSON or throws.
   - checkAuthOnBoot: ping /api/auth/me, branch to gate or app.
   - submitAuthRegister / submitAuthSignin / submitAuthVerify:
     forms wired to the gate UI.
   ============================================================ */
var CURRENT_USER=null;

/* Cross-module CURRENT_USER setter — boot.js and auth/index.js
   set window.CURRENT_USER, but main.js functions read the local
   `var CURRENT_USER`. This setter keeps both in sync. */
function setCurrentUser(user){ CURRENT_USER = user; window.CURRENT_USER = user; }
window.setCurrentUser = setCurrentUser;

/* P0.4 — apiFetch / apiFetchRaw / retryApiFetch / makeApiError are
   imported from ./util/api.js. The handleAuthExpired hook is
   installed once at boot via installAuthHooks() — see below. */
import { apiFetch, apiFetchRaw, retryApiFetch, makeApiError, installAuthHooks, getCsrfToken } from './util/api.js';
window.apiFetch=apiFetch;window.apiFetchRaw=apiFetchRaw;window.retryApiFetch=retryApiFetch;window.getCsrfToken=getCsrfToken;

/* Post-auth grace window. Right after a successful register or
 * login the browser hasn't always written the new `sid` cookie to
 * its cookie jar by the time the next fetch() runs, so a 401 on
 * a background call (e.g. refreshServerSessions) doesn't actually
 * mean the session is gone — it's a race. We give the browser ~3
 * seconds to settle, during which 401s from non-auth endpoints are
 * NOT treated as session expiry. */
var _lastAuthSuccessAt=0;
var AUTH_GRACE_MS=3000;
function markAuthSuccess(){
  _lastAuthSuccessAt=Date.now();
}
function isInAuthGraceWindow(){
  return (Date.now()-_lastAuthSuccessAt) < AUTH_GRACE_MS;
}
window.markAuthSuccess=markAuthSuccess;
window.isInAuthGraceWindow=isInAuthGraceWindow;

/* P4.5 — invoked from apiFetch when a 401 comes back. Clears
   in-memory user state, shows the auth gate, and emits a one-time
   event so views that have their own `currentUser` observers (the
   sidebar, settings, etc.) can react. We deliberately do NOT delete
   the sid cookie from the client side — the server is the source of
   truth for session lifetime, and the next successful login will
   set a new one. */
function handleAuthExpired(cause){
  console.log("[auth] handleAuthExpired called, cause="+(cause||"apiFetch-401"));
  try{
    /* P_bleed-auth-expired — same per-user cache wipe as signOut().
       A 401 may fire mid-session while the user is still on the
       screen; without clearing _userMemories / geo info, the
       signin-gate UI would briefly show the previous user's
       memories in any subsequent system-context preview, and
       _pendingChatContent could replay a draft image after the
       user signs back in. */
    try{_userMemories=[]}catch(_){}
    try{resetGeoInfo({clearCache:true})}catch(_){}
    try{window._pendingChatContent=null}catch(_){}
    /* P_bleed-auth-expired — same comprehensive wipe as signOut(). A
       401 may fire mid-session; without clearing SERVER_SESSIONS /
       apiConfig / _cmdKIndex, the sign-in gate's flash of
       stale sidebar or model-picker data could briefly show the
       previous user's sessions before the next signin's fetch
       resolves. */
    clearPerUserClientState();
    CURRENT_USER=null;
    /* Abort any active SSE chat stream so in-flight requests don't
       complete after the user has been sent to the auth gate and
       trigger further state mutations. */
    try{
      if(window._activeChatCtl){_activeChatCtl.abort();window._activeChatCtl=null}
      if(window._activeChatAbort){_activeChatAbort("session-expired");window._activeChatAbort=null}
    }catch(_){}
    if(window._onAuthExpiredListeners){
      window._onAuthExpiredListeners.forEach(function(fn){
        try{fn()}catch(e){/* auth listener threw */}
      });
    }
    /* Show the gate; the existing showGate() handles UI swap. */
    if(typeof showGate==="function"){showGate()}
    if(typeof showAuthSignin==="function"){showAuthSignin()}
    /* Inject a one-line hint above the sign-in form. We look for
       an existing auth banner element; if absent, we create a
       transient notice. */
    setTimeout(function(){
      var banner=document.getElementById("authExpiredBanner");
      if(!banner){
        banner=document.createElement("div");
        banner.id="authExpiredBanner";
        banner.className="auth-expired-banner";
        banner.textContent=t("auth.sessionExpired");
        var gate=document.getElementById("authGate");
        if(gate){gate.insertBefore(banner,gate.firstChild)}
      }
    },0);
  }catch(e){/* handleAuthExpired failed */}
}
window.handleAuthExpired=handleAuthExpired;

/* Wire the api module's 401 hook to our local handleAuthExpired +
 * grace window. Done after both functions are defined so the closure
 * captures the right references. */
installAuthHooks({ on401: handleAuthExpired, isInGraceWindow: isInAuthGraceWindow });


import { renderUserFooter, openProfile, closeProfile } from './ui/profile.js';

/* ─── Exam view (standalone page) ─── */
/* P_main-split — Wave 3b: exam generation form extracted to exam.js. */
import {
  openExamModal, closeExamModal, closeExamView, renderExamForm,
  toggleExamType, startExamGeneration,
  cancelExamGeneration,
  parseSingleExamQuestion, parseExamArrayJSON,
  renderAllQuestions, paintQuestionCard, replaceStreamingCardWithQuestion,
  appendExamErrorCard, selectExamOpt, finishExamGeneration,
  renderExamNav, examNavCurrentIdx, examNavJump, examNavStep,
  syncExamNav, refreshExamNavTally, scheduleExamAnswerSave, submitExam,
  saveExamSession, doSaveExamSession, renderExamResults,
} from './exam.js';

/* Usage modal — token heatmap & monthly breakdown. */
/* Usage modal — openUsageModal / closeUsageModal / loadUsageData / loadUsageMonth / renderUsageHeatmap / showUsageTip / hideUsageTip — extracted to src/ui/usage.js (Phase C-3.5). */

/* P2.3 — Storage modal. Lists archived sessions with the
   days-remaining countdown, plus a Restore / Delete-forever
   pair per row. The modal is a single instance that gets
   rebuilt every time it opens, so the count is always live. */
import { openStorageModal, closeStorageModal } from './ui/storage.js';

/* P5.8 — Prompt templates manager modal. Lists built-ins
   (read-only) and user customs (editable). The 'New
   template' button opens a lightweight editor inline. */
import {
  openPromptTemplatesModal, closePromptTemplatesModal,
  renderPromptTemplatesModal, renderPromptRow,
  onPromptRowDelete, openPromptTemplateEditor,
  onPromptTemplateEditorSave,
} from './ui/promptTemplates.js';

import { renderArchivedList } from './ui/storage.js';

/* P1.3 — Custom Instructions: load/save/serialize.
   Schema (localStorage key "socrates-custom-instructions"):
     { response: "How should I respond?",
       about:    "What do you know about me?",
       savedAt:  ISO-8601 timestamp }
   The two strings are also pushed to the server via
   PATCH /api/users/me.customInstructions so the same value
   flows to the Android client on the next sign-in. */
var _customInstructionsSaveTimer=null;
import { loadCustomInstructions, saveCustomInstructions, loadCustomInstructionsIntoUI, onCustomInstructionsChange, buildCustomInstructionsString, updateInstSaveState, getCustomInstructionsString, toggleProfileWebSearch, syncProfileWebSearchUI } from './ui/profile.js';

/* P_main-split — Wave 1a: showConfirm + closeConfirm extracted to ui/confirm.js. */
import { showConfirm, closeConfirm } from './ui/confirm.js';

/* Clear local conversations. */
/* P_main-split — Wave 2a: danger confirms extracted to ui/dangerConfirms.js. */
import { confirmClearCache, confirmClearSettings, confirmDeleteAccount } from './ui/dangerConfirms.js';

/* escapeHtml / sanitizeUrl / sanitizeUrls are imported from
 * ./util/safe.js. The window aliases are kept so any on-page
 * debug console (or older hot-reload tab) that still references
 * window.sanitizeUrl / window.escapeHtml keeps working. */
import { escapeHtml, sanitizeUrl, sanitizeUrls } from './util/safe.js';
window.escapeHtml=escapeHtml;window.sanitizeUrl=sanitizeUrl;window.sanitizeUrls=sanitizeUrls;
window.__vizOpenModal=openVizModal;

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
function clearPerUserClientState(){
  /* In-memory module-level caches. */
  try{if(Array.isArray(SERVER_SESSIONS))SERVER_SESSIONS.length=0}catch(_){}
  /* P_recents-fetch-fail — reset the fetch-failed flag on user switch
     so the new user doesn't inherit the previous user's failure state. */
  try{SERVER_SESSIONS_FETCH_FAILED=false}catch(_){}
  try{apiConfig.activeId=null;apiConfig.providers=[]}catch(_){}
  try{_cmdKIndex=null;_cmdKIndexDocs=[];_cmdKResults=[];_cmdKSelected=0;_cmdKRecent=[]}catch(_){}
  try{_deleteConfirmTimers={};_deleteConfirmStates={}}catch(_){}
  try{resetCrossSessionKBCache()}catch(_){}
  try{_examAnswerSaveTimer=null;_examSaveInFlight=null}catch(_){}
  try{_userMemories=[]}catch(_){}
  try{resetGeoInfo()}catch(_){}
  try{if(window._pendingChatContent!==undefined)window._pendingChatContent=null}catch(_){}
  /* P_locale-ghost — `state.locale` was never a real field (the real
     language selector is window._currentLang, managed by i18n.js).
     The previous `window.state.locale=null` here only triggered the
     state.js Proxy's "unknown flat key, setting on root: locale"
     warning on every signin / user switch. Removed. */
  /* Persisted caches. */
  try{localStorage.removeItem("socrates-sessions-v2")}catch(_){}
  try{localStorage.removeItem("socrates-api")}catch(_){}
  try{localStorage.removeItem("socrates-guest")}catch(_){}
  try{localStorage.removeItem("socrates-geo")}catch(_){}
  try{localStorage.removeItem("socrates-projects")}catch(_){}
  try{localStorage.removeItem("socrates-recents-filter")}catch(_){}
  try{localStorage.removeItem("socrates-provider-keys")}catch(_){}
  try{localStorage.removeItem("socrates-websearch")}catch(_){}
  /* P_tutor-leak — socrates-appmode is a per-user preference but it
     was never wiped on signOut. A user who once toggled tutor mode
     leaves it set to "tutor" in localStorage; the next person to
     sign in on the same browser inherits tutor mode without ever
     touching the toggle. Clear it (and the runtime mirror) so the
     new session starts in the documented default of "chat". */
  try{localStorage.removeItem("socrates-appmode")}catch(_){}
  try{window.appMode="chat"}catch(_){}
  try{window.appMode=appMode}catch(_){}
  try{if(typeof LAST_ACTIVE_ID_KEY!=="undefined"){try{localStorage.removeItem(LAST_ACTIVE_ID_KEY)}catch(_){}}}catch(_){}
  /* Re-render so the cleared state is visible immediately, not on
     the next user-driven re-render. */
  try{if(typeof renderRecents==="function")renderRecents()}catch(_){}
  try{if(typeof renderMistakes==="function")renderMistakes()}catch(_){}
  try{if(typeof updateMistakesBadge==="function")updateMistakesBadge()}catch(_){}
  try{if(typeof renderProviderList==="function")renderProviderList()}catch(_){}
  try{if(typeof syncModelPills==="function")syncModelPills()}catch(_){}
}
/* Expose so /auth/index.js afterAuthEnter can call it before
 * fetching the new user's data. */
window.clearPerUserClientState=clearPerUserClientState;

async function signOut(){
  try{await apiFetch("/api/auth/logout",{method:"POST"})}catch(_){}
  /* Clear browser cookies on the current domain. The server already
   * cleared both the host-only and .topodrive.top variants of `sid`
   * and `csrf`, but belt-and-braces: also expire the host-only copy
   * locally so a re-login on the same subdomain doesn't see a
   * stale value. We use the bare hostname (no leading dot) for the
   * host-only match and skip the parent-domain variant — the
   * server's Set-Cookie with Domain=.topodrive.top will already
   * overwrite it on the next login. */
  var host=location.hostname;
  document.cookie.split(";").forEach(function(c){
    var eq=c.indexOf("="),name=eq>-1?c.substring(0,eq).trim():c.trim();
    if(!name)return;
    document.cookie=name+"=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/";
    document.cookie=name+"=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain="+host;
  });
  /* Re-fetch the CSRF token cookie so subsequent auth POSTs succeed. */
  try{await fetch("/api/v2/auth/csrf-token",{credentials:"include"})}catch(_){}
  /* P_bleed-signout — wait for any in-flight save before clearing
     CURRENT_USER. Without this, doSave()'s POST could complete AFTER
     CURRENT_USER is null and write the just-loaded messages into the
     previous session's row. resetApp() also awaits _saveInFlight but
     runs AFTER CURRENT_USER is cleared; awaiting here closes the
     window deterministically. */
  if(_saveInFlight){
    try{await _saveInFlight}catch(_){}
  }
  /* P_bleed-signout — wipe every per-user cache so the next user on
     this browser starts from a clean slate. Clears _userMemories /
     geo info / _pendingChatContent (in-memory) AND the full module-
     level set (SERVER_SESSIONS, apiConfig, _cmdKIndex, …)
     plus localStorage entries that survive sign-out. */
  clearPerUserClientState();
  CURRENT_USER=null;
  /* Reset state. */
  resetState();
  resetApp();
  showGate();
  renderUserFooter();
}

/* Built-in Beagle model — always available, never shown in settings.
   The API key is fetched from the server at boot via GET /api/config
   so it stays out of the source tree. Defined here (before authBoot)
   so the IIFE can reference it without relying on var-hoisting timing. */
/* P_main-split — Wave 3c: provider config extracted to config/providers.js. */
import {
  BEAGLE_BUILT_IN, apiConfig, webSearchOn, appMode,
  isReasoningProvider, pickStreamBudgets, hasUsableActive,
  isMiniMaxProvider, ensureSessionShape,
  syncAppModeUI, syncSidebarForMode, setAppMode,
  refreshApiConfig,
} from './config/providers.js';

async function toggleAppMode(){
  /* Mid-session switch: confirm before discarding the live session. */
  var inSession=state.topic||state.kbNodes&&state.kbNodes.length>0||(state.phase==="chat")||
                (document.getElementById("msgList")&&document.getElementById("msgList").children.length>0);
  if(inSession){
    var next=appMode==="tutor"?"Chat":"Tutor";
    var ok=await showConfirm("Switch to "+next+" mode?",
      "Switching will end this session and save it to Recents. You can pick it back up there any time.",
      false);
    if(!ok)return;
    saveCurrentSession();
    resetApp();
  }
  window.appMode=window.appMode==="tutor"?"chat":"tutor";
  /* P_tutor-sync — update the module-level appMode first, then
     sync window.appMode from it so pickers.js and i18n.js's
     applyI18n() see the correct value. The imported binding is
     read-only, so we use setAppMode() to mutate the module var. */
  setAppMode(window.appMode);
  window.appMode = appMode;
  try{localStorage.setItem("socrates-appmode",appMode)}catch(e){}
  syncAppModeUI();
  syncSidebarForMode();
  updateModeBadge();
  /* v3.0 design — re-render the mode banner after a switch so the
     label and switch-button text flip. */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.renderModeBanner==="function"){
    try{tutorSocratic.renderModeBanner()}catch(_){}
  }
}
/* Expose to other modules — the mode banner in tutorSocratic.js
   calls window.toggleAppMode when the user clicks "Switch to
   Chat/Tutor". */
window.toggleAppMode = toggleAppMode;

/* U-H2 — chat-header mode badge. Shows the active mode (Tutor/Chat)
   in the top bar so the user always knows which mode a live
   conversation is in. Called from toggleAppMode(), syncAppModeUI()
   (providers.js) and updateChatStats() (chat/stats.js). Kept separate
   from the retired renderModeBanner() no-op to avoid re-cluttering the
   message list. */
function updateModeBadge(){
  var badge=document.getElementById("chatModeBadge");
  if(!badge)return;
  var mode=(window.appMode==="tutor")?"tutor":"chat";
  var label=(typeof window.t==="function")
    ? window.t(mode==="tutor"?"tutor.modeTutor":"tutor.modeChat")
    : (mode==="tutor"?"Tutor":"Chat");
  badge.textContent=label;
  badge.classList.remove("hidden");
  /* U-H2-anim — re-trigger the badgeSwap CSS keyframes each time the
     mode flips. The badge style has `animation: badgeSwap …` set
     unconditionally, so the keyframes only run on first render. We
     toggle the inline `animation` to none, force a reflow, and
     restore so the animation replays on every mode change. */
  var prevMode=badge.getAttribute("data-mode");
  badge.setAttribute("data-mode",mode);
  badge.classList.remove("mode-tutor","mode-chat");
  badge.classList.toggle("mode-tutor",mode==="tutor");
  badge.classList.toggle("mode-chat",mode==="chat");
  if(prevMode!==mode){
    badge.style.animation="none";
    /* Force layout flush so the browser sees the cleared animation
       before we restore it — without this, the animation property
       resets but no reflow happens and the keyframes don't replay. */
    void badge.offsetWidth;
    badge.style.animation="";
  }
}
window.updateModeBadge = updateModeBadge;

/* P_main-split — Wave 2c: settings + provider management extracted to ui/settings.js. */
import {
  openSettings, closeSettings, toggleAPI, syncSettingsUI,
  renderProviderList, addProvider, removeProvider,
  setActiveProvider, updateProviderField, saveSettings, clearSettings,
  bindSettingsUI,
} from './ui/settings.js';

/* ============================================================
   API CALL (replaces mock when enabled)
   ============================================================ */

/* ============================================================
   SYSTEM CONTEXT — real-time date, estimated user location
   ============================================================ */
var _userMemories=[];   /* cached memories injected into system context */

/* Fetch the user's saved memories from the server so getSystemContext
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
import { loadUserMemories } from './ui/profile.js';

/* P_main-split: system context and geolocation live in system/context.js. */
/* ============================================================
   SYSTEM PROMPTS
   ============================================================ */
/* Chat mode: plain assistant. No quiz/example/practice scaffolding,
   no Socratic questioning, no knowledge-graph awareness. Used when
   the user picks "Chat mode" on the topic-setup screen. */

/* Tutor mode: uses SOCRATIC_SYSTEM_PROMPT imported at the top of this file. */

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

/* Append Beagle identity to the system prompt when the built-in Beagle
   provider is active. This is appended LAST so the model sees it as the
   most recent instruction about its identity, overriding any generic
   system prompt that came before. */
/* Return a prefix with the user's saved memories for long-term context.
   Memories are fetched from /api/memory and cached in _userMemories. */
function memoriesSuffix(){
  var s="";
  if(_userMemories&&_userMemories.length){
    s+="\n\n## User's saved memories (long-term context)\n"+_userMemories.map(function(t){return"- "+t}).join("\n");
  }
  /* Also include the client-side memory store. */
  if(typeof window.injectMemoryContext==="function"){
    var local=window.injectMemoryContext();
    if(local)s+=local;
  }
  return s;
}
/* Cycle through active projects. If the current session is in a
   project, move to the next one; if not, pick the first project. */
function cycleActiveProject(){
  var projects = window.__projectsCache || [];
  if(!projects.length) return;
  var current = state.currentProjectId;
  var idx = -1;
  if(current) idx = projects.findIndex(function(p){ return p.id === current; });
  var next = projects[(idx + 1) % projects.length];
  if(!next) return;
  /* Move current chat to the next project. */
  state.currentProjectId = next.id;
  window.__activeProject = next;
  var sessionId = state.currentSessionId;
  if(sessionId){
    try{
      apiFetch("/api/sessions/" + encodeURIComponent(sessionId), { method: "PATCH", body: { projectId: next.id } });
    }catch(_){}
  }
  if(typeof refreshServerSessions === "function") refreshServerSessions();
  if(typeof renderRecents === "function") renderRecents();
  if(typeof showToast === "function") showToast("Project: " + next.name);
}

function projectContextSuffix(){
  var project=window.__activeProject;
  if(!project||project.id!==state.currentProjectId)return"";
  var suffix="\n\n## Active project\nProject: "+String(project.name||"Untitled");
  if(project.description)suffix+="\nPurpose: "+String(project.description);
  if(project.systemPrompt)suffix+="\nProject instructions: "+String(project.systemPrompt);
  return suffix;
}

/* Return a voice instruction based on the selected tone preset.
   Overrides the default VOICE section of the system prompt. */
function toneVoiceSuffix(){
  if(typeof window.getTonePreset!=="function")return"";
  var tone=window.getTonePreset();
  if(tone==="default"||!tone)return"";
  if(typeof window.getToneVoice!=="function")return"";
  var voice=window.getToneVoice();
  if(!voice)return"";
  return"\n\n## VOICE (override)\n"+voice+"\n";
}

function beagleSuffix(){
  /* The full Beagle behavior spec (Socratic tutor rules, copyright
     guardrails, child-safety clauses, tool-usage conventions, knowledge
     cutoff, search-first policy, etc.) is now injected server-side by
     minimaxProxy.js from prompts/beagle.md — see server/src/lib/prompts.js.

     What remains here is a small defensive belt-and-suspenders suffix:
     the upstream MiniMax-M3 sometimes leaks its training name in
     long conversations, so we explicitly forbid the model from
     identifying as anything other than Beagle / Topodrive. Keeping
     this client-side means it travels with the request even if the
     backend loader ever fails to read the .md file. */
  var p=getActiveProvider();
  if(p&&p.isBuiltIn){
    return "\n\nYou are Beagle, built by Topodrive. "+
      "Never identify yourself as MiniMax or by any other name. "+
      "If asked which model you are, answer 'Beagle'. "+
      "If asked who made you, answer 'Topodrive'.";
  }
  return "";
}
/* Suffix injected into every chat / socratic system prompt to tell
   the model whether to emit visible thinking. When thinkingOn is
   false, we forbid <think> blocks and reasoning_content so the
   rendered output is clean prose. When on, we explicitly allow them
   (some models are shy unless you ask).

   IMPORTANT: phrasing matters. Models often parrot system instructions
   back into their own thinking block (a well-known self-restraint
   pattern), which then leaks the meta-instruction text into the
   rendered UI. We avoid the obvious "Do NOT / Reply directly / clean
   prose / chain-of-thought" phrasing the model tends to echo. The
   appendThinking() front-end filter is a second line of defense. */
function thinkingSuffix(){
  if(window.thinkingOn){
    return "\n\nYou MAY include a brief <think>…</think> block at the start of each reply showing your step-by-step reasoning. The block will be rendered as a collapsible section for the user.";
  }
  return "\n\nKeep your reply focused on the final answer. Avoid exposing step-by-step scratch work to the reader.";
}

function buildSocraticPrompt(topic,level,context){
  var sysCtx=getSystemContext();
  var full=context||"Start by asking a diagnostic question to understand what the user already knows.";
  /* Append the [Web research] block separately (not into the
     per-turn {context} slot) so the model can clearly distinguish the
     user's situation from the live web evidence. */
  if(state.searchContext){
    full+="\n\n"+state.searchContext;
    full+="\n\nNote: a [Web research] block is present above. Treat its results as fresh, authoritative information. You MAY cite them inline as [1], [2], etc. If no [Web research] block is present, you do not have live web access for this turn.";
  }else{
    full+="\n\nNote: no [Web research] block is present. You do not have live web access for this turn — say so honestly rather than guessing about current events, prices, dates, or anything that may have changed since your training cutoff.";
  }
  return sysCtx+"\n\n"+SOCRATIC_SYSTEM_PROMPT.replace("{topic}",topic).replace("{level}",level).replace("{context}",full)+VISUALIZATION_ROUTING_PROMPT+toneVoiceSuffix()+beagleSuffix()+thinkingSuffix()+memoriesSuffix()+projectContextSuffix();
}

/* ============================================================
   CHAT HISTORY EXTRACTION
   Pulls the last N user/assistant turns out of the live msgList so
   the model can see the running conversation. Without this every
   API call is a one-shot prompt and the model "resets" each turn.
   ============================================================ */
/* No max_tokens cap — let the model produce as much as it wants.
   Backend (server/src/routes/chat.js) defaults to its model max when omitted. */
var MAX_TOKENS_CHAT=undefined;  /* omit entirely; backend passes through */
/* ============================================================
   API OVERRIDES — try API first (streaming when possible), fall back to mock.
   Each generator has TWO variants:
     - <name>         : non-streaming, returns full text at once
     - <name>Stream   : streaming, calls onDelta for each token, returns full text
   The chat path uses the *Stream variants; the non-streaming versions are
    kept so the explain / quickAction paths still work.
    ============================================================ */

function buildSocraticMessages(node,domain,history,isFirst){
/* Task 2.2 — drive the lesson from the explicit teaching-stage
     state machine instead of asking the model to infer position
     from chat history. `stageInstruction` returns a short, stage-
     specific directive that is injected into the system prompt. */
  var stage=state.teachingStage||"motivate";
  var stageInstr=stageInstruction(stage);
  /* P_teaching-plan — Inject the "from basics" directive into every
     teaching turn. The cold-start diagnostic only established a
     baseline; it did NOT verify mastery. Every sub-topic must be
     taught from the foundation, regardless of the node's status. */
  var fromBasicsTxt=fromBasicsDirective(node);
  /* P_knowledge-point — pull the specific knowledge points that the
     diagnostic tested for this node, so the model can address them
     explicitly during teaching. This closes the loop: the diagnostic
     identified what the user was tested on, and the teaching now
     targets those exact points. */
  var diagKps="";
  if(Array.isArray(state.diagQuestions)){
    var nodeKps=[];
    state.diagQuestions.forEach(function(q){
      if(q.knowledgePoint&&typeof q.nodeIdx==="number"&&q.nodeIdx===state.kbNodes.indexOf(node)){
        var userAns=state.diagAnswers[state.diagQuestions.indexOf(q)];
        var userLevel=userAns!==undefined&&q.opts[userAns]?q.opts[userAns].level:"unknown";
        nodeKps.push(q.knowledgePoint+" (diagnostic result: "+userLevel+")");
      }
    });
    if(nodeKps.length){
      diagKps="Diagnostic knowledge points for this sub-topic:\n- "+nodeKps.join("\n- ")+"\n\n";
    }
  }
  /* P_level-consistency — pass a level string that is consistent with
     fromBasicsDirective. The old code passed node.status ("fuzzy"),
     which could make the model think the student has some familiarity
     and skip fundamentals. Now we pass a string that reinforces the
     "teach from basics" directive. */
  var levelForPrompt=BASELINE_LEVEL;
  var prompt=buildSocraticPrompt(domain,levelForPrompt,
    (isFirst
      ? fromBasicsTxt+diagKps+
        "You are beginning the '"+stage+"' stage for sub-topic: "+node.name+". "+
        "START at this stage — do not run earlier stages. "+stageInstr+"\n"+
        "Follow the textbook principles:\n"+
        "1) **Foundation-first**: Start with the core definition, build up layer by layer.\n"+
        "2) **Systematic connection**: Link this sub-topic to the broader topic. Make it part of a coherent narrative.\n"+
        "3) **Thorough &amp; descriptive explanation**: Follow the Motivate → Define → Develop → Illustrate flow with the DESCRIPTIVE &amp; THOROUGH DEPTH rules from the system prompt active — verbose by default, ~1500+ words of running prose in the main body, 4-8 sentences per paragraph (3-5 in Chinese 书面语), every term defined in plain words, every formula wrapped in prose, no skipped algebraic steps, no one-sentence paragraphs. 8-20 paragraphs is the minimum floor, not a target.\n"+
        "4) **2-3 <example> blocks** with clear difficulty progression (Example 1 = foundation, Example 2 = application).\n"+
        "5) After examples, end with 1 <practice> block — harder than the examples, requiring transfer.\n"+
        "6) Optional <quiz> block after explanation (before examples) if there's a key point worth checking.\n"+
        "Write in formal, precise textbook language. Use bold for terms. Use LaTeX for math. Build a knowledge system, not isolated facts."
      : fromBasicsTxt+diagKps+
        "Current teaching stage: "+stage+". Sub-topic: "+node.name+". Advance the lesson according to the stage: "+stageInstr+" "+
        "Connect new material to what was already taught. Do NOT restart from the beginning. "+
        "Always include 2-3 <example> blocks (with progression) before any new <practice> block. "+
        "Use <quiz>, <example>, and <practice> blocks per the system prompt. "+
        "Write in formal textbook register. Build systematically on prior knowledge.")
  );
  var msgs=[{role:"system",content:prompt}].concat(history);
  msgs.push({role:"user",content:isFirst?"I'm ready to begin. Please teach me about "+node.name+".":"Continue the lesson from where we left off."});
  return injectTemplateSystemPrompt(msgs);
}

async function generateSocraticQuestion(node,domain){
  if(hasUsableActive()){
    console.log("[Socratic] non-stream for: "+node.name);
    var history=extractHistory();
    var isFirst=history.length===0;
    var msgs=buildSocraticMessages(node,domain,history,isFirst);
    var resp=await callAPI(msgs,MAX_TOKENS_CHAT);
    if(resp&&resp.trim()){
      state.lastCallSource="api";
      return {text:resp.trim(),node:node};
    }
    state.lastCallSource="mock";
  } else { state.lastCallSource="mock"; }
  return _origGenerateSocraticQuestion(node,domain);
};

async function generateSocraticQuestionStream(node,domain,onDelta){
  if(hasUsableActive()){
    console.log("[Socratic] stream for: "+node.name);
    var history=extractHistory();
    var isFirst=history.length===0;
    var msgs=buildSocraticMessages(node,domain,history,isFirst);
    var result=await callAPIStream(msgs,MAX_TOKENS_CHAT,onDelta);
    if(result&&result.text&&result.text.trim()){
      state.lastCallSource="api";
      return result;  // {text, html, widgets}
    }
    /* User explicitly clicked Stop — propagate the cancelled flag so
       the caller (askNextQuestion) can clean up the bubble without
       showing an error or falling back to the mock question. */
    if(result&&result.cancelled){return result}
    if(!state.lastCallError)state.lastCallError="Stream returned no content";
    state.lastCallSource="mock";
  } else { state.lastCallSource="mock"; }
  return null;
};

/* Explanation: called from handleQuickAction('explain') — non-stream is fine here. */
async function getExplanation(status){
  if(hasUsableActive()){
    var node=state.kbNodes[state.currentNode];
    var domain=state.domain;
    /* Depth hint — modulates how detailed the re-explain is, but still
       mandates starting from the core definition per Principle 2. */
    var depthHint=(status==='internalized'||status==='fuzzy')
      ?"The user has some surface familiarity with this topic, so you can move with less scaffolding and fewer examples, but you MUST still begin from the core definition."
      :"The user is encountering this topic for the first time, so use more examples, more analogies, and more scaffolding, and you MUST still begin from the core definition.";
    var history=extractHistory();
    var prompt=buildSocraticPrompt(domain,BASELINE_LEVEL,
      fromBasicsDirective({status:status})+
      "The user clicked 'Explain this' on: "+node.name+". "+depthHint+"\n"+
      "This is a RE-EXPLAIN of material the user has seen before — do not pad it with greetings or meta-commentary, "+
      "but DO re-ground the explanation in the most essential, foundational core definition before moving to anything advanced. "+
      "You may reference earlier examples from the chat history briefly, but the explanation itself must stand on its own "+
      "starting from the foundation.\n"+
      "Write a textbook-quality explanation: systematic, formal, layer-by-layer. Use bold for key terms. Use LaTeX for math. "+
      "Build from foundation to advanced. Include 1-3 concrete examples inline, scaled by the depth hint above."
    );
    var msgs=injectTemplateSystemPrompt(
      [{role:"system",content:prompt}].concat(history).concat([{role:"user",content:"Please explain this concept, taking into account what we've already discussed."}])
    );
    var apiResp=await callAPI(msgs,MAX_TOKENS_CHAT);
    if(apiResp){
      state.lastCallSource="api";
      return apiResp;
    }
    state.lastCallSource="mock";
  } else { state.lastCallSource="mock"; }
  return _origGetExplanation(status);
};

function buildFollowUpMessages(answer,node,domain,history){
  /* Task 2.2 — use the explicit teaching-stage state machine
     instead of telling the model to "look at chat history to see
     exactly where you are". The stage + sub-topic are passed in
     directly, and the per-stage directive is reused from
     stageInstruction() so the wording stays consistent with
     buildSocraticMessages. */
  var stage=state.teachingStage||"motivate";
  var stageInstr=stageInstruction(stage);
  var attempts=state.practiceAttempts||0;
  /* Stage-specific guidance that also factors in whether the user
     just answered a quiz / practice correctly. For quiz-origin
     answers we know `state.practiceAttempts` was bumped on wrong
     attempts; a fresh attempts===0 in the exercise stage implies
     the user just got it right. */
  var stageGuidance="";
  if(stage==="exercise"){
    stageGuidance=attempts>0
      ? "The student has made "+attempts+" attempt(s) at the current practice problem. Evaluate their work: if correct, affirm and move on to the check stage; if wrong or partial, point out the gap, walk through the correct approach briefly, and give a similar practice problem."
      : "Present a practice problem for the student to attempt, then wait for their answer.";
  }else if(stage==="check"){
    stageGuidance="If the student just answered a <quiz> correctly, acknowledge and prepare to move to the next sub-topic. If wrong, briefly correct the misconception and re-check with another short quiz.";
  }else if(stage==="illustrate"){
    stageGuidance="If the student just answered a <quiz>, acknowledge (right/wrong) and continue with the next worked <example> in the progression.";
  }else{
    stageGuidance="Advance the lesson one stage: "+stageInstr;
  }
  var prompt=buildSocraticPrompt(domain,BASELINE_LEVEL,
    fromBasicsDirective(node)+
    "Current teaching stage: "+stage+". Sub-topic: "+node.name+". "+
    "The student just said: \""+answer+"\". "+stageGuidance+"\n"+
    "Your job is to advance the lesson — stay anchored to the two principles above:\n"+
    "- If the student just answered a <quiz>, acknowledge (right/wrong) and move to the next stage (a worked <example> or a <practice> problem). When introducing the next stage's content, re-ground it briefly in the core definition you established earlier — do NOT introduce new symbols, formulas, or terms without that anchor.\n"+
    "- If the student just attempted a <practice> problem, evaluate their work: if correct, affirm and present the next sub-topic; if wrong or partial, point out the gap by re-walking from the core definition outward, then give a similar practice problem. Never patch a wrong answer by jumping ahead — re-anchor at the foundation first.\n"+
    "- If the student just asked a free-form question, answer it briefly (1-2 paragraphs) and then return to the current stage of the loop, still rooted in the foundational definition.\n"+
    "Always use the appropriate <quiz> / <example> / <practice> blocks per the system prompt. "+
    "Do NOT restart the entire topic from scratch on every turn — instead, advance the lesson while keeping the foundation as the persistent anchor for any new material."
  );
  return injectTemplateSystemPrompt(
    [{role:"system",content:prompt}].concat(history).concat([{role:"user",content:answer}])
  );
}

async function generateFollowUp(answer,node,domain){
  if(hasUsableActive()){
    var history=extractHistory();
    var msgs=buildFollowUpMessages(answer,node,domain,history);
    var resp=await callAPI(msgs,MAX_TOKENS_CHAT);
    if(resp&&resp.trim()){
      state.lastCallSource="api";
      return resp.trim();
    }
    state.lastCallSource="mock";
  } else { state.lastCallSource="mock"; }
  return _origGenerateFollowUp(answer,node,domain);
};

async function generateFollowUpStream(answer,node,domain,onDelta,onThinking){
  if(hasUsableActive()){
    var history=extractHistory();
    var msgs=buildFollowUpMessages(answer,node,domain,history);
    var result=await callAPIStream(msgs,MAX_TOKENS_CHAT,onDelta,onThinking);
    if(result&&result.text&&result.text.trim()){
      state.lastCallSource="api";
      return result.text.trim();
    }
    /* Ensure lastCallError is set so the caller (submitChatMessage)
       shows an error bubble instead of silently falling through to
       a random mock question (_origGenerateFollowUp). */
    if(!state.lastCallError)state.lastCallError="Stream returned no content";
    state.lastCallSource="mock";
  } else { state.lastCallSource="mock"; }
  return null;
};


/* ─── Expose all onclick-required functions on window ─── */
window.closeUsageModal = closeUsageModal;
window.openUsageModal = openUsageModal;
window.resendAuthCode = resendAuthCode;
window.resendVerification = resendVerification;
window.resetApp = resetApp;
window.setAuthError = setAuthError;
window.showAuthCodeLogin = showAuthCodeLogin;
window.showAuthForgotPassword = showAuthForgotPassword;
window.showAuthRegister = showAuthRegister;
window.showAuthSignin = showAuthSignin;
window.showAuthView = showAuthView;
window.showGate = showGate;
window.hideGate = hideGate;
window.submitAuthVerify = submitAuthVerify;
window.signOut = signOut;
window.startSession = startSession;
window.submitAuthLoginWithCode = submitAuthLoginWithCode;
window.submitAuthSendCode = submitAuthSendCode;
window.submitChatMessage = submitChatMessage;
window.askChatTurn = askChatTurn;
window.switchAuthTab = switchAuthTab;
window.switchTab = switchTab;
window.syncSidebarBtns = syncSidebarBtns;
window.toggleAppLang = toggleAppLang;
window.toggleDisplayPrefs = toggleDisplayPrefs;
window.toggleExtensionsPicker = toggleExtensionsPicker;
window.toggleModelPicker = toggleModelPicker;
window.toggleChatModelMenu = toggleChatModelMenu;
window.pickChatModel = pickChatModel;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;

window.showUsageTip = showUsageTip;
window.hideUsageTip = hideUsageTip;
window.closeCheatsheet = closeCheatsheet;
window.autoResize = autoResize;
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
window.skipDiagQuestion = skipDiagQuestion;
window.clearActiveTemplate = clearActiveTemplate;

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
/* P_share-load-bridge — auth/boot.js:44 calls `window.loadSharedSession`
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
window.resetApp = resetApp;
window.signOut = signOut;
window.startSession = startSession;
window.submitChatMessage = submitChatMessage;
window.switchTab = switchTab;
window.syncSidebarBtns = syncSidebarBtns;
window.toggleAppLang = toggleAppLang;
window.closeTagEditor = closeTagEditor;
window.actuallyDeleteSession = actuallyDeleteSession;
window.confirmPurgeSession = confirmPurgeSession;
/* Agent mode placeholder (paired with the comment above on lines
   13112-13114). */
// window.deleteAgentRun = deleteAgentRun; // unimplemented
window.finishDiagnostic = finishDiagnostic;
window.proceedToTeaching = proceedToTeaching;
window.loadSession = loadSession;
window.nextDiagQuestion = nextDiagQuestion;
window.onSlashRowClick = onSlashRowClick;
window.updateSlashSelected = updateSlashSelected;
window.updateCmdKSelected = updateCmdKSelected;
window.openCmdKResult = openCmdKResult;
window.openTagEditor = openTagEditor;
window.prevDiagQuestion = prevDiagQuestion;
window.restoreSession = restoreSession;
window.selectDiag = selectDiag;
window.toggleKBDetail = toggleKBDetail;
/* P_input-fields-not-persisted — renderProviderList builds the
 /* P_input-fields-not-persisted — (legacy) settings provider-row inputs
 * previously used inline oninput="updateProviderField(...)". That was
 * replaced by event delegation in settings.js. The window bridge is
 * kept for any external callers still referencing it. */
window.handleChatKey = handleChatKey;
window.markAuthSuccess = markAuthSuccess;
window.refreshServerSessions = refreshServerSessions;
window.refreshApiConfig = refreshApiConfig;
window.renderRecents = renderRecents;
window.renderMistakes = renderMistakes;
window.updateMistakesBadge = updateMistakesBadge;
window.getChatIdFromURL = getChatIdFromURL;
window.setChatIdInURL = setChatIdInURL;
window.pushChatIdToURL = pushChatIdToURL;
/* P_bulk-restore-2026-07-14 — Phase C module bridges.
   These are main.js-local functions referenced by extracted modules
   (chat/quickActions.js, chat/api.js, chat/format.js, pickers.js,
   ui/promptTemplates.js, ui/storage.js, ui/share.js, auth/boot.js,
   tutorSocratic.js) as window.X. Without these bindings the callers
   throw TypeError at runtime. */
window.addMessage = addMessage;
window.askNextQuestion = askNextQuestion;
window.getExplanation = getExplanation;
window.saveCurrentSession = saveCurrentSession;
window.fetchWebContext = fetchWebContext;
window.setSearchPill = setSearchPill;
window.loadPromptTemplates = loadPromptTemplates;
window.deleteCustomTemplate = deleteCustomTemplate;
window.findTemplateByShortcut = findTemplateByShortcut;
window.upsertCustomTemplate = upsertCustomTemplate;
window.getArchivedSessions = getArchivedSessions;
window.fetchGeoInfo = fetchGeoInfo;
window.getCustomInstructionsString = getCustomInstructionsString;
/* Init UI sync — runs after window.apiConfig is set (above) so
   syncModelPills() can safely read the provider config. Moving
   this earlier would throw and halt the entire boot sequence. */
syncModelPills();
syncWebSearchUI();
syncExtensionsUI();
syncAppModeUI();
syncSidebarForMode();
/* Init tone presets and memory store. */
if (typeof window.loadTonePreset === "function") window.loadTonePreset();
if (typeof window.loadMemories === "function") window.loadMemories();
/* Bind settings UI event handlers (replaces inline onclick attributes) */
bindSettingsUI();
