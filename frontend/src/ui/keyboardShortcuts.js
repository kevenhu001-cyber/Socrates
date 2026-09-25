/* ui/keyboardShortcuts.js — extracted from main.js (B6 batch).
 * Global keyboard shortcut dispatchers (Ctrl+\, Cmd/Ctrl+K, full P5.6
 * shortcut table). Zero-behavior-change lift.
 * Cross-module actions resolve via direct imports where available,
 * otherwise via window.* / typeof-guarded globals at event time.
 */
import { stateStore } from '../state/store.js';
import { showToast } from './toast.js';
import { openCheatsheet, closeCheatsheet } from './cheatsheet.js';
import { toggleTheme } from '../displayPrefs.js';
import { toggleSidebar } from '../sidebar/index.js';
import { openShareModal, closeShareModal } from './share.js';
import { closeUsageModal } from './usage.js';
import { closeStorageModal } from './storage.js';
import { closePromptTemplatesModal } from './promptTemplates.js';
import { closeSettings } from './settings.js';
import { closeProfile, openProfile, toggleProfileWebSearch } from './profile.js';
import { isFindOpen } from './findInSession.js';
import { getComposerMarkdown, setComposerMarkdown, focusComposer } from '../react/composer-input/controller.ts';
import { findLastUserMessage } from '../render/markdown.js';

function _t(key) {
  try {
    if (typeof window !== 'undefined' && typeof window.t === 'function') return window.t(key);
  } catch (_) {}
  return key;
}

export function installKeyboardShortcuts() {
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
      if(typeof openCmdK==="function")window.openCmdK();
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
      if(typeof isFindOpen==="function"&&isFindOpen()){
        e.preventDefault();window.closeFindInSession();return;
      }
      if(!document.getElementById("cmdKOverlay").classList.contains("hidden")){
        e.preventDefault();window.closeCmdK();return;
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
        e.preventDefault();window.closeTagEditor();return;
      }
      if(!document.getElementById("shareOverlay").classList.contains("hidden")){
        e.preventDefault();closeShareModal();return;
      }
    }
    /* Cmd+K — global search. (Already handled above; re-check
       here to keep the cheatsheet in sync.) */
    if(cmd&&!e.altKey&&!e.shiftKey&&key==="k"){
      e.preventDefault();
      if(typeof openCmdK==="function")window.openCmdK();
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
      if(typeof window.startNewChat==="function")window.startNewChat();
      return;
    }
    /* Cmd+Shift+S — share. */
    if(cmd&&!e.altKey&&e.shiftKey&&key==="s"){
      e.preventDefault();
      if(typeof openShareModal==="function"&&stateStore.read("currentSessionId")){
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
        if(composerEl.getAttribute("data-surface")==="topic")window.startSession();
        else if(typeof submitChatMessage==="function")window.submitChatMessage();
      }
      return;
    }
    /* Cmd+Shift+A — open projects picker. */
    if(cmd&&!e.altKey&&e.shiftKey&&key==="a"){
      e.preventDefault();
      if(typeof openNav==="function"){
        window.openNav("projects");
      }else if(typeof openProjects==="function"){
        window.openProjects();
      }
      return;
    }
    /* Cmd+Shift+P — cycle active project. */
    if(cmd&&!e.altKey&&e.shiftKey&&key==="p"){
      e.preventDefault();
      window.cycleActiveProject();
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

}

export default installKeyboardShortcuts;
