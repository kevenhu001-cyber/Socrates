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
import {
  clearComposer,
  focusComposer,
  getComposerMarkdown,
  getVisibleComposerSurface,
  setComposerMarkdown,
  subscribeComposer,
} from './react/composer-input/controller.ts';
import { toggleShareBtn, toggleChatTopBarEls, openShareModal, closeShareModal } from './ui/share.js';
import './ui/mobileModeSwitch.js';
import { renderAttachmentChips, setupAttachmentInput, openAttachmentPicker } from './attachments/render.js';
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
  getExamIdFromURL, setExamIdInURL, pushExamIdToURL,
  capSessions, getVisibleSessions, getArchivedSessionsFrom,
  sweepExpiredArchivesFrom, createDeletedSessionGuard,
} from './session/store.js';
import { esc, escAttr, escHTML, decodeEntities, stripTags, safeHljsLang } from './render/helpers.js';
import { parseQuizInner, parseExampleInner, parsePracticeInner, parseDefinitionInner, parseFlashcardInner, parseTheoremInner, parseProofInner, parseDerivationInner, parseKeyPointInner } from './render/widgetParsers.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions, renderViz, renderVizLoading, renderMermaid, openVizModal } from './render/viz.js';
import { callAPI, callAPIChat } from './chat/api.js';
import { callAPIStream } from './chat/stream.js';
import { looksLikeUserMentionedSite, extractHttpUrls, fetchPagesForContext } from './chat/webLinks.js';
import { fetchWebContext, shouldRefreshSearch } from './chat/webSearch.js';
import { generateSessionTitle } from './chat/sessionTitle.js';
import { parseOneDiagResponse } from './chat/diagnosticParser.js';
import { generateDiagnosticQuestions } from './chat/diagnosticGenerator.js';
import {
  buildFallbackDiagnosticQuestions,
  requestTutorExploration,
  shouldAutoSearchTutor,
  TUTOR_SEARCH_POLICY_PROMPT,
} from './tutor/policy.js';
import { applyDiagnosticResults } from './chat/diagnosticResults.js';
import { generateTopicKBNodes } from './chat/topicKbNodes.js';
import { buildTeachingPlanFromKB, syncCurrentNodeFromTeachingPlan } from './chat/teachingPlan.js';
import { BASELINE_LEVEL, stageInstruction, fromBasicsDirective } from './chat/socraticDirectives.js';
import { aiGenerate } from './chat/mockDiagnostic.js';
import { extractHistory, buildUserContentParts } from './chat/history.js';
import { CHAT_SYSTEM_PROMPT, CHAT_CONCISE_PROMPT } from './chat/systemPrompts.js';
import { appendInlineArtifact } from './ui/toolCards.js';
import { looksLikeMetaInstruction, appendThinking } from './ui/thinkingPill.js';
/* searchProgress UI removed in favour of the inline status label.
   The import was retired when agent-tool-cards were dropped from the
   live chat surface; the background web_search path now only updates
   state.searchContext and lets the chat bubble's thinking pill
   reflect the activity. The function is still re-exported for the
   legacy e2e suite and `window.__startSearchProgress` test hook. */
import { startSearchProgress } from './ui/searchProgress.js';
import { createToolRuntime } from './chat/toolRuntime.js';
import { settleInlineToolRow } from './ui/toolInline.js';
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
  toggleExtensionsPicker, openExtensionsPicker, closeExtensionsPicker, EXTENSIONS,
  toggleWebSearch, syncWebSearchUI,
} from './pickers.js';

/* React migration bridge. The bridge only exists when `?react=1` loaded the
   dynamic compatibility runtime; default mode pays no React bundle cost.
   Payloads contain lifecycle metadata only — never prompt or response text. */
function publishReactChatRuntime(event){
  try{
    var bridge=window.__socratesReactChatBridge;
    if(bridge&&typeof bridge.publish==="function")bridge.publish(event);
  }catch(_){}
}

/* React owns #msgList's message nodes (marked data-react-owned). Wiping the
   container with innerHTML="" detaches React's nodes behind its back, and the
   next commit crashes with "removeChild … not a child of this node". This
   helper clears only legacy-inserted children (streaming bubbles, research
   cards, thinking pills); React removes its own nodes when the next bridge
   event re-renders from the emptied state. */
function clearLegacyMsgListChildren(){
  var list=document.getElementById("msgList");
  if(!list)return;
  if(typeof window.disposeVisualizations==="function"){
    try{window.disposeVisualizations(list)}catch(_){}
  }
  var kids=Array.prototype.slice.call(list.children);
  for(var ki=0;ki<kids.length;ki++){
    var node=kids[ki];
    if(node&&node.hasAttribute&&node.hasAttribute("data-react-owned"))continue;
    try{list.removeChild(node)}catch(_){}
  }
}

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

  function reportError(correl, label, payload) {
    try {
      var data = JSON.stringify({
        correl: correl,
        label: label,
        msg: payload && payload.message ? payload.message : (typeof payload === 'string' ? payload : String(payload)),
        stack: payload && payload.stack ? payload.stack : '',
        href: typeof window !== 'undefined' && window.location ? window.location.href : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      });
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon('/api/client-error', new Blob([data], { type: 'application/json' }));
      } else if (typeof fetch !== 'undefined') {
        fetch('/api/client-error', { method: 'POST', body: data, keepalive: true }).catch(function(){});
      }
    } catch (_) { /* swallow */ }
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
      reportError(correl, label, payload);
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

/* Expose display-pref functions to window for onclick handlers — the
   functions themselves are imported from displayPrefs.js; the window
   bindings for toggleGrid / setAccentColor / toggleDisplayPrefs /
   toggleTheme are handled by windowExports.js. The remaining display
   helpers (setDisplayFont, setBackgroundColor, etc.) are only used
   locally via direct function references and do not need window
   exposure. */

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
    if(typeof window.isFindOpen==="function"&&window.isFindOpen()){
      e.preventDefault();window.closeFindInSession();return;
    }
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
  /* Cmd/Ctrl+F — in-session find. Only intercept the browser's
     native find when a conversation is actually on screen; on the
     landing / topic-setup page we let the default behaviour run. */
  if(cmd&&!e.altKey&&!e.shiftKey&&key==="f"){
    var _cv=document.getElementById("chatView");
    if(_cv&&!_cv.classList.contains("hidden")){
      e.preventDefault();
      if(typeof window.openFindInSession==="function")window.openFindInSession();
      return;
    }
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
      showToast(t("toast.shareStartFirst"));
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
  /* Cmd+Enter — send from either rich composer. */
  if(cmd&&!e.altKey&&!e.shiftKey&&(key==="enter"||k==="Enter")){
    var composerEl=e.target&&e.target.closest?e.target.closest(".rich-composer"):null;
    if(composerEl){
      e.preventDefault();
      if(composerEl.getAttribute("data-surface")==="topic")startSession();
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
  /* Up arrow in an empty rich composer — recall the latest prompt. */
  if(k==="ArrowUp"&&!cmd&&!e.altKey&&!e.shiftKey){
    var rich=e.target&&e.target.closest?e.target.closest('.rich-composer[data-surface="chat"]'):null;
    if(rich&&!getComposerMarkdown("chat")){
      var lastUser=findLastUserMessage();
      if(lastUser){
        e.preventDefault();
        setComposerMarkdown("chat",lastUser);
        focusComposer("chat");
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
    var input=document.getElementById("chatComposerRoot");
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
window.switchTab=switchTab;
window.setRecentsSearch=setRecentsSearch;
window.toggleSidebarView=toggleSidebarView;

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
  try{showToast(t("toast.loadingSessions"))}catch(_){}
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
/* Returns the _saveInFlight promise when a save was
   initiated/queued, or null if guards bailed. Callers that need to
   wait for the save to complete (e.g. toggleAppMode) can await the
   returned promise. */
function saveCurrentSession(){
  /* P_mobile-topbar — incognito ("无痕对话") sessions are never
     persisted. Entering incognito first saves any prior real session
     (toggleIncognito calls resetApp before flipping this flag), so
     bailing here only blocks the temporary conversation itself. */
  if(window.incognitoOn)return null;
  if(!state.topic)return null;
  if(!CURRENT_USER)return null; /* not signed in; do nothing */
  /* P_context-race — discard saves during session loading. The
     loadSession function is in the middle of rebuilding state and
     any intercepted save would capture mismatched sessionId vs
     messages, causing "会话串台" (context cross-contamination). */
  if(_loadingSession) return null;
  /* If a save is already running, mark dirty and let it coalesce. */
  if(_saveInFlight){
    _saveDirty=true;
    return _saveInFlight;  /* return the existing in-flight promise */
  }
  _saveDirty=false;
  doSave();
  /* doSave() sets _saveInFlight to the fetch+then promise, or leaves
     it as-is if early-exit guards (deleted session guard, empty topic)
     fired. Return it for callers that want to await completion. */
  return _saveInFlight;
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
     partial rawText. The server now upserts by clientId (sessions.js
     onConflictDoUpdate, NOTE-P01-05: this replaced the old insert-only
     path), so a later finish() save CAN overwrite the placeholder, but
     persisting half-rendered content is still wrong: a reload between
     the streaming save and the finish() save would surface a truncated
     reply, and it churns needless writes. Filtering streaming
     placeholders here is the root fix; they are only persisted after
     finish() flips type to "assistant". */
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
    /* P1.1 — persist branchedFrom metadata so a reloaded session
       shows "Branched from ..." in the sidebar. */
    branchedFrom:state.session.branchedFrom||null,
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
      /* P_reasoning-asymmetry — loadSession (L1649) reads
         m.reasoningContent || m.reasoning_content to handle both
         Drizzle camelCase and legacy snake_case payloads. doSave
         must do the same so a round-trip (load → no-op edit → save)
         doesn't silently drop the field for messages that arrived
         with the snake_case key. */
      reasoningContent:m.reasoningContent||m.reasoning_content||null,
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
 * exam.prepareExamView() to flip the visible view + top-bar state,
 * then rehydrates the in-memory state (questions, answers, lang, etc.)
 * and re-renders the question cards. If the saved exam was already
 * submitted, jump straight to the results view; otherwise show the
 * questions with the user's previous answers already selected/filled.
 *
 * prepareExamView() (not openExamPanel()) is the right entry here:
 * openExamPanel() calls renderExamForm() which would wipe the saved
 * questions before we paint them. */
async function loadExamSession(s){
  if(typeof window.prepareExamView==="function"){
    try{window.prepareExamView()}catch(_){}
  }else{
    var ev=document.getElementById("examView");
    var others=["topicSetup","diagnosticView","chatView"];
    others.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add("hidden");});
    var mi=document.getElementById("mainInner");
    if(mi)mi.classList.add("hidden");
    if(ev)ev.classList.remove("hidden");
  }
  state._examInView=true;
  state.currentSessionId=s.id;
  try { window.pushExamIdToURL(s.id); } catch (_) { }
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
  document.getElementById("examViewTitle").textContent=state.examSubmitted?("Exam Results: "+state.examTopic):(state.examTopic);
  var titleBar=document.getElementById("examTitleBar");
  if(titleBar)titleBar.textContent=state.examTopic||"Generate Exam";
  var body=document.getElementById("examViewBody");
  var footer=document.getElementById("examViewFooter");
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
  try{clearComposer("chat")}catch(_){}
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
  publishReactChatRuntime({type:"state-synced",reason:"session-id-changed"});
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
  /* A history rebuild used to clear #msgList before all legacy messages
     had been rendered.  One malformed/obsolete message could then throw
     part-way through and leave the whole conversation blank until refresh.
     Keep a recoverable snapshot until the new history has committed. */
  var previousMessages=null;
  var historyRebuildStarted=false;
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
    s.messages=Array.isArray(s.messages)?s.messages:[];
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
    /* P1.1 — restore branchedFrom metadata so the sidebar shows
       "Branched from ..." for branched sessions. */
    state.session.branchedFrom=s.branchedFrom||null;
    /* Restore KB boundary history and mistake filter. */
    state.kb.boundariesHistory=Array.isArray(s.boundariesHistory)?s.boundariesHistory:[];
    state.kb.mistakeFilter=s.mistakeFilter||"all";
    /* Restore the mode the session was started in. Only override when the
       session has an explicit mode field — sessions without one (older
       rows where the DB defaulted to 'tutor') keep the current appMode
       so a chat user doesn't get silently switched to tutor mode. */
    /* AUDIT-fix — the old code wrote s.mode to window.appMode only,
       then immediately overwrote it with the stale module-level
       binding (`window.appMode=appMode`), so loading a tutor session
       from chat mode (or vice-versa) never actually switched modes.
       setAppMode() mutates the module binding in providers.js (the
       import is read-only here); the window mirror is synced after. */
    if(s.mode==="chat"||s.mode==="tutor"){setAppMode(s.mode);}
    /* P_tutor-sync — setAppMode() now syncs window.appMode internally,
       so no manual mirror is needed here. */
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
    /* Restore .main-inner visibility — exam-view may have hidden it. */
    var mi=document.getElementById("mainInner");
    if(mi)mi.classList.remove("hidden");
    /* Hide exam-only top-bar elements (e.g. #examTitleBar) that may
       still be visible if the previous session was an exam. */
    var examEls=document.querySelectorAll("[data-exam-only='true']");
    examEls.forEach(function(el){el.classList.add("hidden")});
    if (typeof window.hideMainPages === "function") window.hideMainPages();
    toggleChatTopBarEls(true);
    syncChatModel();
    var msgList=document.getElementById("msgList");
    previousMessages=state.messages.slice();
    historyRebuildStarted=true;
    /* Drop legacy leftovers (old streaming bubble, research cards) from
       the previous session; React-owned nodes reconcile from state. */
    clearLegacyMsgListChildren();
    /* React owns #msgList. State is authoritative — React re-renders
       from state.messages. The legacy DOM rebuild (div creation,
       formatMsg/renderAssistantHTML, attachment chip mount,
       msgList.appendChild, and viz/mermaid/code-block post-process)
       was reachable only when the message list was not migrated,
       which is no longer possible after the always-on React runtime. */
    state.messages.length = 0;
    s.messages.forEach(function(m){
      var _rrClientId = m.id || ("loaded-"+(m.clientId || generateId()));
      state.messages.push({
        clientId: _rrClientId,
        role: m.role,
        rawText: m.rawText || "",
        html: m.html || (m.rawText ? formatMsg(m.rawText) : ""),
        type: m.type || null,
        /* AUDIT-fix — the server returns Drizzle rows whose property
           name is the camelCase schema key `reasoningContent` (the
           snake_case `reasoning_content` is only the SQL column name),
           so reading m.reasoning_content always yielded null and the
           thinking pill was silently dropped on every session reload.
           Keep the snake_case fallback for any legacy payloads. */
        reasoningContent: m.reasoningContent || m.reasoning_content || null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        toolCalls: Array.isArray(m.toolCalls) ? m.toolCalls.map(function(tc){
          return {
            id: String(tc.id || ''),
            name: String(tc.name || ''),
            input: tc.input == null ? null : tc.input,
            output: tc.output == null ? null : tc.output,
            isError: tc.isError === true,
            artifacts: Array.isArray(tc.artifacts) ? tc.artifacts.map(function(a){
              return { id: String(a.id || ''), mimeType: a.mimeType || null, name: a.name || null };
            }) : [],
            results: Array.isArray(tc.results) ? tc.results.slice(0, 20) : [],
          };
        }) : [],
        actions: null
      });
    });
    publishReactChatRuntime({ type: "state-synced", reason: "session-loaded-react" });
    /* P_recover-local-fallback — if the server response is missing
       the last assistant message (because the user refreshed before
       saveCurrentSession()'s async POST completed), try to recover it
       from the localStorage mirror that appendLocalMemory writes
       synchronously in finishAfterRender().

       Count server messages vs localStorage messages; if localStorage
       has more, the extras are unpersisted and we push them onto
       state.messages and re-render via the bridge. */
    try{
      var _localRec=loadLocalMemory(s.id);
      if(_localRec&&Array.isArray(_localRec.messages)&&_localRec.messages.length>(s.messages||[]).length){
        var _serverCount=(s.messages||[]).length;
        var _extras=_localRec.messages.slice(_serverCount);
        for(var _ei=0;_ei<_extras.length;_ei++){
          var _em=_extras[_ei];
          if(!_em||!_em.content)continue;
          if(_em.role!=="assistant")continue;
          state.messages.push({
            clientId:"local-recovered-"+generateId(),
            role:"assistant",
            rawText:_em.content,
            html:renderAssistantHTML(_em.content),
            type:"assistant",
            reasoningContent:null,
            attachments:[],
            toolCalls:[],
            actions:null
          });
        }
        publishReactChatRuntime({ type: "state-synced", reason: "local-recovered-react" });
      }
    }catch(_){}
    /* P_streaming-survival — if the server has saved streaming_text
       (the previous stream was interrupted before completion), surface
       it as a partial assistant message with a Retry button so the
       user can resume the interrupted response. State push is
       authoritative; React re-renders the bubble from snapshot. The
       retry click is delegated on msgList (React-owned) because the
       button DOM is owned by React after the next paint. */
    if(s.streamingText){
      var partialText=s.streamingText||"(partial content)";
      var partialRendered;
      try{partialRendered=formatMsg(partialText)}catch(_){partialRendered="<p>"+esc(partialText)+"</p>"}
      var partialHtml='<div class="msg-content">'+partialRendered+'</div>'+
        '<div class="msg-error" style="margin-top:8px">'+
          '<span class="msg-error-text">(response interrupted — tap Retry to continue)</span>'+
          '<button type="button" class="msg-retry-btn stream-retry-btn" data-stream-retry>Retry</button>'+
        '</div>';
      var partialClientId="stream-recovered-"+Date.now();
      var partialIdx2=state.messages.push({
        role:"assistant",
        clientId:partialClientId,
        rawText:partialText,
        html:partialHtml,
        type:"assistant",
      })-1;
      /* Delegate the retry click on the React-owned msgList so the
         React-rendered button works without us touching the DOM. */
      var retryDelegated=function(ev){
        var t=ev.target;
        if(!(t && t.matches && t.matches("[data-stream-retry]")))return;
        msgList.removeEventListener("click",retryDelegated);
        if(partialIdx2>=0&&state.messages[partialIdx2]){
          state.messages.splice(partialIdx2,1);
        }
        apiFetch("/api/sessions/"+encodeURIComponent(s.id),{
          method:"PATCH",
          body:{streamingText:null,streamingReasoning:null},
          timeoutMs:5000,
        }).catch(function(){});
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
          showToast(t("toast.noRetryTarget"));
        }
      };
      msgList.addEventListener("click",retryDelegated);
      /* Clear the server-side streaming_text so a second reload
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
       currentSessionId pointed to the new session but
       state.messages still held old data — any saveCurrentSession()
       firing in that window would cross-contaminate contexts. */
    setCurrentSessionId(s.id);
    pushChatIdToURL(s.id);
    /* P_share-btn — loadSession() already had a toggleShareBtn()
       call early (before setCurrentSessionId fixed the id), but
       at that point currentSessionId was still null so the button
       stayed hidden. Run it again now that the id is set. */
    toggleShareBtn();
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
    publishReactChatRuntime({type:"state-synced",reason:"session-loaded"});
  }catch(e){
    /* P_stale-loadSession — if a newer loadSession was requested
       while this one was in-flight, the error (if any) belongs to
       the stale request; don't disrupt the newer session's state. */
    if(_loadSessionId!==id) return;
    /* Preserve the last stable conversation when a legacy record cannot be
       rendered.  The server copy remains untouched; this only prevents a
       transient client rendering failure from blanking the current view. */
    if(historyRebuildStarted && previousMessages){
      try{
        state.messages.length=0;
        Array.prototype.push.apply(state.messages,previousMessages);
        publishReactChatRuntime({type:"state-synced",reason:"session-load-failed"});
      }catch(_){}
    }
    
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
      showToast(t("session.loadFailed").replace("{msg}", e && e.message || "temporary error"));
      return;
    }
    
    showToast(t("session.notFound"));
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
        clearLegacyMsgListChildren();
        state.currentSessionId=null;
        state.topic="";
        state.kbNodes=[];
        state.phase="topic";
        state.messages.length=0;
        publishReactChatRuntime({type:"state-synced",reason:"session-not-found"});
        document.getElementById("chatView").classList.add("hidden");
        toggleChatTopBarEls(false);
        document.getElementById("topicSetup").classList.remove("hidden");
        if (typeof window.hideMainPages === "function") window.hideMainPages();
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
    showToast(t("tags.maxTags"));
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
    showToast(t("session.deleted"));
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
    try{showToast(t("session.deleteFailedRefresh").replace("{msg}", err&&err.message||"server error"),4000)}catch(_){}
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
  renderArchivedList();
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
    showToast(t("session.archiveFirst"));
    return;
  }
  showConfirm(
    t("confirm.deleteForever.title"),
    t("confirm.deleteForever.msg").replace("{title}",s.title||s.topic||"this session"),
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
      showToast(t("session.deleted"));
    }).catch(function(err){
      showToast(t("session.deleteFailedMsg").replace("{msg}", err&&err.message||"server error"));
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
  /* Abort any active chat stream so callbacks don't write to
     state after resetState() has cleared it. */
  if(window._activeChatAbort){try{window._activeChatAbort("archived-session")}catch(_){}}
  if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
  window._activeChatCtl=null;
  window._activeChatAbort=null;
  _chatStreaming=false;
  _chatStopMode=false;
  try{window._pendingChatContent=null}catch(_){}
  try{window._pendingAttachments=null}catch(_){}
  resetState();
  toggleShareBtn();
  setChatIdInURL(null);
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  if (typeof window.hideMainPages === "function") window.hideMainPages();
  toggleChatTopBarEls(false);
  clearLegacyMsgListChildren();
  publishReactChatRuntime({type:"state-synced",reason:"archived-session-reset"});
  clearComposer("topic");
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">'+(typeof t==="function"?t("tutor.kbTopicFirst"):"Set a topic to build your knowledge map.")+'</div>';
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc=document.getElementById("teachingPlanContent");if(_tpc)_tpc.innerHTML="";
  document.getElementById("chatStats").textContent="";
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
        '<span>'+(isPinned?t("session.ctxUnpin"):t("session.ctxPin"))+'</span>'+
      '</button>'+
      /* Custom label */
      '<div class="session-context-label-row">'+
        '<button class="session-context-label-trigger" id="sessionCtxLabelTrigger" type="button">'+
          '<span class="session-context-icon">'+labelSvg()+'</span>'+
          '<span>'+t("session.ctxCustomLabel")+(label?' <mark>'+esc(label)+'</mark>':'')+'</span>'+
        '</button>'+
        '<div class="session-context-label-input-wrap hidden" id="sessionCtxLabelWrap">'+
          '<span class="session-context-icon">'+labelSvg()+'</span>'+
          '<input class="session-context-label-input" id="sessionCtxLabelInput" type="text" placeholder="'+esc(t("session.ctxCustomLabel"))+'\u2026" maxlength="30" value="'+esc(label)+'">'+
        '</div>'+
        '<button class="session-context-label-set hidden" id="sessionCtxLabelSet">'+t("session.ctxLabelSet")+'</button>'+
      '</div>'+
      /* Move to project */
      '<div class="session-context-move-to-project">'+
        '<div class="session-context-move-header">'+t("session.ctxMoveToProject")+'</div>'+
        '<div class="session-context-project-list" id="sessionCtxProjectList"></div>'+
      '</div>'+
      /* Delete */
      '<button class="session-context-btn session-context-btn-danger" data-action="delete">'+
        '<span class="session-context-icon">'+deleteSvg()+'</span>'+
        '<span>'+t("session.ctxDelete")+'</span>'+
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
  /* Custom label: clicking the trigger shows the input. */
  var trigger=pop.querySelector("#sessionCtxLabelTrigger");
  var wrap=pop.querySelector("#sessionCtxLabelWrap");
  var input=pop.querySelector("#sessionCtxLabelInput");
  var setBtn=pop.querySelector("#sessionCtxLabelSet");
  trigger.onclick=function(ev){
    ev.stopPropagation();
    trigger.classList.add("hidden");
    wrap.classList.remove("hidden");
    setBtn.classList.remove("hidden");
    setTimeout(function(){input.focus();input.select()},50);
  };
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
  if(!projects.length && !window.__projectsFetchFailed){
    /* Fetch projects first. */
    if(typeof apiFetch === "function"){
      apiFetch("/api/projects").then(function(r){
        window.__projectsCache = (r && r.projects) || [];
        window.__projectsFetchFailed = false;
        renderProjectListItems(list, sessionId);
      }).catch(function(){
        window.__projectsFetchFailed = true;
        list.innerHTML = '<div class="session-context-project-item">No projects available</div>';
      });
    }
    list.innerHTML = '<div class="session-context-project-item">Loading projects...</div>';
    return;
  }
  if(!projects.length){
    list.innerHTML = '<div class="session-context-project-item">No projects available</div>';
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
/* Expose drag functions globally so inline ondragstart/ondragend work. */
window.onSessionDragStart = onSessionDragStart;
window.onSessionDragEnd = onSessionDragEnd;
window.onProjectDrop = onProjectDrop;

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
        if(typeof showToast === "function") showToast(t("toast.movedToProject").replace("{name}", project.name));
      })
      .catch(function(){
        if(typeof showToast === "function") showToast(t("toast.moveSessionFailed"));
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
/* React migration bridge — publishes the session list data so the React
   session list component can render declaratively. Works under `?react=1`;
   legacy mode never installs the bridge, so this is a cheap no-op. */
function _publishSessionList(){
  try{
    var bridge=window.__socratesSessionListBridge;
    if(!bridge||typeof bridge.publish!=="function")return;
    var sessions=getRecents();
    var filter=getRecentsFilter();
    /* Apply the persistent tag filter, same as doRenderRecents. */
    sessions=filterRecentsByChip(sessions,filter);
    /* Apply search filter. */
    var searchQ=(RECENTS_SEARCH_QUERY||"").trim().toLowerCase();
    if(searchQ){
      sessions=sessions.filter(function(s){
        var hay=((s.title||"")+" "+(s.topic||"")).toLowerCase();
        return hay.indexOf(searchQ)!==-1;
      });
    }
    bridge.publish({
      sessions: sessions.map(function(s){
        return {
          id: s.id,
          title: s.title||"",
          topic: s.topic||"",
          updatedAt: s.updated_at||s.updatedAt||null,
          createdAt: s.created_at||s.createdAt||null,
          totalQ: s.total_q||s.totalQ||0,
          mode: s.mode||"",
          phase: s.phase||"",
          kind: s.kind||"",
          pinned: !!s.pinned,
          tags: Array.isArray(s.tags)?s.tags:[],
          label: (typeof window.getSessionLabel==="function")?window.getSessionLabel(s.id):"",
          archivedAt: typeof s.archivedAt==="number"?s.archivedAt:null,
          branchedFrom: s.branchedFrom||null,
        };
      }),
      currentSessionId: window.state?window.state.session.currentSessionId:null,
      searchQuery: searchQ,
      filter: filter,
      fetchFailed: !!window.SERVER_SESSIONS_FETCH_FAILED,
    });
  }catch(_){/* swallow — bridge is best-effort */}
}

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
  /* React owns the session list. Publish the snapshot via the bridge
     so React re-renders from state. The legacy innerHTML rendering
     was reachable only when session-list was not migrated, which is
     no longer possible after the always-on React runtime landed. */
  _publishSessionList();
  renderRecentsFilterChips();
}

function renderRecentsFilterChips(){
  /* Fetch projects for the filter chips if not cached. */
  var projects = window.__projectsCache || [];
  if (!projects.length && !window.__projectsFetchFailed && typeof apiFetch === "function") {
    apiFetch("/api/projects").then(function(r){
      window.__projectsCache = (r && r.projects) || [];
      renderRecentsFilterChips();
    }).catch(function(){
      /* Mark failure so we don't retry on every renderRecents call.
         The user can refresh the page to retry. */
      window.__projectsFetchFailed = true;
    });
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
  var topic=getComposerMarkdown("topic").trim();
  if(!topic)return;

  /* Deep Research mode — if the extension is active, route the landing
     topic straight into the research agent instead of starting a normal
     tutor/chat session. The chip toggles window.deepResearchOn; without
     this check the Begin button on the landing page would bypass
     research entirely (P_deep-research-fix). */
  var _deepResearchOn=false;
  try{ _deepResearchOn=!!window.deepResearchOn; }catch(_){}
  if(_deepResearchOn && typeof window.launchDeepResearch==="function"){
    window.launchDeepResearch();
    return;
  }

  var lang=detectLanguage(topic);
  var tutorExploration={enabled:false,count:0};
  if(appMode==="tutor"){
    tutorExploration=await requestTutorExploration({
      isZh:(_currentLang==="zh"||lang==="zh"),
    });
    if(!tutorExploration)return;
  }

  state.topic=topic;
  state.diagIndex=0;
  state.diagAnswers=[];

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
  /* P_currentProjectId-leak — reset project binding so a new session
     started via Begin (without going through resetApp()) doesn't
     inherit the previous session's projectId. Preserve any project
     explicitly selected via _nextProjectId (same pattern as
     resetApp()). */
  state.currentProjectId=null;
  if(window._nextProjectId){
    state.currentProjectId=window._nextProjectId;
    window._nextProjectId=null;
  }
  state.diagQuestions=[];
  state.diagAnswers=[];
  state.diagIndex=0;
  state.substantiveCount=0;
  state.stuckCount=0;
  state.session.stuckCheckOffered=false;
  state.session.stuckCheckRejected=0;
  state.session.fourOptionDialog=null;
  /* AUDIT-R5 — stamp the phase for the Begin-time auto-save below.
     Previously the tutor branch never set phase before the first
     save, so a tutor session created right after a chat session
     inherited phase="chat" on the server. proceedToTeaching flips
     tutor sessions to "chat" once teaching actually starts. */
  state.phase=(appMode==="chat")?"chat":"diagnostic";
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
    clearLegacyMsgListChildren();
    publishReactChatRuntime({type:"state-synced",reason:"new-chat-start"});
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

  /* The boundary exploration is optional. Skipping it starts the
     teaching plan with unprobed nodes instead of manufacturing answers
     or forcing the historical five-question detour. */
  if(!tutorExploration.enabled){
    state.phase="chat";
    document.getElementById("diagnosticView").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    proceedToTeaching();
    return;
  }
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
    /* AUDIT-R3 — the Begin click already auto-saved an empty session
       row (P_recents-auto) and set state.topic. Cancelling used to
       leave both behind: a ghost row in Recents and a stale topic
       that made resetApp show a bogus "active session" confirm.
       Clear the local session identity first (blocks further saves
       via the state.topic guard), then delete the server row after
       the in-flight Begin-save drains so the DELETE can't lose the
       race with its own POST. */
    var cancelledSid=state.session.currentSessionId||state.currentSessionId;
    state.topic="";
    state.phase="topic";
    setCurrentSessionId(null);
    setChatIdInURL(null);
    if(cancelledSid){
      rememberDeletedSession(cancelledSid);
      Promise.resolve(_saveInFlight).catch(function(){}).then(function(){
        return apiFetch("/api/sessions/"+encodeURIComponent(cancelledSid),{
          method:"DELETE",
          timeoutMs:8000,
        });
      }).then(function(){
        return refreshServerSessions();
      }).then(function(){
        renderRecents();
      }).catch(function(){});
    }
    var dv=document.getElementById("diagnosticView");
    if(dv){dv.classList.add("hidden");dv.innerHTML="";}
    var ts=document.getElementById("topicSetup");
    if(ts)ts.classList.remove("hidden");
    focusComposer("topic");
  };
  document.getElementById("diagnosticView").innerHTML=diagLoadingHTML();

/* Phase 3 — background web search populates state.searchContext
   * for the diagnostic question without rendering a separate
   * activity log. The chat bubble's inline status label (see
   * thinkingPill.labelForTool) takes care of "Searching…" for live
   * tool calls; diagnostic-mode web search used to show a richer
   * step-by-step card via startSearchProgress, but that surface
   * was retired when the agent-tool-card UI was removed. */
  if(webSearchOn&&shouldAutoSearchTutor(topic)){
    try{
      fetchWebContext(topic,{}).then(function(sc){
        state.searchContext=sc.context||"";
      }).catch(function(){});
    }catch(_){}
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
      }, function(){ return !!state.diagCancel; }, tutorExploration.count);
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
    state.diagQuestions = buildFallbackDiagnosticQuestions(
      topic,
      tutorExploration.count,
      (_currentLang==="zh"||lang==="zh")
    );
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

/* P_inline-onclick-bridge — these handlers are referenced by
   `onclick="X()"` attributes in dynamically generated HTML
   (diagnostic flow buttons, tag editor done, slash row click, active
   template chip). Inline attribute handlers resolve identifiers in the
   global scope, so they must be bound on window at module load. */
window.closeTagEditor = closeTagEditor;
window.clearActiveTemplate = clearActiveTemplate;
window.onSlashRowClick = onSlashRowClick;
window.selectDiag = selectDiag;
window.prevDiagQuestion = prevDiagQuestion;
window.nextDiagQuestion = nextDiagQuestion;
window.skipDiagQuestion = skipDiagQuestion;
window.finishDiagnostic = finishDiagnostic;
window.proceedToTeaching = proceedToTeaching;
window.moveSessionToProject = moveSessionToProject;

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
  /* AUDIT-R5 — diagnostic is over; the session now lives in the chat
     view, so persist phase="chat" (loadSession also uses this as the
     signal that the conversation is resumable). */
  state.phase="chat";

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
    var retryThisTurn=function(){
      try{window._pendingChatContent=pendingContent;}catch(_){}
      askChatTurn(userText);
    };
    var ctlOff=addStreamingMessage({onRetry:retryThisTurn});
    ctlOff.replaceWithError("You appear to be offline — check your connection and retry.",retryThisTurn);
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
  /* AUDIT-R4 — consume-once. Leaving the pending content on window
     after this read meant a later askChatTurn call that didn't set
     it (retry of an OLDER turn, re-explain, recovered-stream retry)
     would silently replay whichever multimodal payload happened to
     be there last. Retry closures below capture the local snapshot
     and restore it before re-entering, so retrying THIS turn still
     carries its own attachments. */
  try{window._pendingChatContent=null;}catch(_){}
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
    try{
      var fetched=await fetchPagesForContext(urls);
      pageBlocks=fetched.blocks||[];
      pageResults=fetched.results||[];
    }catch(_){pageBlocks=[];pageResults=[]}
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
   * CHAT_SYSTEM_PROMPT (verbose scholar voice + <think> suffix) or
   * CHAT_CONCISE_PROMPT (direct, no preamble, no thinking block).
   * Deep thinking is no longer a standalone toggle: it is driven by the
   * reasoning-effort picker — High effort selects the verbose prompt,
   * Medium/Low select the concise one. We derive it here (and keep
   * window.extensiveThinkingOn in sync) so the choice always matches the
   * picker regardless of load order. */
  var _effortHigh = (typeof window.getReasoningEffort === "function" && window.getReasoningEffort() === "high");
  try{ window.extensiveThinkingOn = _effortHigh; }catch(_){}
  var chatPrompt = _effortHigh ? CHAT_SYSTEM_PROMPT : CHAT_CONCISE_PROMPT;
  var thinkSuffix = _effortHigh ? thinkingSuffix() : "";
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
  
  var ctl=addStreamingMessage({onRetry:function(){
    /* AUDIT-R4 — restore this turn's own content snapshot so the
       retry doesn't pick up a newer turn's pending payload. */
    try{window._pendingChatContent=pendingContent;}catch(_){}
    askChatTurn(userText);
  }});
  /* P_inline-tools — tool status is now carried by the inline
     .tool-inline rows inside the bubble (created via the streaming
     controller's onInlineTool), so the transient thinking-pill label
     swap ("Searching…" / "已找到 N 条…") is gone. */
  var result=await callAPIStream(msgs,MAX_TOKENS_CHAT,function(delta){ctl.append(delta)},function(t){ctl.appendThinking(t)},{
    onToolUse:function(calls){for(var i=0;i<calls.length;i++){ctl.recordToolUse(calls[i])}},
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
/* Slash commands are shared by the topic and chat rich composers. */
function _getSlashSurface(){
  var visible=getVisibleComposerSurface();
  var value=getComposerMarkdown(visible);
  if(value && value.charAt(0)==="/") return visible;
  var other=visible==="chat"?"topic":"chat";
  value=getComposerMarkdown(other);
  if(value && value.charAt(0)==="/") return other;
  return null;
}
var _slashActiveSurface = null;
function _currentSlashQuery(){
  var surface=_getSlashSurface();
  if(!surface) return null;
  _slashActiveSurface = surface;
  var v=getComposerMarkdown(surface);
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
  if(_slashActiveSurface==="topic"){
    anchor=document.getElementById("topicInputWrap");
  }
  if(!anchor) anchor=document.getElementById("chatInputWrap")||document.getElementById("chatComposerRoot");
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
  /* Use whichever composer surface triggered the palette. */
  var surface=_slashActiveSurface;
  if(!surface) return;
  var q=_currentSlashQuery();
  var tail=q?q.tail:"";
  if(t._kind==="app"){
    /* Connected app: drop a natural-language directive into the
       composer and place the cursor at the end so the user can type
       the specifics (e.g. "Search arXiv for |"). The model auto-calls
       the matching connector tool via tool_choice:'auto' — no template
       mode is activated, so follow-up turns stay unconstrained. */
    var directive=t.insert||"";
    setComposerMarkdown(surface,directive+tail);
    focusComposer(surface);
  }else{
    /* Replace ONLY the leading `/query` chunk with the
       template body, preserving any text the user typed
       after the first whitespace. This matters because
       users often type `/explain this code` and expect
       ` this code` to survive the click. */
    var body=t.body||"";
    setComposerMarkdown(surface,body+tail);
    focusComposer(surface);
    /* Activate the template so the next LLM call gets the
       specialized system prompt. The chip surfaces the
       mode so the user can see (and dismiss) what's
       happening — without the chip, the model would
       silently switch modes and the user would have no
       idea why the response shape changed. */
    setActiveTemplate(t);
  }
  if(typeof updateSendBtn==="function")updateSendBtn();
  /* P_slash-topic — also sync the Begin button when on topic input. */
  if(surface==="topic" && typeof updateStartBtn==="function") updateStartBtn();
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
subscribeComposer(function(surface,v){
  if(surface==="chat")updateSendBtn();
  else updateStartBtn();
  if(v.charAt(0)==="/"){
    _slashActiveSurface=surface;
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
  var rawText=(textOverride!=null?textOverride:getComposerMarkdown("chat"));
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
      try{showToast(t("toast.typeTextFirst"));}catch(_){}
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
    clearComposer("chat");updateSendBtn();
    scheduleScrollMainToBottom({force:true});
    focusComposer("chat");
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
  if(webSearchOn&&state.topic&&shouldRefreshSearch()&&shouldAutoSearchTutor(state.topic+" "+text)){
    fetchWebContext(state.topic+" "+text,{background:true});
  }
  setTimeout(async function(){
    /* Deep Research mode — if the extension is active, run research
       instead of a normal chat turn. Read the window-level flag set by
       pickers.js: the EXTENSIONS array is module-scoped in pickers.js
       and is NOT visible here, so `typeof EXTENSIONS` was always
       "undefined" and this branch never fired (P_deep-research-fix). */
    var deepResearchOn = false;
    try{ deepResearchOn = !!window.deepResearchOn; }catch(_){}
    if(deepResearchOn && text){
      if(typeof window.startDeepResearch === "function"){
        await window.startDeepResearch(text);
      }
      return;
    }
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
    /* U-M1 — the teaching-plan sidebar now shows the substantive-answer
       depth counter (n/3), so re-render it whenever the counter or the
       stage may have moved. */
    if(typeof tutorSocratic==="object"&&tutorSocratic
       &&typeof tutorSocratic.renderTeachingPlan==="function"){
      try{tutorSocratic.renderTeachingPlan()}catch(_){}
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
      /* U-M2 — only a substantive (or quiz-driven) answer proves the
         student isn't stuck. The old unconditional reset here meant
         stuckCount could never reach 3 — the explain-offer escape
         valve below was dead code and genuinely stuck students just
         kept getting harder follow-ups. Short answers now accumulate;
         three in a row trigger the stuck flow. */
      if(isSubstantive||opts.origin==="quiz"){state.stuckCount=0}
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

/* P1.1 — per-message action toolbar now lives in React. See
   `frontend/src/react/message-list/useMessageActions.ts` (the `stripHtmlToText`
   + `fallbackCopy` helpers there replace the legacy `buildMessageToolbar`
   family). All call sites in this file are guarded by
   `data-react-migration-runtime === "msg-list"` and skip the legacy path. */

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
  if(idx<0){showToast(t("toast.messageNotFound"));return}
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
      showToast(t("toast.savedOffline"));
    });
    /* P0.1 BUG-P01-03 — if the edited message carried image / PDF /
       text attachments, rebuild the multimodal content parts and stash
       them on window._pendingChatContent so the resend still includes
       the attachments. After the previous send this global is null
       (cleared post-send), so without this the edited turn would
       degrade to text-only even though extractHistory can rebuild the
       parts — askChatTurn slices the trailing user history entry and
       sends _pendingChatContent (or the plain text fallback) instead.
       A text-only edit yields null → askChatTurn falls back to text. */
    try{ window._pendingChatContent=buildUserContentParts(editedText,entry.attachments); }catch(_){ window._pendingChatContent=null; }
    /* Replay from the edited turn. askChatTurn writes a fresh
       streaming assistant bubble into the now-empty tail of the
       conversation. P0.1 NOTE-P01-06 — start the new turn only AFTER
       the PATCH settles. discardFollowing deletes assistant rows with
       createdAt >= this user turn; the regenerated reply also gets
       createdAt = now, so if the server delete landed AFTER the fresh
       reply was saved it would wipe the new answer. Chaining the re-ask
       on patchPromise (which resolves even on failure via .catch) closes
       that window — the sub-second PATCH is imperceptible against model
       latency, and the abort below stops any in-flight stream at once. */
    if(typeof window.askChatTurn==="function"){
      /* If a stream is already in flight (e.g. user clicked edit
         while the previous reply was still arriving), abort it
         first so the new turn isn't racing the old one. */
      if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
      if(window._activeChatAbort){try{window._activeChatAbort("msg-edit")}catch(_){}}
      patchPromise.then(function(){
        try{ window.askChatTurn(editedText); }catch(e){/* msg-edit replay failed */}
      });
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
    /* React-owned bubbles are removed by React itself when the
       state-synced event below re-renders from the spliced state.
       Detaching them here would crash React's next commit. */
    if(div&&div.hasAttribute("data-react-owned"))return;
    if(div&&div.parentNode)div.parentNode.removeChild(div);
  });
  publishReactChatRuntime({type:"state-synced",reason:"rollback"});
  return toDrop.length;
}
function deleteUserMessage(messageId,bar){
  var idx=findMessageIndex(messageId);
  if(idx<0)return;
  state.messages.splice(idx,1);
  var div=document.querySelector('[data-client-id="'+messageId+'"]');
  if(div&&!div.hasAttribute("data-react-owned"))div.remove();
  publishReactChatRuntime({type:"state-synced",reason:"message-deleted"});
  apiFetch("/api/messages/"+encodeURIComponent(messageId),{
    method:"DELETE",
    timeoutMs:8000
  }).catch(function(e){
    console.log("[msg-delete] not synced");
  });
}
function regenerateAssistantMessage(messageId,bar){
  /* Hook into the existing streaming pipeline. Locate the user turn
     that produced this assistant reply, rewind the conversation to it
     (locally + server-side), then re-ask. */
  var assistantIdx=findMessageIndex(messageId);
  if(assistantIdx<0)return;
  var userIdx=assistantIdx-1;
  while(userIdx>=0&&state.messages[userIdx].role!=="user")userIdx--;
  var userEntry=userIdx>=0?state.messages[userIdx]:null;
  var userText=userEntry&&userEntry.rawText;
  if(!userText)return;
  var userMessageId=userEntry.id||userEntry.clientId;
  /* P0.1 BUG-P01-04 — rewind to the user turn instead of splicing only
     the single assistant bubble. Regenerating a reply invalidates every
     message that followed it, so drop them all from state + DOM (matches
     editUserMessage semantics). For the common case (the last assistant
     reply) this removes exactly that bubble; for a mid-conversation
     regenerate it prevents the new reply from being appended out of
     order after stale later turns. */
  rollbackMessagesAfter(userMessageId);
  /* P0.1 BUG-P01-02 — delete the replaced assistant rows server-side so
     a hard reload doesn't resurrect the stale reply. saveCurrentSession
     only upserts (never deletes rows absent from the payload), so the
     old assistant would otherwise persist as an orphan. Reuse the proven
     edit cleanup (PATCH …&discardFollowing) but with regenerate:false —
     the client re-asks locally via askChatTurn, so the server must NOT
     also generate a reply. Requires the user message to have a server
     UUID; a client-only id 400s and is caught (same limitation as edit,
     where the local rewind still holds until the next successful sync). */
  var patchPromise=Promise.resolve();
  if(userMessageId){
    patchPromise=apiFetch("/api/messages/"+encodeURIComponent(userMessageId),{
      method:"PATCH",
      body:{content:userText,regenerate:false,discardFollowing:true},
      timeoutMs:15000
    }).catch(function(e){
      console.log("[msg-regen] server cleanup failed");
    });
  }
  /* P0.1 BUG-P01-03 (regenerate parity) — carry the original turn's
     attachments so a regenerate of a message that had an image / PDF /
     text doesn't degrade to text-only. Null for text-only turns. */
  try{ window._pendingChatContent=buildUserContentParts(userText,userEntry.attachments); }catch(_){ window._pendingChatContent=null; }
  if(typeof window.askChatTurn==="function"){
    /* Abort any in-flight stream so the regenerated turn isn't racing
       a previous reply that's still arriving. */
    if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
    if(window._activeChatAbort){try{window._activeChatAbort("msg-regen")}catch(_){}}
    /* P0.1 NOTE-P01-06 — re-ask only AFTER the server discardFollowing
       settles, so the delete (assistant rows createdAt >= user turn)
       can't land after the fresh reply is saved and wipe it. Mirrors
       editUserMessage. patchPromise resolves even on failure (.catch). */
    patchPromise.then(function(){
      try{ window.askChatTurn(userText); }catch(e){/* regen failed */}
    });
  }
}
/* Branch from a message — fork the conversation at this point.
   Saves the current session first, then creates a new session
   whose history only includes messages up to and including the
   branched message. The user can then continue in a different
   direction without affecting the original thread. */
function branchFromMessage(messageId, opts){
  opts = opts || {};
  /* P1.1 — educational reExplain: when the branch is triggered by the
     re-explain button, inject a pedagogical directive into the system
     prompt so the model explains the topic from a different angle. */
  var reExplain = !!opts.reExplain;
  var branchIdx=findMessageIndex(messageId);
  if(branchIdx<0){showToast(t("toast.messageNotFound"));return}
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
  /* P1.1 — branchedFrom metadata: record the source session id and
     the message id where the branch was taken, so the sidebar can
     display "Branched from ..." and the user can navigate back. */
  var branchedFrom = {
    sessionId: state.session.currentSessionId || state.currentSessionId || null,
    messageId: messageId,
    reExplain: reExplain,
  };
  /* Reset the app to a clean state, then inject the branched
     messages. We set a flag so the new session starts with the
     branch context instead of a blank topic. */
  var _branchContext={messages:branchMessages,topic:branchTopic,title:branchTitle,branchedFrom:branchedFrom};
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
      /* P1.1 — restore branchedFrom metadata on the new session. */
      state.session.branchedFrom = ctx.branchedFrom || null;
      /* React owns #msgList. Push a state-synced event so the React
         message list picks up the branched messages from the snapshot.
         The legacy DOM rebuild (innerHTML + per-msg divs + toolbars)
         was reachable only when msg-list was not migrated, which is no
         longer possible after the always-on React runtime landed. */
      publishReactChatRuntime({type:"state-synced",reason:"branch-context-restored"});
      /* Clear the greeting/topic setup so the user sees the
         branched conversation immediately. */
      var ts=document.getElementById("topicSetup");
      if(ts)ts.classList.add("hidden");
      var cv=document.getElementById("chatView");
      if(cv)cv.classList.remove("hidden");
      /* P1.1 — when reExplain is set, append a follow-up message that
         prompts the model to re-explain the last assistant message from
         a different angle. We push a short user message into the
         branched conversation so the model sees it on the next turn. */
      if(reExplain){
        var reExplainMsg = "Please re-explain that from a different angle. Use a different approach, analogy, or teaching method to help me understand better.";
        state.messages.push({
          clientId: "re-explain-" + Date.now(),
          role: "user",
          rawText: reExplainMsg,
          type: "text",
        });
        publishReactChatRuntime({type:"state-synced",reason:"re-explain-prompt"});
        /* Fire the re-explain question immediately. */
        if(typeof window.askChatTurn === "function"){
          setTimeout(function(){ window.askChatTurn(reExplainMsg); }, 100);
        }
      }
      saveCurrentSession();
      showToast(reExplain ? "Re-explaining from a different angle" : "Branched from previous conversation");
    }
  });
}
function restoreMessageBody(entry,body){
  if(entry.rawText){
    /* Re-render so the latest renderer (KaTeX, weak-model fixes,
       scaffold widgets) applies to every message — not the frozen
       html from when it was first saved. */
    var raw = entry.rawText;
    if(entry.role === "assistant"){
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
  publishReactChatRuntime({type:"message-added",messageId:clientId});

  /* React owns the visible message list — the state push above is the
     authoritative write and React re-renders from the snapshot. The
     side effects below mirror the legacy DOM path's bookkeeping. */
  try{
    var scR=scrollContainer();
    if(scR&&role==="user"){
      requestAnimationFrame(function(){scR.scrollTop=scR.scrollHeight});
    }
    if(role==="user"||role==="assistant"){
      try{appendLocalMemory(role,text)}catch(_){}
    }
    if(state.phase==="chat"||(state.topic&&state.kbNodes.length)){
      try{saveCurrentSession()}catch(_){}
    }
    if(role==="assistant"){
      try{updateChatStats()}catch(_){}
    }
    /* Update KB: if user is answering substantive questions, mark current node progress */
    if(role==="user"&&state.kbNodes[state.currentNode]&&state.kbNodes[state.currentNode].status==="blank"){
      state.kbNodes[state.currentNode].status="fuzzy";
      state.kbNodes[state.currentNode].questions++;
      updateKB();
    }
  }catch(_){}
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
   or restore it to the normal send arrow when idle. React owns
   #sendBtnContent and re-renders the icon from dataset.stop, so
   this function only toggles the dataset + CSS class. */
function setChatStopState(active){
  var btn=document.getElementById("sendBtn");
  if(!btn)return;
  if(active){
    btn.classList.add("chat-stop");
    btn.dataset.stop="1";
  }else{
    btn.classList.remove("chat-stop");
    btn.dataset.stop="0";
  }
  /* React owns #sendBtnContent and re-renders the icon from dataset.stop. */
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

function stopChatResponse(){
  if(window._activeChatCtl && typeof window._activeChatCtl.abort === "function"){
    window._activeChatCtl.abort();
  }
}

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
  /* The streaming placeholder is appended outside React so the legacy
     stream controller can update it in place. Keep the transcript pinned
     after that extra row is inserted; otherwise a focused mobile composer
     can sit exactly one placeholder-height (about 79 px) above the newest
     reply until the first token arrives. */
  scheduleScrollMainToBottom({force:true});
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
  publishReactChatRuntime({type:"stream-started",messageId:clientId});
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
  /* P_inline-tools — ChatGPT-style inline tool rows. The assistant
     bubble body is a sequence of "segments": a text segment renders
     the slice full[segBase..] progressively; when a tool_use lands,
     the current segment is frozen in place, a .tool-inline status row
     is appended after it, and the next text delta opens a fresh
     segment below the row. inlineToolRows keeps {id,name,offset,row}
     in chronological order so finish() can rebuild the same layout
     as a serialized HTML string (offset = full.length at tool time). */
  var segBase=0;
  var needNewSegment=false;
  var inlineToolRows=[];
  var segHost=null;
  function ensureSegHost(){
    if(segHost&&segHost.isConnected)return segHost;
    segHost=document.createElement("div");
    segHost.className="stream-segment";
    body.appendChild(segHost);
    return segHost;
  }
  function freezeCurrentSegment(){
    cancelScheduledRender();
    /* Flush the latest text of the current segment into the DOM so
       the frozen block shows everything streamed before the tool. */
    if(streamContent||thinkState.beforeNode){
      try{doRender()}catch(_){}
    }
    try{if(cursor&&cursor.parentNode)cursor.parentNode.removeChild(cursor)}catch(_){}
    try{if(thinkState.cursorNode&&thinkState.cursorNode.parentNode)thinkState.cursorNode.parentNode.removeChild(thinkState.cursorNode)}catch(_){}
    streamContent=null;settledContent=null;liveContent=null;cursor=null;
    thinkState.startIdx=-1;thinkState.endIdx=-1;
    thinkState.beforeNode=null;thinkState.details=null;thinkState.summary=null;
    thinkState.thinkDiv=null;thinkState.afterNode=null;thinkState.cursorNode=null;
    thinkState.lastRenderedThink=null;thinkState.lastRenderedBefore=null;thinkState.lastRenderedAfter=null;
    _stablePrefixText=null;_stablePrefixHtml="";_lastParsedLen=-1;
    _toolCardContainer=null;
    segHost=null;
  }
  function _toolRunList(host){
    var group=host.querySelector('.tool-run-group');
    if(!group){
      group=document.createElement('section');
      group.className='tool-run-group';
      group.innerHTML='<button type="button" class="tool-run-summary" aria-expanded="false">'+
        '<span class="tool-run-summary-dot" aria-hidden="true"></span>'+
        '<span class="tool-run-summary-label">Exploring</span>'+
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
  var placeholderText=document.createElement("span");
  placeholderText.className="shimmer-text";
  placeholderText.textContent=appMode==="chat"?t("think.thinking"):t("common.generating");
  placeholderRow.appendChild(placeholderText);
  placeholder.appendChild(placeholderRow);
  body.appendChild(placeholder);
  function setPlaceholderText(label){
    /* Fast text-node rewrite — no DOM rebuild, no parse, no
       layout reflow beyond the badge's own intrinsic box. Safe to
       call many times per second. */
    placeholderText.textContent=label;
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
    /* P_inline-tools — the three-section think layout now lives inside
       the current segment host instead of owning the whole body, so
       earlier frozen segments and inline tool rows survive intact.
       P_tool_preserve — save tool cards before host.innerHTML=""
       wipes them, so tools called before the <think> marker are
       preserved inside the new think-block structure. */
    try{placeholder.remove()}catch(_){}
    var host=ensureSegHost();
    var _savedTools=host.querySelector('.think-tools');
    if(_savedTools)_savedTools.parentNode.removeChild(_savedTools);
    host.innerHTML="";
    /* P1.4 — pre-think text is a block-level container that holds
       rendered markdown HTML, NOT a text node. The previous design
       used document.createTextNode and wrote the raw slice via
       nodeValue, which made "# Title" / "- item" / code fences
       appear as raw symbols mid-stream, and HTML's whitespace
       handling collapsed every "\n" to a single space — so the
       user saw one run-on blob of unparsed markdown. */
    thinkState.beforeNode=document.createElement("div");
    thinkState.beforeNode.className="think-prefix";
    host.appendChild(thinkState.beforeNode);

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
    sum.innerHTML='<span class="think-summary-label shimmer-text">'+esc(_streamingLabel)+'</span>'+
      '<span class="think-summary-chevron" aria-hidden="true"></span>';
    det.appendChild(sum);

    var td=document.createElement("div");
    td.className="think-content";
    det.appendChild(td);
    host.appendChild(det);

    /* P1.4 — post-think text gets the same block-level container
       treatment; empty until </think> arrives, then populated by
       doRender via formatMsgProgressive. */
    thinkState.afterNode=document.createElement("div");
    thinkState.afterNode.className="think-suffix";
    host.appendChild(thinkState.afterNode);

    var cur=document.createElement("span");
    cur.className="stream-cursor";
    cur.textContent="▍";
    host.appendChild(cur);
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
    var rawDisplayFull=stripChatArtifacts(full.slice(segBase));
    var inlineThinkStart=rawDisplayFull.indexOf("<think>");
    var inlineThinkEnd=inlineThinkStart===-1?-1:rawDisplayFull.indexOf("</think>",inlineThinkStart);
    if(inlineThinkStart!==-1){
      /* Some providers emit reasoning inside <think> instead of the
         reasoning_content field. Keep the same temporary status while
         preventing the internal block from reaching the renderer. */
      try{ensureThinkCtl()}catch(_){}
      if(inlineThinkEnd!==-1){try{ensureThinkCtl().finalize()}catch(_){}}
    }
    var displayFull=inlineThinkStart===-1
      ?rawDisplayFull
      :rawDisplayFull.slice(0,inlineThinkStart)+(inlineThinkEnd===-1?"":rawDisplayFull.slice(inlineThinkEnd+"</think>".length));

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
        /* P_inline-tools — the streaming text surface now lives inside
           a per-segment host appended at the END of the bubble body.
           Earlier children (reasoning pill, inline tool rows, frozen
           segments, artifacts) are left untouched, so the old
           save-and-reinsert dance for pills/tool cards/artifacts is
           no longer needed: chronological DOM order IS the layout. */
        try{placeholder.remove()}catch(_){}
        var _segHost=ensureSegHost();
        _segHost.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        _segHost.appendChild(streamContent);
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
      if(thinkClosed&&thinkState.summary.innerHTML.indexOf("shimmer-text")!==-1){
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
    /* P_inline-tools — a tool_use lands: freeze the current text
       segment in place, append the ChatGPT-style status row after
       it, and start the next text segment below the row. offset
       records where in `full` the split happened so finish() can
       rebuild the identical layout as serialized HTML. */
    onInlineTool:function(entry,row){
      try{placeholder.remove()}catch(_){}
      freezeCurrentSegment();
      body.appendChild(row);
      inlineToolRows.push({id:entry.id,name:entry.name,offset:full.length,row:row});
      segBase=full.length;
      var sc=list||scrollContainer();
      if(sc&&!state._userScrolledAway&&
         sc.scrollHeight-sc.scrollTop-sc.clientHeight<=96){
        sc.scrollTop=sc.scrollHeight;
      }
    },
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
        /* Don't finalize the pill on the FIRST delta — many models emit
           a short preamble ("好的,让我搜一下…") before the tool_use
           event, and removing the pill here would leave the user
           staring at a blank bubble while the search actually runs.
           Defer the pill removal until the streaming text reaches
           PILL_HIDE_MIN_CHARS, so short preambles keep the "Thinking…"
           (or whatever label the upcoming tool_use sets) visible. */
      }
      full+=delta;
      publishReactChatRuntime({type:"stream-delta",messageId:clientId,textLength:full.length});
      /* Hide the status pill once the streamed text passes a small
         threshold — anything shorter is almost certainly a
         "好的,让我搜一下…" preamble that the model emits before its
         tool_use, and we want the pill to stay so the upcoming
         "Searching" label has a host. 60 chars is well below any
         substantive answer but well above a typical Chinese/English
         transition phrase. */
      if(thinkCtl&&typeof thinkCtl.finalize==="function"&&full.length>=60){
        try{thinkCtl.finalize()}catch(_){}
      }
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
        publishReactChatRuntime({
          type:"stream-aborted",
          messageId:clientId,
          textLength:full.length,
          reason:"session-replaced"
        });
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
          /* P_inline-tools — assemble the final HTML by splicing the
             settled inline tool rows between the text segments they
             actually split. The serialized result goes into
             state.messages[i].html so history replay / React handoff /
             session save all reproduce the inline layout for free. */
          var _renderSeg=function(txt){
            var vis=stripChatArtifacts(txt)
              .replace(/<think>[\s\S]*?<\/think>/gi,"")
              .replace(/<think>[\s\S]*$/gi,"");
            if(!vis.trim())return "";
            return renderAssistantHTML(vis);
          };
          if(inlineToolRows.length){
            var _parts2=[];
            var _prev=0;
            for(var _ri=0;_ri<inlineToolRows.length;_ri++){
              var _r=inlineToolRows[_ri];
              _parts2.push(_renderSeg(full.slice(_prev,_r.offset)));
              if(_r.row){
                /* A row still spinning at finish time means its result
                   never arrived — settle it as stopped so the saved
                   HTML doesn't carry a perpetual spinner. */
                if(_r.row.getAttribute("data-state")==="running"){
                  try{settleInlineToolRow(_r.row,null,{cancelled:true})}catch(_){}
                }
                _parts2.push(_r.row.outerHTML);
              }
              _prev=_r.offset;
            }
            _parts2.push(_renderSeg(full.slice(_prev)));
            finalHtml=_parts2.join("");
            /* Persist the split points on the toolCalls entries so the
               raw data survives even if a future renderer wants to
               rebuild the layout from rawText. */
            try{
              var _m=msgIdx>=0?state.messages[msgIdx]:null;
              if(_m&&Array.isArray(_m.toolCalls)){
                for(var _ti=0;_ti<inlineToolRows.length;_ti++){
                  for(var _tj=0;_tj<_m.toolCalls.length;_tj++){
                    if(_m.toolCalls[_tj].id===inlineToolRows[_ti].id){
                      _m.toolCalls[_tj].textOffset=inlineToolRows[_ti].offset;
                      break;
                    }
                  }
                }
              }
            }catch(_){}
          }else{
            var visibleFinal=stripChatArtifacts(full)
              .replace(/<think>[\s\S]*?<\/think>/gi,"")
              .replace(/<think>[\s\S]*$/gi,"");
            finalHtml=renderAssistantHTML(visibleFinal);
          }
        }catch(e){
          console.log("[finish] render error");
          finalHtml="<p>"+esc(stripChatArtifacts(full).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,""))+"</p>";
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
        /* P_finish-no-flash — swap the streamed DOM for the final render
           synchronously, with no fade. The progressive render is already
           near-identical to the final pass, so an in-place swap in a
           single frame is imperceptible; the old opacity fade read as a
           spontaneous "refresh" after the answer completed. */
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
        var fb="<p>"+esc(stripChatArtifacts(full).replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,""))+"</p>";
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
        /* Streaming AI bubbles skip addMessage(). React owns #msgList and the
           React MessageToolbar component renders the same action buttons
           from the snapshot, so the legacy toolbar path is unreachable. */
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
        /* P_streaming-finish-handoff — when the React runtime owns
           #msgList, the legacy streaming bubble is now redundant:
           the snapshot carries the finalized entry (type=assistant,
           html=<finalized>) and React will paint a fresh bubble on
           the next render. The legacy bubble is detached below only
           AFTER React commits its copy, so the swap is seamless. */
        publishReactChatRuntime({
          type:"stream-finished",
          messageId:clientId,
          textLength:full.length
        });
        /* P_handoff-no-flash — publish first, THEN remove the legacy
           bubble only after React has committed its finalized copy.
           rAF callbacks run before paint, so when React commits
           synchronously during the publish above, the very first tick
           below removes the legacy bubble in the same pre-paint frame:
           the user never sees a gap or a duplicate. The old order
           (remove first, publish after) left the message missing for
           at least one frame — perceived as a spontaneous "refresh"
           right after the answer finished. Retained live-DOM modules
           (think pill, tool cards, artifacts) are handed to React's
           body in the same tick. */
        if(list&&list.dataset&&list.dataset.msgListReactHydrated==="1"){
          var _hfFrames=0;
          var _hfFindLegacy=function(){
            var cands=list.querySelectorAll('[data-client-id="'+clientId+'"]');
            for(var ci=0;ci<cands.length;ci++){
              if(!cands[ci].hasAttribute("data-react-owned"))return cands[ci];
            }
            return null;
          };
          var _hfTick=function(){
            try{
              var reactNode=list.querySelector('[data-client-id="'+clientId+'"][data-react-owned]');
              var legacyNode=_hfFindLegacy();
              if(reactNode){
                if(legacyNode&&legacyNode.parentNode)legacyNode.parentNode.removeChild(legacyNode);
                var reactBody=reactNode.querySelector('.msg-body');
                if(reactBody){
                  if(savedPill)reactBody.insertBefore(savedPill,reactBody.firstChild);
                  else if(savedToolGroup)reactBody.appendChild(savedToolGroup);
                  var retainedToolCards=Array.isArray(savedToolCardArr)?savedToolCardArr:[];
                  var retainedArtifacts=Array.isArray(savedArtifacts)?savedArtifacts:[];
                  for(var rtc=0;rtc<retainedToolCards.length;rtc++)reactBody.appendChild(retainedToolCards[rtc]);
                  for(var rta=0;rta<retainedArtifacts.length;rta++)reactBody.appendChild(retainedArtifacts[rta]);
                }
                return;
              }
              if(++_hfFrames<120){requestAnimationFrame(_hfTick);return;}
              /* React never painted this entry — drop the legacy bubble
                 anyway so a later snapshot render can't duplicate it. */
              if(legacyNode&&legacyNode.parentNode)legacyNode.parentNode.removeChild(legacyNode);
            }catch(_){}
          };
          requestAnimationFrame(_hfTick);
        }else{
          try{
            var _finLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
            if(_finLegacy && !_finLegacy.hasAttribute("data-react-owned") && _finLegacy.parentNode===list){
              list.removeChild(_finLegacy);
            }
          }catch(_){}
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
      /* Drop the legacy bubble so React's next snapshot-driven render
         doesn't render a duplicate. When the entry survives (partial
         text path), React renders the finalized version from the
         snapshot; when the entry was spliced, React just shrinks the
         list to match. (Same bug as the finish path — `msgList` was
         undeclared here too, so the cleanup never ran.) */
      try{
        var _abLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
        if(_abLegacy && !_abLegacy.hasAttribute("data-react-owned") && _abLegacy.parentNode===list){
          list.removeChild(_abLegacy);
        }
      }catch(_){}
      publishReactChatRuntime({
        type:"stream-aborted",
        messageId:clientId,
        textLength:full.length
      });
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
         var errHtml='<div class="msg-error">'+
             '<span class="msg-error-text">'+(errMsg||'Generation failed')+'</span>'+
              '<button type="button" class="msg-retry-btn" id="'+retryBtnId+'">Retry</button>'+
            '</div>';
          /* React owns #msgList — serialize the error into the snapshot
             so React re-renders a finalized error bubble. The placeholder
             `btn` (just an id, no addEventListener) triggers the
             delegation branch below for click handling. */
          if(msgIdx>=0 && state.messages[msgIdx]){
            state.messages[msgIdx].html=errHtml;
            state.messages[msgIdx].type="assistant";
          }
          var btn={ id: retryBtnId };
          if(btn&&typeof onRetry==="function"){
            var retryHandler=function(){
              /* P_no_retry_loading — fire onRetry() immediately so the
                 new streaming bubble appears in one step. */
              try{
                var innerRet=onRetry();
                if(innerRet&&typeof innerRet.then==="function"){
                  innerRet.catch(function(e){/* retry async handler failed */});
                }
              }catch(e){/* retry handler threw */}
            };
            if(typeof btn.addEventListener==="function"){
              btn.addEventListener("click",retryHandler);
            }else{
              /* Delegate retry clicks for React-rendered error bubbles.
                 (Previously this was an `else if(msgList && ...)`
                 guard, but `msgList` was undeclared in this closure
                 scope so the delegation never fired — retry clicks on
                 React-rendered error bubbles were silently dead.) */
              list.addEventListener("click",function _retryDelegated(ev){
                var t=ev.target;
                if(t && t.id===retryBtnId){
                  list.removeEventListener("click",_retryDelegated);
                  retryHandler();
                }
              });
            }
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
       /* Drop the legacy bubble so the next snapshot-driven re-render
          doesn't duplicate the finalized error bubble. (Same bug as
          finish/abort — `msgList` was undeclared here too.) */
       try{
         var _errLegacy=list.querySelector('[data-client-id="'+clientId+'"]');
         if(_errLegacy && !_errLegacy.hasAttribute("data-react-owned") && _errLegacy.parentNode===list){
           list.removeChild(_errLegacy);
         }
       }catch(_){}
       publishReactChatRuntime({
         type:"stream-failed",
         messageId:clientId,
         textLength:full.length,
         error:String(errMsg||"Generation failed").slice(0,160)
       });
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
  /* Never render provider scratch work, including historical messages that
     were saved before this policy changed. */
  var text=String(rawText||"")
    .replace(/<think>[\s\S]*?<\/think>/gi,"")
    .replace(/<think>[\s\S]*$/gi,"");
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
      /* U-L4 — capture the actual problem text instead of a placeholder.
         Prefer the tag's inner content; fall back to the first <practice>
         problem parsed from this same message (Pass 3 runs before us).
         Skip recording entirely when neither exists — a card with no
         question is useless in the mistake book and Redo would mount
         an empty widget. */
      var mistakeQ=stripTags(decodeEntities(mm[2]||"")).trim();
      if(!mistakeQ&&practicePH.length){mistakeQ=practicePH[0].parsed.problem||""}
      if(mistakeQ){
        recordMistake({
          type:"practice",
          q:mistakeQ,
          options:[],
          correct:correctVal,
          userAnswer:null,
          judgedAnswer:correctVal
        });
      }
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
  mountPracticeWidget: mountPracticeWidget,
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
  /* React owns #msgList and always leaves a wrapper element inside it,
     so DOM child count no longer signals an active session — use state.
     P_exam-confirm — also fire the "Start a new session?" confirm when
     the user is sitting in the exam panel (or has generated/submitted
     an exam). The exam lives on its own state fields (`_examInView`,
     `examTopic`, `examQuestions`, `examSubmitted`) that the original
     chat-only guard did not check, so clicking 新聊天/新会话 from the
     exam page used to skip straight to topicSetup with no warning.
     The dialog text ("会保存到「最近」") is still accurate — exam
     sessions are persisted to Recents via saveExamSession. */
  var _examDirty = !!state._examInView
    || (typeof state.examTopic === "string" && state.examTopic.length > 0
        && Array.isArray(state.examQuestions) && state.examQuestions.length > 0)
    || !!state.examSubmitted;
  if(state.topic||state.kbNodes.length>0||(Array.isArray(state.messages)&&state.messages.length>0)||_examDirty){
    var ok=await showConfirm(t("confirm.newSession.title"),t("confirm.newSession.msg"),false);
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
  /* AUDIT-fix — drop any assembled-but-unsent multimodal payload from
     the previous session. askChatTurn() prefers _pendingChatContent
     over its own text argument, so a stale value here (e.g. an image
     parts array from the last send) would be replayed as the first
     turn of the new session — the re-explain branch path
     (branchFromMessage → resetApp → askChatTurn) hit exactly this. */
  try{window._pendingChatContent=null}catch(_){}
  try{window._pendingAttachments=null}catch(_){}
  resetState();
  /* Preserve a project selected immediately before a fresh chat. */
  if(window._nextProjectId){
    state.currentProjectId=window._nextProjectId;
    window._nextProjectId=null;
  }

  toggleShareBtn();
  /* Go back to the main page — no chat session yet.
     P_exam-nav — also drop the ?exam=<uuid> URL and clear the
     #examView body + exam-only top bar elements so resetApp from
     inside an exam view (via the +New chat button or sidebar) lands
     on a clean topicSetup page instead of leaving the exam panel
     visible behind it. */
  setChatIdInURL(null);
  try { setExamIdInURL(null); } catch (_) {}
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  if (typeof window.hideMainPages === "function") window.hideMainPages();
  /* Hide the exam-only top-bar elements (#examBackBtn / #examTitleBar)
     that openExamPanel() would have shown — the data-exam-only
     attribute is the selector used by exam.toggleExamOnlyTopBar. */
  document.querySelectorAll("[data-exam-only='true']").forEach(function (el) { el.classList.add("hidden"); });
  /* Drop the exam view's body content so a stale exam title / form
     doesn't bleed into the next view via a delayed render. */
  var _examBody = document.getElementById("examViewBody");
  if (_examBody) _examBody.innerHTML = "";
  toggleChatTopBarEls(false);
  clearLegacyMsgListChildren();
  /* P_app-reset-sync — the sole publishReactChatRuntime call for
     resetApp() is at the end (reason:"session-reset") after all
     DOM state and bridge metadata have been refreshed. Previously
     there was a premature "app-reset" call here (Bug 11) that
     triggered a React re-read before renderRecents / scroll reset /
     sidebar sync had run — the duplicate was wasteful and the
     interim state was incomplete. */
  clearComposer("topic");
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">'+(typeof t==="function"?t("tutor.kbTopicFirst"):"Set a topic to build your knowledge map.")+'</div>';
  document.getElementById("chatStats").textContent="";
  /* Task 3.3 — clear the teaching-plan view on full reset so a
     previous session's plan doesn't linger in the sidebar. */
  var _tpc2=document.getElementById("teachingPlanContent");if(_tpc2)_tpc2.innerHTML="";
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
  /* P_hide-mode-switch-in-conversation — re-sync the conversation-
     active body attribute after a reset so the top-bar Chat/Tutor
     switch reappears for the new session. The MutationObserver in
     mobileModeSwitch.js will already have fired when msgList was
     cleared (line above), this is belt-and-suspenders for the
     state.topic / state.phase / state.kbNodes fields. */
  if (typeof window.syncConversationActive === 'function') {
    try { window.syncConversationActive(); } catch (_) {}
  }
  publishReactChatRuntime({type:"state-synced",reason:"session-reset"});
  /* Focus the topic input so the user can start typing right away. */
  setTimeout(function(){
    focusComposer("topic");
  },50);
}

/* P_mobile-topbar — incognito ("无痕对话") chat. A temporary session
   that saveCurrentSession() refuses to persist (see the guard there).
   The mobile top-right button toggles it; entering incognito clears the
   current view (via resetApp, which also saves any prior real session)
   so the user starts on a clean, unsaved conversation. */
function syncIncognitoBtn(){
  var on=!!window.incognitoOn;
  try{document.body.setAttribute("data-incognito",on?"true":"false")}catch(_){}
  var btn=document.getElementById("mobileIncognitoBtn");
  if(btn){
    btn.setAttribute("aria-pressed",on?"true":"false");
    var title=on?"Incognito on — this chat won't be saved":"Incognito chat";
    btn.setAttribute("title",title);
    btn.setAttribute("aria-label",title);
  }
}
async function toggleIncognito(){
  if(window.incognitoOn){
    /* Leaving incognito — reset the view while the flag is STILL on so
       saveCurrentSession() bails and the temporary chat is discarded,
       then turn incognito off for future (saved) sessions. */
    await resetApp();
    window.incognitoOn=false;
    syncIncognitoBtn();
    if(typeof showToast==="function")showToast(t("incognito.off"));
    return;
  }
  /* Entering incognito — resetApp() saves any prior real session and
     wipes the view, THEN we flip the flag so the fresh conversation is
     never persisted. */
  await resetApp();
  window.incognitoOn=true;
  syncIncognitoBtn();
  if(typeof showToast==="function")showToast(t("incognito.on"));
}
window.toggleIncognito=toggleIncognito;
window.syncIncognitoBtn=syncIncognitoBtn;

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
   installed once at boot via installAuthHooks() — see below.
   apiFetch / getCsrfToken are bridged via windowExports.js;
   apiFetchRaw / retryApiFetch are only used locally. */
import { apiFetch, apiFetchRaw, retryApiFetch, makeApiError, installAuthHooks, getCsrfToken } from './util/api.js';

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
    /* P_bleed-auth-expired-v2 — reset state so React components
       reading from state don't see the previous user's data after
       the gate shows. Without this, state.session, state.messages,
       state.topic etc. remain dirty until the next session load,
       and any React subscription that fires between the gate and
       the next user's first fetch could briefly render stale data. */
    resetState();
    _chatStreaming=false;
    _chatStopMode=false;
    publishReactChatRuntime({type:"state-synced",reason:"auth-expired"});
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
 * ./util/safe.js and used locally. The window bridge for these
 * is not needed — no external module reads them via window.X. */
import { escapeHtml, sanitizeUrl, sanitizeUrls } from './util/safe.js';

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
  /* AUDIT-fix — reset the module binding so the next user starts in
      chat mode. setAppMode() syncs window.appMode internally. */
  try{setAppMode("chat")}catch(_){}
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
  /* P_bleed-signout — drain any in-flight save first, so the
     subsequent saveCurrentSession doesn't cascade into a stale
     _saveDirty chain. */
  if(_saveInFlight){
    try{await _saveInFlight}catch(_){}
  }
  /* P_bleed-signout-v2 — save the current session BEFORE clearing
     any caches or state. Previously (Bug 1&2), clearPerUserClientState
     + CURRENT_USER=null + resetState ran before resetApp's internal
     saveCurrentSession(), causing doSave() to bail because CURRENT_USER
     was null and state.topic was empty — the active session was
     silently lost on every sign-out. */
  saveCurrentSession();
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
  /* Abort any active chat stream — resetApp() isn't called from
     signOut (to avoid its "Start a new session?" confirm dialog), so
     we inline the essential stream teardown here. */
  if(window._activeChatAbort){try{window._activeChatAbort("signout")}catch(_){}}
  if(window._activeChatCtl){try{window._activeChatCtl.abort()}catch(_){}}
  window._activeChatCtl=null;
  window._activeChatAbort=null;
  _chatStreaming=false;
  _chatStopMode=false;
  window._shareToken=null;
  try{window._pendingChatContent=null}catch(_){}
  try{window._pendingAttachments=null}catch(_){}
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
  var msgList=document.getElementById("msgList");
  var hasRealMsgs=msgList&&Array.from(msgList.children).some(function(c){return !c.hasAttribute('data-react-message-list-empty');});
  var inSession=state.topic||state.kbNodes&&state.kbNodes.length>0||(state.phase==="chat")||hasRealMsgs;
  if(inSession){
    var next=appMode==="tutor"?t("tutor.modeChat"):t("tutor.modeTutor");
    var ok=await showConfirm(t("confirm.switchMode.title").replace("{mode}",next),
      t("confirm.switchMode.msg"),
      false);
    if(!ok)return;
    /* P_save-before-mode-switch — await save completion before
       resetting, so the session is fully persisted when the user
       comes back to it in the other mode. Previously (Bug 8) this
       was fire-and-forget, and resetApp could clear state while
       doSave() was still in flight, causing the saved payload to
       capture empty/partial state. */
    var _sp = saveCurrentSession();
    if(_sp){try{await _sp}catch(_){}}
    resetApp();
  }
  /* P_tutor-sync — toggle from the module-level appMode (not
     window.appMode, which could be stale). setAppMode() now syncs
     window.appMode internally. */
  setAppMode(appMode === "tutor" ? "chat" : "tutor");
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
  if(typeof showToast === "function") showToast(t("toast.projectSwitched").replace("{name}", next.name));
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
  return "\n\nKeep your reply focused on the final answer. Do not expose scratch work, chain-of-thought, or <think> blocks to the reader.";
}

function buildSocraticPrompt(topic,level,context){
  var sysCtx=getSystemContext();
  var full=context||"Start by asking a diagnostic question to understand what the user already knows.";
  /* Append the [Web research] block separately (not into the
     per-turn {context} slot) so the model can clearly distinguish the
     user's situation from the live web evidence. */
  if(state.searchContext){
    full+="\n\n"+state.searchContext;
    full+="\n\nNote: a [Web research] block is present above. Treat its results as fresh, authoritative information. Weave the facts into your reply as natural prose; do NOT add [1]/[2] citation markers, do NOT append a \"Sources:\"/\"References:\" list, and do NOT paste result URLs into your reply. If no [Web research] block is present, you do not have live web access for this turn.";
  }else{
    full+="\n\nNote: no [Web research] block is present. You do not have live web access for this turn — say so honestly rather than guessing about current events, prices, dates, or anything that may have changed since your training cutoff.";
  }
  return sysCtx+"\n\n"+SOCRATIC_SYSTEM_PROMPT.replace("{topic}",topic).replace("{level}",level).replace("{context}",full)+TUTOR_SEARCH_POLICY_PROMPT+VISUALIZATION_ROUTING_PROMPT+toneVoiceSuffix()+beagleSuffix()+thinkingSuffix()+memoriesSuffix()+projectContextSuffix();
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
/* Bridge to window so other modules (e.g. exam.js) consume the same
   system-configured token policy instead of hardcoding their own cap. */
window.MAX_TOKENS_CHAT=MAX_TOKENS_CHAT;
/* Incognito ("无痕对话") flag — explicitly false until the mobile
   top-bar button flips it on. Initializing here keeps saveCurrentSession()
   and syncIncognitoBtn() reading a deterministic false instead of
   relying on `undefined` coercing to falsy. */
window.incognitoOn=false;
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
window.setActiveTemplate = setActiveTemplate;

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
window.askChatTurn = askChatTurn;
window.syncSidebarBtns = syncSidebarBtns;
window.actuallyDeleteSession = actuallyDeleteSession;
window.confirmPurgeSession = confirmPurgeSession;
/* Agent mode placeholder (paired with the comment above on lines
   13112-13114). */
// window.deleteAgentRun = deleteAgentRun; // unimplemented
window.loadSession = loadSession;
window.openCmdKResult = openCmdKResult;
window.openTagEditor = openTagEditor;
window.restoreSession = restoreSession;
window.toggleKBDetail = toggleKBDetail;
window.refreshServerSessions = refreshServerSessions;
window.refreshApiConfig = refreshApiConfig;
window.renderRecents = renderRecents;
window.renderMistakes = renderMistakes;
window.updateMistakesBadge = updateMistakesBadge;
window.getChatIdFromURL = getChatIdFromURL;
window.setChatIdInURL = setChatIdInURL;
window.getExamIdFromURL = getExamIdFromURL;
window.setExamIdInURL = setExamIdInURL;
/* P_url-pushstate-bridge — pushChatIdToURL / pushExamIdToURL were
   missing from the C1 window-bridge cleanup. exam.js and main.js#1371
   call window.push*ToURL expecting a pushState (history entry) rather
   than the set*InURL replaceState. Without these, the URL stays at
   the landing page after starting a session — refresh loses the
   session and the back button can't restore prior session. */
window.pushChatIdToURL = pushChatIdToURL;
window.pushExamIdToURL = pushExamIdToURL;
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

window.openAttachmentPicker = openAttachmentPicker;
window.getArchivedSessions = getArchivedSessions;
window.getCustomInstructionsString = getCustomInstructionsString;
/* React message-list toolbar callbacks. The legacy code remains the
   source of truth for the action side-effects (PATCH/DELETE/regenerate);
   React just dispatches through these globals when its per-message
   toolbar buttons fire. */
window.editUserMessage = editUserMessage;
window.deleteUserMessage = deleteUserMessage;
window.regenerateAssistantMessage = regenerateAssistantMessage;
window.branchFromMessage = branchFromMessage;
window.sendFeedback = sendFeedback;
/* Post-render hooks called from the React MessageItem useEffect
   after each dangerouslySetInnerHTML commit. processPendingViz and
   processPendingVizActions are re-exported via windowExports.js; the
   other three live as either local helpers (wireCodeBlockHeaders,
   wireMsgBodyImages) or imported-by-name (processPendingMermaid)
   here. Wiring them on window lets the React side re-trigger the
   same idempotent bookkeeping the legacy DOM pipeline runs on every
   bubble mount. */
window.processPendingMermaid = processPendingMermaid;
window.wireCodeBlockHeaders = wireCodeBlockHeaders;
window.wireMsgBodyImages = wireMsgBodyImages;
/* Bridge missing window.* assignments that React reads but were never
   explicitly exported (pre-existing gap). Adding them here so C4-B's
   __socratesLegacy assembly below captures them. */
window.showToast = showToast;
window.resetApp = resetApp;
window.signOut = signOut;
window.processPendingViz = processPendingViz;
window.startSession = startSession;
window.submitChatMessage = submitChatMessage;
window.handleChatKey = handleChatKey;
/* updateSlashSelected is referenced by inline onmouseenter handler
   in the slash command palette HTML (main.js:3666) but was never
   assigned to window — would throw ReferenceError on hover. */
window.updateSlashSelected = updateSlashSelected;
/* C4 — typed legacy gateway for React.  Assembles the structured
   window.__socratesLegacy object from the existing window.* bindings.
   React code reads this via getLegacyActions() from react/legacy/gateway.ts.
   The window.X = X assignments above remain as temporary backward-
   compatibility aliases for legacy JS modules and e2e tests until C5. */
window.__socratesLegacy = {
  messages: {
    editUserMessage: window.editUserMessage,
    regenerateAssistantMessage: window.regenerateAssistantMessage,
    deleteUserMessage: window.deleteUserMessage,
    branchFromMessage: window.branchFromMessage,
    sendFeedback: window.sendFeedback,
    toggleReadAloud: window.toggleReadAloud,
    openShareModal: window.openShareModal,
    showToast: window.showToast,
  },
  navigation: {
    resetApp: window.resetApp,
    toggleSidebar: window.toggleSidebar,
    openNav: window.openNav,
    openSettings: window.openSettings,
    closeSettings: window.closeSettings,
    openProfile: window.openProfile,
    closeProfile: window.closeProfile,
    openUsageModal: window.openUsageModal,
    closeUsageModal: window.closeUsageModal,
    openStorageModal: window.openStorageModal,
    closeStorageModal: window.closeStorageModal,
    openPromptTemplatesModal: window.openPromptTemplatesModal,
    closePromptTemplatesModal: window.closePromptTemplatesModal,
    openCheatsheet: window.openCheatsheet,
    closeCheatsheet: window.closeCheatsheet,
    closeMorePopover: window.closeMorePopover,
    toggleDisplayPrefs: window.toggleDisplayPrefs,
    signOut: window.signOut,
  },
  sessions: {
    loadSession: window.loadSession,
    setRecentsFilter: window.setRecentsFilter,
    getRecentsFilter: window.getRecentsFilter,
    onRecentsFilterChipClick: window.onRecentsFilterChipClick,
    openTagEditor: window.openTagEditor,
    deleteSession: window.actuallyDeleteSession,
    onSessionDragStart: window.onSessionDragStart,
    onSessionDragEnd: window.onSessionDragEnd,
    restoreSession: window.restoreSession,
    confirmPurgeSession: window.confirmPurgeSession,
  },
  composer: {
    openAttachmentPicker: window.openAttachmentPicker,
    composeAction: window.composeAction,
    researchAction: window.researchAction,
    toggleExtensionByKey: window.toggleExtensionByKey,
    removeAttachment: window.removeAttachment,
    renderAttachmentChips: window.renderAttachmentChips,
    startSession: startSession,
    submitChatMessage: submitChatMessage,
    stopChatResponse: stopChatResponse,
  },
  cmdK: {
    openCmdK: window.openCmdK,
    closeCmdK: window.closeCmdK,
    onCmdKInput: window.onCmdKInput,
    onCmdKKey: window.onCmdKKey,
    openCmdKResult: window.openCmdKResult,
  },
  share: {
    selectShareVis: window.selectShareVis,
    createShareLink: window.createShareLink,
    copyShareLink: window.copyShareLink,
    revokeShareLink: window.revokeShareLink,
    closeShareModal: window.closeShareModal,
  },
  profile: {
    saveProfileName: window.saveProfileName,
    onCustomInstructionsChange: window.onCustomInstructionsChange,
    toggleProfileWebSearch: window.toggleProfileWebSearch,
    confirmClearCache: window.confirmClearCache,
    confirmClearSettings: window.confirmClearSettings,
    confirmDeleteAccount: window.confirmDeleteAccount,
    setLang: window.setLang,
  },
  workspace: {
    switchLibraryTab: window.switchLibraryTab,
    filterLibrary: window.filterLibrary,
    openLibraryItem: window.openLibraryItem,
    toggleLibrarySelect: window.toggleLibrarySelect,
    toggleSelectAllLibrary: window.toggleSelectAllLibrary,
    deleteSelectedLibrary: window.deleteSelectedLibrary,
    startLibraryRename: window.startLibraryRename,
    cancelLibraryRename: window.cancelLibraryRename,
    saveLibraryRename: window.saveLibraryRename,
    deleteLibraryFile: window.deleteLibraryFile,
    renameArtifact: window.renameArtifact,
    openCreateProject: window.openCreateProject,
    openEditProject: window.openEditProject,
    openProjectWorkspace: window.openProjectWorkspace,
    connectProjectConnector: window.connectProjectConnector,
    refreshProjectConnector: window.refreshProjectConnector,
    openProjectConnectorForm: window.openProjectConnectorForm,
    openArxivSearch: window.openArxivSearch,
    openZoteroLibrary: window.openZoteroLibrary,
  },
  scheduled: {
    openCreateScheduledTask: window.openCreateScheduledTask,
    openEditScheduledTask: window.openEditScheduledTask,
    toggleScheduledTask: window.toggleScheduledTask,
  },
  postRender: {
    processPendingMermaid: window.processPendingMermaid,
    processPendingViz: window.processPendingViz,
    processPendingVizActions: window.processPendingVizActions,
    wireCodeBlockHeaders: window.wireCodeBlockHeaders,
    wireMsgBodyImages: window.wireMsgBodyImages,
  },
};
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
import { installDelegate } from './ui/delegate.js';
installDelegate();
import { installModalA11y } from './ui/modalA11y.js';
installModalA11y({ overlayId: 'cmdKOverlay', closeFn: function () { if (typeof window.closeCmdK === 'function') window.closeCmdK(); } });
installModalA11y({ overlayId: 'settingsOverlay', closeFn: function () { if (typeof window.closeSettings === 'function') window.closeSettings(); } });
installModalA11y({ overlayId: 'shareOverlay', closeFn: function () { if (typeof window.closeShareModal === 'function') window.closeShareModal(); } });
installModalA11y({ overlayId: 'usageOverlay', closeFn: function () { if (typeof window.closeUsageModal === 'function') window.closeUsageModal(); } });
installModalA11y({ overlayId: 'profileOverlay', closeFn: function () { if (typeof window.closeProfile === 'function') window.closeProfile(); } });
installModalA11y({ overlayId: 'confirmDialog', closeFn: function () { if (typeof window.closeConfirm === 'function') window.closeConfirm(false); }, skipObserve: true });
/* React migration. Bootstrap the React compatibility runtime on every
   load — the legacy runtime still owns the visible document, but React
   hydrates specific feature slices (sidebar, cmd-k, session list, etc.)
   after all legacy initialization has completed. */
import("./react/bootstrap.tsx").then(function(mod){
  mod.bootstrapReactCompatibilityRuntime();
}).catch(function(error){
  console.error("[react-migration] compatibility runtime failed to initialize",error);
});
