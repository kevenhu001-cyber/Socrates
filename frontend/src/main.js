/* ─── Module imports (Phase 2 split) ─── */
import './state.js';
import './i18n.js';
import { esc, escAttr, escHTML } from './render/helpers.js';
import { processPendingMermaid, renderViz, renderVizLoading, renderMermaid } from './render/viz.js';
import { formatTickSlice, formatMsgProgressive, formatMsg } from './render/markdown.js';
import { callAPI, callAPIChat } from './chat/api.js';
import { callAPIStream } from './chat/stream.js';
import { hideGate, showGate, showAuthView, showAuthSignin, showAuthRegister, switchAuthTab, setAuthError, showAuthForgotPassword, showAuthCodeLogin, submitAuthSignin, submitAuthRegister, submitAuthVerify, submitAuthForgotPassword, submitAuthResetPassword, submitAuthSendCode, submitAuthLoginWithCode, resendVerification, resendAuthCode, afterAuthEnter } from './auth/index.js';
import { SERVER_HAS_BEAGLE_KEY } from './auth/boot.js';
import { toggleSidebar, getRecentsFilter, setRecentsFilter, clearRecentsFilter, onRecentsFilterChipClick } from './sidebar/index.js';

/* ============================================================
   SIDEBAR
   ============================================================ */
var sidebarOpen=true;

/* P1.4 — scroll state lives on `state` so the value is scoped per
   page-load and can be reset cleanly by `addStreamingMessage` on
   each new bubble. The `newReplyPill` is a small "↓ new response"
   affordance shown when the user has scrolled up and a new delta
   arrives — clicking it scrolls to bottom and hides the pill. */
function showNewReplyPill(){
  var pill=document.getElementById("newReplyPill");
  if(pill){pill.classList.add("visible")}
}
function hideNewReplyPill(){
  var pill=document.getElementById("newReplyPill");
  if(pill){pill.classList.remove("visible")}
}

/* Listen for manual scrolls: any wheel, touch, or keyboard scroll that
   moves the user away from the bottom turns off auto-scroll. The flag
   resets when the user sends a new message (in addStreamingMessage) or
   scrolls back to bottom. */
(function(){
  var tmo=null;
  var SCROLL_SLACK=64;
  document.addEventListener("scroll",function(){
    var sc=scrollContainer();
    if(!sc)return;
    var atBottom=sc.scrollHeight-sc.scrollTop-sc.clientHeight<=SCROLL_SLACK;
    if(atBottom){
      state._userScrolledAway=false;
      hideNewReplyPill();
    }else if(!state._userScrolledAway){
      /* Debounce: only set _userScrolledAway once per scroll burst. */
      if(!tmo){
        state._userScrolledAway=true;
        tmo=setTimeout(function(){tmo=null},300);
      }
    }
  },true);  /* useCapture so we catch scroll on any child element */
  /* Pill click handler — wire once, attached to the static element
     rendered by index.html (or lazily created below). */
  document.addEventListener("click",function(ev){
    var t=ev.target;
    while(t&&t!==document.body){
      if(t.id==="newReplyPill"){
        var sc=scrollContainer();
        if(sc){sc.scrollTop=sc.scrollHeight}
        state._userScrolledAway=false;
        hideNewReplyPill();
        return;
      }
      t=t.parentNode;
    }
  });
})();

/* ============================================================
   DISPLAY PREFERENCES — text size + content width
   Persisted in localStorage as `socrates-display`. Applied as CSS
   custom properties on <html> so every rem-based font-size scales
   and the .main-inner max-width scales too. Default = M / M.
   ============================================================ */
var DISPLAY_FONT_STEPS  =[0.875, 1, 1.125, 1.25];
var DISPLAY_WIDTH_STEPS =[0.85,  1, 1.3,   1.7];
var FONT_LABELS  =["S","M","L","XL"];
var WIDTH_LABELS =["S","M","L","XL"];
var displayPrefs={font:1,width:1,darkBg:"",lightBg:""};

function loadDisplayPrefs(){
  try{
    var raw=localStorage.getItem("socrates-display");
    if(raw){
      var p=JSON.parse(raw);
      if(typeof p.font==="number"&&p.font>0)displayPrefs.font=p.font;
      if(typeof p.width==="number"&&p.width>0)displayPrefs.width=p.width;
      if(typeof p.darkBg==="string")displayPrefs.darkBg=p.darkBg;
      if(typeof p.lightBg==="string")displayPrefs.lightBg=p.lightBg;
    }
  }catch(e){}
  applyDisplayPrefs();
}
function applyDisplayPrefs(){
  document.documentElement.style.setProperty("--app-font-scale", String(displayPrefs.font));
  document.documentElement.style.setProperty("--app-width-scale", String(displayPrefs.width));
  var mode=document.documentElement.getAttribute("data-mode")||"dark";
  var customHex=mode==="dark"?displayPrefs.darkBg:displayPrefs.lightBg;
  if(customHex){
    applyCustomBg(customHex,mode);
  }else{
    removeCustomBg();
  }
  syncDisplayPrefsUI();
  /* After font/width change, layout shifts. If the user was already
     pinned at the bottom of the chat scroller, keep them there so
     the new bigger/smaller content doesn't appear to "jump" up the
     middle of the list. If they had scrolled up to read older
     messages, do nothing (respect their position). */
  if(typeof scrollToBottomIfPinned==="function"){
    scrollToBottomIfPinned();
  }
}
function saveDisplayPrefs(){
  try{localStorage.setItem("socrates-display",JSON.stringify(displayPrefs))}catch(_){}
}
function syncDisplayPrefsUI(){
  var fLabel=document.getElementById("displayPrefsFontLabel");
  var wLabel=document.getElementById("displayPrefsWidthLabel");
  if(fLabel){
    var fi=DISPLAY_FONT_STEPS.indexOf(displayPrefs.font);
    fLabel.textContent=fi>=0?FONT_LABELS[fi]:"M";
  }
  if(wLabel){
    var wi=DISPLAY_WIDTH_STEPS.indexOf(displayPrefs.width);
    wLabel.textContent=wi>=0?WIDTH_LABELS[wi]:"M";
  }
  var fWrap=document.getElementById("displayPrefsFontSegs");
  if(fWrap)Array.from(fWrap.children).forEach(function(b){
    b.classList.toggle("on", parseFloat(b.dataset.font)===displayPrefs.font);
  });
  var wWrap=document.getElementById("displayPrefsWidthSegs");
  if(wWrap)Array.from(wWrap.children).forEach(function(b){
    b.classList.toggle("on", parseFloat(b.dataset.width)===displayPrefs.width);
  });
  /* Sync background color inputs */
  var darkInput=document.getElementById("displayPrefsBgDark");
  if(darkInput)darkInput.value=displayPrefs.darkBg||"#252220";
  var lightInput=document.getElementById("displayPrefsBgLight");
  if(lightInput)lightInput.value=displayPrefs.lightBg||"#ded6c8";
}
var _BG_VARS=["--bg-000","--bg-100","--bg-200","--bg-300"];
import { parseHexColor, applyCustomBg, removeCustomBg } from './util/colors.js';
window.parseHexColor=parseHexColor;window.applyCustomBg=applyCustomBg;window.removeCustomBg=removeCustomBg;
function setDisplayFont(step){
  displayPrefs.font=step;
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function setDisplayWidth(step){
  displayPrefs.width=step;
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function setBackgroundColor(hex){
  /* Kept for backward compat — sets dark mode bg */
  displayPrefs.darkBg=hex||"";
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function setBackgroundDark(hex){
  displayPrefs.darkBg=hex||"";
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function setBackgroundLight(hex){
  displayPrefs.lightBg=hex||"";
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function resetBackgroundColor(){
  displayPrefs.darkBg="";
  displayPrefs.lightBg="";
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function resetBackgroundDark(){
  displayPrefs.darkBg="";
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function resetBackgroundLight(){
  displayPrefs.lightBg="";
  applyDisplayPrefs();
  saveDisplayPrefs();
}
function setAccentColor(hue){
  var num=parseInt(hue,10);
  if(isNaN(num))return;
  var root=document.documentElement;
  var sat=num===0||num===0?"0%":"77%";
  root.style.setProperty("--accent-000", num+" "+sat+" 62%");
  root.style.setProperty("--accent-100", num+" "+sat+" 62%");
  root.style.setProperty("--accent-900", num+" 40% 20%");
  /* Persist */
  try{localStorage.setItem("socrates-accent-hue",String(num))}catch(e){}
  /* Update active swatch */
  var swatches=document.querySelectorAll(".color-swatch");
  swatches.forEach(function(s){s.classList.toggle("active", parseInt(s.dataset.hue,10)===num)});
}
function toggleDisplayPrefs(){
  var p=document.getElementById("displayPrefsPopover");
  if(!p)return;
  var btn=document.querySelector('[onclick="toggleDisplayPrefs()"]');
  var isOpen=!p.classList.contains("hidden");
  if(isOpen){p.classList.add("hidden");return}
  /* Position the popover using fixed coords so it doesn't get
     clipped/squeezed by the sidebar-footer's flex layout. Anchor it
     to the ≡ button: above and aligned to the button's right edge. */
  if(btn){
    var r=btn.getBoundingClientRect();
    var popW=240; /* matches .display-prefs-popover min-width */
    var left=r.right-popW;
    if(left<8)left=8;
    var bottom=window.innerHeight-r.top+8;
    p.style.left=left+"px";
    p.style.bottom=bottom+"px";
    p.style.right="auto";
    p.style.top="auto";
  }
  p.classList.remove("hidden");
  /* Close on outside click. */
  setTimeout(function(){
    function onDoc(e){
      if(p.contains(e.target))return;
      if(btn&&btn.contains(e.target))return;
      p.classList.add("hidden");
      document.removeEventListener("click",onDoc,true);
    }
    document.addEventListener("click",onDoc,true);
  },0);
}

function syncSidebarBtns(){
  var ob=document.getElementById("sidebarOpenBtn");
  var cb=document.getElementById("sidebarCloseBtn");
  if(ob)ob.style.display=sidebarOpen?"none":"";
  if(cb)cb.style.display=sidebarOpen?"":"none";
}
try{
  var sbPref=localStorage.getItem("socrates-sb");
  if(sbPref==="0"||(sbPref===null&&window.innerWidth<768)){
    sidebarOpen=false;document.getElementById("sidebar").classList.add("collapsed")
  }
}catch(e){}
syncSidebarBtns();
/* Theme toggle */
function toggleTheme(){
  var html=document.documentElement;
  var mode=html.getAttribute("data-mode");
  var next=mode==="dark"?"light":"dark";
  html.setAttribute("data-mode",next);
  try{localStorage.setItem("socrates-theme",next)}catch(e){}
  /* Re-apply display prefs so the correct mode palette is active */
  applyDisplayPrefs();
}
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
/* Restore saved accent hue */
try{
  var savedHue=localStorage.getItem("socrates-accent-hue");
  if(savedHue)setAccentColor(parseInt(savedHue,10));
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

/* ============================================================
   SIDEBAR DRAG-TO-RESIZE
   Drag the 4px-wide strip on the right edge of the sidebar to
   change its width. Range: 200–480 px. Persists in localStorage.
   ============================================================ */
var SIDEBAR_MIN_PX=200;
var SIDEBAR_MAX_PX=480;
var sidebarWidthPx=288;   /* default ≈ 18rem */

function loadSidebarWidth(){
  try{
    var raw=localStorage.getItem("socrates-sidebar-width");
    if(raw){
      var n=parseInt(raw,10);
      if(n>=SIDEBAR_MIN_PX&&n<=SIDEBAR_MAX_PX)sidebarWidthPx=n;
    }
  }catch(_){}
  applySidebarWidth();
}
function applySidebarWidth(){
  document.documentElement.style.setProperty("--app-sidebar-width", sidebarWidthPx+"px");
}
function saveSidebarWidth(){
  try{localStorage.setItem("socrates-sidebar-width",String(sidebarWidthPx))}catch(_){}
}
(function initSidebarDrag(){
  var handle=document.getElementById("sidebarResizeHandle");
  if(!handle)return;
  loadSidebarWidth();
  var dragging=false,startX=0,startW=0;
  function onDown(e){
    if(window.innerWidth<=768)return; /* mobile: no resize */
    dragging=true;
    startX=e.clientX;
    startW=sidebarWidthPx;
    handle.classList.add("dragging");
    document.body.classList.add("sidebar-resizing");
    e.preventDefault();
  }
  function onMove(e){
    if(!dragging)return;
    var dx=e.clientX-startX;
    var w=startW+dx;
    if(w<SIDEBAR_MIN_PX)w=SIDEBAR_MIN_PX;
    if(w>SIDEBAR_MAX_PX)w=SIDEBAR_MAX_PX;
    sidebarWidthPx=w;
    applySidebarWidth();
  }
  function onUp(){
    if(!dragging)return;
    dragging=false;
    handle.classList.remove("dragging");
    document.body.classList.remove("sidebar-resizing");
    saveSidebarWidth();
  }
  handle.addEventListener("mousedown",onDown);
  window.addEventListener("mousemove",onMove);
  window.addEventListener("mouseup",onUp);
  /* Touch support so tablets can drag too. */
  handle.addEventListener("touchstart",function(e){
    if(e.touches.length!==1)return;
    onDown({clientX:e.touches[0].clientX,preventDefault:function(){e.preventDefault()}});
  },{passive:false});
  window.addEventListener("touchmove",function(e){
    if(!dragging||e.touches.length!==1)return;
    onMove({clientX:e.touches[0].clientX});
  },{passive:true});
  window.addEventListener("touchend",onUp);
  /* Keyboard: focused handle, arrow keys nudge. */
  handle.tabIndex=0;
  handle.addEventListener("keydown",function(e){
    var step=e.shiftKey?32:8;
    if(e.key==="ArrowLeft"){sidebarWidthPx=Math.max(SIDEBAR_MIN_PX,sidebarWidthPx-step);applySidebarWidth();saveSidebarWidth();e.preventDefault()}
    else if(e.key==="ArrowRight"){sidebarWidthPx=Math.min(SIDEBAR_MAX_PX,sidebarWidthPx+step);applySidebarWidth();saveSidebarWidth();e.preventDefault()}
  });
})();
/* Auto-collapse on viewport shrink to mobile width, expand on grow to desktop */
window.addEventListener("resize",function(){
  var bd=document.getElementById("sidebarBackdrop");
  if(window.innerWidth<768&&sidebarOpen){
    sidebarOpen=false;document.getElementById("sidebar").classList.add("collapsed");
    if(bd)bd.classList.remove("show");
  }else if(window.innerWidth>=768&&bd){
    bd.classList.remove("show");
  }
  syncSidebarBtns();
});
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
    if(document.getElementById("projectEditorOverlay")&&!document.getElementById("projectEditorOverlay").classList.contains("hidden")){
      e.preventDefault();closeProjectEditor();return;
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
  /* Cmd+Shift+A — open projects picker (focus the chip row). */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="a"){
    e.preventDefault();
    var row=document.getElementById("sidebarProjects");
    if(row){row.scrollIntoView({behavior:"smooth",block:"center"})}
    showToast("Project chips ↑ — click to switch");
    return;
  }
  /* Cmd+Shift+P — cycle to next project. */
  if(cmd&&!e.altKey&&e.shiftKey&&key==="p"){
    e.preventDefault();
    cycleActiveProject();
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
    if(typeof thinkingOn!=="undefined"){
      thinkingOn=!thinkingOn;
      try{localStorage.setItem("socrates-thinking",JSON.stringify(thinkingOn))}catch(_){}
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

/* P5.6 — cycle to the next project in the sidebar. Used by
   the Cmd+Shift+P shortcut. */
function cycleActiveProject(){
  if(typeof PROJECTS==="undefined"||!PROJECTS.length)return;
  var cur=state.session.currentProjectId||INBOX_PROJECT_ID;
  var idx=-1;
  for(var i=0;i<PROJECTS.length;i++){if(PROJECTS[i].id===cur){idx=i;break;}}
  var next=PROJECTS[(idx+1)%PROJECTS.length];
  state.session.currentProjectId=next.id===INBOX_PROJECT_ID?null:next.id;
  state.session.activeProjectFilter=next.id;
  renderProjects();
  renderRecents();
  showToast("Project: "+next.name);
}

/* P5.6 — find the most recent user-authored message in
   state.session.messages. Used by the Up-arrow-in-empty-input
   shortcut to pop the previous prompt back into the input
   for editing. */
/* Strip markdown formatting symbols from text so the user sees clean
   plain text when editing or resending a message. Removes **bold**,
   *italic*, `code`, $math$, [links](url), # headings, > blockquotes,
   and code fences — keeping only the visible content. */
function stripMarkdown(s){
  if(!s)return"";
  return String(s)
    /* Strip any HTML tags first — older server payloads sometimes
       stored the rendered <p>foo</p> rather than the plain text.
       Editing a user message must never expose raw <p>/<br>/etc. */
    .replace(/<\/?[a-zA-Z][^>]*>/g,"")
    .replace(/<!--[\s\S]*?-->/g,"")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g,"")
    /* Remove fenced code blocks (```...``` or ~~~...~~~) */
    .replace(/```[\s\S]*?```/g,"")
    .replace(/~~~[\s\S]*?~~~/g,"")
    /* Remove inline code and math: $...$, $$...$$, `...` */
    .replace(/\$\$[^$]*\$\$/g,"")
    .replace(/\$[^$]*\$/g,"")
    .replace(/`[^`]*`/g,"")
    /* Remove images: ![alt](url) */
    .replace(/!\[([^\]]*)\]\([^)]*\)/g,"$1")
    /* Replace links: [text](url) → text */
    .replace(/\[([^\]]*)\]\([^)]*\)/g,"$1")
    /* Strip bold/italic markers */
    .replace(/\*\*([^*]*)\*\*/g,"$1")
    .replace(/__([^_]*)__/g,"$1")
    .replace(/\*([^*]*)\*/g,"$1")
    .replace(/_([^_]*)_/g,"$1")
    /* Remove heading markers */
    .replace(/^#{1,6}\s+/gm,"")
    /* Remove blockquote markers */
    .replace(/^>\s+/gm,"")
    /* Remove horizontal rules */
    .replace(/^[-*_]{3,}\s*$/gm,"")
    /* Remove list markers (-, *, +, 1.) */
    .replace(/^[-*+]\s+/gm,"")
    .replace(/^\d+\.\s+/gm,"")
    /* Collapse multiple newlines into one */
    .replace(/\n{3,}/g,"\n\n")
    .trim();
}

function findLastUserMessage(){
  var list=state.session.messages||[];
  for(var i=list.length-1;i>=0;i--){
    if(list[i].role==="user"&&list[i].rawText)return stripMarkdown(list[i].rawText);
  }
  return null;
}

/* P5.6 — open / close the shortcut cheatsheet modal. The
   content is a small static table so the user can learn the
   shortcuts without leaving the app. */
function openCheatsheet(){
  var overlay=document.getElementById("cheatsheetOverlay");
  if(!overlay){
    overlay=document.createElement("div");
    overlay.id="cheatsheetOverlay";
    overlay.className="cmd-k-overlay hidden";
    overlay.onclick=function(ev){if(ev.target===overlay)closeCheatsheet()};
    overlay.innerHTML='<div class="cmd-k-modal cheatsheet" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  var body=overlay.querySelector(".cheatsheet");
  body.innerHTML=
    '<div class="project-editor-head">'+
      '<span class="project-editor-title">Keyboard shortcuts</span>'+
      '<button class="project-editor-close" onclick="closeCheatsheet()">×</button>'+
    '</div>'+
    '<div class="cheatsheet-body">'+
      buildCheatsheetSection("Navigation",[
        ["Open search",        ["⌘","K"]],
        ["Toggle sidebar",     ["⌘","B"]],
        ["Open settings",      ["⌘","."]],
        ["New chat",           ["⌘","⇧","O"]],
        ["Cycle project",      ["⌘","⇧","P"]]
      ])+
      buildCheatsheetSection("Sharing & search",[
        ["Share current chat",["⌘","⇧","S"]],
        ["Open project picker",["⌘","⇧","A"]]
      ])+
      buildCheatsheetSection("Toggles",[
        ["Toggle theme",       ["⌘","⇧","T"]],
        ["Toggle web search",  ["⌘","⇧","F"]],
        ["Toggle thinking pill",["⌘","⇧","M"]]
      ])+
      buildCheatsheetSection("Composing",[
        ["Send (alternative)", ["⌘","⏎"]],
        ["Edit last prompt",   ["↑","(empty input)"]],
        ["New line",           ["⇧","⏎"]]
      ])+
    '</div>';
  overlay.classList.remove("hidden");
}
function buildCheatsheetSection(title,rows){
  var html='<div class="cheatsheet-section"><div class="cmd-k-section-label">'+esc(title)+'</div>';
  rows.forEach(function(row){
    html+='<div class="cheatsheet-row">';
    for(var i=0;i<row[1].length;i++){
      html+='<kbd class="cheatsheet-kbd">'+esc(row[1][i])+'</kbd>';
    }
    html+='<span class="cheatsheet-desc">'+esc(row[0])+'</span>';
    html+='</div>';
  });
  html+='</div>';
  return html;
}
function closeCheatsheet(){
  var overlay=document.getElementById("cheatsheetOverlay");
  if(overlay)overlay.classList.add("hidden");
}
/* Mobile: tap anywhere outside the sidebar (and outside the toggle button)
   to close it. On desktop the sidebar is a permanent fixture, so we skip
   the handler when the viewport is wider than 768px. The backdrop is a
   sibling of the sidebar in the DOM and z-index 25; tapping it always
   closes the drawer on mobile. */
function isMobileViewport(){return window.innerWidth<768;}
document.addEventListener("click",function(e){
  if(!isMobileViewport())return;
  if(!sidebarOpen)return;
  /* Clicks inside the sidebar or on the toggle button are not "outside". */
  if(e.target.closest("#sidebar"))return;
  if(e.target.closest(".toggle-sidebar"))return;
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
  toggleSidebar();
});
/* Backdrop tap on mobile also closes. */
var sbBackdrop=document.getElementById("sidebarBackdrop");
if(sbBackdrop)sbBackdrop.addEventListener("click",function(){if(isMobileViewport()&&sidebarOpen)toggleSidebar();});
/* Click outside sidebar to close — disabled. Sidebar now stays open until the user
   explicitly toggles it (toggle button, Ctrl+\, or mobile breakpoint). */
/* document.querySelector(".main").addEventListener("click",function(e){
  if(sidebarOpen&&window.innerWidth>=768&&!e.target.closest(".toggle-sidebar")){
    toggleSidebar();
  }
}); */

/* Mobile keyboard avoidance: when the keyboard opens on mobile, the browser
   scrolls the page to keep the focused textarea visible. This pushes the AI
   content upward even when there's empty space below it. This fix saves the
   scroll position when the input is focused and restores it whenever the
   visual viewport resizes (keyboard open), placing content back where it was. */
if(window.visualViewport){
  (function(){
    var input=document.getElementById("chatInputArea");
    if(!input)return;
    var _kbFix=0;
    input.addEventListener("focus",function(){
      var sc=scrollContainer();
      if(sc)_kbFix=sc.scrollTop;
    });
    var tid;
    window.visualViewport.addEventListener("resize",function(){
      if(tid)cancelAnimationFrame(tid);
      tid=requestAnimationFrame(function(){
        tid=0;
        if(document.activeElement!==input)return;
        var sc=scrollContainer();
        if(sc)sc.scrollTop=_kbFix;
      });
    });
  })();
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

/* ============================================================
   TOPIC SETUP
   ============================================================ */
function autoResize(el){el.style.height="auto";el.style.height=Math.min(el.scrollHeight,el.id==="chatInputArea"?120:160)+"px"}
function updateStartBtn(){
  var v=document.getElementById("topicInput").value.trim();
  var b=document.getElementById("startBtn");
  if(v)b.classList.add("active");else b.classList.remove("active");
}
function updateSendBtn(){
  var v=document.getElementById("chatInputArea").value.trim();
  var b=document.getElementById("sendBtn");
  if(v)b.classList.add("active");else b.classList.remove("active");
}

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
var RECENTS_CAP=20;
/* P2.3 — how long the client and server keep an archived
   session before it's permanently erased. The server is the
   source of truth (it runs a daily GC job); we mirror the
   window on the client to keep the Storage modal and the
   Recents list in sync without waiting for the server's
   next sync round. */
var ARCHIVE_RETENTION_MS=30*24*60*60*1000;
/* Server-side session cache. The SPA keeps a copy of the user's chat
   sessions here so the UI can render the Recents / Knowledge / Mistakes
   tabs without a roundtrip on every action. We keep it fresh via
   getRecents() / setRecents() — which now hit the server. */
var SERVER_SESSIONS=[];

/* P2.1 — Projects. The web SPA has a built-in "Inbox" project
   (the default for legacy sessions) and supports user-created
   projects as a way to group related sessions. Schema:
     { id, name, description, color, icon, systemPrompt,
       createdAt, archivedAt }
   Stored client-side in `socrates-projects` while the server-
   side /api/projects endpoint (docs/api/openapi.yaml P2.1) is
   not yet live; switched to fetch once the backend ships.
   Sessions get a `projectId` field; missing → "inbox".
   The default Recents list shows everything; clicking a
   project chip filters to that project only. */
var PROJECTS_KEY="socrates-projects";
var INBOX_PROJECT_ID="inbox";
var INBOX_PROJECT={id:INBOX_PROJECT_ID,name:"Inbox",description:"All sessions without a project",color:"#7d7468",icon:"in",systemPrompt:"",createdAt:0,archivedAt:null,isSystem:true};
var PROJECTS=[INBOX_PROJECT];
function loadProjects(){
  try{
    var raw=localStorage.getItem(PROJECTS_KEY);
    var arr=raw?JSON.parse(raw):null;
    if(Array.isArray(arr)&&arr.length){
      /* Always ensure Inbox is first. */
      PROJECTS=[INBOX_PROJECT].concat(arr.filter(function(p){return p.id!==INBOX_PROJECT_ID}));
    }else{
      PROJECTS=[INBOX_PROJECT];
    }
  }catch(_){
    PROJECTS=[INBOX_PROJECT];
  }
}
function saveProjects(){
  try{
    var persistable=PROJECTS.filter(function(p){return!p.isSystem});
    localStorage.setItem(PROJECTS_KEY,JSON.stringify(persistable));
  }catch(_){}
}
function getProjectById(id){
  if(!id)return INBOX_PROJECT;
  for(var i=0;i<PROJECTS.length;i++)if(PROJECTS[i].id===id)return PROJECTS[i];
  return INBOX_PROJECT;
}
function createProject(opts){
  var p={
    id:generateId(),
    name:(opts&&opts.name||"New project").trim().slice(0,80),
    description:(opts&&opts.description||"").trim().slice(0,500),
    color:(opts&&opts.color)||randomProjectColor(),
    icon:(opts&&opts.icon)||"fl",
    systemPrompt:(opts&&opts.systemPrompt||"").slice(0,8000),
    createdAt:Date.now(),
    archivedAt:null
  };
  PROJECTS.push(p);
  saveProjects();
  renderProjects();
  return p;
}
function updateProject(id,patch){
  var p=getProjectById(id);
  if(p.isSystem)return p;
  if(patch.name!==undefined)p.name=String(patch.name).trim().slice(0,80);
  if(patch.description!==undefined)p.description=String(patch.description).trim().slice(0,500);
  if(patch.color!==undefined)p.color=patch.color;
  if(patch.icon!==undefined)p.icon=String(patch.icon).slice(0,4);
  if(patch.systemPrompt!==undefined)p.systemPrompt=String(patch.systemPrompt).slice(0,8000);
  saveProjects();
  renderProjects();
  return p;
}
function deleteProject(id){
  if(id===INBOX_PROJECT_ID)return;
  /* Re-parent affected sessions back to Inbox. */
  for(var i=0;i<SERVER_SESSIONS.length;i++){
    if(SERVER_SESSIONS[i].projectId===id)SERVER_SESSIONS[i].projectId=null;
  }
  /* Same for in-memory active session. */
  if(state.session.currentProjectId===id)state.session.currentProjectId=null;
  /* Clear the Recents filter too — otherwise the user is stuck
     looking at an empty list filtered to a project that no longer
     exists, with no chip to click to clear it (the project is gone
     from PROJECTS). */
  if(state.session.activeProjectFilter===id)state.session.activeProjectFilter=null;
  PROJECTS=PROJECTS.filter(function(p){return p.id!==id});
  saveProjects();
  renderProjects();
  renderRecents();
}
function randomProjectColor(){
  /* Curated palette that pairs with the existing tier-badge
     colors. Each entry is a hex that the dot + chip both
     reference. */
  var palette=["#d8a85b","#7da9d8","#a0c46c","#c47ed1","#e07b5b","#5bc0be","#d6a4d1","#b8b54a"];
  return palette[Math.floor(Math.random()*palette.length)];
}
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
function getChatIdFromURL(){return new URLSearchParams(location.search).get("chat")||null}
function setChatIdInURL(id){history.replaceState({chatId:id},"",id?"?chat="+encodeURIComponent(id):location.pathname)}
function pushChatIdToURL(id){history.pushState({chatId:id},"",id?"?chat="+encodeURIComponent(id):location.pathname)}
function getRecents(){
  /* P2.3 — sweep local expired archives first so the Recents
     list and the Storage modal never disagree. */
  sweepExpiredArchives();
  /* P2.3 — archived sessions are hidden from the default
     Recents list. Users restore them from the Storage modal. */
  var copy=SERVER_SESSIONS.filter(function(s){return!s||!s.archivedAt;});
  /* P2.2 — pinned sessions always come first, then everything
     else sorted by updatedAt desc. The sort is stable; ties keep
     their original order. */
  copy.sort(function(a,b){
    var ap=a&&a.pinned?1:0;
    var bp=b&&b.pinned?1:0;
    if(ap!==bp)return bp-ap;
    var at=(a&&(a.updated_at||a.updatedAt||a.created_at||a.createdAt))||0;
    var bt=(b&&(b.updated_at||b.updatedAt||b.created_at||b.createdAt))||0;
    return bt-at;
  });
  return copy;
}
function setRecents(arr){SERVER_SESSIONS=Array.isArray(arr)?arr.slice(0,RECENTS_CAP):[]}

/* P2.2 — filter chip state. `null` = all; otherwise one of
   "pinned" or a tag string. Persisted in localStorage so
   the user's last filter survives a reload. */
var RECENTS_FILTER_KEY="socrates-recents-filter";

/* P2.2 — set of tag strings the user has ever used. Powers
   the autocomplete suggestions in the tag editor popover. */
function getKnownTags(){
  var seen={};
  (SERVER_SESSIONS||[]).forEach(function(s){
    (s.tags||[]).forEach(function(t){if(t)seen[t]=1});
  });
  return Object.keys(seen).sort();
}
async function refreshServerSessions(){
  if(!CURRENT_USER)return[];
  try{
    var r=await apiFetch("/api/sessions");
    SERVER_SESSIONS=Array.isArray(r&&r.sessions)?r.sessions:[];
  }catch(e){console.warn("[sessions] refresh failed:",e.message)}
  /* Recompute the sidebar project counts now that the session
     list is fresh. renderProjects reads SERVER_SESSIONS for the
     per-project session-count badge, so without this re-render
     the chip row stays at 0 even when sessions are present. */
  try{renderProjects()}catch(_){}
  return SERVER_SESSIONS.slice();
}
function formatRelativeTime(ts){
  var diff=Date.now()-ts;
  var m=Math.floor(diff/60000);
  if(m<1)return"just now";
  if(m<60)return m+"m ago";
  var h=Math.floor(m/60);
  if(h<24)return h+"h ago";
  var d=Math.floor(h/24);
  if(d===1)return"Yesterday";
  if(d<7)return d+" days ago";
  return new Date(ts).toLocaleDateString();
}
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
var _cmdKIndex=null;            /* fuse.js instance */
var _cmdKIndexDocs=[];          /* raw docs, used to render snippets */
var _cmdKResults=[];            /* last result list (used for keyboard nav) */
var _cmdKSelected=0;             /* index of the highlighted row */
var _cmdKRecent=[];             /* recent queries */
try{_cmdKRecent=JSON.parse(localStorage.getItem("socrates-search-recent")||"[]")||[]}catch(_){_cmdKRecent=[]}

function rebuildCmdKIndex(){
  if(typeof Fuse==="undefined")return;
  var docs=[];
  /* Sessions: title + topic. */
  (SERVER_SESSIONS||[]).forEach(function(s){
    docs.push({
      kind:"session",
      id:s.id,
      title:s.title||s.topic||"(untitled)",
      topic:s.topic||"",
      mode:s.mode||"tutor",
      updatedAt:s.updated_at||s.updatedAt||0,
      snippet:s.preview||(s.title||s.topic||"").slice(0,140)
    });
  });
  /* Messages inside the active session. Older sessions get
     loaded on demand when the user picks a session hit, so we
     don't preload them. */
  (state.session.messages||[]).forEach(function(m){
    if(!m.rawText)return;
    var role=m.role==="user"?"You":"Assistant";
    docs.push({
      kind:"message",
      id:m.clientId||m.id,
      sessionId:state.session.currentSessionId,
      title:role+": "+(m.rawText||"").slice(0,80),
      topic:state.session.topic||"",
      snippet:(m.rawText||"").slice(0,200)
    });
  });
  _cmdKIndexDocs=docs;
  _cmdKIndex=new Fuse(docs,{
    keys:["title","topic","snippet"],
    threshold:0.4,
    ignoreLocation:true,
    minMatchCharLength:2,
    includeMatches:true
  });
}

function openCmdK(){
  if(!CURRENT_USER)return;
  if(!_cmdKIndex)rebuildCmdKIndex();
  var overlay=document.getElementById("cmdKOverlay");
  if(overlay)overlay.classList.remove("hidden");
  var input=document.getElementById("cmdKInput");
  if(input){input.value="";setTimeout(function(){input.focus()},0)}
  /* If the user has recent queries, surface the most recent
     so they can re-run with a single Enter. */
  renderCmdKResults(_cmdKRecent.length?[
    {kind:"recent",label:"Recent",items:_cmdKRecent.slice(0,5)}
  ]:[]);
  _cmdKResults=[];
  _cmdKSelected=0;
}
function closeCmdK(){
  var overlay=document.getElementById("cmdKOverlay");
  if(overlay)overlay.classList.add("hidden");
}
function onCmdKInput(q){
  q=(q||"").trim();
  if(!q){
    renderCmdKResults(_cmdKRecent.length?[
      {kind:"recent",label:"Recent",items:_cmdKRecent.slice(0,5)}
    ]:[]);
    return;
  }
  var hits=_cmdKIndex?_cmdKIndex.search(q,{limit:20}):[];
  /* Also fire a server search in the background. If the user
     is on a slow link the local results are still useful. */
  try{
    apiFetch("/api/search",{
      method:"POST",
      body:{q:q,scope:"all",limit:20},
      timeoutMs:4000
    }).then(function(r){
      if(r&&Array.isArray(r.hits)&&r.hits.length){
        var serverHits=r.hits.map(function(h){
          return{kind:"remote",id:h.id,sessionId:h.sessionId,title:h.title,snippet:h.snippet||""};
        });
        /* Merge remote hits after the local ones. */
        var existing=document.getElementById("cmdKResults");
        if(existing){
          var remoteBlock=document.createElement("div");
          remoteBlock.className="cmd-k-section";
          remoteBlock.innerHTML='<div class="cmd-k-section-label">From your other devices</div>'+
            serverHits.map(function(h,idx){
              return '<div class="cmd-k-row" data-idx="'+(hits.length+idx)+'" data-kind="'+h.kind+'" data-id="'+esc(h.id)+'">'+
                '<div class="cmd-k-row-title">'+esc(h.title)+'</div>'+
                '<div class="cmd-k-row-snippet">'+esc(h.snippet)+'</div>'+
              '</div>';
            }).join("");
          existing.appendChild(remoteBlock);
        }
      }
    }).catch(function(){/* offline or 404 — ignore */});
  }catch(_){}
  _cmdKResults=hits;
  _cmdKSelected=0;
  renderCmdKResultsHits(q,hits);
}
function renderCmdKResultsHits(q,hits){
  var html=[];
  if(hits.length){
    html.push('<div class="cmd-k-section"><div class="cmd-k-section-label">'+hits.length+' result'+(hits.length===1?"":"s")+' for "'+esc(q)+'"</div>');
    hits.forEach(function(h,idx){
      var item=h.item||h;
      var meta=item.kind==="message"?"Message":(item.mode==="chat"?"Chat":"Tutor");
      html.push(
        '<div class="cmd-k-row '+(idx===_cmdKSelected?"selected":"")+'" data-idx="'+idx+'" data-kind="'+item.kind+'" data-id="'+esc(item.id||"")+'" onclick="openCmdKResult('+idx+')" onmouseenter="_cmdKSelected='+idx+';updateCmdKSelected()">'+
          '<div class="cmd-k-row-title">'+esc(item.title||"")+'</div>'+
          '<div class="cmd-k-row-snippet">'+esc(item.snippet||"")+'</div>'+
          '<div class="cmd-k-row-meta">'+meta+'</div>'+
        '</div>'
      );
    });
    html.push('</div>');
  }else{
    html.push('<div class="cmd-k-empty">No results. Press <kbd>↵</kbd> to search on the server.</div>');
  }
  renderCmdKResultsHTML(html.join(""));
}
function renderCmdKResults(sections){
  if(!sections.length){
    renderCmdKResultsHTML('<div class="cmd-k-empty">Type to search across all your sessions.</div>');
    return;
  }
  var html=sections.map(function(sec){
    var rows=sec.items.map(function(it,idx){
      return '<div class="cmd-k-row" data-recent="'+esc(it)+'" onclick="document.getElementById(\'cmdKInput\').value=\''+esc(it)+'\';onCmdKInput(\''+esc(it)+'\')">'+
        '<div class="cmd-k-row-title">'+esc(it)+'</div>'+
        '<div class="cmd-k-row-meta">Recent</div>'+
      '</div>';
    }).join("");
    return '<div class="cmd-k-section"><div class="cmd-k-section-label">'+esc(sec.label)+'</div>'+rows+'</div>';
  }).join("");
  renderCmdKResultsHTML(html);
}
function renderCmdKResultsHTML(html){
  var el=document.getElementById("cmdKResults");
  if(el)el.innerHTML=html;
}
function updateCmdKSelected(){
  var rows=document.querySelectorAll("#cmdKResults .cmd-k-row");
  rows.forEach(function(r,i){
    r.classList.toggle("selected",i===_cmdKSelected);
    if(i===_cmdKSelected&&r.scrollIntoView){
      r.scrollIntoView({block:"nearest"});
    }
  });
}
function openCmdKResult(idx){
  var hit=_cmdKResults[idx];
  if(!hit)return;
  var item=hit.item||hit;
  /* Persist the query for next time. */
  var q=document.getElementById("cmdKInput").value.trim();
  if(q){
    _cmdKRecent=_cmdKRecent.filter(function(x){return x!==q});
    _cmdKRecent.unshift(q);
    _cmdKRecent=_cmdKRecent.slice(0,10);
    try{localStorage.setItem("socrates-search-recent",JSON.stringify(_cmdKRecent))}catch(_){}
  }
  if(item.kind==="session"){
    loadSession(item.id);
  }else if(item.kind==="message"&&item.sessionId&&loadSession){
    loadSession(item.sessionId);
  }else if(item.kind==="remote"&&item.sessionId){
    loadSession(item.sessionId);
  }
  closeCmdK();
}
function onCmdKKey(ev){
  if(ev.key==="Escape"){
    ev.preventDefault();
    closeCmdK();
  }else if(ev.key==="ArrowDown"){
    ev.preventDefault();
    if(_cmdKResults.length){
      _cmdKSelected=(_cmdKSelected+1)%_cmdKResults.length;
      updateCmdKSelected();
    }
  }else if(ev.key==="ArrowUp"){
    ev.preventDefault();
    if(_cmdKResults.length){
      _cmdKSelected=(_cmdKSelected-1+_cmdKResults.length)%_cmdKResults.length;
      updateCmdKSelected();
    }
  }else if(ev.key==="Enter"){
    ev.preventDefault();
    if(_cmdKResults.length){
      openCmdKResult(_cmdKSelected);
    }else{
      var q=document.getElementById("cmdKInput").value.trim();
      if(q){
        /* No local hits — try the server endpoint as a last resort. */
        apiFetch("/api/search",{
          method:"POST",
          body:{q:q,scope:"all",limit:20},
          timeoutMs:5000
        }).then(function(r){
          if(r&&Array.isArray(r.hits)&&r.hits.length){
            _cmdKResults=r.hits.map(function(h){
              return{item:{kind:"remote",id:h.id,sessionId:h.sessionId,title:h.title,snippet:h.snippet||""}};
            });
            _cmdKSelected=0;
            renderCmdKResultsHits(q,_cmdKResults);
          }else{
            showToast("No matches");
          }
        }).catch(function(){
          showToast("Search failed");
        });
      }
    }
  }
}

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
function saveCurrentSession(){
  if(!state.topic)return;
  if(!CURRENT_USER)return; /* not signed in; do nothing */
  /* If a save is already running, mark dirty and let it coalesce. */
  if(_saveInFlight){
    _saveDirty=true;
    return;
  }
  _saveDirty=false;
  doSave();
}

function doSave(){
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
    return {clientId:m.clientId||null,role:m.role,html:m.html,rawText:m.rawText||null,type:m.type||null,reasoningContent:m.reasoningContent||null};
  });
  var sessionId=state.session.currentSessionId||generateId();
  var payload={
    id:sessionId,
    topic:state.session.topic,
    title:state.session.sessionTitle||state.session.topic,
    domain:state.session.domain||state.session.topic,
    mode:appMode,
    /* P2.1 — write the active project binding into the session
       record so the server-side list endpoint can group by
       project. `null` (or missing) means Inbox. */
    projectId:state.session.currentProjectId||null,
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
    /* v3.0 design — persist the long-term-plan optional fields
       (§10) so a reloaded session restores the deadline, daily
       budget, and rest-day selection. The backend sessions
       schema uses .passthrough() so these are accepted as-is. */
    planTargetDate:state.session.planTargetDate||null,
    planDailyMinutes:state.session.planDailyMinutes||30,
    planWeeklyRestDays:state.session.planWeeklyRestDays||[],
    planStartedAt:state.session.planStartedAt||null,
    planLastWarnedAt:state.session.planLastWarnedAt||0,
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
     user can immediately find the message they just sent. */
  rebuildCmdKIndex();
  /* Fire-and-forget write to server. The local SERVER_SESSIONS cache is
     refreshed on next renderRecents; we don't block the UI on the roundtrip.
     P0.0 — adopt the server's canonical session id when it differs
     from what we sent. Pre-UUID fix the client generated identifiers
     like "mq61wc16-ayb8j6" and the server swapped in a fresh UUID
     before inserting. Without this adoption step, every subsequent
     save kept sending the original (rejected) id, breaking the upsert
     and producing duplicate rows. */
  _saveInFlight=apiFetch("/api/sessions",{method:"POST",body:payload}).then(function(r){
    if(r&&r.id&&r.id!==sessionId){
      state.currentSessionId=r.id;
      if(state.session)state.session.currentSessionId=r.id;
      pushChatIdToURL(r.id);
    }
    return refreshServerSessions();
  }).then(function(){renderRecents()}).catch(function(e){
    console.warn("[sessions] save failed:",e.message);
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

async function loadSession(id){
  try{
    var s=await apiFetch("/api/sessions/"+encodeURIComponent(id));
    ensureSessionShape(s);
    state.topic=s.topic;
    state.domain=s.domain;
    state.kbNodes=s.kbNodes||[];
    state.currentNode=s.currentNode||0;
    state.totalQ=s.totalQ||0;
    state.phase=s.phase||"chat";
    state.currentSessionId=s.id;
    toggleShareBtn();
    state.mistakes=s.mistakes||[];
    state.sessionTitle=s.title||null;
    /* Update the URL to reflect the current chat session. */
    pushChatIdToURL(s.id);
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
    /* v3.0 design — restore the long-term plan fields. Sessions
       saved before this field existed default to a 30 min/day
       budget with no deadline. */
    state.session.planTargetDate=s.planTargetDate||null;
    state.session.planDailyMinutes=s.planDailyMinutes||30;
    state.session.planWeeklyRestDays=Array.isArray(s.planWeeklyRestDays)?s.planWeeklyRestDays:[];
    state.session.planStartedAt=s.planStartedAt||null;
    state.session.planLastWarnedAt=s.planLastWarnedAt||0;
    /* Restore KB boundary history and mistake filter. */
    state.kb.boundariesHistory=Array.isArray(s.boundariesHistory)?s.boundariesHistory:[];
    state.kb.mistakeFilter=s.mistakeFilter||"all";
    /* A-R2 perf — invalidate the cached plan warning; the
       underlying planTargetDate / dailyMinutes may have just
       changed. */
    if(typeof tutorSocratic==="object"&&tutorSocratic
       &&typeof tutorSocratic.invalidatePlanWarningCache==="function"){
      try{tutorSocratic.invalidatePlanWarningCache()}catch(_){}
    }
    /* Restore the mode the session was started in. Default to tutor for
       sessions saved before the mode field existed. */
    appMode=(s.mode==="chat")?"chat":"tutor";
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
    document.getElementById("topicBadge").classList.remove("hidden");
    toggleChatTopBarEls(true);
    document.getElementById("topicBadgeText").textContent=state.domain;
    syncChatModel();
    var msgList=document.getElementById("msgList");
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
      state.messages.push({
        clientId: clientId,
        role: m.role,
        rawText: m.rawText || "",
        html: renderHtml,
        type: m.type || null,
        /* P_reasoning-persist — restore chain-of-thought text so it
           can be passed back to the LLM on the next turn. */
        reasoningContent: m.reasoning_content || null,
        actions: null
      });
      /* P_reasoning-persist — render the thinking pill if the loaded
         message has saved reasoning_content and thinking is on. */
      if(m.role==="assistant" && m.reasoning_content && thinkingOn){
        var tp=appendThinking(m.reasoning_content||"");
        if(tp&&typeof tp.finalize==="function"){
          try{setTimeout(function(){tp.finalize()},0)}catch(_){}
        }
      }
      div.appendChild(body);
      msgList.appendChild(div);
    });
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
        if(rec.messages.length)localStorage.setItem(_memKey(s.id),JSON.stringify(rec));
      }catch(e){console.warn("[sessions] mirror to local memory failed:",e.message)}
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
      state.teachingPlan=buildTeachingPlanFromKB();
      if(state.teachingPlan&&state.teachingPlan.subtopics.length){
        var firstActive=-1;
        for(var pi=0;pi<state.teachingPlan.subtopics.length;pi++){
          if(state.teachingPlan.subtopics[pi].status!=="internalized"){firstActive=pi;break}
        }
        if(firstActive>=0){
          state.teachingPlan.currentSubtopicIdx=firstActive;
          var targetName=state.teachingPlan.subtopics[firstActive].name;
          var matchedIdx=-1;
          for(var kni=0;kni<state.kbNodes.length;kni++){
            if(state.kbNodes[kni].name===targetName){matchedIdx=kni;break}
          }
          state.currentNode=matchedIdx>=0?matchedIdx:Math.min(firstActive,state.kbNodes.length-1);
        }
      }
    }
    var sc=scrollContainer();
    sc.scrollTop=sc.scrollHeight;
  }catch(e){
    console.warn("[sessions] load failed:",e.message);
    /* The URL had ?chat=<id> pointing to a session that doesn't exist
       on the server (404). This happens when the user bookmarks a
       chat link on one device, then opens it on another device where
       the session never synced; or after a long absence, server-side
       pruning, or DB reset. Either way, the URL is now stale and
       confusing the user — clear it and let them start a new topic
       rather than showing a blank chat panel. */
    if(state.currentSessionId===id||!state.currentSessionId){
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
        document.getElementById("topicBadge").classList.add("hidden");
        toggleChatTopBarEls(false);
        document.getElementById("topicSetup").classList.remove("hidden");
        /* Friendly notice so the user knows what just happened. */
        try{
          var pill=document.getElementById("searchPill");
          if(pill){
            pill.textContent="Link expired — start a new topic.";
            pill.classList.remove("hidden");
          }
        }catch(_){}
      }catch(_){}
    }
  }
}

/* ============================================================
   CLIENT-SIDE CONVERSATION MEMORY
   The server stores the rendered HTML of each message, but on a hard
   refresh the assistant text can drift (formatting changes, code-block
   re-render, etc.) and we lose the *raw* text we actually sent the
   model. To keep the model grounded in what it has seen, we also keep
   a localStorage copy of the last 200 plain-text messages per session.

   - key:  socrates-memory-<sessionId>
   - value: { topic, ts, messages:[{role, content}] }
   - capacity: 200 messages / 1MB; older entries are dropped.
   - If localStorage is full or unavailable, every write is silently
     dropped — never throws.
   ============================================================ */
var LOCAL_MEMORY_MAX=200;

function _memKey(sid){return "socrates-memory-"+(sid||"default")}

function loadLocalMemory(sid){
  if(!sid)return null;
  try{
    var raw=localStorage.getItem(_memKey(sid));
    if(!raw)return null;
    var parsed=JSON.parse(raw);
    if(!parsed||!Array.isArray(parsed.messages))return null;
    return parsed;
  }catch(e){
    return null;
  }
}

function appendLocalMemory(role,content){
  var sid=state.currentSessionId;
  if(!sid)return;
  /* Skip "suggest" placeholders — they are UI, not dialogue. */
  if(!content||(typeof content==="string"&&!content.trim()))return;
  try{
    var rec=loadLocalMemory(sid)||{topic:state.topic||"",ts:Date.now(),messages:[]};
    rec.topic=state.topic||rec.topic;
    rec.ts=Date.now();
    rec.messages.push({role:role,content:String(content)});
    if(rec.messages.length>LOCAL_MEMORY_MAX){
      /* Keep the most recent LOCAL_MEMORY_MAX; drop the oldest 50% to
         avoid trimming on every single message. */
      rec.messages=rec.messages.slice(-LOCAL_MEMORY_MAX);
    }
    localStorage.setItem(_memKey(sid),JSON.stringify(rec));
  }catch(e){
    /* QuotaExceeded or private-mode: drop silently. */
  }
}

function clearLocalMemory(sid){
  if(!sid)return;
  try{localStorage.removeItem(_memKey(sid))}catch(_){}
}

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
/* P2.2 — toggle a session's pinned state. The UI re-renders
   immediately; the server sync is fire-and-forget. */
function togglePinSession(id,e){
  if(e){e.stopPropagation();e.preventDefault()}
  var idx=findServerSessionIndex(id);
  if(idx<0)return;
  var s=SERVER_SESSIONS[idx];
  s.pinned=!s.pinned;
  /* Persist via PATCH so the same value flows to other
     devices the next time /api/sessions is called. The
     server-side PATCH accepts any subset of SessionSummary
     fields. */
  apiFetch("/api/sessions/"+encodeURIComponent(id),{
    method:"PATCH",
    body:{pinned:s.pinned},
    timeoutMs:8000
  }).catch(function(err){
    console.debug("[pin] server sync failed:",err&&err.message);
  });
  renderRecents();
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
      '<input class="tag-editor-input" id="tagEditorInput" placeholder="Add a tag and press Enter" maxlength="30" autocomplete="off">'+
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
    console.debug("[tags] server sync failed:",err&&err.message);
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

function actuallyDeleteSession(id){
  if(!CURRENT_USER)return;
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
      var remaining=getRecents().length;
      if(remaining===0){
        bounceOutOfArchivedSession();
      }else if(wasActive){
        renderRecents();
      }
    });
  }).catch(function(err){
    console.warn("[delete] server sync failed:",err&&err.message);
    try{showToast("Delete failed: "+(err&&err.message||"server error")+" - refreshing.",4000)}catch(_){}
    refreshServerSessions();
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
    console.debug("[archive] restore sync failed:",err&&err.message);
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
  var cutoff=Date.now()-ARCHIVE_RETENTION_MS;
  return (SERVER_SESSIONS||[])
    .filter(function(s){return s&&s.archivedAt&&s.archivedAt>cutoff})
    .sort(function(a,b){return(b.archivedAt||0)-(a.archivedAt||0)});
}
/* P2.3 — the localStorage mirror is swept the same way the
   server is expected to. Called from refreshServerSessions
   and on every read of getArchivedSessions. */
function sweepExpiredArchives(){
  var cutoff=Date.now()-ARCHIVE_RETENTION_MS;
  var before=SERVER_SESSIONS.length;
  SERVER_SESSIONS=(SERVER_SESSIONS||[]).filter(function(s){
    return!s.archivedAt||s.archivedAt>cutoff;
  });
  return SERVER_SESSIONS.length!==before;
}

/* P2.3 — bounce the user out of an archived session. Used by
   actuallyDeleteSession when the active session is the one
   being archived; the chat view collapses back to the topic
   screen. */
function bounceOutOfArchivedSession(){
  _shareToken=null;
  resetState();
  toggleShareBtn();
  setChatIdInURL(null);
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  document.getElementById("topicBadge").classList.add("hidden");
  toggleChatTopBarEls(false);
  document.getElementById("msgList").innerHTML="";
  document.getElementById("topicInput").value="";
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">Set a learning topic to build your knowledge map.</div>';
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

/* P2.1 — Project sidebar + filter UI. The chip row is
   always visible (above the tab strip) and is the canonical
   way to scope the Recents panel. The active session's
   `currentProjectId` defaults to whatever the chip row shows,
   so the user always knows where new chats will land. */
function renderProjects(){
  loadProjects();
  var cont=document.getElementById("sidebarProjects");
  if(!cont)return;
  var html=[];
  PROJECTS.forEach(function(p){
    var isActive=p.id===state.session.currentProjectId;
    var isFilter=p.id===state.session.activeProjectFilter;
    var count=SERVER_SESSIONS.filter(function(s){return (s.projectId||INBOX_PROJECT_ID)===p.id;}).length;
    html.push(
      '<button class="sidebar-project-chip'+(isActive?" active":"")+(isFilter?" filter":"")+'" data-project-id="'+esc(p.id)+'" style="--chip-color:'+esc(p.color)+'" onclick="onProjectChipClick(\''+esc(p.id)+'\',event)" oncontextmenu="event.preventDefault();openProjectEditor(\''+esc(p.id)+'\')" title="'+esc(p.name)+(p.isSystem?"": " — right-click to edit")+'">'+
        '<span class="sidebar-project-icon" aria-hidden="true"></span>'+
        '<span class="sidebar-project-name">'+esc(p.name)+'</span>'+
        '<span class="sidebar-project-count">'+count+'</span>'+
      '</button>'
    );
  });
  html.push('<button class="sidebar-project-chip sidebar-project-add" onclick="openProjectEditor(null)" title="New project"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="13" height="13"><path d="M12 5v14M5 12h14"/></svg></button>');
  cont.innerHTML=html.join("");
}
function onProjectChipClick(projectId,ev){
  if(ev&&(ev.shiftKey||ev.metaKey||ev.ctrlKey)){
    /* Multi-select: toggle this project as a filter while
       keeping the active project unchanged. */
    if(state.session.activeProjectFilter===projectId){
      state.session.activeProjectFilter=null;
    }else{
      state.session.activeProjectFilter=projectId;
    }
  }else if(projectId===INBOX_PROJECT_ID){
    /* P2.1 — Inbox is the "default" view, NOT a regular filter.
       A plain click on Inbox should always take the user back
       to "show everything that isn't assigned to a project"
       (i.e. the unfiltered Recents list) — clearing whatever
       custom-project filter was active. This matches the user
       mental model: "Inbox = home", and avoids the trap where
       the user clicks Inbox and still sees an empty list
       because some other project's filter is still on. */
    state.session.currentProjectId=null;
    state.session.activeProjectFilter=null;
  }else{
    /* Plain click on a custom project: pin the active project
       to it, and scope Recents to it. */
    state.session.currentProjectId=projectId;
    state.session.activeProjectFilter=projectId;
  }
  renderProjects();
  renderRecents();
}
function clearProjectFilter(){
  state.session.activeProjectFilter=null;
  renderProjects();
  renderRecents();
}
function openProjectEditor(projectId){
  var existing=projectId?getProjectById(projectId):null;
  if(existing&&existing.isSystem){
    showToast("The Inbox project is permanent");
    return;
  }
  /* Lightweight modal — uses the existing shareOverlay
     structure as a generic dialog shell. */
  var overlay=document.getElementById("projectEditorOverlay");
  if(!overlay){
    overlay=document.createElement("div");
    overlay.id="projectEditorOverlay";
    overlay.className="cmd-k-overlay hidden";
    overlay.onclick=function(ev){if(ev.target===overlay)closeProjectEditor()};
    overlay.innerHTML='<div class="cmd-k-modal project-editor" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  var body=overlay.querySelector(".project-editor");
  body.innerHTML=
    '<div class="project-editor-head">'+
      '<span class="project-editor-title">'+(existing?"Edit project":"New project")+'</span>'+
      '<button class="project-editor-close" onclick="closeProjectEditor()">×</button>'+
    '</div>'+
    '<div class="project-editor-body">'+
      '<label class="project-editor-label">Name<input class="project-editor-input" id="projName" maxlength="80" placeholder="e.g. Linear Algebra" value="'+esc(existing?existing.name:"")+'"></label>'+
      '<label class="project-editor-label">Description<textarea class="project-editor-textarea" id="projDescription" maxlength="500" placeholder="Optional. Helps the tutor tailor its style.">'+esc(existing&&existing.description||"")+'</textarea></label>'+
      '<label class="project-editor-label">Icon<input class="project-editor-input project-editor-icon" id="projIcon" maxlength="4" value="'+esc(existing&&existing.icon||"pg")+'"></label>'+
      '<div class="project-editor-label">Color'+
        '<div class="project-editor-colors" id="projColors">'+
          ["#d8a85b","#7da9d8","#a0c46c","#c47ed1","#e07b5b","#5bc0be","#d6a4d1","#b8b54a"].map(function(c){
            return '<button class="project-editor-swatch" data-color="'+c+'" style="background:'+c+'" onclick="pickProjectColor(\''+c+'\')" '+(existing&&existing.color===c?"data-selected=\"1\"":"" )+'></button>';
          }).join("")+
        '</div>'+
      '</div>'+
    '</div>'+
    '<div class="project-editor-foot">'+
      (existing?'<button class="project-editor-delete" onclick="onProjectDelete(\''+esc(existing.id)+'\')">Delete</button>':'')+
      '<div class="project-editor-spacer"></div>'+
      '<button class="project-editor-cancel" onclick="closeProjectEditor()">Cancel</button>'+
      '<button class="project-editor-save" onclick="onProjectEditorSave(\''+(existing?esc(existing.id):"")+'\')">Save</button>'+
    '</div>';
  /* Stash the picked color on the body so the save handler
     can read it without a hidden input. */
  body.dataset.pickedColor=existing?existing.color:randomProjectColor();
  overlay.classList.remove("hidden");
  var nameEl=document.getElementById("projName");
  if(nameEl){setTimeout(function(){nameEl.focus();nameEl.select()},0)}
}
function pickProjectColor(c){
  var body=document.querySelector("#projectEditorOverlay .project-editor");
  if(!body)return;
  body.dataset.pickedColor=c;
  /* Visual selection state. */
  Array.from(body.querySelectorAll(".project-editor-swatch")).forEach(function(s){
    if(s.dataset.color===c)s.setAttribute("data-selected","1");
    else s.removeAttribute("data-selected");
  });
}
function onProjectEditorSave(projectId){
  var body=document.querySelector("#projectEditorOverlay .project-editor");
  if(!body)return;
  var name=(document.getElementById("projName")||{}).value||"";
  var description=(document.getElementById("projDescription")||{}).value||"";
  var icon=(document.getElementById("projIcon")||{}).value||"fl";
  var color=body.dataset.pickedColor||randomProjectColor();
  if(!name.trim()){
    showToast("Project name is required");
    return;
  }
  if(projectId){
    updateProject(projectId,{name:name,description:description,color:color,icon:icon});
  }else{
    var p=createProject({name:name,description:description,color:color,icon:icon});
    state.session.currentProjectId=p.id;
    state.session.activeProjectFilter=p.id;
  }
  closeProjectEditor();
  renderRecents();
  /* Best-effort server sync — non-blocking. */
  try{
    apiFetch(projectId?"/api/projects/"+encodeURIComponent(projectId):"/api/projects",{
      method:projectId?"PATCH":"POST",
      body:{name:name,description:description,color:color,icon:icon},
      timeoutMs:8000
    }).catch(function(e){console.debug("[project] server sync failed:",e&&e.message)});
  }catch(_){}
}
function onProjectDelete(projectId){
  if(!projectId)return;
  showConfirm("Delete project?","Sessions in this project will move back to Inbox. This cannot be undone.",true).then(function(yes){
    if(!yes)return;
    deleteProject(projectId);
    closeProjectEditor();
    try{
      apiFetch("/api/projects/"+encodeURIComponent(projectId),{method:"DELETE",timeoutMs:8000}).catch(function(){});
    }catch(_){}
  });
}
function closeProjectEditor(){
  var overlay=document.getElementById("projectEditorOverlay");
  if(overlay)overlay.classList.add("hidden");
}
/* P2.1 — when starting a new chat, persist the active project
   binding to the new session record. Called from resetApp(). */
function getActiveProjectId(){return state.session.currentProjectId||null;}

function renderRecents(){
  var cont=document.getElementById("recentsList");
  if(!cont)return;
  /* Self-heal: if the active project filter points to a non-system
     project id that's no longer in PROJECTS (e.g. the project was
     deleted from another tab / by another client, or the local
     project list was wiped), drop the filter so the user isn't
     stuck on an empty list. The system Inbox project is the only
     id that's always valid. */
  var filter=state.session.activeProjectFilter;
  if(filter&&filter!==INBOX_PROJECT_ID){
    var stillExists=PROJECTS.some(function(p){return p.id===filter});
    if(!stillExists){
      state.session.activeProjectFilter=null;
      filter=null;
    }
  }
  var recents=getRecents();
  /* P2.1 — apply the active project filter. `null` = show all.
     A project id (including INBOX_PROJECT_ID) scopes the list
     to that project. */
  if(filter){
    recents=recents.filter(function(s){
      var pid=s.projectId||INBOX_PROJECT_ID;
      return pid===filter;
    });
  }
  /* P2.2 — apply the persistent tag / pin filter, layered on
     top of the project filter. The two compose: "show pinned
     in this project" is just (project==P) ∧ (filter==pinned). */
  var recentsFilter=getRecentsFilter();
  if(recentsFilter==="pinned"){
    recents=recents.filter(function(s){return s&&s.pinned;});
  }else if(recentsFilter&&recentsFilter!=="all"){
    recents=recents.filter(function(s){
      return Array.isArray(s.tags)&&s.tags.indexOf(recentsFilter)>=0;
    });
  }
  /* Render the project filter chip showing what's currently
     shown. */
  var filterEl=document.getElementById("recentsFilter");
  if(filterEl){
    if(filter){
      var proj=getProjectById(filter);
      filterEl.innerHTML='<span class="recents-filter-chip" style="--chip-color:'+esc(proj.color)+'">'+
        '<span class="recents-filter-icon" aria-hidden="true"></span>'+
        '<span class="recents-filter-name">'+esc(proj.name)+'</span>'+
        '<button class="recents-filter-clear" onclick="clearProjectFilter()" title="Show all projects">×</button>'+
      '</span>';
    }else{
      filterEl.innerHTML="";
    }
  }
  if(recents.length===0){
    /* Three distinct empty states so the user never sees a
       misleading "No recent sessions yet." when the real cause
       is an active pinned/tag filter that matches nothing:
         1) project filter active, no sessions in that project
         2) no project filter, but a pinned/tag filter is active
            and matched zero rows — surface the filter name and a
            one-click clear action so the user isn't left thinking
            their data is gone (this is the root cause of the
            "Inbox says 12 but list is empty" report).
         3) no filter at all — the truly-empty state. */
    var emptyMsg;
    if(filter){
      emptyMsg='<div class="recents-empty">No sessions in this project yet.<br><a href="#" onclick="resetApp();return false">Start a new chat</a> in this project.</div>';
    }else if(recentsFilter){
      var filterLabel=recentsFilter==="pinned"?"pinned":("#"+recentsFilter);
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
    /* Resolve the displayed mode. Three sources, in order:
         1) the session's persisted s.mode  (truthful for sessions saved
            after we added the field)
         2) the persisted s.phase === "chat" hint (older sessions that
            had no mode field but did have phase)
         3) the active appMode — if this row IS the currently active
            session and we know we're in chat mode, show Chat even if
            the server hasn't been updated yet (e.g. session just
            created, the async save hasn't completed) */
    var resolvedMode=s.mode;
    if(resolvedMode!=="chat"&&resolvedMode!=="tutor"){
      if(s.phase==="chat"){resolvedMode="chat"}
    }
    if(active){
      resolvedMode=appMode;
    }
    /* P_exam-history — exam sessions get their own label and CSS
     * class on the recent-row badge. We check s.kind first because
     * a user-created exam session also has mode='chat' (the front-end
     * used chat-mode for the underlying row) — kind is the truth. */
    var isExam=s.kind==="exam";
    var modeLabel=isExam?"Exam":(resolvedMode==="chat"?"Chat":"Tutor");
    var modeCls=isExam?"mode-exam":(resolvedMode==="chat"?"mode-chat":"mode-tutor");
    var safeId="r-"+Math.abs((s.id||"").split("").reduce(function(a,b){a=(a<<5)-a+b.charCodeAt(0);return a&a},0));
    var pinned=!!(s.pinned);
    html+='<div class="recent-item'+(active?" active":"")+(pinned?" pinned":"")+'" data-recent-id="'+safeId+'" data-recent-actual="'+esc(s.id)+'" onclick="loadSession(\''+esc(s.id)+'\')">';
    /* P2.2 — pin button on the left edge of the row. Tapping
       toggles the pinned state; pinned rows float to the top
       automatically because getRecents() sorts them first. */
    html+='<button class="recent-item-pin'+(pinned?" pinned":"")+'" title="'+(pinned?"Unpin":"Pin to top")+'" onclick="togglePinSession(\''+esc(s.id)+'\',event)">';
    html+='<svg viewBox="0 0 24 24" fill="'+(pinned?"currentColor":"none")+'" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><line x1="12" y1="12" x2="12" y2="20"/></svg>';
    html+='</button>';
    /* P2.2 — mode-coloured dot. The visible text is hidden via CSS
       (font-size:0; overflow:hidden) so the span is just a 6 px circle;
       the title attribute provides a hover tooltip. */
    html+='<span class="recent-mode-badge '+modeCls+'" title="'+modeLabel+'">'+modeLabel+'</span>';
    html+='<div class="recent-item-main">';
    html+='<div class="recent-item-text">'+esc(s.title||s.topic||"(untitled)")+'</div>';
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
  /* P2.2 — render the secondary filter chip row. "All" is the
     default; "Pinned" filters to pinned sessions; the user's
     most-used tags are also surfaced. The active chip is
     highlighted; clicking a chip toggles its filter state. */
  renderRecentsFilterChips();
}

function renderRecentsFilterChips(){
  var el=document.getElementById("recentsFilterChips");
  if(!el)return;
  var cur=getRecentsFilter();
  var tags=getKnownTags().slice(0,8);
  var html=[];
  function chip(label,val,isActive){
    return '<button class="recents-filter-chip-btn'+(isActive?" active":"")+'" data-filter="'+esc(val==null?"all":val)+'" onclick="onRecentsFilterChipClick(\''+esc(val==null?"all":val)+'\')">'+esc(label)+'</button>';
  }
  html.push(chip("All",null,!cur));
  var pinActive=cur==="pinned";
  /* Pinned chip — minimal line-drawn bookmark. The previous
     Bootstrap pushpin had 18 control points and read as busy at
     11px; a 4-vertex bookmark is the universal "pinned / saved"
     cue and matches the stroke style of the other sidebar icons. */
  html.push('<button class="recents-filter-chip-btn'+(pinActive?" active":"")+'" data-filter="pinned" onclick="onRecentsFilterChipClick(\'pinned\')" title="Pinned"><svg class="icon-inline" viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 2 H12 V14 L8 11 L4 14 Z"/></svg><span class="recents-filter-chip-label">Pinned</span></button>');
  /* P2.2 — surface the tags currently in use, plus — crucially —
     the active tag filter even if no session currently carries it.
     Without this, an orphaned tag filter (e.g. the user removed the
     tag from every session, or the tag was lost during a partial
     sync) would be invisible AND match nothing, leaving the Recents
     list empty with no way to clear the filter except clicking "All". */
  var tagSet={};
  tags.forEach(function(t){tagSet[t]=true});
  if(cur&&cur!=="pinned"&&!tagSet[cur]){
    tags.push(cur);
  }
  if(tags.length){
    html.push('<span class="recents-filter-chips-sep"></span>');
    tags.forEach(function(t){
      html.push(chip("#"+t,t,cur===t));
    });
  }
  el.innerHTML=html.join("");
}

/* =============================================================
   In production, this would call an LLM API.
   ============================================================ */
/* Detect user language from input text */
function detectLanguage(text){
  if(/[\u4e00-\u9fff]/.test(text))return'zh';
  if(/[\u3040-\u309f\u30a0-\u30ff]/.test(text))return'ja';
  if(/[\uac00-\ud7af]/.test(text))return'ko';
  if(/[\u0400-\u04ff]/.test(text))return'ru';
  if(/[\u0600-\u06ff]/.test(text))return'ar';
  return'en';
}

var DIAG_SYSTEM_PROMPT = "You are a thoughtful diagnostic tutor. Generate exactly 1 multiple-choice question (this is question {questionNumber} of 5, focused on {aspect}) to assess a learner's grasp of {topic}.\n\n{previousQuestions}\n\nVoice and form:\n- Write the question and all options in {language}. The learner thinks in {language}; the text must read as native, not a translation. Match the learner's input language exactly.\n- Use academic but accessible language, like a kind teacher who is precise yet warm. Imagine a professor explaining to a curious student over tea.\n- Show depth and a small intellectual flavor (韵味) in the question. It should feel thoughtful, never mechanical. Probe what the learner truly understands, not just surface familiarity.\n- Avoid em-dashes (—, ——) where possible. Prefer periods, commas, colons, semicolons, or parentheses instead.\n- Use Markdown for formatting (bold, italic, code) and LaTeX ($...$ or $$...$$) for mathematical notation where applicable.\n\nStructure:\n- The question must probe {aspect} from a different angle than anything listed above.\n- The question must target a SPECIFIC knowledge point within {aspect}. Name it in the knowledgePoint field (e.g. \"matrix multiplication rules\", \"Ohm's law derivation\", \"binary search edge cases\"). This maps the question to a concrete concept so the teaching plan can address it precisely.\n- Provide 3 to 4 options labeled A, B, C, D.\n- Each option includes a level field: internalized (deep grasp), fuzzy (some knowledge with gaps), or blank (no knowledge).\n- Output ONLY a single valid JSON object, no other text: {\"q\":\"question text\", \"knowledgePoint\":\"specific concept being tested\", \"opts\":[{\"letter\":\"A\",\"text\":\"option text\",\"level\":\"internalized\"}, ...]}\n- Do NOT wrap the JSON in code fences.\n- CRITICAL: inside any string value, NEVER use ASCII double quotes (\\\"...) to quote phrases. Use full-width quotation marks 「...」 or 『...』 for CJK text, or just plain text without quotes for English. ASCII double quotes are reserved for JSON delimiters only.";

/* The five probe angles, one per question. Mapped 1:1 to the
   fixed KB nodes in aiGenerate() (0 Core concepts, 1 Key principles,
   2 Practical applications, 3 Common misconceptions, 4 Advanced).
   The descriptions are passed to the model so each call gets a
   fresh, non-overlapping angle.
   P_cold-start-coverage — the five dimensions systematically cover:
   0. Basic concepts (基础概念) — vocabulary, definitions, foundational terms
   1. Core principles (核心原理) — underlying mechanisms, derivations, why-it-works
   2. Application scenarios (应用场景) — concrete real-world cases, problem-solving
   3. Common problem handling (常见问题处理) — pitfalls, misconceptions, edge cases
   4. Critical analysis (批判性分析) — comparison, evaluation, deeper connections
   This ensures the diagnostic probes multiple knowledge dimensions rather than
   only surface familiarity, per the cold-start design requirement. */
var DIAG_ASPECTS=[
  "basic concepts and vocabulary: foundational definitions, key terms, and entry-level recognition of the topic's building blocks",
  "core principles and mechanisms: the underlying logic, derivations, and causal relationships that govern the topic",
  "application scenarios: concrete real-world cases where the topic's concepts are applied to solve problems",
  "common problems and pitfalls: frequent mistakes, edge cases, and misconceptions that arise when working with the topic",
  "critical analysis and synthesis: comparing alternatives, evaluating trade-offs, and connecting the topic to broader contexts"
];

/* Build the 5-question diagnostic by calling the LLM once per
   question, passing the previous questions so the model avoids
   repetition. Falls back to mock (caller side) if fewer than 3
   questions come back successfully. */
async function generateDiagnosticQuestions(topic,language,onProgress){
  var langNames={zh:'Chinese',ja:'Japanese',ko:'Korean',ru:'Russian',ar:'Arabic',en:'English'};
  var langName=langNames[language]||'English';
  var all=[];
  var previousTexts=[];
  for(var i=0;i<5;i++){
    var aspect=DIAG_ASPECTS[i]||DIAG_ASPECTS[DIAG_ASPECTS.length-1];
    var prevBlock=previousTexts.length
      ?"Already asked in this diagnostic. Do NOT repeat the same angle or wording:\n"+
        previousTexts.map(function(t,idx){return(idx+1)+". "+t}).join("\n")
      :"This is the first question in the diagnostic.";
    var prompt=DIAG_SYSTEM_PROMPT
      .replace('{topic}',topic)
      .replace('{language}',langName)
      .replace('{questionNumber}',String(i+1))
      .replace('{aspect}',aspect)
      .replace('{previousQuestions}',prevBlock);
    /* Web context only needs to be mentioned once (on the first
       call) — the same context applies to all 5 questions and
       repeating it 5x burns tokens without changing behavior. */
    if(i===0){
      if(state.searchContext){
        prompt+="\n\n"+state.searchContext;
        prompt+="\n\nNote: a [Web research] block is present above. You MAY ground the diagnostic questions in its contents. If no [Web research] block is present, you do not have live web access for this turn.";
      }else{
        prompt+="\n\nNote: no [Web research] block is present. You do not have live web access for this turn — say so honestly rather than guessing about current events.";
      }
    }
    if(onProgress)onProgress(i+1,5,null);
    var msgs=[{role:'system',content:prompt},{role:'user',content:'Topic: '+topic}];
    var resp=await callAPI(msgs,MAX_TOKENS_DIAG);
    if(!resp){
      if(!state.lastCallError)state.lastCallError="Diag call returned empty response";
      console.log("[diag] step "+(i+1)+"/5: no response, reason="+state.lastCallError);
      break;
    }
    var q=parseOneDiagResponse(resp,i);
    if(!q){
      console.log("[diag] step "+(i+1)+"/5: parse failed, reason="+state.lastCallError);
      break;
    }
    all.push(q);
    previousTexts.push(q.q);
    if(onProgress)onProgress(i+1,5,q);
  }
  /* If we got fewer than 3 of 5 questions, treat the whole call as
     failed and let the caller fall back to mock. The user gets a
     consistent 5-question diagnostic either way. */
  if(all.length<3)return null;
  return all;
}

/* Parse a single-question JSON object from the model response.
   Returns the normalized question or null. Sets state.lastCallError
   on failure for the api-badge to surface. */
function parseOneDiagResponse(resp,index){
  try{
    var raw=String(resp||"");
    /* Strip think blocks. Reasoning models emit <think>...</think>
       which can be huge; if the response was truncated mid-think
       there's no closing tag — discard everything from <think>
       onward so we don't accidentally swallow the JSON. */
    raw=raw.replace(/<think>[\s\S]*?<\/think>/gi,'');
    raw=raw.replace(/<think>[\s\S]*$/gi,'');
    /* Strip code fences if present */
    raw=raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    var start=raw.indexOf("{"),end=raw.lastIndexOf("}");
    if(start<0||end<=start){
      state.lastCallError="Diag response had no JSON object";
      return null;
    }
    var jsonStr=raw.slice(start,end+1);
    var parsed=null;
    try{
      parsed=JSON.parse(jsonStr);
    }catch(parseErr){
      /* JSON.parse failed — usually because the model embedded
         unescaped ASCII double quotes inside a CJK string. Fall
         back to the existing balanced-brace per-object extractor
         so we still surface the question instead of giving up. */
      parsed=parseSingleDiagObject(jsonStr);
      if(!parsed)throw parseErr;
    }
    if(!parsed||typeof parsed.q!=="string"||!Array.isArray(parsed.opts)||parsed.opts.length<3){
      state.lastCallError="Diag response not a valid question object";
      return null;
    }
    /* Pin nodeIdx to the question slot so each step maps to its
       own KB node. The model may return a nodeIdx but we trust
       the round-robin slot more. */
    parsed.nodeIdx=index;
    return normalizeDiagQuestions([parsed])[0]||null;
  }catch(e){
    state.lastCallError="Diag JSON parse failed: "+(e&&e.message?e.message:String(e));
    return null;
  }
}

/* Shared finalizer: takes an array of question objects (from either
   JSON.parse or the balanced extractor), normalizes the shape, and
   returns at most 5 questions. */
function normalizeDiagQuestions(parsed){
  if(!Array.isArray(parsed))return[];
  var out=[];
  for(var i=0;i<parsed.length&&out.length<5;i++){
    var q=parsed[i];
    if(!q||typeof q!=="object")continue;
    var text=(typeof q.q==="string")?q.q.trim():"";
    if(!text)continue;
    var opts=Array.isArray(q.opts)?q.opts:[];
    if(opts.length<3)continue;
    var levels=["internalized","fuzzy","blank"];
    var letters=["A","B","C","D"];
    var fixedOpts=[];
    for(var oi=0;oi<opts.length&&fixedOpts.length<4;oi++){
      var src=opts[oi]||{};
      var ot=(typeof src.text==="string")?src.text.trim():((levels[fixedOpts.length]==="internalized"?"I know this well":levels[fixedOpts.length]==="fuzzy"?"I have heard of this":"I do not know this"));
      if(!ot)continue;
      fixedOpts.push({
        letter:letters[fixedOpts.length]||(fixedOpts.length+""),
        text:ot,
        level:levels[fixedOpts.length]||"fuzzy"
      });
    }
    if(fixedOpts.length<3)continue;
    var nodeIdx=parseInt(q.nodeIdx,10);
    if(!isFinite(nodeIdx)||nodeIdx<0||nodeIdx>4)nodeIdx=out.length;
    out.push({
      q:text,
      knowledgePoint:(typeof q.knowledgePoint==="string"&&q.knowledgePoint.trim())?q.knowledgePoint.trim():"",
      subarea:(typeof q.subarea==="string"&&q.subarea.trim())?q.subarea.trim():("Sub-area "+(out.length+1)),
      nodeIdx:nodeIdx,
      opts:fixedOpts.slice(0,3)
    });
  }
  return out;
}

/* Last-resort extractor for diagnostic JSON that JSON.parse can't
   handle (typically because the model put ASCII " inside Chinese
   strings). Walks the source character by character with a tiny
   state machine — tracking JSON-string boundaries, escapes, and
   brace / bracket nesting — and pulls out each top-level object
   inside the outer array. For each object, it scans for known
   keys ("q", "subarea", "nodeIdx", "opts") and reads their values
   with the same string-state-aware logic. Not a general JSON
   parser; built specifically for the diag schema. */
function extractDiagQuestionsBalanced(text){
  var out=[];
  if(!text)return out;
  /* Walk past the opening '['. */
  var i=0;var n=text.length;
  while(i<n&&text[i]!=='[')i++;
  if(i>=n)return out;
  i++;
  while(i<n&&out.length<5){
    /* Skip whitespace + commas. */
    while(i<n&&/\s|,/.test(text[i]))i++;
    if(i>=n||text[i]===']')break;
    if(text[i]!=='{')break;
    /* Find the matching '}' using bracket/string awareness. */
    var end=findMatchingClose(text,i,'{','}');
    if(end<0)break;
    var objText=text.slice(i,end+1);
    var parsed=parseSingleDiagObject(objText);
    if(parsed)out.push(parsed);
    i=end+1;
  }
  return out;
}

/* Find the matching close bracket for the open at position `open`,
   honoring JSON string boundaries and backslash escapes so we
   don't get confused by a '}' inside a quoted string. */
function findMatchingClose(text,open,openCh,closeCh){
  var depth=0;var n=text.length;
  for(var i=open;i<n;i++){
    var c=text[i];
    if(c==='\\'){i++;continue}
    if(c==='"'){
      i++;
      while(i<n){
        if(text[i]==='\\'){i+=2;continue}
        if(text[i]==='"'){break}
        i++;
      }
      continue;
    }
    if(c===openCh)depth++;
    else if(c===closeCh){depth--;if(depth===0)return i}
  }
  return-1;
}

/* Parse one flat question object via per-key string-aware scan.
   Returns null on failure. */
function parseSingleDiagObject(objText){
  var o={opts:[]};
  var n=objText.length;var i=1;/* skip '{' */
  while(i<n-1){
    /* Find next key: a "...":" pattern. */
    while(i<n&&/\s|,/.test(objText[i]))i++;
    if(i>=n-1||objText[i]==='}')break;
    if(objText[i]!=='"'){i++;continue}
    /* Read key. */
    var keyEnd=readJsonString(objText,i);
    if(keyEnd<0){i++;continue}
    var key=objText.slice(i+1,keyEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    i=keyEnd+1;
    /* Skip ":". */
    while(i<n&&/\s/.test(objText[i]))i++;
    if(objText[i]!==':'){i++;continue}
    i++;
    while(i<n&&/\s/.test(objText[i]))i++;
    if(i>=n)break;
    if(objText[i]==='['){
      /* opts array — read each {letter, text, level} object. */
      var arrEnd=findMatchingClose(objText,i,'[',']');
      if(arrEnd<0)break;
      var arrText=objText.slice(i+1,arrEnd);
      var opts=extractOptArray(arrText);
      if(opts&&opts.length)o.opts=o.opts.concat(opts);
      i=arrEnd+1;
    }else if(objText[i]==='{'){
      var objEnd=findMatchingClose(objText,i,'{','}');
      if(objEnd<0)break;
      i=objEnd+1;
    }else if(objText[i]==='"'){
      var valEnd=readJsonString(objText,i);
      if(valEnd<0)break;
      var val=objText.slice(i+1,valEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
      if(key==='q')o.q=val;
      else if(key==='subarea')o.subarea=val;
      else if(key==='nodeIdx'){var ni=parseInt(val,10);if(isFinite(ni))o.nodeIdx=ni}
      i=valEnd+1;
    }else{
      /* number / true / false / null — skip a run of token chars. */
      while(i<n&&/[0-9eE+\-.]/.test(objText[i]))i++;
    }
  }
  return(o.q||o.subarea)?o:null;
}

/* Read a JSON string starting at the opening quote. Returns the
   position of the closing quote, or -1 if not found / unbalanced. */
function readJsonString(text,openQuote){
  var n=text.length;
  if(text[openQuote]!=='"')return-1;
  var i=openQuote+1;
  while(i<n){
    var c=text[i];
    if(c==='\\'){i+=2;continue}
    if(c==='"')return i;
    i++;
  }
  return-1;
}

/* Pull option objects out of an opts array body (between [ and ]). */
function extractOptArray(arrText){
  var out=[];var i=0;var n=arrText.length;
  while(i<n&&out.length<4){
    while(i<n&&/\s|,/.test(arrText[i]))i++;
    if(i>=n)break;
    if(arrText[i]!=='{')break;
    var end=findMatchingClose(arrText,i,'{','}');
    if(end<0)break;
    var obj=parseSingleOptObject(arrText.slice(i,end+1));
    if(obj)out.push(obj);
    i=end+1;
  }
  return out;
}

/* Parse one {"letter":"A","text":"...","level":"..."} object. */
function parseSingleOptObject(objText){
  var o={};var n=objText.length;var i=1;
  while(i<n-1){
    while(i<n&&/\s|,/.test(objText[i]))i++;
    if(i>=n-1||objText[i]==='}')break;
    if(objText[i]!=='"'){i++;continue}
    var keyEnd=readJsonString(objText,i);
    if(keyEnd<0){i++;continue}
    var key=objText.slice(i+1,keyEnd);
    i=keyEnd+1;
    while(i<n&&/\s/.test(objText[i]))i++;
    if(objText[i]!==':'){i++;continue}
    i++;
    while(i<n&&/\s/.test(objText[i]))i++;
    if(objText[i]!=='"'){i++;continue}
    var valEnd=readJsonString(objText,i);
    if(valEnd<0)break;
    var val=objText.slice(i+1,valEnd).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
    if(key==='letter'||key==='text'||key==='level')o[key]=val;
    i=valEnd+1;
  }
  return(o.text||o.letter||o.level)?o:null;
}

function aiGenerate(topic){
  var clean=topic.replace(/^(i want to |i'd like to |i would like to |learn about |learn |understand |study |explore )/i,"").replace(/[.!?]+$/,"").trim();
  var domain=clean.length>30?clean.substring(0,27)+"...":clean;
  domain=domain.charAt(0).toUpperCase()+domain.slice(1);

  /* Fixed 5-node KB skeleton, each carries the rich metadata that
     updateKB() / mountKBDetail() expects.
     P_cold-start-coverage — the five nodes map 1:1 to DIAG_ASPECTS:
     0. Basic concepts (基础概念)
     1. Core principles (核心原理)
     2. Practical applications (应用场景)
     3. Common problems & pitfalls (常见问题处理)
     4. Critical analysis & advanced (批判性分析与进阶) */
  var nodes=[
    {name:"Basic concepts of "+domain,status:"blank",questions:0,system_note:"",user_note:"",confidence_score:0,history:[]},
    {name:"Core principles of "+domain,status:"blank",questions:0,system_note:"",user_note:"",confidence_score:0,history:[]},
    {name:"Practical applications of "+domain,status:"blank",questions:0,system_note:"",user_note:"",confidence_score:0,history:[]},
    {name:"Common problems and pitfalls in "+domain,status:"blank",questions:0,system_note:"",user_note:"",confidence_score:0,history:[]},
    {name:"Critical analysis and advanced "+domain,status:"blank",questions:0,system_note:"",user_note:"",confidence_score:0,history:[]}
  ];

  var diagQs=generateMockDiagQs(domain);
  return {domain:domain,nodes:nodes,diagQuestions:diagQs};
}

/* P_cold-start-coverage — generate topic-specific KB node names via LLM
   so the knowledge dimensions are tailored to the subject rather than
   using generic placeholders. Called before diagnostic questions so
   the question generation can reference the same node names. Falls
   back to the fixed skeleton from aiGenerate() on any failure. */
async function generateTopicKBNodes(topic,language){
  var langNames={zh:'Chinese',ja:'Japanese',ko:'Korean',ru:'Russian',ar:'Arabic',en:'English'};
  var langName=langNames[language]||'English';
  var prompt="You are an expert curriculum designer. For the topic \""+topic+"\", generate exactly 5 knowledge dimensions that systematically cover the subject.\n"+
    "The 5 dimensions MUST follow this structure (adapt the specific content to the topic):\n"+
    "0. Basic concepts — foundational definitions, key terms, vocabulary\n"+
    "1. Core principles — underlying mechanisms, derivations, causal logic\n"+
    "2. Practical applications — concrete real-world cases, problem-solving scenarios\n"+
    "3. Common problems and pitfalls — frequent mistakes, edge cases, misconceptions\n"+
    "4. Critical analysis and advanced topics — comparison, synthesis, deeper connections\n"+
    "Write ALL dimension names in "+langName+". Each name should be specific to the topic (not generic).\n"+
    "Output ONLY a JSON array of 5 strings, no other text:\n"+
    "[\"dimension 0 name\",\"dimension 1 name\",\"dimension 2 name\",\"dimension 3 name\",\"dimension 4 name\"]\n"+
    "Do NOT wrap in code fences. Do NOT add explanation.";
  var msgs=[{role:'system',content:prompt},{role:'user',content:'Topic: '+topic}];
  try{
    var resp=await callAPI(msgs,2000);
    if(!resp)return null;
    var raw=String(resp).replace(/<think>[\s\S]*?<\/think>/gi,'').replace(/<think>[\s\S]*$/gi,'');
    raw=raw.replace(/```json\s*/gi,'').replace(/```\s*/g,'').trim();
    var start=raw.indexOf("["),end=raw.lastIndexOf("]");
    if(start<0||end<=start)return null;
    var arr=JSON.parse(raw.slice(start,end+1));
    if(!Array.isArray(arr)||arr.length<3)return null;
    /* Pad to 5 if the model returned fewer */
    while(arr.length<5)arr.push("Dimension "+arr.length);
    return arr.slice(0,5).map(function(s){return String(s).trim()}).filter(function(s){return s.length>0});
  }catch(e){
    console.log("[generateTopicKBNodes] failed: "+(e&&e.message?e.message:String(e)));
    return null;
  }
}

/* Generate varied mock diagnostic questions for fallback */
/* Mock diagnostic questions for fallback when no API is configured.
   Each question is bound to a nodeIdx 0..4 (matching the fixed KB
   skeleton in aiGenerate) and to a subarea label. */
function generateMockDiagQs(domain){
  /* The 5 fixed mock KB node names — used both to name the subareas and
     to seed the KB so the question's nodeIdx actually lines up.
     P_cold-start-coverage — aligned with the 5 knowledge dimensions. */
  var subareaNames=["Basic concepts of "+domain,"Core principles of "+domain,"Practical applications of "+domain,"Common problems and pitfalls in "+domain,"Critical analysis and advanced "+domain];
  var templates=[
    {knowledgePoint:"core definitions and key vocabulary",subarea:subareaNames[0],nodeIdx:0,
     q:["How familiar are you with the core concepts of "+domain+"?","What is your current level of understanding of "+domain+"'s core ideas?"],
     opts:[
       [{letter:"A",text:"I have a clear mental model of the core concepts and can apply them independently",level:"internalized"},
        {letter:"B",text:"I have heard of them but could not explain them precisely",level:"fuzzy"},
        {letter:"C",text:"I do not know what the core concepts are",level:"blank"}],
       [{letter:"A",text:"I can articulate the core concepts and how they connect",level:"internalized"},
        {letter:"B",text:"I recognize the names but cannot define them",level:"fuzzy"},
        {letter:"C",text:"I have not encountered the core concepts",level:"blank"}]
     ]},
    {knowledgePoint:"underlying mechanisms and derivations",subarea:subareaNames[1],nodeIdx:1,
     q:["How well can you explain the key principles that govern "+domain+"?"],
     opts:[
       [{letter:"A",text:"I can state the principles and reason from them",level:"internalized"},
        {letter:"B",text:"I know some principles exist but cannot articulate them",level:"fuzzy"},
        {letter:"C",text:"I do not know which principles are central to "+domain,level:"blank"}]
     ]},
    {knowledgePoint:"real-world application cases",subarea:subareaNames[2],nodeIdx:2,
     q:["Can you give a concrete real-world example where "+domain+" is applied?"],
     opts:[
       [{letter:"A",text:"Yes, and I can describe how it works in detail",level:"internalized"},
        {letter:"B",text:"I have heard of applications but cannot describe one fully",level:"fuzzy"},
        {letter:"C",text:"I do not know any real applications of "+domain,level:"blank"}]
     ]},
    {knowledgePoint:"common mistakes and edge cases",subarea:subareaNames[3],nodeIdx:3,
     q:["Are you aware of common misconceptions or pitfalls in "+domain+"?"],
     opts:[
       [{letter:"A",text:"I can name several misconceptions and explain why they are wrong",level:"internalized"},
        {letter:"B",text:"I have a vague sense of what goes wrong but cannot name specifics",level:"fuzzy"},
        {letter:"C",text:"I have not thought about misconceptions in "+domain,level:"blank"}]
     ]},
    {knowledgePoint:"critical comparison and synthesis",subarea:subareaNames[4],nodeIdx:4,
     q:["How comfortable are you with the more advanced aspects of "+domain+"?"],
     opts:[
       [{letter:"A",text:"I have explored advanced material and feel comfortable",level:"internalized"},
        {letter:"B",text:"I know it exists but have not engaged with it",level:"fuzzy"},
        {letter:"C",text:"I do not know what the advanced parts of "+domain+" are",level:"blank"}]
     ]}
  ];
  /* Shuffle order so successive mocks feel different. */
  var pool=templates.slice();
  for(var i=pool.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var tmp=pool[i];pool[i]=pool[j];pool[j]=tmp;}
  return pool.map(function(t){
    var qi=Math.floor(Math.random()*t.q.length);
    var oi=Math.floor(Math.random()*t.opts.length);
    return {q:t.q[qi],knowledgePoint:t.knowledgePoint,subarea:t.subarea,nodeIdx:t.nodeIdx,opts:t.opts[oi]};
  });
}


/* ============================================================
   SESSION START
   ============================================================ */

async function startSession(){
  var input=document.getElementById("topicInput");
  var topic=input.value.trim();
  if(!topic)return;

  state.topic=topic;
  state.diagIndex=0;
  state.diagAnswers=[];
  /* v3.0 design — §10.1 read the optional long-term plan fields
     (target date / daily minutes / rest days) into state before
     the KB is built so the plan generator can use them. */
  if(typeof readPlanSetupIntoState==="function"){
    try{readPlanSetupIntoState()}catch(_){}
  }

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
  state.currentSessionId=newSessId;
  /* P_dup-session — mirror into the namespaced field too so the
     first saveCurrentSession after Begin uses this id rather than
     re-generating its own (which the previous code did, creating
     a duplicate session on the server). */
  state.session.currentSessionId=newSessId;
  pushChatIdToURL(state.currentSessionId);

  /* Chat mode: skip diagnostic, KB, mistake book. Go straight to chat
     with a plain-conversation prompt. The first AI turn is a greeting
     so the user sees something without having to type. */
  if(appMode==="chat"){
    state.kbNodes=[];
    state.diagQuestions=[];state.diagAnswers=[];state.diagIndex=0;
    state.substantiveCount=0;
    state.domain=state.topic;
    state.phase="chat";
    document.getElementById("topicSetup").classList.add("hidden");
    document.getElementById("diagnosticView").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    document.getElementById("topicBadge").classList.remove("hidden");
    toggleChatTopBarEls(true);
    document.getElementById("topicBadgeText").textContent=state.domain;
    document.getElementById("msgList").innerHTML="";
    /* Show the user's input as the first message in the chat. */
    addMessage("user",'<p>'+esc(state.topic)+'</p>');
    updateKB();
    updateChatStats();
    saveCurrentSession();
    setTimeout(function(){askChatTurn(state.topic)},200);
    return;
  }

  /* Show diagnostic view with loading animation immediately */
  document.getElementById("topicSetup").classList.add("hidden");
  document.getElementById("diagnosticView").classList.remove("hidden");
  document.getElementById("chatView").classList.add("hidden");
  toggleChatTopBarEls(false);
    document.getElementById("topicBadge").classList.remove("hidden");
    document.getElementById("topicBadgeText").textContent=state.domain;
    syncChatModel();
  document.getElementById("diagnosticView").innerHTML='<div class="diag-loading"><div class="loading"><span></span><span></span><span></span></div><p class="diag-loading-text">'+t("tutor.loading")+'</p><div class="diag-progress"><div class="diag-progress-bar"><div class="diag-progress-fill" id="diagProgressFill"></div></div><div class="diag-progress-step" id="diagProgressStep"><span class="diag-progress-spin"></span>'+(window._currentLang==="zh"?"正在分析主题…":"Analyzing topic…")+'</div></div></div>';

  /* Phase 3 — create the search-progress log up front so the user sees
   * the activity feed while the search runs in the background.
   * The fire-and-forget pattern avoids blocking diagnostic questions
   * on the 12s search timeout — results arrive before teaching starts. */
  var diagSearchLog=null;
  if(webSearchOn){
    try{
      var diagLoading=document.querySelector("#diagnosticView .diag-loading");
      diagSearchLog=startSearchProgress(topic,{mount:diagLoading,collapsed:false});
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
    diagProgress(10, window._currentLang==="zh"?"正在分析主题…":"Analyzing topic…");
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
      console.log("[startSession] generateTopicKBNodes returned insufficient results, using generic KB node names");
      diagProgress(15, (window._currentLang==="zh"?"已识别知识点":"Knowledge dimensions ready"));
    }
  }catch(e){
    console.log("[startSession] generateTopicKBNodes failed, using generic KB node names:",e&&e.message?e.message:String(e));
    diagProgress(15, (window._currentLang==="zh"?"已识别知识点":"Knowledge dimensions ready"));
  }

  /* KB nodes ready — advance to question generation */
  diagProgress(20, window._currentLang==="zh"?"正在出诊断题…":"Generating questions…");

  /* Try the real LLM first (via the project's existing
     generateDiagnosticQuestions — it goes through callAPI() and
     so respects the user's configured provider, plus the
     DIAG_SYSTEM_PROMPT already instructs the model to write all
     questions and options in the user's input language).
     Falls back to the built-in mock only if the LLM call returns
     nothing usable. */
  var diagQs = null;
  var diagErr = null;
  /* P_ui-tutor-diag-debug — log apiConfig so we can see why
     getActiveProvider() might return null on cold boot. */
  try{
    var _ap=getActiveProvider();
    console.log("[diag] apiConfig.activeId="+apiConfig.activeId+" providerCount="+apiConfig.providers.length+" activeProvider="+(_ap?(_ap.label||_ap.id):"null"));
  }catch(_){}
  try {
    diagQs = await generateDiagnosticQuestions(topic, lang, function(step, total, q) {
      var pct = 20 + Math.round(75 * step / total);
      if (q) {
        diagProgress(pct, (window._currentLang==="zh"
          ? "已出 "+step+"/"+total+" 道题"
          : "Generated "+step+"/"+total+" questions"));
      } else {
        diagProgress(pct, (window._currentLang==="zh"
          ? "正在出题 "+step+"/"+total+"…"
          : "Generating Q"+step+"/"+total+"…"));
      }
    });
  } catch (e) {
    diagErr = (e && e.message) || String(e);
  }
  if (!diagQs) {
    /* Belt-and-braces: if callAPI / generateDiagnosticQuestions
       returned null without writing lastCallError, synthesise a
       reason from the current apiConfig so the api-badge actually
       tells the user something useful. */
    if (!state.lastCallError) {
      var ap = (typeof getActiveProvider === "function") ? getActiveProvider() : null;
      if (!ap) state.lastCallError = "no provider configured";
      else if (!ap.model) state.lastCallError = "active provider missing model";
      else if (ap.isBuiltIn) state.lastCallError = "built-in provider call failed (network or server error)";
      else state.lastCallError = "active provider '"+(ap.label||ap.id)+"' call failed";
    } else {
      /* generateDiagnosticQuestions already wrote a specific reason
         (e.g. "Diag JSON parse failed: ..." or "Diag response had no
         JSON array"). Log it once at warn level so the user / dev
         console shows the actual failure mode, not just the generic
         "Diag generator returned no questions" string the badge
         displays. */
      try{console.warn("[diag] generator failed, lastCallError="+state.lastCallError)}catch(_){}
    }
  }
  if (diagQs && diagQs.length) {
    state.diagQuestions = diagQs;
    state.lastCallSource = 'real';
    /* Don't overwrite lastCallError on success — callAPI() set it to
       null on the way in and we want to leave it that way. */
  } else {
    /* Fallback: built-in mock questions. callAPI() / generateDiagnosticQuestions
       have already populated state.lastCallError with the real reason
       (network, JSON parse, provider missing, etc.) — surface it on
       the api-badge via updateChatStats(). If for some reason that
       didn't happen (e.g. callAPI never ran because the user is on a
       fresh page where state.lastCallError hasn't been initialised),
       synthesise a clear reason from apiConfig. */
    state.diagQuestions = gen.diagQuestions;
    state.lastCallSource = 'mock';
    if (!state.lastCallError) {
      var ap = (typeof getActiveProvider === "function") ? getActiveProvider() : null;
      state.lastCallError = diagErr
        || (ap ? "Diag generator returned no questions" : "no provider configured");
    }
  }
  updateChatStats();

  /* Done — fill the bar before showing questions */
  diagProgress(100, window._currentLang==="zh"?"准备就绪":"Ready");

  renderDiagQuestion();
  updateKB();
}

function renderDiagQuestion(){
  var q=state.diagQuestions[state.diagIndex];
  var sel=state.diagAnswers[state.diagIndex];
  var view=document.getElementById("diagnosticView");

  var html='<div class="diag-card">';
  html+='<div class="diag-num">'+t("tutor.questionOf").replace("{n}",state.diagIndex+1).replace("{total}",state.diagQuestions.length)+'</div>';
  html+='<div class="diag-text">'+formatMsg(q.q)+'</div>';
  html+='<div class="diag-opts">';
  q.opts.forEach(function(o,i){
    html+='<button class="diag-opt'+(sel===i?' selected':'')+'" onclick="selectDiag('+i+')">';
    html+='<div class="diag-opt-letter">'+o.letter+'</div>';
    html+='<div class="diag-opt-text">'+formatMsg(o.text)+'</div>';
    html+='</button>';
  });
  html+='</div>';  /* close .diag-opts */
  html+='<div class="diag-actions">';
  html+='<button onclick="prevDiagQuestion()"'+(state.diagIndex===0?' style="visibility:hidden"':'')+'>'+t("tutor.back")+'</button>';
  if(state.diagIndex<state.diagQuestions.length-1){
    html+='<button class="diag-continue'+(sel!==undefined?' enabled':'')+'" onclick="nextDiagQuestion()"'+(sel===undefined?' disabled':'')+'>'+t("tutor.next")+'</button>';
  }else{
    html+='<button class="diag-continue'+(sel!==undefined?' enabled':'')+'" onclick="finishDiagnostic()"'+(sel===undefined?' disabled':'')+'>'+t("tutor.begin")+'</button>';
  }
  html+='</div>';  /* close .diag-actions */
  html+='</div>';  /* close .diag-card */

  view.innerHTML=html;
  scrollContainer().scrollTop=0;
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

  /* P_test-interpretation — Update KB based on diagnostic.
     CRITICAL CHANGE: "internalized" answers are mapped to "fuzzy" (NOT
     "internalized") because passing a single multiple-choice question
     only demonstrates surface recognition, not deep mastery. The cold-
     start test establishes a baseline, not a verdict. True internalization
     requires verification through the teaching phase (3 substantive
     answers per node). This preserves room for further evaluation and
     prevents the teaching plan from skipping knowledge points the user
     merely recognized but does not truly understand. */
  state.diagQuestions.forEach(function(q,i){
    var ans=state.diagAnswers[i];
    if(ans===undefined)return;
    var level=q.opts[ans].level;
    /* Clamp nodeIdx to a valid index in case the AI returned something
       out of range. Default to question index if missing. */
    var nodeIdx=typeof q.nodeIdx==="number"?Math.max(0,Math.min(q.nodeIdx,state.kbNodes.length-1)):i;
    var node=state.kbNodes[nodeIdx];
    if(!node)return;
    /* P_test-interpretation — downscale: internalized→fuzzy, fuzzy→fuzzy, blank→blank.
       The diagnostic only establishes familiarity, not mastery. */
    var newStatus=level==="blank"?"blank":"fuzzy";
    if(node.status!==newStatus){
      node.history=node.history||[];
      node.history.push({date:new Date().toISOString().slice(0,10),from:node.status,to:newStatus,reason:"cold-start diagnostic (baseline, not mastery)"});
      node.status=newStatus;
    }
    /* Record the specific knowledge point tested, so the teaching plan
       can address it precisely. */
    if(q.knowledgePoint){
      var kpNote="Tested knowledge point: "+q.knowledgePoint+" (baseline: "+newStatus+"). ";
      node.system_note=(node.system_note||"")+kpNote;
    }
    /* Use the AI-provided subarea label to refine the node's name on
       first encounter — but never overwrite a user-friendly domain-prefixed
       name if the AI didn't supply one. */
    if(q.subarea&&i<2&&node.name.indexOf(q.subarea)===-1&&q.subarea!=="Sub-area "+(i+1)){
      node.system_note=(node.system_note||"")+"Sub-area: "+q.subarea+". ";
    }
  });

  /* P_test-interpretation — show a results interpretation screen before
     starting teaching. This makes it clear to the user that the test
     result is a baseline assessment, NOT a verdict of mastery. */
  renderDiagResultsScreen();
}

/* P_test-interpretation — Render the diagnostic results interpretation
   screen. Shows the user's baseline across all knowledge dimensions,
   with an explicit message that passing the test only means reaching
   the evaluation standard, not full mastery. The teaching will still
   cover ALL dimensions from the basics. */
function renderDiagResultsScreen(){
  var view=document.getElementById("diagnosticView");
  var isZh=_currentLang==="zh";
  var summary={internalized:0,fuzzy:0,blank:0};
  state.diagQuestions.forEach(function(q,i){
    var ans=state.diagAnswers[i];
    if(ans===undefined)return;
    var level=q.opts[ans].level;
    /* Use the downscaled status for display consistency */
    var status=level==="blank"?"blank":"fuzzy";
    summary[status]=(summary[status]||0)+1;
  });

  var html='<div class="diag-results">';
  html+='<div class="diag-results-title">'+(isZh?"测试结果解读":"Diagnostic Results Interpretation")+'</div>';
  html+='<div class="diag-results-notice">';
  html+='<div class="diag-results-notice-icon">i</div>';
  html+='<div class="diag-results-notice-text">';
  html+=isZh
    ?"<strong>重要提示：</strong>冷启动测试仅用于探测您的知识边界基线。通过测试仅代表您达到特定评估标准，<strong>不代表完全掌握</strong>相关主题。系统将针对所有知识维度从基础开始系统教学，确保知识体系的完整性和连贯性。"
    :"<strong>Important:</strong> The cold-start test only establishes a baseline of your knowledge boundary. Passing the test means you reached a specific evaluation standard, <strong>NOT full mastery</strong> of the topic. The system will teach ALL knowledge dimensions from the fundamentals to ensure a complete and coherent knowledge system.";
  html+='</div></div>';

  html+='<div class="diag-results-grid">';
  state.kbNodes.forEach(function(node,i){
    var status=node.status||"blank";
    var statusLabel=isZh
      ?(status==="fuzzy"?"有一定基础":"未知/空白")
      :(status==="fuzzy"?"Some familiarity":"Unknown/Blank");
    var statusClass=status==="fuzzy"?"fuzzy":"blank";
    html+='<div class="diag-result-card '+statusClass+'">';
    html+='<div class="diag-result-card-num">'+(i+1)+'</div>';
    html+='<div class="diag-result-card-name">'+esc(node.name)+'</div>';
    html+='<div class="diag-result-card-status">'+statusLabel+'</div>';
    html+='</div>';
  });
  html+='</div>';

  html+='<div class="diag-results-summary">';
  html+=isZh
    ?"基线评估："+summary.fuzzy+" 个维度有一定基础，"+summary.blank+" 个维度待探索"
    :"Baseline: "+summary.fuzzy+" dimension(s) with some familiarity, "+summary.blank+" dimension(s) to explore";
  html+='</div>';

  html+='<div class="diag-results-actions">';
  html+='<button class="diag-results-continue" onclick="proceedToTeaching()">'+(isZh?"开始系统学习":"Start Systematic Learning")+'</button>';
  html+='</div>';
  html+='</div>';

  view.innerHTML=html;
  scrollContainer().scrollTop=0;
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
  state.teachingPlan=buildTeachingPlanFromKB();
  /* v3.0 design (§10) — overlay the long-term plan: target date,
     daily minutes, weekly rest days, day-by-day distribution with
     the last 7 days reserved as a review buffer. The plan object
     keeps the legacy fields (subtopics, currentSubtopicIdx) for
     backwards compatibility with the rest of the code. */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.buildLongTermPlan==="function"){
    try{
      var _ltp=tutorSocratic.buildLongTermPlan({});
      if(_ltp){
        /* Merge the schedule fields into the existing plan so
           callers reading state.teachingPlan see one shape. */
        for(var _k in _ltp){
          if(Object.prototype.hasOwnProperty.call(_ltp,_k)
             &&!Object.prototype.hasOwnProperty.call(state.teachingPlan,_k)){
            state.teachingPlan[_k]=_ltp[_k];
          }
        }
        state.teachingPlan.days=_ltp.days;
        state.teachingPlan.dailyMinutes=_ltp.dailyMinutes;
        state.teachingPlan.targetDate=_ltp.targetDate;
        state.teachingPlan.totalMinutes=_ltp.totalMinutes;
        state.teachingPlan.weeklyRestDays=_ltp.weeklyRestDays;
      }
    }catch(_){}
  }
  /* P_teaching-plan — sync state.currentNode with the teaching plan's
     first sub-topic. The teaching plan subtopics are sorted (blank → fuzzy
     → internalized), but state.currentNode indexes into the original
     state.kbNodes array. Find the kbNode whose name matches the first
     sub-topic in the sorted plan and set currentNode to that index. */
  if(state.teachingPlan&&state.teachingPlan.subtopics.length){
    var firstActive=-1;
    for(var pi=0;pi<state.teachingPlan.subtopics.length;pi++){
      if(state.teachingPlan.subtopics[pi].status!=="internalized"){firstActive=pi;break}
    }
    if(firstActive>=0){
      state.teachingPlan.currentSubtopicIdx=firstActive;
      /* Find the kbNode index that matches the first sub-topic's name */
      var targetName=state.teachingPlan.subtopics[firstActive].name;
      var matchedIdx=-1;
      for(var kni=0;kni<state.kbNodes.length;kni++){
        if(state.kbNodes[kni].name===targetName){matchedIdx=kni;break}
      }
      state.currentNode=matchedIdx>=0?matchedIdx:Math.min(firstActive,state.kbNodes.length-1);
    }
  }
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

/* Task 3.2 — build a structured teaching plan from state.kbNodes.
   P_teaching-plan — CRITICAL CHANGE: Sub-topics are sorted blank → fuzzy
   → internalized so the biggest knowledge gaps are addressed first.
   ALL sub-topics are taught from basics regardless of diagnostic result,
   because the cold-start test only establishes a baseline, not mastery.
   currentSubtopicIdx always starts at 0 (the first/blank-est node) so
   teaching always begins from the foundation. */
function buildTeachingPlanFromKB(){
  var nodes=state.kbNodes||[];
  if(!nodes.length)return null;
  var subtopics=nodes.map(function(n){
    return {
      name:n.name,
      status:n.status||"blank",
      objective:"Master "+n.name,
      exampleCount:2,
      practiceCount:1,
      inspectionType:"concept",
      prerequisites:[],
      fromBasics:true
    };
  });
  /* P_teaching-plan — Sort: blank first (biggest gaps), then fuzzy, then
     internalized last. The sort is stable on the original index so
     equal-priority nodes keep their knowledge-dimension order
     (basic concepts → core principles → applications → problems → analysis). */
  var rank={"blank":0,"fuzzy":1,"internalized":2};
  subtopics=subtopics.map(function(s,i){return{s:s,i:i}})
    .sort(function(a,b){
      var ra=rank[a.s.status]!=null?rank[a.s.status]:0;
      var rb=rank[b.s.status]!=null?rank[b.s.status]:0;
      if(ra!==rb)return ra-rb;
      return a.i-b.i;
    })
    .map(function(x){return x.s});
  /* P_teaching-plan — always start from the first sub-topic. Even if
     some nodes were marked fuzzy by the diagnostic, we teach them from
     basics. The only exception is if ALL nodes are internalized (which
     shouldn't happen with the new downscaling logic, but kept as a
     safety net). */
  var currentSubtopicIdx=0;
  for(var i=0;i<subtopics.length;i++){
    if(subtopics[i].status!=="internalized"){currentSubtopicIdx=i;break}
    if(i===subtopics.length-1)currentSubtopicIdx=0;
  }
  return {
    subtopics:subtopics,
    currentSubtopicIdx:currentSubtopicIdx,
    createdAt:Date.now()
  };
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
  /* The "user" message we feed the model: if the user just opened the
     chat and hasn't typed anything, synthesize a short opener so the
     model has something to greet them with. */
  var userMsg=userText||("Let's talk about "+state.topic+".");
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
  var msgs=[{role:"system",content:sysCtx+"\n\n"+CHAT_SYSTEM_PROMPT+beagleSuffix()+thinkingSuffix()+memoriesSuffix()}];
  msgs=msgs.concat(history);
  if(pageBlocks.length){
    /* Append a single user turn carrying both the original text and the
       page blocks. Keeping it as a user message (not system) preserves
       ordering with subsequent rounds. */
    msgs.push({role:"user",content:userMsg+"\n\n"+pageBlocks.join("\n\n")});
  }else if(looksLikeUserMentionedSite(userMsg)){
    /* The user said something like "look up topodrive.top" or "看看
       example.com 的首页" but we couldn't extract a URL. Inject a
       short hint to the model so it asks for the full URL with an
       http(s):// prefix instead of guessing. */
    msgs.push({role:"user",content:userMsg+"\n\n[System] The user appears to be referring to a website, but no complete URL was provided in this turn (the system only auto-fetches text that contains a full http(s):// link or a recognizable bare domain like example.com / www.foo.bar). Reply briefly asking them to paste the full URL — including the https:// prefix — so you can read the page. Do NOT invent or guess the page contents."});
  }else{
    msgs.push({role:"user",content:userMsg});
  }

  /* Round 1: let the model decide whether to call web_search. We use
     a non-streaming call for round 1 because we need the FULL response
     to detect a tool envelope. Once we know it's a normal answer, we
     could re-stream; but re-streaming means paying for a second
     generation. Trade-off: we just display round 1 directly. */
  if(!webSearchOn){
    /* Web search is OFF. Skip round-1 detection; just stream the
       answer. This is the fast path users get when they don't want
       search at all. */
    var ctl=addStreamingMessage({onRetry:function(){askChatTurn(userText)}});
    var result=await callAPIStream(msgs,MAX_TOKENS_CHAT,function(delta){ctl.append(delta)},function(t){ctl.appendThinking(t)});
    handleChatApiResult(result,ctl,userText);
    updateChatStats();
    if(state.phase==="chat"||(state.topic&&state.kbNodes.length))saveCurrentSession();
    return;
  }

  /* Web search is ON: do a non-streaming round 1, check for tool call.
     P2.1 — lifted the round-1 ceiling from 15 s to 60 s for reasoning
     models (DeepSeek R1, QwQ) which routinely take 30-50 s on a single
     call. For non-reasoning providers we still pass 15 s via
     `isReasoningProvider`; the helper below picks the right value. */
  var r1=await callAPIChat(msgs,MAX_TOKENS_CHAT,isReasoningProvider()?60000:15000);
  if(!r1||!r1.text){
    /* Round 1 failed (no provider / network / etc). Show error. */
    var ctl=addStreamingMessage({onRetry:function(){askChatTurn(userText)}});
    handleChatApiResult(r1,ctl,userText);
    updateChatStats();
    if(state.phase==="chat"||(state.topic&&state.kbNodes.length))saveCurrentSession();
    return;
  }
  var toolCall=parseToolCall(r1.text);
  if(!toolCall){
    /* Model chose not to search. Display the round-1 answer directly
       (no second round needed). */
    var ctl2=addStreamingMessage({onRetry:function(){askChatTurn(userText)}});
    /* Render the full text at once: no streaming for round 1 since
       the API call was non-streaming. */
    ctl2.append(r1.text);
    ctl2.finish();
    state.lastCallSource="api";
    updateChatStats();
    if(state.phase==="chat"||(state.topic&&state.kbNodes.length))saveCurrentSession();
    return;
  }
  /* Model asked to search. Show a transient pill so the user knows.
     We try to fetch fresh results, but cap the wait at 5s. If the
     search is slow or fails, we fall back to whatever the model
     already has — better to answer from training than to make the
     user stare at "搜索中…" for ages. */
  try{setSearchPill("loading",0,"Model requested: \""+toolCall.query+"\"")}catch(_){}
  console.log("[chat] model invoked web_search:",toolCall.query);
  /* P2.1 — race the search against a REAL ceiling via AbortController
     + Promise.race. The previous implementation only `console.warn`-ed
     after 5 s but still awaited the full `searchPromise` — a slow
     DNS / hung provider would block the entire chat turn until
     STREAM_TIMEOUT_MS. We now truly abandon the search after the
     ceiling; the in-flight fetch is aborted so its socket is freed. */
  var searchCtl=new AbortController();
  /* Phase 3 — ceiling relaxed from 5 s → 12 s to accommodate the
   * round-1 + judge + (optional) round-2 loop. The first answer
   * token still arrives in <1 s because the main answer stream
   * runs in parallel (not awaiting the search). */
  var SEARCH_CEILING_MS=25000;
  var searchTimer=setTimeout(function(){
    try{searchCtl.abort("search-ceiling")}catch(_){}
  },SEARCH_CEILING_MS);
  /* Phase 3 — drive the bubble's search-progress log LIVE (not
   * capture-and-replay) by feeding onStep events directly to a
   * controller attached to the round-2 bubble. The bubble is created
   * up front so the user sees the activity feed as the search runs. */
  var ctl4=addStreamingMessage({onRetry:function(){askChatTurn(userText)}});
  var searchProgress=null;
  try{
    /* No explicit mount — startSearchProgress falls back to the last
     * AI bubble body, which is ctl4 (we just created it above). */
    searchProgress=startSearchProgress(toolCall.query);
    if(ctl4&&searchProgress)ctl4.attachSearchProgress(searchProgress);
  }catch(e){console.warn("[search-progress] init failed:",e&&e.message);searchProgress=null}
  var searchPromise=webSearchWithRetry(toolCall.query,{
    signal:searchCtl.signal,
    onStep:function(ev){
      try{if(searchProgress)searchProgress.onStep(ev)}catch(_){}
    }
  });
  var searchRes=null;
  try{
    searchRes=await Promise.race([
      searchPromise,
      new Promise(function(resolve){searchCtl.signal.addEventListener("abort",function(){
        console.warn("[chat] web search exceeded "+SEARCH_CEILING_MS+"ms ceiling, falling back to no-context answer");
        resolve(null);
      })})
    ]);
  }catch(e){
    searchRes=null;
  }
  clearTimeout(searchTimer);
  /* Whatever happens, cancel the in-flight fetch if it's still going
     so we don't leak sockets. */
  try{searchCtl.abort("abandoned")}catch(_){}
  if(!searchRes||!searchRes.ok||!searchRes.sources||!searchRes.sources.length){
    /* Search failed or returned nothing. Finalize the log to err
       state and tell the model to answer from its own knowledge. */
    try{if(searchProgress){
      searchProgress.finalize({state:"err",message:searchRes&&searchRes.reason||"no results"});
      searchProgress=null;
    }}catch(_){}
    try{setSearchPill("err",0,"Search failed")}catch(_){}
    var fallbackMsgs=msgs.concat([
      {role:"assistant",content:r1.text},
      {role:"user",content:"[System] The web_search tool returned no results (error: "+(searchRes&&searchRes.reason||"empty")+"). Please answer the user's question from your own knowledge, or say honestly that you don't have current information."}
    ]);
    var result=await callAPIStream(fallbackMsgs,MAX_TOKENS_CHAT,function(delta){ctl4.append(delta)},function(t){ctl4.appendThinking(t)});
    handleChatApiResult(result,ctl4,userText);
    updateChatStats();
    if(state.phase==="chat"||(state.topic&&state.kbNodes.length))saveCurrentSession();
    return;
  }
  /* Build the [Web research] block from the search+fetch results. */
  var sourcesBlock=formatSourcesBlock(searchRes.sources,toolCall.query);
  /* Phase 3 — finalise the search-progress log on the bubble with the
   * engine breakdown summary. */
  try{
    if(searchProgress){
      var finalEngines=searchRes.sources.reduce(function(acc,s){var k=s.source||"web";acc[k]=(acc[k]||0)+1;return acc;},{});
      var fetchedN=searchRes.sources.filter(function(x){return!!x.fullContent}).length;
      searchProgress.finalize({state:"ok",finalCount:searchRes.sources.length,fetchedCount:fetchedN,engines:finalEngines});
      searchProgress=null;
    }
  }catch(_){}
  /* Stash the sources for the post-render sources card. */
  state.searchContext=sourcesBlock;
  state.searchResults=searchRes.sources;
  state.searchContextAt=Date.now();
  state.searchContextCount=searchRes.sources.length;
  state.searchContextQuery=toolCall.query;
  /* Round 2: stream the answer with the [Web research] block in the
   * system message so the model can cite [1]..[n]. The bubble is
   * already created (ctl4) and the search log is prepended; the
   * streamed answer text appends below it. */
  var round2Msgs=[
    {role:"system",content:getSystemContext()+"\n\n"+CHAT_SYSTEM_PROMPT+"\n\n"+sourcesBlock+beagleSuffix()+thinkingSuffix()+memoriesSuffix()}
  ].concat(history).concat([
    {role:"user",content:userMsg},
    {role:"assistant",content:r1.text},
    {role:"user",content:"[Web research results for query: \""+toolCall.query+"\"]\n"+sourcesBlock+"\n\nPlease answer the user's original question using these results. Cite inline as [1], [2], etc."}
  ]);
  var result2=await callAPIStream(round2Msgs,MAX_TOKENS_CHAT,function(delta){ctl4.append(delta)},function(t){ctl4.appendThinking(t)});
  handleChatApiResult(result2,ctl4,userText);
  updateChatStats();
  if(state.phase==="chat"||(state.topic&&state.kbNodes.length))saveCurrentSession();
}

/* Non-streaming variant of callAPIStream for round-1 detection. Returns
   the same {text,html,widgets,cancelled} shape (or null on failure). */

/* Detect a tool envelope in the model's response. Returns:
     null — not a tool call
     {tool:"web_search", query:"..."} — a real tool call
   We search the FULL response text for any recognizable tool call
   format — the model may embed it in conversation text or wrap it
   in [TOOL_CALL] tags despite the instruction to output it alone. */
function parseToolCall(text){
  if(!text||typeof text!=="string")return null;
  /* Try to find ANY web_search tool call in the response. Search all
     known formats and return the FIRST match. */
  var candidates=[];

  /* Format 1: exact JSON parse (whole text is the JSON). */
  try{
    var trimmed=text.trim();
    var obj=JSON.parse(trimmed);
    if(obj&&obj.tool==="web_search"&&typeof obj.query==="string"&&obj.query.trim())
      return{tool:"web_search",query:obj.query.trim().slice(0,200)};
  }catch(_){}

  /* Format 2: markdown code fence ```json { "...":... } ``` */
  var fence=text.match(/```(?:json)?\s*(\{[\s\S]*?"tool"\s*:\s*"web_search"[\s\S]*?\})\s*```/i);
  if(fence){
    try{
      var obj2=JSON.parse(fence[1]);
      if(obj2&&obj2.tool==="web_search"&&typeof obj2.query==="string"&&obj2.query.trim())
        return{tool:"web_search",query:obj2.query.trim().slice(0,200)};
    }catch(_){}
  }

  /* Format 3: [TOOL_CALL] ... [/TOOL_CALL] wrapper. */
  var tcMatch=text.match(/\[TOOL_CALL\]\s*(\{[\s\S]*?["']tool["']\s*:\s*["']web_search["'][\s\S]*?\})\s*\[\/TOOL_CALL\]/i);
  if(tcMatch){
    try{
      var obj3=JSON.parse(tcMatch[1]);
      if(obj3&&obj3.tool==="web_search"&&typeof obj3.query==="string"&&obj3.query.trim())
        return{tool:"web_search",query:obj3.query.trim().slice(0,200)};
    }catch(_){}
  }

  /* Format 4: bare JSON anywhere in the text (no length limit — search
     the full response for the first match). */
  var bare=text.match(/\{\s*["']tool["']\s*:\s*["']web_search["']\s*,\s*["']query["']\s*:\s*["']([^"']+)["']\s*\}/i);
  if(bare){
    return{tool:"web_search",query:bare[1].slice(0,200)};
  }

  /* Format 5: lenient variation with single quotes or no quotes on values. */
  var lenient=text.match(/\{\s*["']?tool["']?\s*:\s*["']?web_search["']?\s*,\s*["']?query["']?\s*:\s*["']?([^"'\}\s][^"'\}]*?)["']?\s*\}/i);
  if(lenient){
    return{tool:"web_search",query:lenient[1].slice(0,200)};
  }

  return null;
}

/* Format the search results into the same [Web research] block the
   system used to inject. Used by the round-2 message. */
function formatSourcesBlock(sources,query){
  /* Strip emojis from web search content so the model does not mimic
     emoji-heavy style from page titles/snippets. Covers most emoji
     ranges: pictographs, emoticons, symbols, dingbats, transport,
     flags (paired regional indicators), variation selectors. */
  function stripEmoji(s){
    if(!s)return s;
    return String(s)
      .replace(/[\u{1F000}-\u{1FAFF}]/gu,"")
      .replace(/[\u{2600}-\u{27BF}]/gu,"")
      .replace(/[\u{2B00}-\u{2BFF}]/gu,"")
      .replace(/[\u{FE00}-\u{FE0F}]/gu,"")
      .replace(/[\u{1F1E6}-\u{1F1FF}]{2}/gu,"")
      .replace(/[\u{1F900}-\u{1F9FF}]/gu,"")
      .replace(/\u200D/g,"")
      .replace(/\s{2,}/g," ")
      .trim();
  }
  var lines=sources.map(function(x,i){
    var title=stripEmoji(x.title)||x.title;
    var head="["+(i+1)+"] "+title;
    if(x.snippet){var snip=stripEmoji(x.snippet);if(snip)head+=" — "+snip}
    head+=" ( "+x.url+" )";
    if(x.matchedQuery)head+="\n    Source query: \""+x.matchedQuery+"\"";
    if(x.fullContent){
      var fc=stripEmoji(x.fullContent);
      var trimmed=(fc.length>3000)?fc.slice(0,3000)+"…":fc;
      head+="\n    Full text: "+trimmed;
    }else{
      head+="\n    (snippet only — full text unavailable)";
    }
    return head;
  });
  return "[Web research] — query: \""+query+"\". "+
    "Each result below was retrieved live from the web. "+
    "If you use a fact from these results, you MUST cite it inline as [1], [2], etc. "+
    "Do NOT invent facts not supported by the results; if a result is irrelevant, ignore it.\n"+
    lines.join("\n");
}

function handleChatApiResult(result,ctl,userText){
  /* User clicked Stop — silently clean up the bubble. Don't show an
     error, don't fall back to mock. Whatever text already streamed is
     discarded so the conversation state stays consistent with what the
     user actually saw (a stopped bubble is not a finished answer). */
  if(result&&result.cancelled){
    ctl.abort();
    return;
  }
  if(result&&result.text&&typeof result.text==="string"&&result.text.trim()){
    state.lastCallSource="api";
    ctl.finish();
  }else{
    state.lastCallSource="mock";
    if(state.lastCallError){
      ctl.replaceWithError("No response: "+state.lastCallError,function(){
        askChatTurn(userText);
      });
    }else{
      ctl.abort();
      addMessage("assistant","(no response — check your API settings)");
    }
  }
}

/* Mock Socratic questions (fallback when no API available). */
function _origGenerateSocraticQuestion(node,domain){
  var qs={
    fuzzy:[
      "Can you describe "+domain+" in your own words, as if explaining it to someone who has never heard of it?",
      "What do you think is the most commonly misunderstood aspect of "+domain+"?",
      "If you had to identify one gap in your understanding of "+domain+", what would it be?",
      "Can you think of a situation where the standard rules of "+domain+" might not apply?",
      "What is the relationship between "+domain+" and the broader field it belongs to?",
      "If you were explaining "+domain+" to a skeptical friend, what would be your strongest argument for why it matters?",
      "What part of "+domain+" do you find most counterintuitive?",
      "How does "+domain+" connect to things you already know well?",
      "What question about "+domain+" have you hesitated to ask because it might seem too basic?",
      "If "+domain+" were a story, what would be its central conflict?"
    ],
    blank:[
      "What do you already know, or think you know, about "+domain+"?",
      "Before we dive in, what questions do you have about "+domain+"?",
      'When you hear the term "'+domain+'", what comes to mind first?',
      "What made you interested in learning about "+domain+"?",
      "If "+domain+" were a tool, what problem do you think it solves?",
      "Have you encountered "+domain+" in your daily life, even without realizing it?",
      "What do you imagine an expert in "+domain+" thinks about that beginners do not?",
      "Is there anything about "+domain+" that feels intimidating? What specifically?",
      "If you could ask one question to the best "+domain+" expert in the world, what would it be?",
      "What would success look like for you in learning "+domain+"?"
    ],
    internalized:[
      "Can you identify an assumption that most people make about "+domain+" that might not always hold true?",
      "How would you test whether someone truly understands "+domain+" versus just memorizing facts?",
      "What is a concrete example from your own experience that illustrates a key principle of "+domain+"?",
      "If you were to teach "+domain+" to someone, where would you start and why?",
      "What is the most elegant or beautiful idea within "+domain+" in your opinion?",
      "Can you think of two seemingly unrelated ideas in "+domain+" that actually share a deep connection?",
      "What limitations or boundaries of "+domain+" are rarely discussed?",
      "How has your understanding of "+domain+" changed over time? What caused those shifts?",
      "If you had to argue against a core principle of "+domain+", what would your argument be?",
      "Where do you think "+domain+" will be in 20 years, and what will drive that change?"
    ]
  };
  var pool=qs[node.status]||qs.fuzzy;
  var idx=Math.floor(Math.random()*pool.length);
  return {text:pool[idx],node:node};
}

function _origGenerateFollowUp(answer,node,domain){
  var phrase=extractKeyPhrase(answer);
  var fus=[
    'You mentioned "'+phrase+'". Could you elaborate on what you mean by that?',
    "That is an interesting perspective. What leads you to that conclusion?",
    "Can you give me a specific, concrete example of what you just described?",
    "What would be the strongest argument against what you just said?",
    "How does what you described connect to the broader concept of "+domain+"?",
    "If someone disagreed with your view, what might their reasoning be?",
    "Is there an assumption in your answer that might not always be true?",
    'You used the term "'+phrase+'". How would you define that in your own words?',
    "Can you walk me through the reasoning behind that, step by step?",
    "What experience or evidence supports what you just shared?",
    "If we zoom out, how does this relate to the bigger picture of "+domain+"?",
    "Is what you described always the case, or can you think of exceptions?"
  ];
  return fus[Math.floor(Math.random()*fus.length)];
}function extractKeyPhrase(text){
  var words=text.split(/\s+/);
  if(words.length<4)return text;
  var start=Math.floor(Math.random()*Math.min(words.length-3,words.length));
  return words.slice(start,start+3).join(" ");
}

var _explanationMock={
  fuzzy:[
    "Let us step back and approach this from a different angle. When we encounter a concept like this, it helps to start not with definitions but with concrete examples. Consider a situation where you have used this idea without realizing it. The key is to recognize the pattern, not memorize the terminology. Once the pattern is clear, the formal definition becomes much easier to grasp. Think about a specific instance in your own life where this pattern appears. What was the situation? What did you do? What was the result?",
    "Sometimes the best way to understand something is to see it in action. Imagine watching someone who deeply understands this topic. What would they notice that others miss? What questions would they ask? Try to put yourself in that mindset. Instead of trying to absorb isolated facts, try to see the patterns. Patterns are the language of deep understanding. Once you see them, the facts organize themselves.",
    "A useful way to approach this is to ask: what problem was this idea originally designed to solve? Ideas do not emerge from nowhere. They come from someone encountering a real challenge and needing a new way to think about it. If you can understand the original problem, the solution makes much more sense. So let us trace this back. What need, what gap, what frustration gave birth to this concept?"
  ],
  blank:[
    "This is new territory, so let us build from the ground up. The most important thing to understand first is why this concept exists. Every idea in any field exists because someone encountered a problem and needed a solution. If you can understand the original problem, the solution makes intuitive sense. So let us start there. What problem do you think this concept was designed to solve? Even if you are not sure, take a guess. The act of guessing activates the part of your brain that will later connect to the correct answer.",
    "Learning something new is like exploring an unfamiliar city. At first everything seems disconnected. But gradually you start to recognize landmarks, then streets, then neighborhoods. The same happens with ideas. Right now you are building your first landmarks. Do not worry about seeing the whole map yet. Focus on one thing at a time. What is the first landmark you want to establish?",
    "Think of this as building a mental model from scratch. Every complex idea can be broken down into simpler pieces. The trick is finding the right starting piece, the one that makes everything else click. Usually that piece is the simplest version of the idea, stripped of jargon and technical detail. Once that piece is in place, everything else attaches to it naturally."
  ],
  internalized:[
    "You seem to have a solid grasp of this. Let us push deeper. A sign of true understanding is being able to identify the boundaries of an idea: where it applies and where it breaks down. Can you think of a scenario where the usual rules of this concept would not apply, or would produce a misleading result? Edge cases reveal whether your understanding is flexible or rigid.",
    "Now that the foundation is solid, we can explore the subtleties. The difference between competence and mastery often lies in understanding the exceptions, the edge cases, the situations where the standard approach fails. Think about the assumptions baked into what you know. Which of those assumptions are actually optional? Which are truly fundamental?",
    "Mastery is not about knowing more facts. It is about developing intuition for what matters and what does not. When you look at this topic now, what do you see that a beginner would miss? What shortcuts has your experience taught you? Those insights are the real measure of deep understanding."
  ]
};
var explanationContent={fuzzy:_explanationMock.fuzzy,blank:_explanationMock.blank,internalized:_explanationMock.internalized};
function _origGetExplanation(status){var pool=explanationContent[status]||explanationContent.fuzzy;return pool[Math.floor(Math.random()*pool.length)]}

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
  /* P5.8 — Slash-command palette. Typing `/` as the only
     content in the input opens a Spotlight-style picker of
     prompt templates; arrow keys navigate, Enter inserts the
     template body (with the cursor on the placeholder line
     so the user can immediately type), Esc closes.
     Backspacing to an empty input also closes the palette
     so we don't shadow what the user is trying to type. */
  var t=e.target;
  if(t&&t.id==="chatInputArea"){
    if(e.key==="/"){
      /* Defer to next tick so the new `/` is in the value
         before we read it. */
      setTimeout(function(){
        if(t.value==="/")openSlashCommandPalette();
      },0);
    }else if(isSlashCommandPaletteOpen()&&t.value===""){
      closeSlashCommandPalette();
    }
  }
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
var BUILTIN_TEMPLATES=[
  {id:"tpl-summarize",title:"Summarize",description:"Condense the pasted text into bullet points.",icon:"no",category:"writing",shortcut:"/summarize",body:"Please summarize the following text in concise bullet points (≤ 5):\n\n",isBuiltin:true},
  {id:"tpl-translate",title:"Translate to English",description:"Translate the input into natural English.",icon:'<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.74 3.74 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073H4.75a.75.75 0 0 1 0-1.5h2.5l.005-4.243H4.75a.75.75 0 0 1 0-1.5h2.5V.75a.75.75 0 0 1 1.5 0v1.008h2.5a.75.75 0 0 1 0 1.5h-2.5l-.004 4.243H11.5a.75.75 0 0 1 0 1.5H9.255l-.004 5.072Z"/></svg>',category:"writing",shortcut:"/translate",body:"Translate the following into natural English, preserving tone:\n\n",isBuiltin:true},
  {id:"tpl-explain-code",title:"Explain this code",description:"Walk through the snippet line by line.",icon:'<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M5.854 4.854a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708l3.5 3.5a.5.5 0 0 1 0 .708"/><path d="M2.5 0a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-1a1 1 0 0 0-1 1v1a1 1 0 0 1-1 1h-6a1 1 0 0 1-1-1V3a1 1 0 0 0-1-1z"/></svg>',category:"code",shortcut:"/explain",body:"Walk me through this code line by line, calling out anything surprising or worth refactoring:\n\n```\n\n```",isBuiltin:true},
  {id:"tpl-debug",title:"Debug this",description:"Find the bug, propose a fix, explain why it worked.",icon:'<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M4.978.855a.5.5 0 1 0-.956.29l.41 1.367A4.98 4.98 0 0 0 3 6h10a4.98 4.98 0 0 0-1.432-3.488l.41-1.367a.5.5 0 1 0-.956-.29l-.291.972A5 5 0 0 0 8 1a5 5 0 0 0-2.731.827l-.291-.972z"/><path d="M13 6.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-.021A2.5 2.5 0 0 1 11 11h-.5a.5.5 0 0 1-.5-.5V8h-4v2.5a.5.5 0 0 1-.5.5H5a2.5 2.5 0 0 1-1.979-1H3a.5.5 0 0 1-.5-.5V7a.5.5 0 0 1 .5-.5z"/></svg>',category:"code",shortcut:"/debug",body:"This code is misbehaving. Find the bug, propose a minimal fix, and explain the root cause:\n\n```\n\n```\n\nExpected behavior:\nActual behavior:\n",isBuiltin:true},
  {id:"tpl-quiz",title:"Quiz me",description:"Generate 5 questions on a topic.",icon:'<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M5.5 13.5a.5.5 0 0 1 0 1H2a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5h5.5a.5.5 0 0 1 0 1H3v10.5zm3-12a.5.5 0 0 1 .5-.5h5a.5.5 0 0 1 .5.5v12a.5.5 0 0 1-.5.5H9a.5.5 0 0 1-.5-.5zm1.5.5v11h4v-11z"/><path d="M11 3a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0v-1A.5.5 0 0 1 11 3m-1.5.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5zm1 2.5a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m-1.5.5a.5.5 0 0 1 .5-.5h2a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1-.5-.5z"/></svg>',category:"learning",shortcut:"/quiz",body:"Quiz me with 5 questions on the following topic. Mix difficulty levels and tell me the answer only after I've answered:\n\nTopic: ",isBuiltin:true},
  {id:"tpl-socratic",title:"Socratic me",description:"Don't tell me the answer — ask me leading questions.",icon:'<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M2 1a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h9.586a1 1 0 0 1 .707.293l2.853 2.853a.5.5 0 0 0 .854-.353V2a1 1 0 0 0-1-1zm4 3.5a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5m0 2a.5.5 0 0 1 .5-.5h3a.5.5 0 0 1 0 1h-3a.5.5 0 0 1-.5-.5m-2.5.5a.5.5 0 0 1 .5-.5h.5a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5m0-2a.5.5 0 0 1 .5-.5h.5a.5.5 0 0 1 0 1H4a.5.5 0 0 1-.5-.5"/></svg>',category:"learning",shortcut:"/socratic",body:"Help me work through this with questions, not answers. Don't reveal the solution until I've reasoned it out:\n\nProblem: ",isBuiltin:true}
];
var PROMPT_TEMPLATES_KEY="socrates-prompt-templates";
function loadPromptTemplates(){
  try{
    var raw=localStorage.getItem(PROMPT_TEMPLATES_KEY);
    var custom=raw?JSON.parse(raw):null;
    if(!Array.isArray(custom))custom=[];
  }catch(_){custom=[]}
  /* Custom entries shadow built-ins of the same shortcut. */
  var byShortcut={};
  BUILTIN_TEMPLATES.forEach(function(t){byShortcut[t.shortcut]=t;});
  custom.forEach(function(t){if(t&&t.shortcut)byShortcut[t.shortcut]=t;});
  return Object.values(byShortcut).sort(function(a,b){
    return(a.title||"").localeCompare(b.title||"");
  });
}
function savePromptTemplates(customs){
  try{
    /* Persist only non-built-in entries. */
    var persistable=(customs||[]).filter(function(t){return t&&!t.isBuiltin;});
    localStorage.setItem(PROMPT_TEMPLATES_KEY,JSON.stringify(persistable));
  }catch(_){}
}
function findTemplateByShortcut(s){
  if(!s)return null;
  var list=loadPromptTemplates();
  for(var i=0;i<list.length;i++)if(list[i].shortcut===s)return list[i];
  return null;
}
function upsertCustomTemplate(t){
  var customs=loadPromptTemplates().filter(function(x){return!x.isBuiltin;});
  var idx=-1;
  for(var i=0;i<customs.length;i++)if(customs[i].id===t.id){idx=i;break}
  if(idx>=0)customs[idx]=t;else customs.push(t);
  savePromptTemplates(customs);
}
function deleteCustomTemplate(id){
  var customs=loadPromptTemplates().filter(function(x){return!x.isBuiltin&&x.id!==id;});
  savePromptTemplates(customs);
}

/* P5.8 — Slash-command palette overlay. A single instance
   that's lazily created the first time the user types `/`.
   Renders the list filtered by the current input; arrow
   keys move the highlight; Enter inserts the body at the
   cursor position; Esc closes. */
var _slashSelected=0;
var _slashList=[];
function isSlashCommandPaletteOpen(){
  var p=document.getElementById("slashCommandPalette");
  return p&&p.classList.contains("visible");
}
function openSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(!p){
    p=document.createElement("div");
    p.id="slashCommandPalette";
    p.className="slash-command-palette";
    document.body.appendChild(p);
  }
  _slashList=loadPromptTemplates();
  _slashSelected=0;
  renderSlashCommandPalette();
  p.classList.add("visible");
}
function closeSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(p)p.classList.remove("visible");
}
function renderSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(!p)return;
  var html=[];
  html.push('<div class="slash-command-head">Prompt templates</div>');
  if(!_slashList.length){
    html.push('<div class="slash-command-empty">No templates yet. Add one from the Profile → Data section.</div>');
  }else{
    _slashList.forEach(function(t,i){
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
  var input=document.getElementById("chatInputArea");
  if(!input)return;
  /* Replace the leading `/` with the template body, then
     put the cursor on a blank line so the user can type
     the topic / code / etc. immediately. If the body ends
     with a newline, the cursor lands on the next line
     naturally; if not, we add a trailing newline. */
  var body=t.body||"";
  input.value=body;
  input.focus();
  /* Place cursor at end. */
  var end=input.value.length;
  try{input.setSelectionRange(end,end)}catch(_){}
  /* Trigger autoResize so the textarea grows. */
  if(typeof autoResize==="function")autoResize(input);
  if(typeof updateSendBtn==="function")updateSendBtn();
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

async function submitChatMessage(textOverride,opts){
  opts=opts||{};
  var input=document.getElementById("chatInputArea");
  var text=(textOverride!=null?textOverride:input.value).trim();
  if(!text)return;
  if(textOverride==null){
    addMessage("user",text);
    input.value="";autoResize(input);updateSendBtn();
    input.focus();
  }else{
    /* Origin: quiz — synthetic message from a quiz pick. */
    addMessage("user",text);
  }

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
      /* A-R2 perf — node status flipped; the cached plan warning
         is now stale. Invalidate so the next evaluatePlanWarning
         recomputes the blank/fuzzy ratio. */
      try{
        if(window.tutorSocratic&&window.tutorSocratic._invalidatePlanWarningCache){
          window.tutorSocratic._invalidatePlanWarningCache();
        }
      }catch(_){}
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
    /* v3.0 design — §10.4 plan warning. Evaluate after every
       user turn; render if a warning is due. The evaluator
       itself throttles so the user is not nagged. */
    if(typeof tutorSocratic==="object"&&tutorSocratic
       &&typeof tutorSocratic.evaluatePlanWarning==="function"
       &&typeof tutorSocratic.renderPlanWarning==="function"){
      try{
        var _warn=tutorSocratic.evaluatePlanWarning();
        if(_warn)tutorSocratic.renderPlanWarning(_warn);
      }catch(_){}
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
      try{onClick(ev)}catch(e){console.warn("[msg-toolbar] "+action+" failed:",e&&e.message)}
    });
    bar.appendChild(b);
    return b;
  }
  /* Copy — works for both roles. Uses navigator.clipboard with a
     legacy fallback to a hidden textarea + execCommand. */
  function doCopy(){
    var txt=entry.rawText||entry.html||"";
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){
        showToast("Copied to clipboard");
      },function(){
        legacyCopy(txt);
      });
    }else{
      legacyCopy(txt);
    }
    if(!readOnly)fireFeedback(messageId,"copy",null);
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
      console.debug("[msg-feedback] not sent:",e&&e.message);
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
      console.warn("[msg-edit] PATCH failed; staying in offline mode:",e&&e.message);
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
      }catch(e){console.warn("[msg-edit] replay failed:",e&&e.message)}
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
    console.debug("[msg-delete] not synced:",e&&e.message);
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
    try{window.askChatTurn(userText)}catch(e){console.warn("[regen] failed:",e&&e.message)}
  }
}
function restoreMessageBody(entry,body){
  if(entry.rawText){
    /* Re-render so the latest renderer (KaTeX, weak-model fixes,
       scaffold widgets) applies to every message — not the frozen
       html from when it was first saved. */
    var raw = entry.rawText;
    if(entry.role === "assistant" && /<(quiz|example|practice|definition|step|flashcard)\b/i.test(raw)){
      try { body.innerHTML = renderAssistantHTML(raw); return; } catch(_) {}
    }
    body.innerHTML = formatMsg(raw);
  }else if(entry.html){
    body.innerHTML = entry.html;
  }else{
    body.innerHTML = "";
  }
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

function addMessage(role,text,type,actions){
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
  var entry={clientId:clientId,role:role,rawText:String(text||""),html:html,type:type||null,actions:actions||null,modelInfo:modelInfo};
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


/* ============================================================
   AGENT — runs /api/agent/run and renders the SSE stream as a
   normal chat-thread with tool-step module cards appended to the
   assistant's last bubble. Same `msgList`, same `addMessage`,
   same input bar as Chat mode — the agent is just another
   source of "assistant" content.

   The differences from Chat mode:
     - input placeholder + hint change
     - a slim "Agent mode" banner sits between header and msgList
     - a Stop button lives in the input footer
   ============================================================ */

var AGENT_TOOL_META={
  Read:    {letter:"R", cls:"read",    label:"Read"},
  Write:   {letter:"W", cls:"write",   label:"Write"},
  Edit:    {letter:"E", cls:"edit",    label:"Edit"},
  Glob:    {letter:"G", cls:"glob",    label:"Find"},
  Grep:    {letter:"F", cls:"grep",    label:"Search"},
  Bash:    {letter:"$", cls:"bash",    label:"Bash"},
  WebFetch:{letter:"↗", cls:"webfetch",label:"Fetch"}
};

var AGENT_RUNS=[];
var AGENT_HISTORY_KEY="socrates-agent-runs";
var _agentAbortCtl=null;
var _agentModeActive=false;
var _agentCurrentRun=null;
var _agentStopMode=false;
var _chatStopMode=false;
var _chatStreaming=false;

try{
  var stored=JSON.parse(localStorage.getItem(AGENT_HISTORY_KEY)||"[]");
  if(Array.isArray(stored))AGENT_RUNS=stored;
}catch(_){}

function saveAgentHistory(){
  try{localStorage.setItem(AGENT_HISTORY_KEY,JSON.stringify(AGENT_RUNS.slice(0,30)))}catch(_){}
}

function agentFormatInput(name,inp){
  if(!inp||typeof inp!=="object")return"";
  if(name==="Read")    return inp.path+(inp.limit?("  lines "+(inp.offset||0)+"–"+(inp.offset+inp.limit)):"");
  if(name==="Write")   return inp.path+"  ("+((inp.content||"").length)+" bytes)";
  if(name==="Edit")    return inp.path+(inp.allOccurrences?"  (all occurrences)":"");
  if(name==="Glob")    return inp.pattern;
  if(name==="Grep")    return (inp.path||"workspace")+"  /  "+inp.pattern;
  if(name==="Bash")    return inp.command;
  if(name==="WebFetch")return inp.url;
  return JSON.stringify(inp).slice(0,200);
}

/* Pretty-format agent stream text (very small subset of markdown). */
function agentMd(s){
  var escaped=String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  var parts=escaped.split(/```([a-zA-Z0-9_+\-#]*)\n([\s\S]*?)```/g);
  var html="";
  for(var i=0;i<parts.length;i++){
    if(i%3===0){
      html+=parts[i]
        .replace(/`([^`]+)`/g,function(_,c){return"<code>"+c+"</code>"})
        .replace(/\*\*([^*]+)\*\*/g,function(_,c){return"<strong>"+c+"</strong>"})
        .replace(/\n\n+/g,"</p><p>")
        .replace(/\n/g,"<br>");
      if(parts[i].trim())html="<p>"+html+"</p>";
    }else if(i%3===2){
      html+="<pre><code>"+parts[i].trim()+"</code></pre>";
    }
  }
  return html;
}

/* Append a "tool module" to the last assistant message in msgList.
   Layout: [icon][name: input]  ▼  (collapsible output).   */
function appendToolModule(toolName,toolInput){
  var list=document.getElementById("msgList");
  if(!list)return null;
  /* Reuse the last assistant bubble if the most recent activity was
     a streaming assistant message; otherwise create a fresh one. */
  var last=list.lastElementChild;
  var body=null;
  if(last&&last.classList.contains("assistant")){
    body=last.querySelector(".msg-body");
  }
  if(!body){
    /* create a new assistant msg as the "host" */
    var div=document.createElement("div");
    div.className="msg assistant";
    body=document.createElement("div");
    body.className="msg-body";
    div.appendChild(body);
    list.appendChild(div);
  }
  var meta=AGENT_TOOL_META[toolName]||{letter:"?",cls:"",label:toolName};

  /* Card. */
  var card=document.createElement("div");
  card.className="agent-tool-card "+meta.cls;
  card.innerHTML=
    '<div class="agent-tool-head">'+
      '<span class="agent-tool-icon"></span>'+
      '<span class="agent-tool-name"></span>'+
      '<span class="agent-tool-input"></span>'+
      '<span class="agent-tool-chev">▾</span>'+
    '</div>'+
    '<div class="agent-tool-out"></div>';
  card.querySelector(".agent-tool-icon").textContent=meta.letter;
  card.querySelector(".agent-tool-name").textContent=meta.label;
  card.querySelector(".agent-tool-input").textContent=agentFormatInput(toolName,toolInput);
  var head=card.querySelector(".agent-tool-head");
  head.addEventListener("click",function(){card.classList.toggle("open")});
  body.appendChild(card);
  scrollMainToBottom();
  return card.querySelector(".agent-tool-out");
}

/* Update the most recently appended tool card's output. */
function setLastToolOutput(text,isError){
  var list=document.getElementById("msgList");
  if(!list)return;
  var last=list.querySelector(".msg.assistant .agent-tool-card:last-child .agent-tool-out");
  if(!last)return;
  last.textContent=text||"";
  if(isError)last.classList.add("error");else last.classList.remove("error");
  /* If the text is long, open the card by default so the user sees it. */
  if(text&&text.length>200){
    var card=last.parentElement;
    if(card)card.classList.add("open");
  }
}

/* Phrases the model tends to echo verbatim from the system prompt's
   "thinking off" / "thinking on" suffixes. If a streamed thinking
   buffer contains any of these it has almost certainly drifted into
   self-restraint meta-text, which is not useful to the user and is
   the bug we are trying to prevent. Matched case-insensitively
   against short phrases (3+ words) so a single passing word like
   "reply" never trips the filter. */
function looksLikeMetaInstruction(s){
  if(!s)return false;
  var t=s.toLowerCase();
  var phrases=[
    /* the OLD "thinking off" suffix (kept so historical build outputs
       still get filtered) */
    "do not output", "reply directly with", "in clean prose",
    "do not narrate your thought process", "narrate your thought process",
    "chain-of-thought", "internal reasoning",
    /* the NEW "thinking off" suffix (must also be filtered — even
       though we just rewrote it, the model may still echo it) */
    "step-by-step scratch work", "exposing step-by-step",
    "keep your reply focused on the final answer",
    /* the "thinking on" suffix (less common but possible) */
    "rendered as a collapsible section",
  ];
  for(var i=0;i<phrases.length;i++){
    if(t.indexOf(phrases[i])>=0)return true;
  }
  return false;
}

/* Append a small "thinking" pill. The body is rendered through
   formatMsg (marked + KaTeX + highlight.js) so reasoning that
   contains code, math, lists, or links is typeset properly — not
   dumped as raw text. Throttled with rAF so a 1000-token burst
   doesn't fire 1000 innerHTML assignments.

   Returns a controller { append(delta), finalize(), remove() } so the
   caller (submitAgentTask) can:
     - append()  more deltas
     - finalize() when the agent signals 'text' (re-render once with cursor)
     - remove()   if thinking should be hidden (e.g. user toggled off mid-run) */
function appendThinking(text){
  var list=document.getElementById("msgList");
  if(!list)return null;
  var last=list.lastElementChild;
  var body=null;
  if(last&&last.classList.contains("assistant"))body=last.querySelector(".msg-body");
  if(!body){
    var div=document.createElement("div");
    div.className="msg assistant";
    body=document.createElement("div");
    body.className="msg-body";
    div.appendChild(body);
    list.appendChild(div);
  }
  /* Dedupe consecutive thinking: append to existing pill if the
     last thing inside the body is also a thinking pill. */
  var existing=body.lastElementChild;
  var pill,buffer,pending;
  if(existing&&existing.classList&&existing.classList.contains("agent-thinking")){
    pill=existing;
    /* The text content of the pill is also our render cache. When the
       first append happened, we stored the raw buffer as a
       data- attribute. Read it back, append, schedule a re-render. */
    buffer=pill.dataset.thinkingBuffer||pill.textContent||"";
  }else{
    pill=document.createElement("div");
    /* Collapsed by default — small preview with ellipsis, click to
       expand and read the full reasoning. The .expanded class is
       only added by the click handler once the buffer is long
       enough that the preview is genuinely a preview. */
    pill.className="agent-thinking";
    pill.addEventListener("click",function(){
      if(!buffer||buffer.length<200)return;  /* tiny thoughts: don't bother */
      pill.classList.toggle("expanded");
    });
    buffer="";
    pending=null;
    body.appendChild(pill);
  }
  function doRender(){
    pending=null;
    if(!pill.isConnected)return;
    /* Empty buffer — show a pulsing "Thinking…" placeholder so the
       pill doesn't look like an empty box. The actual content
       replaces this on the next render. */
    if(!buffer){
      pill.innerHTML='<span class="thinking-ring thinking-ring-sm"></span> Thinking…';
      pill.dataset.thinkingBuffer=buffer;
      scrollMainToBottom();
      return;
    }
    try{
      pill.innerHTML=formatMsg(buffer);
      /* Highlight any closed code blocks (the formatMsg helper doesn't
         auto-highlight because it doesn't know where it'll be mounted). */
      if(typeof hljs!=="undefined"){
        pill.querySelectorAll("pre code").forEach(function(c){
          if(c.dataset&&c.dataset.hljsDone)return;
          if(/```\s*$/.test(c.textContent||""))return;
          try{hljs.highlightElement(c);c.dataset.hljsDone="1"}catch(_){}
        });
      }
    }catch(e){
      pill.innerHTML='<pre style="white-space:pre-wrap;margin:0">'+esc(buffer)+'</pre>';
    }
    pill.dataset.thinkingBuffer=buffer;
    scrollMainToBottom();
  }
  function schedule(){
    if(pending)return;
    pending=requestAnimationFrame(doRender);
  }
  /* First render so the user sees content immediately. */
  buffer+=text||"";
  /* Meta-instruction filter: if a thinking delta looks like the model
     parroting its own system-prompt constraints back (e.g. "Do NOT
     output…", "Reply directly with the final answer in clean prose",
     "Do not narrate your thought process", or our own current
     "step-by-step scratch work" suffix), drop it instead of leaking
     the meta-text into the UI. Self-restraint is a well-known LLM
     pattern; the suffix above is the first line of defense, this is
     the second. The check fires on each delta so a long valid
     thinking trace that happens to mention the word "preamble" won't
     be wiped just because that word appears in the buffer. */
  if(looksLikeMetaInstruction(buffer)){
    /* Hide the pill entirely — there is no longer useful content to
       show. The caller can still call finalize()/remove() as normal. */
    if(pill.parentNode)pill.parentNode.removeChild(pill);
    buffer="";
  }
  schedule();
  return {
    append:function(delta){
      if(!pill.isConnected)return;
      buffer+=delta||"";
      if(looksLikeMetaInstruction(buffer)){
        if(pill.parentNode)pill.parentNode.removeChild(pill);
        buffer="";
        schedule();
        return;
      }
      schedule();
    },
    finalize:function(){
      if(pending){cancelAnimationFrame(pending);pending=null}
      doRender();
    },
    remove:function(){
      if(pending){cancelAnimationFrame(pending);pending=null}
      if(pill&&pill.parentNode)pill.parentNode.removeChild(pill);
    }
  };
}

/* ──────────────────────────────────────────────────────────────────────
   Phase 3 — Search Progress Log
   ──────────────────────────────────────────────────────────────────────
   A streaming, collapsible activity log that surfaces each step of
   `fetchWebContext` (and any future re-search round) as it happens.
   Appears in the AI bubble that will answer the user, or inside the
   diagnostic loading card. Modeled on the `appendThinking` controller
   pattern: returns { appendStep, onStep, finalize, remove } so the
   caller can drive it from the existing fetchWebContext onStep
   callback with no extra plumbing. */

var SEARCH_PROGRESS_LABELS = {
  en: {
    started:    'Searching the web for "{topic}"',
    expanding:  'Tried {n} query variants',
    querying:   'Q: {query}',
    got_results:'  · {n} results',
    retry:      '↻ First round was thin. Retrying with the original query…',
    fetching:   'Reading {n} pages…',
    fetched:    '✓ Read {ok}/{total} pages',
    scored:     '  · top match {topRel}% relevance',
    filtered:   '  · kept {kept}, dropped {dropped}',
    good:       '✓ Quality OK ({score}/5)',
    retry_low:  '↻ First round was thin. AI rewriting the query…',
    retry_rewrote:'↻ New query: {q}',
    retry_still_bad:'↻ Still thin. Proceeding with what we have.',
    done:       '{n} sources · {engines} · {fetched} read',
    error:      'Search failed: {msg}',
    warn:       '⚠ {msg}',
    cancelled:  'Search cancelled.',
    ceiling:    'Search exceeded {sec}s — proceeding without web context.',
  },
  zh: {
    started:    '正在搜索：“{topic}”',
    expanding:  '尝试了 {n} 个查询变体',
    querying:   '{query}',
    got_results:'  · {n} 条结果',
    retry:      '↻ 第一轮结果偏少，正在用原查询重试…',
    fetching:   '正在阅读 {n} 个页面…',
    fetched:    '✓ 已读 {ok}/{total} 个页面',
    scored:     '  · 最佳匹配相关度 {topRel}%',
    filtered:   '  · 保留 {kept}，剔除 {dropped}',
    good:       '✓ 质量良好（{score}/5）',
    retry_low:  '↻ 第一轮结果偏少，AI 正在改写查询…',
    retry_rewrote:'↻ 新查询：{q}',
    retry_still_bad:'↻ 仍不理想，继续。',
    done:       '{n} 条来源 · {engines} · 已读 {fetched}',
    error:      '搜索失败：{msg}',
    warn:       '⚠ {msg}',
    cancelled:  '搜索已取消。',
    ceiling:    '搜索超过 {sec} 秒，将在没有网络上下文的情况下继续。',
  },
};

/* Tiny tr(key, vars) for the search-progress labels. Picks language
   from state.locale; falls back to en for any missing key. */
function trSearchLabel(key, vars) {
  var lang = (state && state.locale === 'zh') ? 'zh' : 'en';
  var labels = SEARCH_PROGRESS_LABELS[lang] || SEARCH_PROGRESS_LABELS.en;
  var tpl = labels[key] || (SEARCH_PROGRESS_LABELS.en[key] || key);
  if (!vars) return tpl;
  return tpl.replace(/\{(\w+)\}/g, function (m, name) {
    return (vars[name] != null) ? String(vars[name]) : m;
  });
}

/* Build a short, comma-separated engine breakdown like
 * "arXiv ×3, Wikipedia ×1, Bing ×2" from {engine: count} map. */
function _formatEngineBreakdown(engines) {
  if (!engines || typeof engines !== 'object') return '';
  var keys = Object.keys(engines);
  if (!keys.length) return '';
  /* Sort: by count desc, then alphabetically. */
  keys.sort(function (a, b) { return (engines[b] - engines[a]) || (a < b ? -1 : 1); });
  return keys.map(function (k) {
    /* Map raw source tags to friendlier labels. */
    var labelMap = { bing: 'Bing', google: 'Google', baidu: 'Baidu',
                     wikipedia: 'Wikipedia', arxiv: 'arXiv', ddg: 'DDG',
                     web: 'Web' };
    var label = labelMap[k] || k;
    return label + ' ×' + engines[k];
  }).join(', ');
}

/* startSearchProgress(topic, opts) — create a streaming activity log
 * inside `opts.mount` (or fall back to the most recent AI bubble body,
 * or the diagnostic loading card). Returns a controller:
 *   ctl.onStep(event)   — feed it a fetchWebContext event
 *   ctl.appendStep(ev)  — push a synthetic step (used by webSearchWithRetry
 *                         for retry / judge messages)
 *   ctl.finalize(summary) — collapse to the final summary line
 *   ctl.remove()        — detach entirely (used on cancel / error)
 *
 * Steps are coalesced via rAF so a burst of events from fetchWebContext
 * doesn't fire 20 innerHTML assignments. */
function startSearchProgress(topic, opts) {
  opts = opts || {};
  /* Decide where to mount. Caller can pass opts.mount (a real Element).
   * Otherwise, fall back to the most recent assistant bubble body. If
   * neither exists (e.g. diagnostic flow), look for the diagnostic
   * loading card. If even that is missing, create a floating panel
   * pinned to the bottom of the chat. */
  var mount = opts.mount;
  if (!mount) {
    var lastAssistant = document.querySelector('.msg.assistant:last-child .msg-body');
    if (lastAssistant) mount = lastAssistant;
  }
  if (!mount) {
    var diag = document.querySelector('#diagnosticView .diag-loading-text, #diagnosticView .diag-loading');
    if (diag) mount = diag;
  }
  /* Create the root element. We always create a fresh `<div>` and
   * prepend it to mount — that way the search log appears at the top
   * of the bubble body, just above the streaming answer text. */
  var root = document.createElement('div');
  root.className = 'search-progress running';
  if (opts.collapsed === false) root.classList.add('open');

  var head = document.createElement('div');
  head.className = 'search-progress-head';
  head.innerHTML =
    '<span class="search-progress-pulse"></span>' +
    '<span class="search-progress-title">' + esc(trSearchLabel('started', { topic: topic || '' })) + '</span>' +
    '<span class="search-progress-chev">▾</span>';
  root.appendChild(head);

  var stepsList = document.createElement('ul');
  stepsList.className = 'search-progress-steps';
  root.appendChild(stepsList);

  if (mount) {
    /* Insert at the very top of mount so the log precedes any stream. */
    if (mount.firstChild) mount.insertBefore(root, mount.firstChild);
    else mount.appendChild(root);
  } else {
    /* Last-resort: floating panel pinned to chat bottom. */
    root.classList.add('search-progress-floating');
    var msgList = document.getElementById('msgList');
    if (msgList && msgList.parentNode) {
      msgList.parentNode.insertBefore(root, msgList.nextSibling);
    } else {
      document.body.appendChild(root);
    }
  }

  /* Click-to-expand: clicking the header toggles `.open` (CSS controls
   * visibility of .search-progress-steps). */
  head.addEventListener('click', function () { root.classList.toggle('open'); });

  /* Append a step. kind: 'running' | 'ok' | 'warn' | 'err'. */
  function makeStepEl(text, kind) {
    var li = document.createElement('li');
    li.className = 'search-progress-step ' + (kind || 'running');
    var icon = document.createElement('span');
    icon.className = 'icon';
    icon.textContent = kind === 'ok' ? '✓' : kind === 'warn' ? '⚠' : kind === 'err' ? '✕' : '·';
    var t = document.createElement('span');
    t.className = 'text';
    t.textContent = text;
    li.appendChild(icon);
    li.appendChild(t);
    stepsList.appendChild(li);
    return li;
  }

  var pendingSteps = [];
  var rafScheduled = false;
  function scheduleFlush() {
    if (rafScheduled) return;
    rafScheduled = true;
    requestAnimationFrame(function () {
      rafScheduled = false;
      var pending = pendingSteps;
      pendingSteps = [];
      for (var i = 0; i < pending.length; i++) {
        var p = pending[i];
        var li = makeStepEl(p.text, p.kind);
        if (p.autoscroll) scrollMainToBottom();
      }
    });
  }

  /* Translate a fetchWebContext step event into a user-visible line. */
  function renderEvent(ev) {
    var d = ev.data || {};
    switch (ev.kind) {
      case 'started':
        return null; /* Already shown in the header — no extra line. */
      case 'expanding':
        return { text: trSearchLabel('expanding', { n: d.count || 0 }), kind: 'running' };
      case 'querying':
        return { text: trSearchLabel('querying', { query: d.query || '' }), kind: 'running' };
      case 'got_results':
        return { text: trSearchLabel('got_results', { n: d.count || 0 }), kind: d.count > 0 ? 'ok' : 'warn' };
      case 'retry':
        return { text: trSearchLabel('retry'), kind: 'warn' };
      case 'fetching':
        return { text: trSearchLabel('fetching', { n: d.count || 0 }), kind: 'running' };
      case 'fetched':
        if (d.error) return { text: trSearchLabel('warn', { msg: d.error }), kind: 'warn' };
        return { text: trSearchLabel('fetched', { ok: d.okCount || 0, total: d.total || 0 }), kind: d.okCount > 0 ? 'ok' : 'warn' };
      case 'scored':
        return { text: trSearchLabel('scored', { topRel: d.topRel || 0 }), kind: 'running' };
      case 'filtered':
        return { text: trSearchLabel('filtered', { kept: d.keptCount || 0, dropped: d.droppedCount || 0 }), kind: 'running' };
      case 'done':
        return null; /* Final summary is rendered into the header by finalize(). */
      case 'error':
        return { text: trSearchLabel('error', { msg: d.message || 'failed' }), kind: 'err' };
      default:
        return null;
    }
  }

  function appendSynthetic(text, kind) {
    pendingSteps.push({ text: text, kind: kind || 'running', autoscroll: true });
    scheduleFlush();
  }

  function onStep(ev) {
    var step = renderEvent(ev);
    if (step) appendSynthetic(step.text, step.kind);
  }

  function finalize(summary) {
    summary = summary || {};
    var state = summary.state || 'ok';
    root.classList.remove('running');
    root.classList.add(state);
    var titleEl = head.querySelector('.search-progress-title');
    var chev = head.querySelector('.search-progress-chev');
    /* In the diagnostic flow, leave the steps list expanded so the user
     * can see the full history before they're taken to the next step. */
    if (opts.collapsed === false) {
      /* Keep .open. */
    } else {
      /* Default: collapse the steps after finalize. */
      root.classList.remove('open');
    }
    if (chev) chev.style.display = '';
    if (state === 'err') {
      if (titleEl) titleEl.textContent = trSearchLabel('error', { msg: summary.message || 'failed' });
    } else if (state === 'warn') {
      if (titleEl) titleEl.textContent = trSearchLabel('warn', { msg: summary.message || '' });
    } else {
      var engineStr = _formatEngineBreakdown(summary.engines);
      if (titleEl) {
        titleEl.textContent = trSearchLabel('done', {
          n: summary.finalCount || 0,
          engines: engineStr || '—',
          fetched: summary.fetchedCount || 0,
        });
      }
    }
  }

  function remove() {
    if (root && root.parentNode) root.parentNode.removeChild(root);
  }

  return {
    onStep: onStep,
    appendStep: appendSynthetic,
    finalize: finalize,
    remove: remove,
  };
}


/* Stream agent text into a single assistant bubble. Returns the
   controller { append(delta), finalize() }. Same rAF-coalesced
   pattern as addStreamingMessage — so we get the full chat
   markdown renderer (formatMsg → marked + KaTeX) for headings,
   code blocks, inline code, lists, links, and math. */
function beginAgentTextStream(){
  var list=document.getElementById("msgList");
  if(!list)return null;
  var div=document.createElement("div");
  div.className="msg assistant";
  var body=document.createElement("div");
  body.className="msg-body";
  div.appendChild(body);
  list.appendChild(div);
  var full="";
  var finished=false;
  var pending=null;
  /* First-delta watchdog: if no text chunk arrives within 30s, surface an
     error so the user isn't left looking at an empty assistant bubble. */
  var AGENT_FIRST_DELTA_TIMEOUT_MS=45000;
  var firstDelta=true;
  var firstDeltaTimer=setTimeout(function(){
    if(finished||firstDelta===false)return;
    finished=true;
    if(pending){cancelAnimationFrame(pending);pending=null}
    body.innerHTML=
      '<div class="msg-error">'+
        '<span class="msg-error-icon">!</span>'+
        '<span class="msg-error-text">Agent text timed out (no response for '+(AGENT_FIRST_DELTA_TIMEOUT_MS/1000)+'s)</span>'+
      '</div>';
  },AGENT_FIRST_DELTA_TIMEOUT_MS);
  function doRender(){
    pending=null;
    if(finished)return;
    try{
      body.innerHTML=formatMsg(full);
      if(typeof hljs!=="undefined"){
        body.querySelectorAll("pre code").forEach(function(c){
          if(c.dataset&&c.dataset.hljsDone)return;
          if(/```\s*$/.test(c.textContent||""))return;
          try{hljs.highlightElement(c);c.dataset.hljsDone="1"}catch(_){}
        });
      }
    }catch(e){
      body.innerHTML='<p>'+esc(full)+'</p>';
    }
    scrollMainToBottom();
  }
  function schedule(){
    if(pending||finished)return;
    pending=requestAnimationFrame(doRender);
  }
  return {
    append:function(delta){
      if(finished)return;
      if(firstDelta){
        firstDelta=false;
        clearTimeout(firstDeltaTimer);
      }
      full+=delta||"";
      schedule();
    },
    finalize:function(){
      if(finished)return;
      finished=true;
      clearTimeout(firstDeltaTimer);
      if(pending){cancelAnimationFrame(pending);pending=null}
      try{body.innerHTML=formatMsg(full)}catch(_){body.innerHTML='<p>'+esc(full)+'</p>'}
      scrollMainToBottom();
    }
  };
}

/* End a run with a small status footer chip ("Done · 4 steps · 12.4s"). */
function appendRunFooter(steps,usedTools,durationMs,status){
  var list=document.getElementById("msgList");
  if(!list)return;
  var last=list.lastElementChild;
  if(!last||!last.classList.contains("assistant"))return;
  var body=last.querySelector(".msg-body");
  if(!body)return;
  var chip=document.createElement("div");
  chip.className="agent-run-footer "+(status||"done");
  var s=durationMs>0?(durationMs/1000).toFixed(1)+"s":steps+" steps";
  var tools=(usedTools&&usedTools.length)?" · "+usedTools.join(", "):"";
  chip.textContent=(status==="error"?"Error":(status==="stopped"?"Stopped":"Done"))+" · "+steps+" steps · "+s+tools;
  body.appendChild(chip);
  scrollMainToBottom();
}

function scrollMainToBottom(){
  if(state._userScrolledAway)return;
  var sc=scrollContainer();
  if(!sc)return;
  var slack=64;
  var atBottom=sc.scrollHeight-sc.scrollTop-sc.clientHeight<=slack;
  if(atBottom)sc.scrollTop=sc.scrollHeight;
}

/* Open the agent view: re-use Chat's chat-view, just flip the
   input placeholder + show the mode banner. */
function openAgentView(){
  _agentModeActive=true;
  document.getElementById("topicSetup").classList.add("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.remove("hidden");
  toggleChatTopBarEls(true);
  var banner=document.getElementById("agentModeBanner");
  if(banner)banner.classList.remove("hidden");
  /* Update the top-bar session chip to indicate the workspace. */
  var badge=document.getElementById("topicBadge");
  var badgeText=document.getElementById("topicBadgeText");
  if(badge&&badgeText){
    badge.classList.remove("hidden");
    var uid=(CURRENT_USER&&CURRENT_USER.id)||"…";
    badgeText.textContent="Agent · /tmp/agent-workspace/"+uid+"/";
  }
  /* Input placeholder + hint. */
  var ta=document.getElementById("chatInputArea");
  if(ta)ta.placeholder="Describe a task for the agent (e.g. find all TODO comments in /home/ubuntu/Socrates/)…";
  var hint=document.getElementById("chatInputHint");
  if(hint)hint.textContent="Enter to send · Shift+Enter for newline";
  /* Reset send button to its default send-arrow look. */
  setAgentStopState(false);
  setTimeout(function(){
    var t=document.getElementById("chatInputArea");
    if(t)t.focus();
  },50);
  renderAgentHistory();
  scrollMainToBottom();
}

/* Flip the existing send button into a red Stop button (or back).
   We morph the same DOM element rather than create a new one, so
   the layout doesn't shift and the focus state is preserved. */
function setAgentStopState(stopMode){
  var btn=document.getElementById("sendBtn");
  if(!btn)return;
  _agentStopMode=!!stopMode;
  if(stopMode){
    btn.classList.add("agent-stop");
    btn.title="Stop the current agent run";
    btn.setAttribute("aria-label","Stop");
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  }else{
    btn.classList.remove("agent-stop");
    btn.disabled=false;
    btn.title="Send";
    btn.setAttribute("aria-label","Send");
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  }
}
/* Chat-mode Stop state. The same send button is morphed into a red
   Stop while a chat / tutor follow-up stream is in flight (NOT agent
   mode — that uses setAgentStopState). The two are mutually
   exclusive: agent mode's submitChatMessage wrapper checks
   _chatStreaming first and routes accordingly. */
function setChatStopState(stopMode){
  var btn=document.getElementById("sendBtn");
  if(!btn)return;
  _chatStopMode=!!stopMode;
  /* Also update the chat-input hint so chat-mode users have a second,
   * always-visible signal that work is in flight — the in-bubble
   * thinking-dot scrolls away as the answer arrives, but the input
   * bar stays pinned to the bottom of the viewport. */
  var hint=document.getElementById("chatInputHint");
  if(hint){
    if(stopMode){
      hint.innerHTML='<span class="thinking-ring thinking-ring-xs"></span> Streaming…  click <svg viewBox="0 0 24 24" fill="currentColor" width="9" height="9" style="vertical-align:-1px"><rect x="5" y="5" width="14" height="14" rx="2"/></svg> to stop';
    }else if(!_agentModeActive){
      hint.textContent="Shift+Enter for new line";
    }
  }
  if(stopMode){
    btn.classList.add("chat-stop");
    btn.title="Stop the current response";
    btn.setAttribute("aria-label","Stop");
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>';
  }else{
    btn.classList.remove("chat-stop");
    btn.disabled=false;
    btn.title="Send";
    btn.setAttribute("aria-label","Send");
    btn.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
  }
}
function stopChatRun(){
  if(window._activeChatCtl){try{_activeChatCtl.abort()}catch(_){}}
  if(window._activeChatAbort){try{_activeChatAbort("user-stop")}catch(_){}}
}

function exitAgentMode(){
  _agentModeActive=false;
  var banner=document.getElementById("agentModeBanner");
  if(banner)banner.classList.add("hidden");
  var ta=document.getElementById("chatInputArea");
  if(ta)ta.placeholder="Type your thinking…";
  var hint=document.getElementById("chatInputHint");
  if(hint)hint.textContent="Shift+Enter for new line";
  setAgentStopState(false);
}

/* Re-render the sidebar Agent panel's run history. */
function renderAgentHistory(){
  var cont=document.getElementById("agentHistoryList");
  if(!cont)return;
  if(!AGENT_RUNS.length){
    cont.innerHTML='<div class="recents-empty">No agent runs yet.</div>';
    return;
  }
  var html="";
  AGENT_RUNS.slice(0,12).forEach(function(r){
    var color=r.status==="done"?"hsl(145 50% 55%)":(r.status==="error"?"hsl(0 60% 55%)":"hsl(200 50% 55%)");
    html+='<div class="agent-history-row" data-run-id="'+r.id+'">'+
      '<span class="dot" style="background:'+color+'"></span>'+
      '<span class="label"></span>'+
      '<span class="ts"></span>'+
      '<button class="recent-item-del" onclick="event.stopPropagation();deleteAgentRun(\''+r.id+'\')" title="Delete run" aria-label="Delete run">'+
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>'+
      '</button>'+
    '</div>';
  });
  cont.innerHTML=html;
  cont.querySelectorAll(".agent-history-row").forEach(function(row){
    var r=AGENT_RUNS.find(function(x){return x.id===row.dataset.runId});
    if(!r)return;
    row.querySelector(".label").textContent=r.task;
    row.querySelector(".ts").textContent=formatRelativeTime(r.startedAt);
    row.addEventListener("click",function(){reopenAgentRun(r.id)});
  });
}

function deleteAgentRun(id){
  AGENT_RUNS=AGENT_RUNS.filter(function(r){return r.id!==id});
  saveAgentHistory();
  renderAgentHistory();
}

function reopenAgentRun(id){
  var run=AGENT_RUNS.find(function(r){return r.id===id});
  if(!run)return;
  /* If we're in agent mode, the run is already in msgList. Just
     scroll to its last text bubble. If not, switch to agent mode
     first. */
  if(!_agentModeActive)openAgentView();
  setTimeout(function(){
    var list=document.getElementById("msgList");
    if(!list||!list.firstChild)return;
    list.firstChild.scrollIntoView({behavior:"smooth",block:"start"});
  },80);
}

function stopAgentRun(){
  if(_agentAbortCtl){try{_agentAbortCtl.abort()}catch(_){}}
  /* Also stop the watchdog so its timers don't keep firing after
     the user has aborted. */
  try{if(typeof window._agentStopHook==="function"){window._agentStopHook()}}catch(_){}
}

/* Hook into submitChatMessage: if agent mode is active, redirect
   to the agent path. We do this by swapping the send button's
   onclick handler at runtime. */
function _agentSend(){
  submitAgentTask();
}

/* The `submitChatMessage` function is what the Send button calls.
   When agent mode is active, intercept. */
var _origSubmitChatMessage=window.submitChatMessage;
window.submitChatMessage=function(textOverride,opts){
  /* Read the live input value so we can distinguish "user wants to
   * stop the current stream" (input is empty) from "user wants to
   * send a new message while a stream is still in flight" (input
   * has text). The previous logic treated every click during a
   * stream as a stop request, which meant a typed-but-not-yet-sent
   * message would never reach the model — the wrapper just aborted
   * the greeting stream and returned without forwarding the new
   * text. P0.0 — fix this so the user can interrupt and send. */
  var liveInput=(textOverride==null)
    ?document.getElementById("chatInputArea")
    :null;
  var liveValue=liveInput?liveInput.value.trim():"";
  var hasPendingText=!!liveValue;
  /* Agent mode + send button morphed into Stop → abort the run. */
  if(_agentModeActive&&_agentStopMode){
    stopAgentRun();
    return;
  }
  if(_agentModeActive&&!_agentAbortCtl){
    submitAgentTask(textOverride);
    return;
  }
  /* Chat mode + stream in flight + no pending text → stop. */
  if(!_agentModeActive&&_chatStopMode&&_chatStreaming&&!hasPendingText){
    stopChatRun();
    return;
  }
  /* Chat mode + stream in flight + typed text → cancel the stream
   * and forward the new text. askChatTurn / submitChatMessage will
   * see the active controller on the next turn and replace it via
   * the existing _activeChatAbort handle. We do this synchronously
   * here so the user never sees a "frozen" UI for the 200ms between
   * the click and the abort callback. */
  if(!_agentModeActive&&_chatStreaming&&hasPendingText){
    try{
      if(window._activeChatAbort){window._activeChatAbort("superseded-by-new-message")}
    }catch(_){}
  }
  if(_origSubmitChatMessage){_origSubmitChatMessage(textOverride,opts)}
};

/* Real agent run. */
async function submitAgentTask(textOverride){
  if(_agentAbortCtl)return;
  var ta=document.getElementById("chatInputArea");
  var task=(textOverride!=null?textOverride:(ta&&ta.value||"")).trim();
  if(!task)return;
  if(ta&&textOverride==null){ta.value="";autoResize(ta)}

  var run={
    id:"r-"+Math.random().toString(36).slice(2,10),
    task:task.slice(0,200),
    startedAt:Date.now(),
    status:"running",
    steps:0,
    usedTools:[],
    deliverables:[]
  };
  AGENT_RUNS.unshift(run);
  saveAgentHistory();

  /* Render into the chat thread. */
  addMessage("user",esc(task));
  /* Create the "host" assistant bubble. Its body will accumulate
     tool cards + thinking pills + final text. */
  var host=document.createElement("div");
  host.className="msg assistant";
  var body=document.createElement("div");
  body.className="msg-body";
  host.appendChild(body);
  document.getElementById("msgList").appendChild(host);

  _agentAbortCtl=new AbortController();
  /* Morph the send button into a red Stop button. */
  setAgentStopState(true);

  var ac=_agentAbortCtl;
  var thinkEl=null;
  /* Watchdog: total budget + heartbeat. Without these, a hung agent
     leaves the UI stuck on "Agent 思考中" forever. The watchdog's
     AbortController is merged with the user's Stop controller via
     _agentAbortCtl, so the Stop button still works. */
  var watchdog=makeAIWatchdog(AGENT_TOTAL_TIMEOUT_MS,AGENT_HEARTBEAT_MS,function(kind,ms){
    try{ac.abort(kind==="heartbeat"?"agent-heartbeat":"agent-total-timeout")}catch(_){}
  });
  /* If the user clicks Stop, also stop the watchdog so the timers
     don't fire after the user has already given up. */
  var userStop=function(){watchdog.stop("user-stop")};
  var _prevStop=window._agentStopHook;
  window._agentStopHook=userStop;
  try{
    /* Offline precheck — no point even POSTing if we know we have
       no network. Surface the error inline instead of waiting for
       the fetch to fail. */
    if(offlineGuard()){
      throw new Error("offline: you appear to be offline");
    }
    var resp=await apiFetchRaw("/api/agent/run",{
      method:"POST",
      body:{task:task,maxSteps:25},
      signal:ac.signal
    });
    watchdog.touch();
    if(!resp.ok){
      var txt=await resp.text().catch(function(){return""});
      throw new Error("HTTP "+resp.status+": "+txt.slice(0,200));
    }
    var reader=resp.body.getReader();
    var dec=new TextDecoder("utf-8");
    var buf="";
    var textStream=null;  /* created on first 'text' event */
    while(true){
      var step=await reader.read();
      if(step.done)break;
      watchdog.touch();
      buf+=dec.decode(step.value,{stream:true});
      var idx;
      while((idx=buf.indexOf("\n\n"))>=0){
        var frame=buf.slice(0,idx);
        buf=buf.slice(idx+2);
        var ev=null,data=null;
        frame.split("\n").forEach(function(line){
          if(line.indexOf("event:")===0)ev=line.slice(6).trim();
          else if(line.indexOf("data:")===0)data=line.slice(5);
        });
        if(!ev||!data)continue;
        var payload;
        try{payload=JSON.parse(data)}catch(_){continue}
        if(ev==="thinking"){
          /* Respect the "Show AI thinking" toggle: if the user turned
             it off mid-run, swallow the deltas silently — they
             shouldn't appear in the chat. The toggle can be flipped
             back on at any time, but the data for THIS run is
             already lost (we don't buffer it). */
          if(thinkingOn){
            thinkEl=appendThinking(payload.delta||"");
          }
        }else if(ev==="text"){
          if(thinkEl){thinkEl.remove();thinkEl=null}
          if(!textStream)textStream=beginAgentTextStream();
          if(textStream)textStream.append(payload.delta||"");
        }else if(ev==="tool_use"){
          if(thinkEl){thinkEl.remove();thinkEl=null}
          if(textStream){textStream.finalize();textStream=null}
          appendToolModule(payload.name,payload.input||{});
          run.steps++;
          if(payload.name==="Write"||payload.name==="Edit"){
            var p=(payload.input&&payload.input.path)||"";
            if(p)run.deliverables.push({path:p,kind:payload.name});
          }
        }else if(ev==="tool_result"){
          setLastToolOutput(payload.ok===false?("[error] "+(payload.error||payload.output||"failed")):(payload.output||"(no output)"),payload.ok===false);
        }else if(ev==="done"){
          if(textStream){textStream.finalize();textStream=null}
          run.status="done";
          run.completedAt=Date.now();
          run.usedTools=payload.usedTools||[];
          run.durationMs=payload.durationMs;
          run.stepsCount=payload.steps;
          appendRunFooter(payload.steps,payload.usedTools,payload.durationMs,"done");
        }else if(ev==="error"){
          if(textStream){textStream.finalize();textStream=null}
          run.status="error";
          run.error=payload.message||"agent error";
          appendRunFooter(run.steps,run.usedTools,0,"error");
        }else if(ev==="step"){
          /* ignore; just a heartbeat */
        }else if(ev==="start"){
          /* ignore */
        }
      }
    }
  }catch(e){
    if(thinkEl){thinkEl.remove();thinkEl=null}
    if(textStream){textStream.finalize();textStream=null}
    var isAbort=(e&&(e.name==="AbortError"||e.code===20));
    if(isAbort){
      /* Distinguish: did the USER click Stop, or did the WATCHDOG fire?
         The watchdog passes a custom reason string ("agent-total-timeout"
         / "agent-heartbeat") so we can show the right message and a Retry
         button. Without this branch, a hung agent leaves the UI stuck. */
      var isUserStop=!watchdog.isStopped();
      if(isUserStop){
        run.status="stopped";
        var lastMsg=document.getElementById("msgList").lastElementChild;
        if(lastMsg&&lastMsg.classList.contains("assistant")){
          var b=lastMsg.querySelector(".msg-body");
          if(b){
            var p=document.createElement("p");
            p.style.cssText="font-style:italic;color:hsl(var(--text-400));font-size:calc(12px * var(--app-font-scale, 1));margin-top:8px";
            p.textContent="(stopped by user)";
            b.appendChild(p);
          }
        }
        appendRunFooter(run.steps,run.usedTools,0,"stopped");
      }else{
        /* Watchdog fired: surface an inline error with Retry. This is
           the "any case" guarantee — the user ALWAYS gets feedback. */
        run.status="error";
        var wdReason=watchdog.reason()||"agent-timeout";
        run.error=wdReason;
        var lastMsg2=document.getElementById("msgList").lastElementChild;
        if(lastMsg2&&lastMsg2.classList.contains("assistant")){
          var b2=lastMsg2.querySelector(".msg-body");
          if(b2){
            var errP=document.createElement("p");
            errP.style.cssText="color:hsl(0 60% 50%);font-size:calc(12px * var(--app-font-scale, 1));margin-top:8px";
            var friendly=wdReason.indexOf("heartbeat")>=0
              ?"Agent stalled: no response from the model for "+(AGENT_HEARTBEAT_MS/1000)+"s"
              :"Agent exceeded the "+(AGENT_TOTAL_TIMEOUT_MS/1000)+"s budget";
            errP.textContent=friendly+" — click Retry to continue.";
            b2.appendChild(errP);
            var retryBtn=document.createElement("button");
            retryBtn.type="button";
            retryBtn.className="msg-retry-btn";
            retryBtn.style.marginTop="6px";
            retryBtn.textContent="Retry";
            retryBtn.addEventListener("click",function(){
              errP.remove();retryBtn.remove();
              /* Re-submit the same task into a fresh agent run. */
              submitAgentTask(task);
            });
            b2.appendChild(retryBtn);
          }
        }
        appendRunFooter(run.steps,run.usedTools,0,"error");
      }
    }else{
      run.status="error";
      run.error=e.message||String(e);
      var lastMsg3=document.getElementById("msgList").lastElementChild;
      if(lastMsg3&&lastMsg3.classList.contains("assistant")){
        var b3=lastMsg3.querySelector(".msg-body");
        if(b3){
          var p3=document.createElement("p");
          p3.style.cssText="color:hsl(0 60% 50%);font-size:calc(12px * var(--app-font-scale, 1));margin-top:8px";
          p3.textContent="Error: "+run.error;
          b3.appendChild(p3);
        }
      }
      appendRunFooter(run.steps,run.usedTools,0,"error");
    }
  }
  /* Final state. */
  if(window._agentStopHook===userStop){window._agentStopHook=_prevStop}
  _agentAbortCtl=null;
  setAgentStopState(false);
  saveAgentHistory();
  renderAgentHistory();
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
  var pendingRender=null;
  /* Thinking pill (for chat-mode reasoning_content). Lazily created on
     the first onThinking(delta) callback so we don't add a pill for
     models that don't produce reasoning. Hidden when the user has
     toggled "Show AI thinking" off. */
  var thinkCtl=null;
  function ensureThinkCtl(){
    if(thinkCtl)return thinkCtl;
    if(!thinkingOn){thinkCtl={append:function(){},finalize:function(){},remove:function(){}};return thinkCtl}
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
     the user context that work is happening). */
  var FIRST_DELTA_TIMEOUT_MS=120000;
  body.innerHTML='<span class="thinking-dot" data-mode="'+esc(appMode)+'"><span class="thinking-ring thinking-ring-sm"></span>'+(appMode==="chat"?"Thinking…":"Generating…")+'</span>';
  /* Morph the send button into a red Stop so the user can abort
     the stream. Agent mode uses its own state; we only flip chat
     here. setChatStopState(false) on finish/abort. */
  _chatStreaming=true;
  if(!_agentModeActive){try{setChatStopState(true)}catch(_){}}
  var thinkStarted=Date.now();
  /* Elapsed-second counter so the user sees progress while waiting. */
  var _elapsedTick=null;
  _elapsedTick=setInterval(function(){
    if(finished||!firstDelta)return;
    var sec=Math.round((Date.now()-thinkStarted)/1000);
    body.innerHTML='<span class="thinking-dot" data-mode="'+esc(appMode)+'"><span class="thinking-ring thinking-ring-sm"></span>'+(appMode==="chat"?"Thinking…":"Generating…")+' '+sec+'s</span>';
  },5000);
  var firstDeltaTimer=setTimeout(function(){
    if(finished||!firstDelta)return;
    if(_elapsedTick)clearInterval(_elapsedTick);
    finished=true;
    if(pendingRender){cancelAnimationFrame(pendingRender);pendingRender=null}
    state.lastCallError="No response for "+Math.round(FIRST_DELTA_TIMEOUT_MS/1000)+"s";
    body.innerHTML=
      '<div class="msg-error">'+
        '<span class="msg-error-icon">!</span>'+
        '<span class="msg-error-text">No response for '+(FIRST_DELTA_TIMEOUT_MS/1000)+'s — check API availability</span>'+
        '<button type="button" class="msg-retry-btn" id="'+retryBtnId+'">Retry</button>'+
      '</div>';
    var btn=body.querySelector("#"+retryBtnId);
    if(btn){
      btn.addEventListener("click",function(){
        body.innerHTML='<span class="thinking-dot"><span class="thinking-ring thinking-ring-sm"></span>Retrying…</span>';
        setTimeout(function(){
          if(typeof onRetry==="function"){try{onRetry()}catch(e){console.warn("[retry] handler threw:",e)}}
        },120);
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
    det.className="think-block";
    /* P0.7 — start collapsed. The user clicks the summary to
       expand. The stream-cursor is NOT inside the details so the
       pulsing "Thinking…" indicator stays visible even while the
       reasoning is hidden. */
    var sum=document.createElement("summary");
    sum.className="think-summary";
    sum.innerHTML='<span class="thinking-ring thinking-ring-sm"></span> Thinking…';
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

    thinkState.details=det;
    thinkState.summary=sum;
    thinkState.thinkDiv=td;
    thinkState.cursorNode=cur;
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
    if(finished)return;

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
        body.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        body.appendChild(streamContent);
        cursor=document.createElement("span");
        cursor.className="stream-cursor";
        cursor.textContent="▍";
        body.appendChild(cursor);
      }
      /* Skip the DOM write if the rendered HTML hasn't changed —
         the most common case once the cursor blinks and the model
         produces no new tokens. Caching by raw text length + last
         few chars is cheap and avoids a layout per frame. */
      var rendered=formatMsgProgressive(displayFull);
      if(streamContent.dataset.lastRendered!==rendered){
        streamContent.innerHTML=rendered;
        streamContent.dataset.lastRendered=rendered;
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
      }
      if(thinkState.afterNode.dataset.lastRendered!==afterText){
        thinkState.afterNode.innerHTML=afterText?formatMsgProgressive(afterText):"";
        thinkState.afterNode.dataset.lastRendered=afterText;
      }
      /* When </think> has been seen, swap the summary to a
         static label and drop the pulse — the model is done
         thinking. */
      if(thinkClosed&&thinkState.summary.innerHTML.indexOf("thinking-ring")!==-1){
        thinkState.summary.innerHTML="Thinking";
      }
      /* Re-render the think content only if it changed. The
         recursive formatMsg call is the same code path used by
         the final render at finish(), so the live and final
         look match exactly. */
      if(thinkState.lastRenderedThink!==thinkContent){
        if(thinkContent){
          try{
            thinkState.thinkDiv.innerHTML=formatMsg(thinkContent.replace(/<\/?think>/g,""));
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

    /* P1.1 — mirror rawText to state.messages so extractHistory
       and saveCurrentSession see the latest text. html is left
       null until finish() so the saved session never holds a
       half-rendered string. */
    if(msgIdx>=0&&state.messages[msgIdx]){
      state.messages[msgIdx].rawText=full;
    }
    /* Only auto-scroll if the user has NOT manually scrolled away and
       is still near the bottom — otherwise leave them alone. */
    if(!state._userScrolledAway){
      var slack=64; /* pixels from bottom considered "at bottom" */
      var sc=scrollContainer();
      var atBottom=sc.scrollHeight-sc.scrollTop-sc.clientHeight<=slack;
      if(atBottom){sc.scrollTop=sc.scrollHeight}
      else{showNewReplyPill()}  /* P1.4 — show pill when scrolled up + new delta */
    }
  }
  var streamContent=null;
  var cursor=null;
  /* P_arch typewriter — no chunked bookkeeping needed. The streaming
     surface is a single text node; new deltas are appended by
     overwriting streamContent.textContent on each rAF frame. */
  function scheduleRender(){
    if(pendingRender||finished)return;
    /* rAF coalesces multiple deltas that land in the same frame into
       a single formatMsg pass. This is critical for streaming: if 30
       small deltas arrive within 16ms we re-render only once. */
    pendingRender=requestAnimationFrame(function(){doRender()});
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

  var ret={
    append:function(delta){
      if(finished)return;
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
        if(pendingRender)cancelAnimationFrame(pendingRender);
        pendingRender=requestAnimationFrame(function(){doRender()});
      }else{
        scheduleRender();
      }
    },
    /* Append reasoning deltas (DeepSeek R1 / QwQ style
       reasoning_content). Routed to a thinking pill (rendered with
       Markdown/LaTeX) and only when the user has thinking mode on. */
    appendThinking:function(delta){
      if(finished)return;
      if(typeof delta==="string")fullReasoning+=delta;
      try{ensureThinkCtl().append(delta||"")}catch(_){}
    },
    finalizeThinking:function(){
      if(thinkCtl&&typeof thinkCtl.finalize==="function"){
        try{thinkCtl.finalize()}catch(_){}
      }
    },
    finish:function(){
      if(finished)return;
      finished=true;
      clearTimeout(firstDeltaTimer);
      if(_elapsedTick)clearInterval(_elapsedTick);
      if(pendingRender){
        cancelAnimationFrame(pendingRender);
        pendingRender=null;
      }
      /* P1.2 — single formatMsg pass at finish time, write to
         state.messages[i].html, and replace the streaming nodes
         with the final innerHTML (which includes the cursor removal).
         This is the only place marked + KaTeX run for the FINAL render; doRender above
         now also uses marked + KaTeX via formatMsgProgressive for live streaming. */
      var total=full.length;
      var firstChunkDuration=Date.now()-(thinkStarted||Date.now());
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
        body.innerHTML="";
        streamContent=document.createElement("div");
        streamContent.className="stream-content";
        cursor=document.createElement("span");
        cursor.className="stream-cursor";
        cursor.textContent="▍";
        body.appendChild(streamContent);
        /* Cursor is a child of streamContent so subsequent
           insertBefore(chunk, cursor) calls succeed (see the
           corresponding comments in the other appendChild(cursor)
           callsites for the full story). */
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
                console.warn("[typeTick] renderAssistantHTML error:",e&&e.message);
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
            console.warn("[typeTick] render error:",e&&e.message);
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
          console.warn("[finish] renderAssistantHTML error:",e&&e.message);
          finalHtml="<p>"+esc(full)+"</p>";
        }
        body.innerHTML=finalHtml;
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
        console.warn("[finish] formatMsg error:",e&&e.message);
        var fb="<p>"+esc(full)+"</p>";
        body.innerHTML=fb;
        if(msgIdx>=0&&state.messages[msgIdx]){
          state.messages[msgIdx].html=fb;
          state.messages[msgIdx].reasoningContent=fullReasoning||null;
        }
      }
      finishAfterRender();

      function finishAfterRender(){
        try{processPendingMermaid()}catch(_){}
        if(hasSources){
          var card=renderSourcesCard(sourcesSnapshot);
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
          if(state._userScrolledAway)return;
          var s=scrollContainer();
          if(!s)return;
          var slack=64;
          var atBottom=s.scrollHeight-s.scrollTop-s.clientHeight<=slack;
          if(atBottom)s.scrollTo({top:s.scrollHeight,behavior:"smooth"});
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
          if(!_agentModeActive){try{setChatStopState(false)}catch(_){}}
          /* P1.4 — clearing the global abort handle on natural finish
             keeps the closure (and DOM refs) eligible for GC. */
          window._activeChatCtl=null;
        }
      }
    },
    abort:function(){
      if(finished)return;
      finished=true;
      clearTimeout(firstDeltaTimer);
      if(_elapsedTick)clearInterval(_elapsedTick);
      if(pendingRender){
        cancelAnimationFrame(pendingRender);
        pendingRender=null;
      }
      /* Restore the send button — but only if no new stream has
       * already taken over (the new wrapper cancels the OLD
       * controller when the user sends a follow-up, and the new
       * addStreamingMessage has already raised _chatStreaming). */
      if(window._activeChatCtl===ret){
        _chatStreaming=false;
        if(!_agentModeActive){try{setChatStopState(false)}catch(_){}}
      }
      /* Clean up incomplete placeholder message from state.messages
       * to prevent saving empty/partial AI responses to the database.
       * Only remove if still in streaming state with no content. */
      if(msgIdx>=0&&state.messages[msgIdx]){
        if(state.messages[msgIdx].type==="streaming"&&!state.messages[msgIdx].rawText){
          state.messages.splice(msgIdx,1);
        }
      }
      /* Delay remove so a pending rAF render doesn't throw on detached DOM */
      requestAnimationFrame(function(){div.remove()});
    },
    /* Show an inline error state with a retry button so the user can
       recover from a transient failure (network, 429, 5xx) without
       retyping. onRetry() is invoked when the button is clicked. */
      replaceWithError:function(errMsg,onRetry){
        if(finished)return;
        finished=true;
        clearTimeout(firstDeltaTimer);
        if(_elapsedTick)clearInterval(_elapsedTick);
        if(pendingRender){cancelAnimationFrame(pendingRender);pendingRender=null}
       try{
         body.innerHTML=
           '<div class="msg-error">'+
             '<span class="msg-error-icon">!</span>'+
             '<span class="msg-error-text">'+(errMsg||'Generation failed')+'</span>'+
              '<button type="button" class="msg-retry-btn" id="'+retryBtnId+'">Retry</button>'+
            '</div>';
          var btn=body.querySelector("#"+retryBtnId);
          if(btn&&typeof onRetry==="function"){
            btn.addEventListener("click",function(){
              /* Reset this bubble to thinking state, then retry.
                 The retried call writes to a new bubble via addStreamingMessage,
                 so we clean up this failed one. */
body.innerHTML='<span class="thinking-dot"><span class="thinking-ring thinking-ring-sm"></span>Retrying…</span>';
              /* Small delay so the user can see the retry state before the
                 new bubble appears. */
             setTimeout(function(){
               try{
                 var ret=onRetry();
                 /* If onRetry returns a Promise, await it — some callers
                    (askChatTurn, submitChatMessage) are async. */
                 if(ret&&typeof ret.then==="function"){
                   ret.catch(function(e){console.warn("[retry] async handler failed:",e)});
                 }
               }catch(e){console.warn("[retry] handler threw:",e)}
             },120);
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
         if(!_agentModeActive){try{setChatStopState(false)}catch(_){}}
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
  /* All placeholder lists — collected during the scan, mounted at the end. */
  var quizPH=[];
  var examplePH=[];
  var practicePH=[];
  var definitionPH=[];
  var stepPH=[];
  var flashcardPH=[];

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

  /* formatMsg uses marked.parse, which passes raw <div> blocks through
     untouched. The slots will land in the final HTML intact. */
  var html=formatMsg(text);

  /* Defer DOM mount until the html is actually inserted. */
  if(quizPH.length||examplePH.length||practicePH.length||definitionPH.length||stepPH.length||flashcardPH.length){
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
    },0);
  }
  return html;
}

/* Parse the inner XML of a <quiz> block into {q, options:[{letter,text}], correct}. */
function parseQuizInner(inner){
  var qMatch=inner.match(/<q>([\s\S]*?)<\/q>/i);
  if(!qMatch)return null;
  var q=stripTags(decodeEntities(qMatch[1].trim()));
  var optRe=/<o\s+letter="([A-Da-d])"[^>]*>([\s\S]*?)<\/o>/gi;
  var opts=[];
  var om;
  while((om=optRe.exec(inner))!==null){
    opts.push({letter:om[1].toUpperCase(),text:stripTags(decodeEntities(om[2].trim()))});
  }
  if(opts.length<2)return null;
  var cMatch=inner.match(/<correct>([A-Da-d])<\/correct>/i);
  var correct=cMatch?cMatch[1].toUpperCase():null;
  return{q:q,options:opts,correct:correct};
}

/* Parse <example>…</example> inner into {title, problem, solution}. */
function parseExampleInner(inner){
  var t=inner.match(/<title>([\s\S]*?)<\/title>/i);
  var p=inner.match(/<problem>([\s\S]*?)<\/problem>/i);
  var s=inner.match(/<solution>([\s\S]*?)<\/solution>/i);
  if(!p&&!s)return null;
  return{
    title:t?stripTags(decodeEntities(t[1].trim())):"Example",
    problem:p?stripTags(decodeEntities(p[1].trim())):"",
    solution:s?stripTags(decodeEntities(s[1].trim())):""
  };
}

/* Parse <practice>…</practice> inner into {title, problem, hint}.
   The optional `correct="…"` attribute on the opening <practice> tag
   is captured separately by renderAssistantHTML (which has access to
   the raw attribute string) and assigned to parsed.correct. */
function parsePracticeInner(inner){
  var t=inner.match(/<title>([\s\S]*?)<\/title>/i);
  var p=inner.match(/<problem>([\s\S]*?)<\/problem>/i);
  var h=inner.match(/<hint>([\s\S]*?)<\/hint>/i);
  if(!p)return null;
  return{
    title:t?stripTags(decodeEntities(t[1].trim())):"Practice",
    problem:stripTags(decodeEntities(p[1].trim())),
    hint:h?stripTags(decodeEntities(h[1].trim())):""
  };
}

/* Parse <definition>…</definition> inner into {term, body}. Both fields
   are required — a definition without a term is meaningless. */
function parseDefinitionInner(inner){
  var tM=inner.match(/<term>([\s\S]*?)<\/term>/i);
  var bM=inner.match(/<body>([\s\S]*?)<\/body>/i);
  if(!tM&&!bM)return null;
  return{
    term:tM?stripTags(decodeEntities(tM[1].trim())):"",
    body:bM?stripTags(decodeEntities(bM[1].trim())):""
  };
}

/* Parse <flashcard>…</flashcard> inner into {front, back}. Both sides
   are required; the card just toggles visibility on click. */
function parseFlashcardInner(inner){
  var fM=inner.match(/<front>([\s\S]*?)<\/front>/i);
  var bM=inner.match(/<back>([\s\S]*?)<\/back>/i);
  if(!fM&&!bM)return null;
  return{
    front:fM?stripTags(decodeEntities(fM[1].trim())):"",
    back:bM?stripTags(decodeEntities(bM[1].trim())):""
  };
}

function mountExampleWidget(slot,parsed){
  var el=document.createElement("div");
  el.className="inline-example";
  if(parsed.title){
    var tEl=document.createElement("div");
    tEl.className="inline-example-title";
    tEl.textContent=parsed.title;
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
    tEl.textContent=parsed.term;
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

function decodeEntities(s){
  return s.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,"&");
}
function stripTags(s){return s.replace(/<[^>]+>/g,"")}

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

/* ============================================================
   MISTAKE BOOK
   Captures wrong quiz picks and wrong practice attempts. Surfaced in
   a dedicated sidebar tab with a Redo button that re-enables the
   original widget (or re-emits it inline if the widget is gone).
   ============================================================ */
/* Task 5.5 — fire-and-forget POST to /api/mistakes so the server-side
   mistakes table stays in sync with the client-side mistake book. The
   mistake is already in state.mistakes (recordMistake unshifted it), so
   a failed POST is non-fatal — we just log and move on. Uses apiFetch
   for credentials / CSRF / JSON body handling, consistent with other
   calls (e.g. /api/sessions). */
function persistMistake(mistakeData){
  var sid=state.currentSessionId;
  /* The backend zod schema requires a UUID for sessionId; during
     session creation currentSessionId can briefly hold a non-uuid
     value, so guard before sending to avoid a noisy 400. */
  if(typeof sid!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sid))sid=null;
  try{
    apiFetch("/api/mistakes",{
      method:"POST",
      body:{
        sessionId:sid,
        nodeName:mistakeData.nodeName||null,
        questionContent:mistakeData.questionContent||"",
        userAnswer:mistakeData.userAnswer!=null?String(mistakeData.userAnswer):null,
        correctAnswer:mistakeData.correctAnswer!=null?String(mistakeData.correctAnswer):null,
        source:mistakeData.source||"quiz"
      }
    }).catch(function(e){
      console.warn("[mistakes] failed to persist mistake:",e&&e.message);
    });
  }catch(e){
    console.warn("[mistakes] persistMistake threw:",e&&e.message);
  }
}

function recordMistake(rec){
  if(!state.mistakes)state.mistakes=[];
  var node=state.kbNodes[state.currentNode]||{};
  var mistake={
    id:"m-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,6),
    type:rec.type||"quiz",
    topic:state.topic||"",
    node:node.name||"",
    nodeIdx:state.currentNode,
    q:rec.q,
    options:rec.options||[],
    correct:rec.correct||null,
    userAnswer:rec.userAnswer||null,
    judgedAnswer:rec.judgedAnswer||null,
    timestamp:Date.now(),
    redoCount:0,
    quizSlotId:rec.quizSlotId||null
  };
  state.mistakes.unshift(mistake);
  /* Task 5.5 — mirror the mistake to the backend mistakes table.
     Fire-and-forget; the client-side array above remains the source
     of truth for the UI, so a failed POST doesn't break anything.
     Both recording sites (the <mistake> block parser and
     handleQuizPick) funnel through recordMistake, so this covers
     them both. */
  persistMistake({
    nodeName:mistake.node||null,
    questionContent:mistake.q||"",
    userAnswer:mistake.userAnswer,
    correctAnswer:mistake.correct,
    source:mistake.type==="practice"?"practice":"quiz"
  });
  saveCurrentSession();
  renderMistakes();
  updateMistakesBadge();
}

function removeMistakeForQuizSlot(slotId){
  if(!slotId||!state.mistakes)return;
  var before=state.mistakes.length;
  state.mistakes=state.mistakes.filter(function(m){return m.quizSlotId!==slotId});
  if(state.mistakes.length!==before){
    saveCurrentSession();
    renderMistakes();
    updateMistakesBadge();
  }
}

function updateMistakesBadge(){
  var badge=document.getElementById("mistakesTabBadge");
  if(!badge)return;
  var n=(state.mistakes||[]).length;
  badge.textContent=n>0?String(n):"";
}

function renderMistakes(){
  var cont=document.getElementById("mistakesList");
  if(!cont)return;
  /* v3.0 design — §9.4 filter bar (all / unresolved / resolved) */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.renderMistakeFilterBar==="function"){
    try{tutorSocratic.renderMistakeFilterBar()}catch(_){}
  }
  if(!state.mistakes||state.mistakes.length===0){
    cont.innerHTML='<div class="recents-empty">No mistakes yet.<br>Wrong quiz picks and incorrect practice attempts will land here for review.</div>';
    return;
  }
  /* v3.0 design — apply the user's current filter selection
     (all / unresolved / resolved) per §9.4. */
  var filter=state.mistakeFilter||"all";
  var filtered=state.mistakes.slice();
  if(filter==="unresolved"){
    filtered=filtered.filter(function(m){return!m.resolved&&!m.isResolved});
  }else if(filter==="resolved"){
    filtered=filtered.filter(function(m){return!!(m.resolved||m.isResolved)});
  }
  if(!filtered.length){
    cont.innerHTML='<div class="recents-empty">'
      +(filter==="resolved"
        ?"No resolved mistakes yet. Mark a mistake as conquered after redoing it successfully."
        :"Nothing in this filter. Switch to \"all\" to see every mistake.")
      +'</div>';
    return;
  }
  var html="";
  filtered.forEach(function(m){
    var optsHtml="";
    (m.options||[]).forEach(function(o){
      var tag=o.letter===m.correct?"correct-tag":(o.letter===m.userAnswer?"wrong-tag":"");
      optsHtml+='<div class="mistake-opt '+tag+'"><span class="mistake-opt-letter">'+esc(o.letter)+'</span><span>'+esc(o.text)+'</span></div>';
    });
    var resolvedFlag=!!(m.resolved||m.isResolved);
    html+='<div class="mistake-card'+(resolvedFlag?' mistake-card-resolved':'')+'" data-mistake-id="'+esc(m.id)+'">';
    html+='<div class="mistake-meta"><span class="mistake-type">'+esc(m.type)+'</span><span class="mistake-topic">'+esc(m.topic||"")+'</span><span class="mistake-time">'+formatRelativeTime(m.timestamp)+'</span>'
      +(resolvedFlag?'<span class="mistake-resolved-tag">conquered</span>':'')
      +'</div>';
    html+='<div class="mistake-q">'+esc(m.q||"")+'</div>';
    html+='<div class="mistake-opts">'+optsHtml+'</div>';
    if(m.redoCount)html+='<div class="mistake-redo-count">Redone '+m.redoCount+' time'+(m.redoCount>1?'s':'')+'</div>';
    html+='<button class="mistake-redo-btn" data-redo="'+esc(m.id)+'">Redo</button>';
    html+='</div>';
  });
  cont.innerHTML=html;
  /* Wire Redo buttons. */
  cont.querySelectorAll('[data-redo]').forEach(function(btn){
    btn.onclick=function(){handleMistakeRedo(btn.getAttribute("data-redo"))};
  });
}

function handleMistakeRedo(mistakeId){
  var m=(state.mistakes||[]).find(function(x){return x.id===mistakeId});
  if(!m)return;
  m.redoCount=(m.redoCount||0)+1;
  saveCurrentSession();
  /* Try to reset the original widget in-place. */
  if(m.quizSlotId){
    var slot=document.querySelector('[data-quiz-id="'+m.quizSlotId+'"]');
    if(slot){
      var parent=slot.closest(".inline-quiz");
      if(parent){
        /* Re-render fresh. The original parsed object isn't reachable here,
           so we reconstruct it from the mistake record. */
        var parsed={
          q:m.q,
          options:m.options.map(function(o){return{letter:o.letter,text:o.text}}),
          correct:m.correct,
          slotId:m.quizSlotId
        };
        /* Replace the existing widget with a fresh one. */
        var fresh=document.createElement("div");
        parent.parentNode.replaceChild(fresh,parent);
        mountQuizWidget(fresh,parsed);
        return;
      }
    }
  }
  /* Fallback: append a new assistant message containing a fresh quiz widget. */
  var div=document.createElement("div");
  div.className="msg assistant";
  var body=document.createElement("div");
  body.className="msg-body";
  body.innerHTML='<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(var(--text-500));margin-bottom:6px">— Redoing a question you got wrong —</div><div class="quiz-slot" data-quiz-id="redo-'+Date.now().toString(36)+'"></div>';
  div.appendChild(body);
  var list=document.getElementById("msgList");
  if(list)list.appendChild(div);
  var sc=scrollContainer();
  requestAnimationFrame(function(){sc.scrollTop=sc.scrollHeight});
  var slot=div.querySelector(".quiz-slot");
  if(slot){
    var parsed={
      q:m.q,
      options:m.options.map(function(o){return{letter:o.letter,text:o.text}}),
      correct:m.correct,
      slotId:slot.getAttribute("data-quiz-id")
    };
    /* Update the mistake's quizSlotId so a future correct pick clears it. */
    m.quizSlotId=parsed.slotId;
    saveCurrentSession();
    mountQuizWidget(slot,parsed);
  }
}

async function handleQuickAction(action){
  /* Remove quick option buttons from last assistant message */
  var msgs=document.querySelectorAll(".msg.assistant:last-of-type .quick-opts");
  msgs.forEach(function(m){m.style.display="none"});

  if(action==="explain"){
    state.explaining=true;
    state.substantiveCount=0;
    var node=state.kbNodes[state.currentNode];
    var expText=await getExplanation(node.status);
    addMessage("assistant",expText);
    setTimeout(function(){
      addMessage("assistant","Does that help clarify things? What questions do you have now?");
      state.explaining=false;
    },300);
  }else if(action==="skip"){
    state.currentNode=Math.min(state.currentNode+1,state.kbNodes.length-1);
    state.stuckCount=0;
    state.substantiveCount=0;
    await askNextQuestion();
    saveCurrentSession();
  }else if(action==="retry"){
    addMessage("assistant","No problem. Let's try from a different angle.");
    await askNextQuestion();
  }
}

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
    try{tutorSocratic.renderKnowledgeBoundaryFile()}catch(e){console.warn("[kb] boundary render failed",e)}
  }
  /* Mode banner and teaching plan re-render in the new module. */
  if(typeof tutorSocratic==="object"&&tutorSocratic){
    try{tutorSocratic.renderTeachingPlan()}catch(_){}
    try{tutorSocratic.renderModeBanner()}catch(_){}
    try{tutorSocratic.renderLongTermPlan()}catch(_){}
    try{tutorSocratic.renderPracticeProgress()}catch(_){}
  }
  var cont=document.getElementById("kbContent");
  if(!cont)return;
  if(!state.kbNodes.length){
    cont.innerHTML='<div class="kb-empty">'+(typeof t==="function"
      ?t("tutor.setTopicFirst")
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
function renderKnowledgeView(){
  var cont=document.getElementById("teachingPlanContent");
  if(!cont)return;
  /* v3.0 design — delegate to tutorSocratic.renderTeachingPlan
     so the stage label is human-readable ("Intuition" / "建立直觉")
     instead of the raw internal identifier (audit U-H4). */
  if(typeof tutorSocratic==="object"&&tutorSocratic
     &&typeof tutorSocratic.renderTeachingPlan==="function"){
    try{tutorSocratic.renderTeachingPlan()}catch(_){}
  }
  return;
  /* Legacy inline render below — kept for reference but no longer
     reached. The original showed the raw `state.teachingStage`
     value ("motivate", "define", "develop"...) which leaked
     internal identifiers into the UI. The new module translates
     these to friendly labels and adds a progress bar (§10.7). */
  var plan=state.teachingPlan;
  var html='';
  if(plan&&plan.subtopics&&plan.subtopics.length){
    var curIdx=plan.currentSubtopicIdx||0;
    var stage=state.teachingStage||"motivate";
    var stageText=(typeof tutorSocratic==="object"&&tutorSocratic&&typeof tutorSocratic.stageLabel==="function")
      ?tutorSocratic.stageLabel(stage):stage;
    html+='<div class="teaching-plan">';
    html+='<div class="teaching-plan-title">Teaching Plan</div>';
    plan.subtopics.forEach(function(s,i){
      var isCurrent=i===curIdx&&s.status!=="internalized";
      var isDone=s.status==="internalized";
      var cls="teaching-plan-subtopic";
      if(isCurrent)cls+=" current";
      if(isDone)cls+=" done";
      var statusLabel=s.status==="internalized"?"done":s.status==="fuzzy"?"exploring":"new";
      html+='<div class="'+cls+'">';
      html+='<span class="teaching-plan-marker">'+(isDone?"[done]":isCurrent?"›":"·")+'</span>';
      html+='<span class="teaching-plan-name">'+esc(s.name)+'</span>';
      if(isCurrent){
        html+='<span class="teaching-plan-stage">'+esc(stageText)+'</span>';
      }
      html+='<span class="teaching-plan-status">'+statusLabel+'</span>';
      html+='</div>';
    });
    html+='</div>';
  }
  /* Task 6.4 — cross-session knowledge-boundary aggregation, shown
     below the teaching plan. Rendered for every session (including
     those without a teaching plan) since it aggregates across all
     sessions, not just the current one. */
  html+='<div class="kb-cross-session" id="kbCrossSession">';
  html+='<div class="kb-cross-header"><span class="kb-cross-title">Cross-session knowledge</span><button class="kb-cross-refresh" id="kbCrossRefresh" type="button">Refresh</button></div>';
  html+='<div class="kb-cross-body" id="kbCrossBody">Loading…</div>';
  html+='</div>';
  cont.innerHTML=html;
  var refreshBtn=document.getElementById("kbCrossRefresh");
  if(refreshBtn)refreshBtn.onclick=function(){loadAndRenderCrossSessionKB(true)};
  loadAndRenderCrossSessionKB(false);
}

/* Task 6.4 — fetch /api/knowledge-boundary and cache the {items,
   summary} response for 60s. Pass {force:true} to bypass the cache
   (used by the Refresh button). On error, returns an empty shape so
   the UI degrades gracefully. */
var _crossSessionKBCache={data:null,at:0};
function loadCrossSessionKB(opts){
  opts=opts||{};
  var now=Date.now();
  if(!opts.force&&_crossSessionKBCache.data&&now-_crossSessionKBCache.at<60000){
    return Promise.resolve(_crossSessionKBCache.data);
  }
  return apiFetch("/api/knowledge-boundary",{method:"GET"}).then(function(r){
    _crossSessionKBCache={data:r,at:Date.now()};
    return r;
  }).catch(function(e){
    console.warn("[kb] failed to load cross-session boundary:",e&&e.message);
    return {items:[],summary:{total:0,fuzzy:0,internalized:0,blank:0}};
  });
}

/* Render the cross-session section into #kbCrossBody. Uses the cache
   when fresh; otherwise shows a loading state and fetches. */
function loadAndRenderCrossSessionKB(force){
  var body=document.getElementById("kbCrossBody");
  if(!body)return;
  var now=Date.now();
  if(!force&&_crossSessionKBCache.data&&now-_crossSessionKBCache.at<60000){
    body.innerHTML=renderCrossSessionKBHtml(_crossSessionKBCache.data);
    return;
  }
  body.textContent="Loading…";
  loadCrossSessionKB({force:force}).then(function(data){
    var b=document.getElementById("kbCrossBody");
    if(b)b.innerHTML=renderCrossSessionKBHtml(data);
  });
}

/* Build the HTML for the cross-session section: summary counts plus
   a compact node list grouped by name, showing the best status across
   sessions (internalized > fuzzy > blank). */
function renderCrossSessionKBHtml(data){
  if(!data||!data.items)data={items:[],summary:{total:0,fuzzy:0,internalized:0,blank:0}};
  var s=data.summary||{};
  var rank={internalized:3,fuzzy:2,blank:1};
  var byName={};
  (data.items||[]).forEach(function(it){
    if(!it||!it.nodeName)return;
    var cur=byName[it.nodeName];
    if(!cur||(rank[it.status]||0)>(rank[cur.status]||0)){
      byName[it.nodeName]=it;
    }
  });
  var names=Object.keys(byName).sort();
  var html='<div class="kb-cross-summary">';
  html+='<span class="kb-cross-count kb-cross-internalized">internalized: '+esc(String(s.internalized||0))+'</span>';
  html+='<span class="kb-cross-count kb-cross-fuzzy">fuzzy: '+esc(String(s.fuzzy||0))+'</span>';
  html+='<span class="kb-cross-count kb-cross-blank">blank: '+esc(String(s.blank||0))+'</span>';
  html+='</div>';
  if(!names.length){
    html+='<div class="kb-cross-empty">No knowledge-boundary data across sessions yet.</div>';
    return html;
  }
  html+='<div class="kb-cross-nodes">';
  names.forEach(function(n){
    var it=byName[n];
    html+='<div class="kb-cross-node kb-cross-status-'+esc(it.status||"blank")+'">';
    html+='<span class="kb-cross-node-name">'+esc(n)+'</span>';
    html+='<span class="kb-cross-node-status">'+esc(it.status||"blank")+'</span>';
    html+='</div>';
  });
  html+='</div>';
  return html;
}

function kbNodeHtml(n,cls){
  /* Click on the row toggles the boundary detail panel. A separate small
     "→ go" button (added in mountKBDetail) is what actually jumps the
     chat to this node — so reading a note never accidentally triggers a
     new question. */
  return '<div class="kb-node" data-node-idx="'+n.idx+'" onclick="toggleKBDetail('+n.idx+')"><div class="kb-dot '+cls+'"></div><span class="kb-name">'+esc(n.name)+'</span>'+(n.questions?'<span class="kb-count">'+n.questions+' Qs</span>':'')+'</div>';
}

function toggleKBDetail(idx){
  var cont=document.getElementById("kbContent");
  var existing=cont.querySelector('.kb-node-detail[data-node-idx="'+idx+'"]');
  if(existing){existing.remove();return}
  /* Close any other open detail panels (accordion behaviour). */
  var others=cont.querySelectorAll('.kb-node-detail');
  others.forEach(function(o){o.remove()});
  var node=state.kbNodes[idx];
  if(!node)return;
  var detail=document.createElement("div");
  detail.className="kb-node-detail";
  detail.setAttribute("data-node-idx",idx);
  detail.innerHTML=renderKBDetailInner(node,idx);
  /* Insert the detail panel right after the matching .kb-node row. */
  var row=cont.querySelector('.kb-node[data-node-idx="'+idx+'"]');
  if(row&&row.parentNode)row.parentNode.insertBefore(detail,row.nextSibling);
  else cont.appendChild(detail);
  wireKBDetailEvents(detail,idx);
}

function renderKBDetailInner(node,idx){
  var html="";
  html+='<div class="kb-detail-head">';
  html+='<div class="kb-detail-status kb-detail-status-'+(node.status||"blank")+'">'+esc(node.status||"blank")+'</div>';
  html+='<button class="kb-go-btn" data-go="'+idx+'" title="Jump chat to this node">→ go</button>';
  html+='</div>';
  /* Confidence 1-5 dots. */
  var cs=typeof node.confidence_score==="number"?node.confidence_score:0;
  html+='<div class="kb-detail-row"><span class="kb-detail-label">Confidence</span><div class="kb-conf-row">';
  for(var i=1;i<=5;i++){
    html+='<button class="kb-conf-dot'+(i<=cs?' on':'')+'" data-conf="'+i+'" title="Set confidence to '+i+'"></button>';
  }
  html+='</div></div>';
  /* System note (read-only). */
  html+='<div class="kb-detail-row"><span class="kb-detail-label">System note</span>';
  html+='<div class="kb-system-note">'+(node.system_note?esc(node.system_note):'<em style="color:hsl(var(--text-500))">No system note yet.</em>')+'</div></div>';
  /* User note (editable). */
  html+='<div class="kb-detail-row"><label class="kb-detail-label" for="kbUserNote">Your note</label>';
  html+='<textarea class="kb-user-note" id="kbUserNote" name="kbUserNote" rows="3" placeholder="Write anything you want to remember about this sub-topic...">'+esc(node.user_note||"")+'</textarea></div>';
  /* History list. */
  var hist=node.history||[];
  html+='<div class="kb-detail-row"><span class="kb-detail-label">History</span>';
  if(hist.length){
    html+='<ul class="kb-history">';
    hist.forEach(function(h){
      html+='<li><span class="kb-hist-date">'+esc(h.date||"")+'</span> <span class="kb-hist-from kb-hist-from-'+esc(h.from||"")+'">'+esc(h.from||"?")+'</span> → <span class="kb-hist-to kb-hist-to-'+esc(h.to||"")+'">'+esc(h.to||"?")+'</span>'+(h.reason?' <span class="kb-hist-reason">— '+esc(h.reason)+'</span>':'')+'</li>';
    });
    html+='</ul>';
  }else{
    html+='<div class="kb-history-empty">No status changes yet.</div>';
  }
  html+='</div>';
  return html;
}

function wireKBDetailEvents(detail,idx){
  var node=state.kbNodes[idx];
  if(!node)return;
  /* "→ go" button. */
  var goBtn=detail.querySelector('[data-go]');
  if(goBtn){goBtn.onclick=function(e){e.stopPropagation();jumpToNode(idx)}}
  /* Confidence dots. */
  detail.querySelectorAll('[data-conf]').forEach(function(btn){
    btn.onclick=function(e){
      e.stopPropagation();
      var v=parseInt(btn.getAttribute("data-conf"),10);
      node.confidence_score=(node.confidence_score===v)?0:v;
      detail.querySelectorAll('[data-conf]').forEach(function(b){
        var n=parseInt(b.getAttribute("data-conf"),10);
        b.classList.toggle("on",n<=node.confidence_score);
      });
      saveCurrentSession();
    };
  });
  /* User note textarea — debounced save. */
  var ta=detail.querySelector(".kb-user-note");
  if(ta){
    var debounceTimer=null;
    ta.oninput=function(){
      clearTimeout(debounceTimer);
      debounceTimer=setTimeout(function(){
        node.user_note=ta.value;
        saveCurrentSession();
      },500);
    };
    ta.onclick=function(e){e.stopPropagation()};
  }
}

async function jumpToNode(idx){
  state.currentNode=idx;
  state.stuckCount=0;
  state.substantiveCount=0;
  await askNextQuestion();
  saveCurrentSession();
}

function updateChatStats(){
  /* "Questions asked" counter is hidden by default — the user said the
     metric is not useful in chat mode and the chip is a distraction.
     The element still exists (id=chatStats) so old code paths that
     touch it remain harmless. We leave it empty. */
  var statsEl=document.getElementById("chatStats");
  if(statsEl)statsEl.textContent="";
  /* Reflect whether the last response came from the configured API or the local mock.
     Helps surface silent fallbacks caused by provider errors. */
  var badge=document.getElementById("chatApiBadge");
  if(!badge)return;
  if(state.lastCallSource==="api"){
    badge.textContent="API";
    badge.className="chat-api-badge on";
    badge.title="Last reply came from the configured model.";
  }else if(state.lastCallSource==="mock"){
    /* Surface the fallback reason inline so it's visible without hovering.
       The full text remains in the title attribute for tooltip / devtools. */
    var reason=state.lastCallError||"no provider";
    var shortReason=reason.length>80?reason.slice(0,77)+"…":reason;
    badge.innerHTML='<svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 1.5a.75.75 0 0 1 .65.375l6.25 11.25a.75.75 0 0 1-.65 1.125H1.75a.75.75 0 0 1-.65-1.125L7.35 1.875A.75.75 0 0 1 8 1.5zM8 5a.5.5 0 0 0-.5.5v3a.5.5 0 0 0 1 0v-3A.5.5 0 0 0 8 5zm0 5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5z"/></svg> mock ('+esc(shortReason)+')';
    badge.className="chat-api-badge mocked";
    badge.title="Fallback reason: "+reason+". Reply came from the local mock engine. Check API settings if this is unexpected.";
  }else{
    badge.textContent="";
    badge.className="chat-api-badge";
    badge.title="";
  }
}

/* ============================================================
   UTILS
   ============================================================ */

/* The page's scrollable area is .msg-list (when chat/tutor is
   active) or #mainContent (for the start screen, settings, etc.).
   Return whichever is currently scrollable. This centralises the
   "where do I scroll" question so we don't have to chase it every
   time we add a new auto-scroll point. */
function scrollContainer(){
  var ml=document.getElementById("msgList");
  if(ml&&ml.offsetParent!==null&&ml.scrollHeight>ml.clientHeight+2){
    return ml;
  }
  return document.getElementById("mainContent");
}

/* If the chat scroller is currently pinned near the bottom, snap it
   back to the new bottom after the next layout pass. Used after the
   user changes font-size / content-width — otherwise the same
   content recomputes to a larger/smaller height and the user's
   visible window ends up somewhere in the middle of the list. */
function scrollToBottomIfPinned(){
  var sc=scrollContainer();
  if(!sc)return;
  var slack=80; /* pixels from bottom considered "pinned" */
  var wasPinned=(sc.scrollHeight-sc.scrollTop-sc.clientHeight)<=slack;
  /* Do the scroll on the next frame so the new font-size / width has
     been applied to the layout. */
  requestAnimationFrame(function(){
    var sc2=scrollContainer();
    if(!sc2)return;
    if(wasPinned){
      sc2.scrollTop=sc2.scrollHeight;
    }else{
      /* Even if not pinned, keep the relative position stable. */
      var ratio=sc.scrollTop/Math.max(1,sc.scrollHeight-sc.clientHeight);
      sc2.scrollTop=Math.round(ratio*(sc2.scrollHeight-sc2.clientHeight));
    }
  });
}

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
    if(!ok)return;
  }
  saveCurrentSession();
  _shareToken=null;
  resetState();
  /* P2.1 — preserve the project binding so a new chat in the
     same project keeps the user in their context. */
  state.session.currentProjectId=getActiveProjectId();
  toggleShareBtn();
  /* Go back to the main page — no chat session yet. */
  setChatIdInURL(null);
  document.getElementById("topicSetup").classList.remove("hidden");
  document.getElementById("diagnosticView").classList.add("hidden");
  document.getElementById("chatView").classList.add("hidden");
  document.getElementById("topicBadge").classList.add("hidden");
  toggleChatTopBarEls(false);
  document.getElementById("msgList").innerHTML="";
  document.getElementById("topicInput").value="";
  document.getElementById("kbContent").innerHTML='<div class="kb-empty">Set a learning topic to build your knowledge map.</div>';
  document.getElementById("chatStats").textContent="";
  /* v3.0 design — refresh the plan-setup form so a returning
     user sees their previously chosen target date / daily
     minutes / rest days. Without this, the form would always
     show the default 30-minute empty date, even after the
     user had set values in a previous session. */
  if(typeof writeStateIntoPlanSetup==="function"){
    try{writeStateIntoPlanSetup()}catch(_){}
  }
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
  /* Mobile: close the drawer if it's open. */
  if(window.innerWidth<768){
    var sb=document.getElementById("sidebar");
    var bd=document.getElementById("sidebarBackdrop");
    if(sb&&!sb.classList.contains("collapsed")){
      sb.classList.add("collapsed");
      sidebarOpen=false;
      if(bd)bd.classList.remove("show");
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

/* P4.5 — invoked from apiFetch when a 401 comes back. Clears
   in-memory user state, shows the auth gate, and emits a one-time
   event so views that have their own `currentUser` observers (the
   sidebar, settings, etc.) can react. We deliberately do NOT delete
   the sid cookie from the client side — the server is the source of
   truth for session lifetime, and the next successful login will
   set a new one. */
function handleAuthExpired(cause){
  console.warn("[auth] handleAuthExpired called, cause="+(cause||"apiFetch-401"),"at",new Error().stack?.split("\n")[2]?.trim());
  try{
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
        try{fn()}catch(e){console.warn("[auth] listener threw:",e)}
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
        banner.textContent="Your session has expired. Please sign in again.";
        var gate=document.getElementById("authGate");
        if(gate){gate.insertBefore(banner,gate.firstChild)}
      }
    },0);
  }catch(e){console.warn("[auth] handleAuthExpired failed:",e&&e.message)}
}
window.handleAuthExpired=handleAuthExpired;

/* Wire the api module's 401 hook to our local handleAuthExpired +
 * grace window. Done after both functions are defined so the closure
 * captures the right references. */
installAuthHooks({ on401: handleAuthExpired, isInGraceWindow: isInAuthGraceWindow });


function renderUserFooter(){
  var row=document.querySelector(".sidebar-footer .user-row");
  if(!row)return;
  if(!CURRENT_USER){
    row.innerHTML='<div class="user-avatar">?</div><div><div class="user-name">Guest</div><div class="user-plan">Not signed in</div></div>';
    return;
  }
  var initials=(CURRENT_USER.displayName||CURRENT_USER.email||"?").slice(0,2).toUpperCase();
  var tier=CURRENT_USER.tier||'diophantus';
  // Tier is server-controlled and known-safe, but escape anyway in case
  // a future tier value (e.g. "tier-<script>") is ever introduced.
  var safeTier=escapeHtml(tier);
  var tierLabel=escapeHtml(tier.charAt(0).toUpperCase()+tier.slice(1));
  var tierBadge='<span class="tier-badge '+safeTier+'">'+tierLabel+'</span>';
  var safeName=escapeHtml(CURRENT_USER.displayName||CURRENT_USER.email||"");
  row.innerHTML='<div class="user-avatar">'+escapeHtml(initials)+'</div><div style="flex:1;min-width:0" onclick="event.stopPropagation();openProfile()"><div class="user-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer">'+safeName+'</div><div class="user-plan">'+tierBadge+'</div></div>';
  /* Clicking the avatar opens the profile modal. */
  row.querySelector(".user-avatar").onclick=function(e){e.stopPropagation();openProfile()};
}
function openProfile(){
  if(!CURRENT_USER)return;
  /* P1.3 — hydrate the custom-instructions textareas from the
     last-saved value (localStorage first; falls back to
     CURRENT_USER.customInstructions if the server already
     returns it). */
  loadCustomInstructionsIntoUI();
  document.getElementById("profileAvatar").textContent=(CURRENT_USER.displayName||CURRENT_USER.email||"?").slice(0,2).toUpperCase();
  document.getElementById("profileName").textContent=CURRENT_USER.displayName||"User";
  document.getElementById("profileEmail").textContent=CURRENT_USER.email||"";
  /* Format the join date. */
  var joinedEl=document.getElementById("profileJoined");
  if(CURRENT_USER.createdAt){
    try{joinedEl.textContent=new Date(CURRENT_USER.createdAt).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}catch(e){joinedEl.textContent=CURRENT_USER.createdAt}
  }else{joinedEl.textContent="—"}
  /* Email verified status with badge. */
  document.getElementById("profileVerified").textContent=CURRENT_USER.verifiedAt?"Yes":"No";
  document.getElementById("profileVerified").className="profile-row-value"+(CURRENT_USER.verifiedAt?" profile-status-badge yes":" profile-status-badge no");
  /* User ID. */
  var uidEl=document.getElementById("profileUserId").querySelector(".profile-id-text");
  uidEl.textContent=CURRENT_USER.id||"—";
  /* Subscription tier. */
  var tier=CURRENT_USER.tier||'diophantus';
  var tierEl=document.getElementById("profileTier");
  tierEl.textContent=tier.charAt(0).toUpperCase()+tier.slice(1);
  tierEl.className='profile-row-value tier-badge tier-'+tier;
  /* Subscription end date. */
  var subEndEl=document.getElementById("profileSubEnd");
  var subEndRow=document.getElementById("profileSubEndRow");
  if(CURRENT_USER.subscriptionEnd){
    try{subEndEl.textContent=new Date(CURRENT_USER.subscriptionEnd).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}catch(e){subEndEl.textContent="—"}
    subEndRow.style.display="flex";
  }else{
    subEndRow.style.display=(tier==='diophantus'?'none':'flex');
    subEndEl.textContent="—";
  }
  /* Sync web search toggle state. */
  syncProfileWebSearchUI();
  document.getElementById("profileOverlay").classList.remove("hidden");
}
function closeProfile(){
  document.getElementById("profileOverlay").classList.add("hidden");
}

/* ─── Exam view (standalone page) ─── */
function openExamModal(){
  /* Standalone view: hide other top-level views, show examView */
  var ev=document.getElementById("examView");
  var others=["topicSetup","diagnosticView","chatView"];
  others.forEach(function(id){var el=document.getElementById(id);if(el)el.classList.add("hidden");});
  ev.classList.remove("hidden");
  /* P_exam-fullbleed — the chat-only top-bar (session chip, model
   * picker, search, share) is empty in exam mode but still takes 44px
   * of vertical space at the top of .main. Hide it so the exam-view
   * header (which now lives inside #examView itself with its own back
   * button + title) sits flush against the top of the chat pane. */
  var tb=document.querySelector(".main > .top-bar");if(tb)tb.style.display="none";
  toggleChatTopBarEls(false);
  /* Use the same render functions but referencing examViewBody/Footer */
  state._examInView=true;
  /* Wire the scroll listener once per open so the active nav pill
     tracks the viewport as the user scrolls between questions. */
  if(!state._examScrollBound){
    var cont=document.getElementById("examViewBody");
    if(cont){
      cont.addEventListener("scroll",function(){
        if(state._examInView)syncExamNav();
      });
    }
    /* Also track window scroll inside the central scroll container in
       case the exam body itself doesn't scroll. */
    var sc=document.getElementById("scrollContainer")||document.getElementById("msgScroll");
    if(sc){
      sc.addEventListener("scroll",function(){
        if(state._examInView)syncExamNav();
      });
    }
    state._examScrollBound=true;
  }
  renderExamForm();
}
function closeExamView(){
  var ev=document.getElementById("examView");
  ev.classList.add("hidden");
  /* P_exam-fullbleed — restore the chat-only top-bar that openExamModal
   * hid. The exam-view header is gone with the exam view; chat-mode
   * UI (session chip, model picker, share button) needs the top-bar
   * to be visible again. */
  var tb=document.querySelector(".main > .top-bar");if(tb)tb.style.display="";
  state.examCancel=true;
  state._examInView=false;
  state.examReadOnly=false;
  /* Restore the active provider to whatever it was before the exam
     started, even if the user just closes the view mid-generation. */
  try{restoreExamActiveProvider()}catch(_){}
  /* Show the previous view — if there was an active chat, return to it */
  if(state.currentSessionId){
    document.getElementById("chatView").classList.remove("hidden");
    toggleChatTopBarEls(true);
  }else{
    document.getElementById("topicSetup").classList.remove("hidden");
    toggleChatTopBarEls(false);
  }
}
function closeExamModal(){
  /* Legacy alias for the unused modal HTML — just routes to the view. */
  closeExamView();
}
function _examBody(){return document.getElementById("examViewBody");}
function _examFooter(){return document.getElementById("examViewFooter");}
function _examTitle(){return document.getElementById("examViewTitle");}
function renderExamForm(){
  var body=_examBody();
  var footer=_examFooter();
  _examTitle().textContent=(_currentLang==="zh"?"生成考卷":"Generate Exam");
  var meta=document.getElementById("examViewMeta");
  if(meta)meta.textContent="";
  state.examCancel=false;
  state.examQuestions=[];
  state.examAnswers={};
  state.examSubmitted=false;
  _examSelectedTypes={mc:true,fb:true,sa:false};
  var L=function(en,zh){return _currentLang==="zh"?zh:en};
  /* Provider picker — list every configured provider (built-in Beagle +
     user keys) so the user can pick which model generates the exam.
     Defaults to the currently active provider. */
  var provOptions="";
  if(Array.isArray(apiConfig.providers)){
    apiConfig.providers.forEach(function(p){
      if(!p||!p.id)return;
      var label=p.label||p.model||p.id;
      var selected=(p.id===apiConfig.activeId)?" selected":"";
      provOptions+='<option value="'+esc(p.id)+'"'+selected+'>'+esc(label)+'</option>';
    });
  }
  if(!provOptions){
    provOptions='<option value="">'+(L("无可用模型","No models available"))+'</option>';
  }
  var html='<div class="exam-form-container">';
  /* Row 1 — topic (full width) */
  html+='<div class="exam-form-row"><label class="exam-form-label" for="examTopic">'+t("exam.topic")+'</label>';
  html+='<input class="exam-form-input" id="examTopic" name="examTopic" placeholder="'+( _currentLang==="zh"?"如：线性代数、量子力学、二战…":"e.g. Linear Algebra, Quantum Mechanics, World War II..." )+'"></div>';
  /* Row 2 — model, difficulty, count (3-column grid) */
  html+='<div class="exam-form-row">';
  html+='<div class="exam-form-grid3">';
  html+='<div class="exam-form-cell"><label class="exam-form-label" for="examModel">'+(L("生成模型","Model"))+'</label>';
  html+='<select class="exam-form-input exam-form-select" id="examModel" name="examModel">'+provOptions+'</select></div>';
  html+='<div class="exam-form-cell"><label class="exam-form-label" for="examDifficulty">'+t("exam.difficulty")+'</label>';
  html+='<input class="exam-form-input" id="examDifficulty" name="examDifficulty" placeholder="'+( _currentLang==="zh"?"入门 / 中级 / 困难 / 专家 / 自定义":"beginner / intermediate / hard / expert / custom" )+'" value="intermediate"></div>';
  html+='<div class="exam-form-cell exam-form-cell-narrow"><label class="exam-form-label" for="examCount">'+t("exam.count")+'</label>';
  html+='<input class="exam-form-input" id="examCount" name="examCount" type="number" min="1" max="50" value="5"></div>';
  html+='</div></div>';
  /* Row 3 — question types */
  html+='<div class="exam-form-row"><div class="exam-form-label">'+t("exam.types")+'</div>';
  html+='<div class="exam-type-picker" id="examTypePicker">';
  html+='<button class="exam-type-pill active" data-type="mc" onclick="toggleExamType(\'mc\')">'+L("选择题","Multiple choice")+'</button>';
  html+='<button class="exam-type-pill active" data-type="fb" onclick="toggleExamType(\'fb\')">'+L("填空题","Fill blank")+'</button>';
  html+='<button class="exam-type-pill" data-type="sa" onclick="toggleExamType(\'sa\')">'+L("简答题","Short answer")+'</button>';
  html+='</div></div>';
  /* Row 4 — instructions */
  html+='<div class="exam-form-row"><label class="exam-form-label" for="examInstructions">'+t("exam.instructions")+'</label>';
  html+='<textarea class="exam-form-textarea" id="examInstructions" name="examInstructions" placeholder="'+( _currentLang==="zh"?"具体说明要覆盖的知识点，留空则由 AI 决定…":"Specific topics to cover, or leave blank for AI to decide..." )+'"></textarea></div>';
  html+='</div>';
  body.innerHTML=html;
  footer.innerHTML='<button class="exam-btn secondary" onclick="closeExamView()">'+t("common.cancel")+'</button><button class="exam-btn primary" onclick="startExamGeneration()">'+t("exam.generate")+'</button>';
}
function toggleExamType(type){
  var btn=document.querySelector('.exam-type-pill[data-type="'+type+'"]');
  if(!btn)return;
  var countActive=document.querySelectorAll('.exam-type-pill.active').length;
  if(btn.classList.contains("active")&&countActive<=1)return;
  btn.classList.toggle("active");
  _examSelectedTypes[type]=btn.classList.contains("active");
}
/* P_exam-lang — detect the language of the topic string so the LLM
   generates questions in the user's own language. Defaults to English
   when no CJK / Hangul / Kana / Cyrillic characters are present.
   The result is also injected into the prompt to make it unambiguous
   to the model that q/opts/answer/explanation MUST all be in lang. */
function detectExamLang(topic){
  if(!topic)return"English";
  if(/[一-鿿]/.test(topic))return"Chinese";
  if(/[぀-ゟ゠-ヿ]/.test(topic))return"Japanese";
  if(/[가-힯]/.test(topic))return"Korean";
  if(/[Ѐ-ӿ]/.test(topic))return"Russian";
  if(/[؀-ۿ]/.test(topic))return"Arabic";
  if(/[ऀ-ॿ]/.test(topic))return"Hindi";
  if(/[Ͱ-Ͽ]/.test(topic))return"Greek";
  if(/[֐-׿]/.test(topic))return"Hebrew";
  if(/[฀-๿]/.test(topic))return"Thai";
  /* Latin-script heuristic — if non-ASCII Latin is present (e.g. accented
     characters) keep "English" but mark the prompt with the topic verbatim
     so the LLM still mirrors the user's script. */
  return"English";
}
function startExamGeneration(){
  var topic=document.getElementById("examTopic").value.trim();
  if(!topic){document.getElementById("examTopic").focus();return;}
  var count=Math.max(1,Math.min(50,parseInt(document.getElementById("examCount").value,10)||5));
  var difficulty=document.getElementById("examDifficulty").value.trim()||"intermediate";
  var instructions=document.getElementById("examInstructions").value.trim()||"";
  var modelSel=document.getElementById("examModel");
  var chosenModel=modelSel?modelSel.value:"";
  var types=[];
  if(_examSelectedTypes.mc)types.push("multiple-choice");
  if(_examSelectedTypes.fb)types.push("fill-blank");
  if(_examSelectedTypes.sa)types.push("short-answer");
  if(!types.length){types=["multiple-choice","fill-blank","short-answer"]}
  var typeStr=types.join(", ");
  var lang=detectExamLang(topic);
  state.examCancel=false;
  state.examQuestions=[];
  state.examAnswers={};
  state.examSubmitted=false;
  state.examTopic=topic;
  state.examCount=count;
  state.examLang=lang;
  state.examDifficulty=difficulty;
  state.examInstructions=instructions;
  state.examTypes=types.slice();
  /* Temporarily switch the active provider so callAPI uses the model
     the user picked in the exam form. Save the previous id so we can
     restore it after generation finishes (success or failure). */
  state._examPrevActiveId=apiConfig.activeId;
  if(chosenModel&&Array.isArray(apiConfig.providers)){
    var exists=apiConfig.providers.some(function(p){return p&&p.id===chosenModel});
    if(exists){
      apiConfig.activeId=chosenModel;
      /* Tell the server too, but ignore failures — if the PATCH fails
         the local switch still routes the in-flight callAPI to the
         correct provider. */
      try{apiFetch("/api/api-key/"+encodeURIComponent(chosenModel),{method:"PATCH",body:{isActive:true}}).catch(function(){})}catch(_){}
    }
  }
  _examTitle().textContent=topic;
  var meta=document.getElementById("examViewMeta");
  var provLabel=(Array.isArray(apiConfig.providers)?apiConfig.providers.find(function(p){return p&&p.id===apiConfig.activeId}):null)||{};
  if(meta)meta.textContent=count+" "+(lang==="Chinese"?"题 · ":"questions · ")+(provLabel.label||provLabel.model||"")+" · "+difficulty;
  var body=_examBody();
  body.innerHTML='<div class="exam-loading" id="examGenStatus"><span class="loading"><span></span><span></span><span></span></span><div class="exam-loading-msg" id="examGenMsg">'+(lang==="Chinese"?"正在生成考卷…":"Generating your exam…")+'</div><div class="exam-loading-sub">'+(lang==="Chinese"?"AI 正在为您出题，请稍候片刻":"The AI is preparing your questions — this usually takes a few seconds.")+'</div></div>';
  _examFooter().innerHTML='<button class="exam-btn secondary" onclick="cancelExamGeneration()">'+(lang==="Chinese"?"取消":"Cancel")+'</button>';
  /* Kick off a SINGLE non-streaming call that returns all questions
     as one JSON array. No more one-question-at-a-time streaming —
     the user sees one clean loading state, then the whole exam. */
  generateAllQuestions(topic,count,difficulty,typeStr,instructions,lang);
}
function restoreExamActiveProvider(){
  /* Restore the active provider to whatever it was before the exam
     started, so a quick switch doesn't leak into the regular chat. */
  var prev=state._examPrevActiveId;
  if(!prev)return;
  if(apiConfig.activeId===prev)return;
  if(Array.isArray(apiConfig.providers)&&apiConfig.providers.some(function(p){return p&&p.id===prev})){
    apiConfig.activeId=prev;
    try{apiFetch("/api/api-key/"+encodeURIComponent(prev),{method:"PATCH",body:{isActive:true}}).catch(function(){})}catch(_){}
  }
  state._examPrevActiveId=null;
}
function cancelExamGeneration(){
  state.examCancel=true;
  restoreExamActiveProvider();
  var body=_examBody();
  var lang=state.examLang||"English";
  var L=function(en,zh){return lang==="Chinese"?zh:en};
  body.innerHTML='<div class="exam-empty">'+(L("已取消出题","Generation cancelled")+'.</div>');
  _examFooter().innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">'+L("重新出题","Try again")+'</button><button class="exam-btn secondary" onclick="closeExamView()">'+L("关闭","Close")+'</button>';
  _examTitle().textContent=L("已取消","Cancelled");
}
async function generateAllQuestions(topic,count,difficulty,typeStr,instructions,lang){
  /* Build a prompt that asks for the whole exam as a JSON array.
     Reasoning models (Beagle M2.7 / DeepSeek R1 / QwQ) can take a
     couple of minutes for a 5-question exam; the longer single
     response avoids the overhead of N separate round trips and the
     JSON parsing failures that come from truncated streaming deltas. */
  var prompt="Generate an exam of "+count+" questions as a single JSON object with shape {\"questions\":[ ... ]}.\n"+
    "Topic: "+topic+".\n"+
    "Difficulty: "+difficulty+".\n"+
    "Allowed question types: "+typeStr+".\n"+
    "Language: "+lang+".\n"+
    "CRITICAL: EVERY field of every question (q, opts[*].text, answer, answers[*], explanation) MUST be written in "+lang+".\n"+
    (instructions?"Specifics: "+instructions+"\n":"")+
    "Return ONLY the JSON — no markdown, no preamble, no commentary. "+
    "Each question object must have: q (string), type (one of \""+typeStr+"\"). "+
    "For multiple-choice add opts:[{letter,text}] (4 options A-D) and answer (correct letter). "+
    "For fill-blank add answers:[string] (acceptable fills). "+
    "For short-answer add answer (key facts). "+
    "Always add explanation (string). Use Markdown + $LaTeX$ in q text.";
  var msgs=[{role:"system",content:prompt},{role:"user",content:"Generate "+count+" questions now."}];
  /* callAPI is non-streaming and returns the full text at once, or
     null if no provider is available (falls back to mock). For
     long generations (reasoning models), the existing callAPI uses
     the same 10-minute total budget + 2-retry pattern, so a slow
     first attempt has a chance to recover. */
  var tokens=Math.max(800,count*700);
  var result=await callAPI(msgs,tokens);
  restoreExamActiveProvider();
  if(state.examCancel)return;
  if(!result){
    var langL=lang==="Chinese"?"生成失败：模型无响应":"Generation failed — no response from model";
    var body=_examBody();
    body.innerHTML='<div class="exam-empty"><strong>'+langL+'</strong><div style="margin-top:8px;font-size:13px;color:hsl(var(--text-500))">'+(lang==="Chinese"?"请稍后重试":"Please try again in a moment.")+'</div></div>';
    _examFooter().innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">'+(lang==="Chinese"?"重新出题":"Try again")+'</button><button class="exam-btn secondary" onclick="closeExamView()">'+(lang==="Chinese"?"关闭":"Close")+'</button>';
    return;
  }
  /* callAPI may return a string or an object; normalise to string. */
  var text=typeof result==="string"?result:(result&&(result.text||result.content))||"";
  if(!text||!text.trim()){
    var langL2=lang==="Chinese"?"生成失败：模型返回为空":"Generation failed — empty response";
    var body2=_examBody();
    body2.innerHTML='<div class="exam-empty"><strong>'+langL2+'</strong></div>';
    _examFooter().innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">'+(lang==="Chinese"?"重新出题":"Try again")+'</button><button class="exam-btn secondary" onclick="closeExamView()">'+(lang==="Chinese"?"关闭":"Close")+'</button>';
    return;
  }
  var parsed=parseExamArrayJSON(text);
  if(!parsed||!Array.isArray(parsed.questions)||parsed.questions.length===0){
    var langL3=lang==="Chinese"?"生成失败：无法解析返回的题目":"Generation failed — couldn't parse the exam response";
    var body3=_examBody();
    body3.innerHTML='<div class="exam-empty"><strong>'+langL3+'</strong><div style="margin-top:10px;font-size:12px;color:hsl(var(--text-500));max-width:480px;text-align:left;background:hsl(var(--bg-200));padding:10px 12px;border-radius:8px;word-break:break-word;line-height:1.5">'+(lang==="Chinese"?"原始返回（前 500 字）：":"Raw response (first 500 chars):")+"<br>"+esc(text.slice(0,500))+'</div></div>';
    _examFooter().innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">'+(lang==="Chinese"?"重新出题":"Try again")+'</button><button class="exam-btn secondary" onclick="closeExamView()">'+(lang==="Chinese"?"关闭":"Close")+'</button>';
    return;
  }
  /* Sanitize each question and push to state. Coerce unknown types
     to fill-blank as a graceful fallback. */
  parsed.questions.forEach(function(q,qi){
    if(!q||!q.q||!q.type)return;
    if(q.type!=="multiple-choice"&&q.type!=="fill-blank"&&q.type!=="short-answer")q.type="fill-blank";
    if(!q.explanation)q.explanation="";
    q._idx=state.examQuestions.length;
    state.examQuestions.push(q);
  });
  if(state.examQuestions.length===0){
    var langL4=lang==="Chinese"?"生成失败：返回中没有有效题目":"Generation failed — no valid questions returned";
    var body4=_examBody();
    body4.innerHTML='<div class="exam-empty"><strong>'+langL4+'</strong></div>';
    _examFooter().innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">'+(lang==="Chinese"?"重新出题":"Try again")+'</button><button class="exam-btn secondary" onclick="closeExamView()">'+(lang==="Chinese"?"关闭":"Close")+'</button>';
    return;
  }
  /* Render the questions container and mount the nav bar in one go. */
  renderAllQuestions();
  finishExamGeneration();
}
function parseExamArrayJSON(text){
  /* Robustly parse an LLM response of shape {"questions":[...]} or a
     bare [...]. Strategies, tried in order:
       1) Strip markdown fences and <think> blocks, then try direct parse.
       2) Pull the first balanced { ... } starting at the first { (skipping
          any chars until we find one), or [ ... ] starting at the first [.
       3) As a last resort, try a balanced scan where we walk character by
          character tracking nesting depth.
     Logs the raw text on failure so the user can see what the model
     actually returned in the console. */
  if(!text||typeof text!=="string")return null;
  /* Strategy 1: clean fences / think blocks and parse the whole string. */
  var clean=text.replace(/```(?:json|JSON)?\s*/g,"").replace(/\s*```/g,"").replace(/<(?:thinking|think)>[\s\S]*?(<\/(?:thinking|think)>|$)/gi,"").replace(/\[(?:thinking|think)\][\s\S]*?(\[\/(?:thinking|think)\]|$)/gi,"").trim();
  try{
    var direct=JSON.parse(clean);
    if(direct&&Array.isArray(direct.questions))return direct;
    if(Array.isArray(direct))return{questions:direct};
  }catch(_){/* fall through */}
  /* Strategy 2: balanced-brace scan starting from the first { or [. */
  function findBalanced(s,openCh,closeCh){
    var start=-1,depth=0,inStr=false,escape=false,quote=null;
    for(var i=0;i<s.length;i++){
      var ch=s[i];
      if(inStr){
        if(escape){escape=false;continue}
        if(ch==="\\"){escape=true;continue}
        if(ch===quote){inStr=false;quote=null}
        continue;
      }
      if(ch==='"'||ch==="'"){inStr=true;quote=ch;continue}
      if(ch===openCh){
        if(depth===0)start=i;
        depth++;
      }else if(ch===closeCh){
        depth--;
        if(depth===0&&start>=0)return s.slice(start,i+1);
      }
    }
    return null;
  }
  /* Prefer {...} shape since that's what the prompt asked for. */
  var objSlice=findBalanced(clean,"{","}");
  if(objSlice){
    try{
      var parsed=JSON.parse(objSlice);
      if(parsed&&Array.isArray(parsed.questions))return parsed;
      if(Array.isArray(parsed))return{questions:parsed};
    }catch(_){}
  }
  /* Fallback to bare [...] array. */
  var arrSlice=findBalanced(clean,"[","]");
  if(arrSlice){
    try{
      var arr=JSON.parse(arrSlice);
      if(Array.isArray(arr))return{questions:arr};
    }catch(_){}
  }
  console.warn("[exam] parseExamArrayJSON failed. Raw response (first 800 chars):",text.slice(0,800));
  return null;
}
function renderAllQuestions(){
  /* Build the full exam body in one shot: questions container with
     each rendered card, plus the prev/next nav bar at the top. */
  var body=_examBody();
  if(!body)return;
  body.innerHTML='<div id="examQuestionsContainer"></div>';
  var cont=document.getElementById("examQuestionsContainer");
  if(!cont)return;
  state.examQuestions.forEach(function(q,idx){
    var ph=document.createElement("div");
    ph.className="exam-q-card";
    ph.id="examQ"+idx;
    cont.appendChild(ph);
    paintQuestionCard(idx,q,ph);
  });
}
function paintQuestionCard(idx,q,container){
  /* Render the content of one question card into the given container
     element. Used both for fresh rendering and for restoring a saved
     session. */
  var html='<div class="exam-q-num">Question '+(idx+1)+' of '+state.examQuestions.length+' <span class="exam-q-type">'+q.type+'</span></div>';
  html+='<div class="exam-q-text">'+formatMsg(q.q)+'</div>';
  if(q.type==="multiple-choice"&&q.opts){
    html+='<div class="exam-q-opts">';
    q.opts.forEach(function(o,oi){
      html+='<button class="exam-q-opt" data-eidx="'+idx+'" data-oidx="'+oi+'" onclick="selectExamOpt('+idx+','+oi+')">';
      html+='<span class="exam-q-opt-letter">'+o.letter+'</span>';
      html+='<span class="exam-q-opt-text">'+formatMsg(o.text)+'</span>';
      html+='</button>';
    });
    html+='</div>';
  }else if(q.type==="fill-blank"){
    html+='<input class="exam-q-fill-input" data-eidx="'+idx+'" name="examAnswer'+idx+'" aria-label="Answer for question '+(idx+1)+'" placeholder="'+(state.examLang==="Chinese"?"输入你的答案…":"Type your answer…")+'" oninput="state.examAnswers['+idx+']=this.value;refreshExamNavTally();scheduleExamAnswerSave()">';
  }else if(q.type==="short-answer"){
    html+='<textarea class="exam-q-fill-input" data-eidx="'+idx+'" name="examAnswer'+idx+'" aria-label="Answer for question '+(idx+1)+'" placeholder="'+(state.examLang==="Chinese"?"输入你的答案…":"Type your answer…")+'" rows="3" oninput="state.examAnswers['+idx+']=this.value;refreshExamNavTally();scheduleExamAnswerSave()" style="min-height:80px;resize:vertical"></textarea>';
  }
  container.innerHTML=html;
}
function replaceStreamingCardWithQuestion(i,q){
  /* Kept as a stub for any callers that may still reference it —
     delegates to the unified paintQuestionCard renderer. */
  var ph=document.getElementById("examQ"+i);
  if(!ph)return;
  paintQuestionCard(q._idx,q,ph);
  renderExamNav();
}
function appendExamErrorCard(i,msg){
  var ph=document.createElement("div");
  ph.className="exam-q-card";
  ph.id="examQ"+i;
  ph.innerHTML='<div class="exam-q-num">Question '+(i+1)+' — <span class="exam-result-wrong">Failed</span></div><div class="exam-q-text" style="color:hsl(0 60% 55%)">'+esc(msg)+'</div>';
  state.examQuestions.push({q:"[failed]",type:"error",explanation:"",_idx:i});
  var cont=document.getElementById("examQuestionsContainer");
  if(cont)cont.appendChild(ph);
  renderExamNav();
}
function selectExamOpt(qidx,oidx){
  if(state.examSubmitted)return;
  state.examAnswers[qidx]=oidx;
  var btns=document.querySelectorAll('.exam-q-opt[data-eidx="'+qidx+'"]');
  btns.forEach(function(b,i){b.classList.toggle("selected",i===oidx);});
  /* Refresh the nav counter's "answered" tally and pill dots so the
     user sees the question is now ticked off in the jump bar. */
  renderExamNav();
  /* P_exam-history — debounced save so a multi-choice click survives
     a refresh. saveExamSession coalesces rapid saves. */
  saveExamSession();
}
function finishExamGeneration(){
  var st=document.getElementById("examGenStatus");
  if(st)st.style.display="none";
  var valid=state.examQuestions.filter(function(q){return q.type!=="error";});
  var footer=_examFooter();
  if(state.examCancel){
    footer.innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">Start New Exam</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
    renderExamNav();
    return;
  }
  if(valid.length>0){
    footer.innerHTML='<button class="exam-btn primary" onclick="submitExam()">Submit for Grading</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
  }else{
    footer.innerHTML='<button class="exam-btn primary" onclick="renderExamForm()">Try Again</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
  }
  /* P_exam-nav — now that all questions are on screen, mount the
     Prev/Next/jump bar so the user can leap between them. */
  renderExamNav();
  /* P_exam-history — persist the exam to the server so it appears in
     Recents and is recoverable after a refresh. We always save at
     generation finish (not just on Submit) so a half-finished exam is
     also recoverable. */
  saveExamSession({submitted:false});
}

/* P_exam-nav — render the Prev / question-counter / Next bar and a
   "Jump to question N" pill row. Called every time a question is added
   (replaceStreamingCardWithQuestion, appendExamErrorCard) and at
   generation / submission finish.

   The bar is inserted just above the footer inside #examViewBody, so it
   stays anchored to the bottom of the question list rather than floating
   with each individual question. */
function renderExamNav(){
  if(!state._examInView)return;
  var body=_examBody();
  if(!body)return;
  var existing=document.getElementById("examNavBar");
  if(existing)existing.parentNode.removeChild(existing);
  var total=state.examQuestions.length;
  if(total===0)return;
  console.log("[exam] renderExamNav total:", total);
  var isSubmitted=!!state.examSubmitted;
  var answeredKeys=Object.keys(state.examAnswers||{}).filter(function(k){
    var v=state.examAnswers[k];
    if(v===undefined||v===null)return false;
    if(typeof v==="string")return v.trim().length>0;
    return true;
  });
  var answered=answeredKeys.length;
  var lang=state.examLang||"English";
  var L=function(en,zh){
    if(lang==="Chinese")return zh;
    return en;
  };
  var html='<div class="exam-nav-bar" id="examNavBar" style="display:flex;">';
  html+='<button class="exam-nav-btn" id="examNavPrev" onclick="examNavStep(-1)" aria-label="Previous question">‹</button>';
  html+='<div class="exam-nav-counter" id="examNavCounter">';
  html+='<span class="exam-nav-current" id="examNavCurrent">1</span>';
  html+='<span class="exam-nav-sep">/</span>';
  html+='<span class="exam-nav-total">'+total+'</span>';
  if(!isSubmitted){
    html+='<span class="exam-nav-progress" id="examNavProgress">· '+answered+' '+L("answered","已答")+'</span>';
  }
  html+='</div>';
  html+='<button class="exam-nav-btn" id="examNavNext" onclick="examNavStep(1)" aria-label="Next question">›</button>';
  html+='</div>';
  html+='<div class="exam-nav-pills" id="examNavPills">';
  for(var j=0;j<total;j++){
    var isAns=answeredKeys.indexOf(String(j))>=0;
    var isCur=(j===examNavCurrentIdx());
    var cls="exam-nav-pill"+(isCur?" current":"")+(isAns?" answered":"");
    var lbl=(j+1)+(isAns?" ✓":"");
    html+='<button class="'+cls+'" data-nav-idx="'+j+'" onclick="examNavJump('+j+')">'+lbl+'</button>';
  }
  html+='</div>';
  /* Insert before the first card so the nav bar lives between the
     status/header area and the questions themselves. */
  var first=body.firstChild;
  var navWrap=document.createElement("div");
  navWrap.innerHTML=html;
  while(navWrap.firstChild)body.insertBefore(navWrap.firstChild,first);
  syncExamNav();
}

/* Return the index of the question closest to the top of the viewport. */
function examNavCurrentIdx(){
  var cont=document.getElementById("examQuestionsContainer");
  if(!cont)return 0;
  var cards=cont.querySelectorAll(".exam-q-card[id^='examQ']");
  if(!cards.length)return 0;
  var closest=0,bestDist=Infinity;
  var top0=cont.getBoundingClientRect().top;
  cards.forEach(function(c,i){
    var d=Math.abs(c.getBoundingClientRect().top-top0);
    if(d<bestDist){bestDist=d;closest=i}
  });
  return closest;
}
function examNavJump(idx){
  var el=document.getElementById("examQ"+idx);
  if(!el)return;
  el.scrollIntoView({behavior:"smooth",block:"start"});
  setTimeout(syncExamNav,300);
}
function examNavStep(dir){
  var i=examNavCurrentIdx();
  var total=state.examQuestions.length;
  if(total===0)return;
  var next=Math.max(0,Math.min(total-1,i+dir));
  examNavJump(next);
}
function syncExamNav(){
  var i=examNavCurrentIdx();
  var total=state.examQuestions.length;
  var cur=document.getElementById("examNavCurrent");
  if(cur)cur.textContent=(i+1);
  var prev=document.getElementById("examNavPrev");
  var next=document.getElementById("examNavNext");
  if(prev)prev.disabled=(i<=0);
  if(next)next.disabled=(i>=total-1);
  var pills=document.querySelectorAll("#examNavPills .exam-nav-pill");
  pills.forEach(function(p,j){
    p.classList.toggle("current",j===i);
  });
}

/* P_exam-nav — called from input/textarea oninput on every keystroke.
   Updating only the "answered" label and pill classes (no full re-render)
   keeps the nav bar visible while the user types, and avoids losing
   focus or scroll position mid-answer. */
function refreshExamNavTally(){
  var total=state.examQuestions.length;
  if(total===0)return;
  var answered=Object.keys(state.examAnswers||{}).filter(function(k){
    var v=state.examAnswers[k];
    if(v===undefined||v===null)return false;
    if(typeof v==="string")return v.trim().length>0;
    return true;
  });
  var prog=document.getElementById("examNavProgress");
  if(prog){
    var lang=state.examLang||"English";
    prog.textContent="· "+answered.length+" "+(lang==="Chinese"?"已答":"answered");
  }
  var pills=document.querySelectorAll("#examNavPills .exam-nav-pill");
  pills.forEach(function(p){
    var j=parseInt(p.getAttribute("data-nav-idx"),10);
    var isAns=answered.indexOf(String(j))>=0;
    p.classList.toggle("answered",isAns);
    if(isAns&&p.textContent.indexOf("✓")<0)p.textContent=(j+1)+" ✓";
  });
}

/* P_exam-history — debounce per-keystroke saves so we don't POST on
   every character typed in a short-answer textarea. The trailing
   call to saveExamSession (after 800ms of quiet) still lands within
   a second of the last edit. */
var _examAnswerSaveTimer=null;
function scheduleExamAnswerSave(){
  if(_examAnswerSaveTimer)clearTimeout(_examAnswerSaveTimer);
  _examAnswerSaveTimer=setTimeout(function(){
    _examAnswerSaveTimer=null;
    saveExamSession();
  },800);
}
function submitExam(){
  var qs=state.examQuestions;
  var ans=state.examAnswers;
  var validQs=qs.filter(function(q){return q.type!=="error";});
  if(!validQs.length)return;
  var missing=[];
  validQs.forEach(function(q,i){
    if(q.type==="multiple-choice"&&ans[i]===undefined)missing.push(i+1);
    if((q.type==="fill-blank"||q.type==="short-answer")&&(!ans[i]||String(ans[i]).trim()===""))missing.push(i+1);
  });
  if(missing.length){
    var el=document.querySelector('.exam-q-card#examQ'+(missing[0]-1));
    if(el)el.scrollIntoView({behavior:"smooth",block:"center"});
    return;
  }
  state.examSubmitted=true;
  /* P_exam-history — persist the submitted exam so the result is
     visible in Recents and recoverable after a refresh. The render
     follows so the user sees the score first. */
  saveExamSession({submitted:true});
  renderExamResults();
}

/* P_exam-history — POST /api/sessions with kind='exam' and the full
 * exam payload in examData. Reuses the existing session-save
 * machinery (so the recents list updates automatically) but skips the
 * message-write path because exams don't have chat-style messages.
 *
 * Called from finishExamGeneration (just-completed exam), submitExam
 * (just-graded exam), and selectExamOpt / refreshExamNavTally debounced
 * (every answer change) so progress is never lost to a refresh.
 */
var _examSaveInFlight=null;
var _examSaveDirty=false;
function saveExamSession(opts){
  if(!CURRENT_USER)return;
  if(!state.examTopic)return;
  if(!state._examInView)return;
  /* Don't write back when the viewer is reading someone else's
   * shared exam — they're not signed in as the owner and the
   * POST would 404 / 403. */
  if(state.examReadOnly)return;
  opts=opts||{};
  /* Coalesce rapid-fire saves (typing in a textarea fires oninput on
   * every keystroke) so we don't burn one POST per character. */
  if(_examSaveInFlight){
    _examSaveDirty=true;
    return;
  }
  _examSaveDirty=false;
  doSaveExamSession(opts);
}
function doSaveExamSession(opts){
  var body={
    kind:"exam",
    topic:state.examTopic,
    title:state.examTopic,
    domain:state.examTopic,
    mode:"chat",
    phase:"chat",
    examData:{
      topic:state.examTopic,
      difficulty:state.examDifficulty||"intermediate",
      count:state.examCount,
      lang:state.examLang||"English",
      types:Array.isArray(state.examTypes)?state.examTypes:[],
      questions:state.examQuestions.map(function(q){
        /* Strip the client-only _idx before sending; the server only
           needs the actual question content. */
        var c={q:q.q,type:q.type,explanation:q.explanation||""};
        if(q.opts)c.opts=q.opts;
        if(q.answer!==undefined)c.answer=q.answer;
        if(q.answers)c.answers=q.answers;
        return c;
      }),
      answers:state.examAnswers||{},
      submitted:!!state.examSubmitted,
      generatedAt:Date.now(),
    },
  };
  /* Use the existing currentSessionId if there is one (so this is an
   * update), otherwise the server mints a new id. Either way the
   * canonical id is captured on response and written back to state. */
  if(state.currentSessionId){
    body.id=state.currentSessionId;
  }
_examSaveInFlight=apiFetch("/api/sessions",{method:"POST",body:body})
    .then(function(r){
      if(r&&r.id){
        state.currentSessionId=r.id;
        try{pushChatIdToURL(r.id)}catch(_){}
      }
      /* Refresh the session list from server so the new/updated exam
         row appears in Recents. Then re-render. */
      return refreshServerSessions().then(function(){
        try{renderRecents()}catch(_){}
        try{toggleShareBtn()}catch(_){}
      });
    })
    .catch(function(e){
      console.warn("[exam] save failed:",e&&e.message);
    })
    .then(function(){
      _examSaveInFlight=null;
      if(_examSaveDirty){
        _examSaveDirty=false;
        doSaveExamSession({});
      }
    });
}
function renderExamResults(){
  var qs=state.examQuestions;
  var ans=state.examAnswers;
  var body=_examBody();
  var footer=_examFooter();
  _examTitle().textContent="Exam Results: "+state.examTopic;
  var correct=0,total=0;
  var resultDetails=[];
  qs.forEach(function(q,i){
    if(q.type==="error")return;
    total++;
    var isCorrect=false;
    if(q.type==="multiple-choice"){
      var sel=ans[i];
      if(sel!==undefined&&q.opts&&q.opts[sel])isCorrect=q.opts[sel].letter===q.answer;
    }else if(q.type==="fill-blank"){
      var ua=String(ans[i]||"").trim().toLowerCase();
      isCorrect=(q.answers||[]).some(function(a){return ua===String(a).trim().toLowerCase();});
    }else if(q.type==="short-answer"){
      var ua=String(ans[i]||"").trim().toLowerCase();
      var expected=String(q.answer||"").trim().toLowerCase();
      var keywords=expected.split(/[,\s]+/).filter(function(k){return k.length>3});
      isCorrect=keywords.length===0||keywords.some(function(k){return ua.indexOf(k)>=0;});
    }
    if(isCorrect)correct++;
    resultDetails.push({q:q,ans:ans[i],isCorrect:isCorrect});
  });
  var pct=total>0?Math.round(correct/total*100):0;
  var html='<div class="exam-score"><div class="exam-score-val"><span class="score-correct">'+correct+'</span><span class="score-total">/ '+total+'</span></div><div class="exam-score-lbl">'+pct+'% correct</div></div>';
  resultDetails.forEach(function(rd,i){
    var q=rd.q;
    var isCorrect=rd.isCorrect;
    var cls=isCorrect?"correct":"wrong";
    html+='<div class="exam-q-card">';
    html+='<div class="exam-q-num">Question '+(i+1)+' — <span class="exam-result-'+(isCorrect?"correct":"wrong")+'">'+(isCorrect?"✓ Correct":"✗ Incorrect")+'</span><span class="exam-q-type">'+q.type+'</span></div>';
    html+='<div class="exam-q-text">'+formatMsg(q.q)+'</div>';
    if(q.type==="multiple-choice"&&q.opts){
      html+='<div class="exam-q-opts">';
      q.opts.forEach(function(o,oi){
        var selected=rd.ans===oi;
        var isAns=o.letter===q.answer;
        var oc="exam-q-opt";
        if(isAns)oc+=" correct";
        if(selected&&!isAns)oc+=" wrong";
        if(selected)oc+=" selected";
        html+='<div class="'+oc+'"><span class="exam-q-opt-letter">'+o.letter+'</span><span class="exam-q-opt-text">'+formatMsg(o.text)+'</span></div>';
      });
      html+='</div>';
    }else if(q.type==="fill-blank"){
      var ic="exam-q-fill-input"+(isCorrect?" correct":" wrong");
      html+='<input class="'+ic+'" value="'+esc(rd.ans||"")+'" readonly>';
      if(!isCorrect)html+='<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(145 40% 45%);margin-top:4px">Correct answer: <strong>'+(q.answers||[]).join(", ")+'</strong></div>';
    }else if(q.type==="short-answer"){
      var ic="exam-q-fill-input"+(isCorrect?" correct":" wrong");
      html+='<textarea class="'+ic+'" readonly rows="2">'+esc(rd.ans||"")+'</textarea>';
      if(!isCorrect)html+='<div style="font-size:calc(12px * var(--app-font-scale, 1));color:hsl(145 40% 45%);margin-top:4px">Expected: <strong>'+esc(q.answer||"")+'</strong></div>';
    }
    if(q.explanation){
      html+='<div class="exam-q-result '+cls+'"><span class="label">Explanation:</span><div class="explain">'+formatMsg(q.explanation)+'</div></div>';
    }
    html+='</div>';
  });
  body.innerHTML=html;
  footer.innerHTML='<button class="exam-btn success" onclick="renderExamForm()">New Exam</button><button class="exam-btn secondary" onclick="closeExamView()">Close</button>';
}

/* Usage modal — token heatmap & monthly breakdown. */
function openUsageModal(){
  document.getElementById("usageOverlay").classList.remove("hidden");
  loadUsageData();
}
function closeUsageModal(){
  document.getElementById("usageOverlay").classList.add("hidden");
}
function loadUsageData(){
  var body=document.getElementById("usageBody");
  body.innerHTML='<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> Loading usage data…</div>';
  Promise.all([
    apiFetch("/api/usage/daily?days=365"),
    apiFetch("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],body,results[1]);
  }).catch(function(){
    body.innerHTML='<div class="usage-loading" style="color:hsl(0 60% 55%)">Failed to load usage data. Make sure you are signed in.</div>';
  });
}
function renderUsageHeatmap(data,body,limits){
  var entries=data.entries||[];
  var lookup={};
  var totalTokens=0,totalMsgs=0;
  entries.forEach(function(e){
    lookup[e.day]=e;
    totalTokens+=parseInt(e.tokens,10)||0;
    totalMsgs+=parseInt(e.messages,10)||0;
  });
  /* Compute max daily tokens for color scaling */
  var maxDay=entries.reduce(function(m,e){return Math.max(m,parseInt(e.tokens,10)||0)},1);
  function level(t){var v=parseInt(t,10)||0;if(v===0)return 0;var r=v/maxDay;return r>0.8?5:r>0.6?4:r>0.4?3:r>0.2?2:1;}

  /* Build date grid for last 365 days (or up to today) */
  var now=new Date();
  var end=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  var start=new Date(end);start.setDate(start.getDate()-364);
  /* Align start to Sunday */
  var startDow=start.getDay();
  start.setDate(start.getDate()-startDow);

  var days=[];
  var cursor=new Date(start);
  while(cursor<=end){
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate()+1);
  }

  /* Build weeks array: array of 7-element arrays */
  var weeks=[];
  var curWeek=[];
  days.forEach(function(d,y){
    var key=d.toISOString().slice(0,10);
    var e=lookup[key];
    curWeek.push({date:key,tokens:e?parseInt(e.tokens,10):0,msgs:e?parseInt(e.messages,10):0,day:d.getDay()});
    if(curWeek.length===7){weeks.push(curWeek);curWeek=[];}
  });
  if(curWeek.length){weeks.push(curWeek);}

  /* Month labels */
  var monthLabels=[];
  var lastMth="";
  weeks.forEach(function(w,i){
    if(!w.length)return;
    var d=new Date(w[0].date);
    var mth=d.toLocaleDateString("en-US",{month:"short"});
    if(mth!==lastMth){monthLabels.push({col:i,label:mth});lastMth=mth;}
  });

  /* Build HTML */
  var html='';

  /* Beagle monthly usage bar (only shown when usage > 0 or user is free tier) */
  if(limits&&limits.beagleLimit){
    var beagleUsed=parseInt(limits.beagleUsed,10)||0;
    var beagleLimit=limits.beagleLimit;
    var beaglePct=Math.min(100,Math.round(beagleUsed/beagleLimit*100));
    var barColor=beaglePct>=90?'hsl(0 65% 55%)':beaglePct>=70?'hsl(35 80% 55%)':'hsl(var(--accent-000))';
    html+='<div class="usage-beagle-section" style="margin-bottom:20px;padding:14px 16px;background:hsl(var(--bg-100));border-radius:10px">';
    html+='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html+='<div style="font-size:calc(13px * var(--app-font-scale, 1));font-weight:600;color:hsl(var(--text-000))">Beagle Monthly Usage</div>';
    html+='<div style="font-size:calc(11px * var(--app-font-scale, 1));color:hsl(var(--text-500))">'+beagleUsed.toLocaleString()+' / '+beagleLimit.toLocaleString()+' tokens</div>';
    html+='</div>';
    html+='<div style="height:8px;background:hsl(var(--bg-300));border-radius:4px;overflow:hidden">';
    html+='<div style="height:100%;width:'+beaglePct+'%;background:'+barColor+';border-radius:4px;transition:width .3s ease"></div>';
    html+='</div>';
    if(beaglePct>=100){
      html+='<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(0 65% 55%);font-weight:500">Limit reached. Add your own API key in Account → API Keys to continue using Beagle.</div>';
    }else if(beaglePct>=80){
      html+='<div style="margin-top:6px;font-size:calc(11px * var(--app-font-scale, 1));color:hsl(35 80% 55%)">Approaching monthly limit ('+beaglePct+'% used).</div>';
    }
    html+='</div>';
  }

  /* Summary stats */
  html+='<div class="usage-summary">';
  html+='<div class="usage-stat"><div class="usage-stat-val">'+totalTokens.toLocaleString()+'</div><div class="usage-stat-lbl">Total tokens</div></div>';
  html+='<div class="usage-stat"><div class="usage-stat-val">'+totalMsgs.toLocaleString()+'</div><div class="usage-stat-lbl">Messages</div></div>';
  var dayCount=entries.length;
  html+='<div class="usage-stat"><div class="usage-stat-val">'+(dayCount>0?Math.round(totalTokens/dayCount).toLocaleString():0)+'</div><div class="usage-stat-lbl">Avg tokens / active day</div></div>';
  html+='<div class="usage-stat"><div class="usage-stat-val">'+(dayCount>0?Math.round(totalMsgs/dayCount).toLocaleString():0)+'</div><div class="usage-stat-lbl">Avg msgs / active day</div></div>';
  html+='</div>';

  /* Period tabs */
  html+='<div class="usage-section-title">Daily Activity</div>';
  html+='<div class="usage-period-tabs">';
  html+='<button class="usage-period-tab active" onclick="loadUsageData()">Last 12 months</button>';
  html+='<button class="usage-period-tab" onclick="loadUsageMonth()">This month</button>';
  html+='</div>';

  /* Heatmap grid */
  html+='<div class="usage-calendar-wrap"><div class="usage-calendar">';

  /* Day-of-week labels */
  var dowLbl=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  weeks.forEach(function(w,wi){
    /* Month label row for first week only */
    if(wi===0){
      html+='<div class="usage-cal-day-lbl"></div>';
      var mthIdx=0;
      for(var c=0;c<weeks.length;c++){
        var lbl="";
        if(mthIdx<monthLabels.length&&monthLabels[mthIdx].col===c){
          lbl=monthLabels[mthIdx].label;mthIdx++;
        }
        html+='<div style="font-size:calc(8px * var(--app-font-scale, 1));color:hsl(var(--text-500));text-align:center">'+lbl+'</div>';
      }
    }
  });
  /* Day rows */
  for(var row=0;row<7;row++){
    html+='<div class="usage-cal-day-lbl">'+dowLbl[row]+'</div>';
    weeks.forEach(function(w){
      if(row<w.length){
        var d=w[row];
        var lv=d.tokens>0?level(d.tokens):0;
        html+='<div class="usage-cal-day lv'+lv+'" data-date="'+d.date+'" data-tokens="'+d.tokens+'" data-msgs="'+d.msgs+'" onmouseenter="showUsageTip(event)" onmouseleave="hideUsageTip()"></div>';
      }else{
        html+='<div></div>';
      }
    });
  }

  html+='</div></div>';

  /* Legend */
  html+='<div class="usage-legend">Less<div class="usage-legend-cell usage-cal-day lv0"></div><div class="usage-legend-cell usage-cal-day lv1"></div><div class="usage-legend-cell usage-cal-day lv2"></div><div class="usage-legend-cell usage-cal-day lv3"></div><div class="usage-legend-cell usage-cal-day lv4"></div><div class="usage-legend-cell usage-cal-day lv5"></div>More</div>';
  html+='<div class="usage-tooltip" id="usageTooltip"></div>';

  /* Monthly breakdown */
  html+='<div class="usage-breakdown"><div class="usage-section-title">Monthly Summary</div><table><thead><tr><th>Month</th><th>Days active</th><th>Tokens</th><th>Messages</th></tr></thead><tbody>';
  var monthMap={};
  entries.forEach(function(e){
    var m=e.day.slice(0,7);
    if(!monthMap[m])monthMap[m]={days:{},tokens:0,msgs:0};
    monthMap[m].days[e.day]=true;
    monthMap[m].tokens+=parseInt(e.tokens,10)||0;
    monthMap[m].msgs+=parseInt(e.messages,10)||0;
  });
  var mKeys=Object.keys(monthMap).sort().reverse();
  mKeys.forEach(function(m){
    var d=new Date(m+"-01");
    var lbl=d.toLocaleDateString("en-US",{year:"numeric",month:"long"});
    var mm=monthMap[m];
    html+='<tr><td>'+lbl+'</td><td>'+Object.keys(mm.days).length+'</td><td>'+mm.tokens.toLocaleString()+'</td><td>'+mm.msgs.toLocaleString()+'</td></tr>';
  });
  html+='</tbody></table></div>';

  body.innerHTML=html;
}
function showUsageTip(ev){
  var el=ev.currentTarget;
  var tip=document.getElementById("usageTooltip");
  if(!tip){tip=document.createElement("div");tip.id="usageTooltip";tip.className="usage-tooltip";document.body.appendChild(tip);}
  var date=el.dataset.date;
  var tokens=parseInt(el.dataset.tokens,10)||0;
  var msgs=parseInt(el.dataset.msgs,10)||0;
  tip.innerHTML='<strong>'+date+'</strong> — '+tokens.toLocaleString()+' tokens, '+msgs+' messages';
  tip.style.display="block";
  var rect=el.getBoundingClientRect();
  tip.style.left=Math.min(rect.left+rect.width/2-tip.offsetWidth/2,window.innerWidth-tip.offsetWidth-10)+"px";
  tip.style.top=(rect.top-tip.offsetHeight-6)+"px";
}
function hideUsageTip(){var tip=document.getElementById("usageTooltip");if(tip)tip.style.display="none";}
function loadUsageMonth(){
  var body=document.getElementById("usageBody");
  body.innerHTML='<div class="usage-loading"><span class="loading"><span></span><span></span><span></span></span> Loading usage data…</div>';
  Promise.all([
    apiFetch("/api/usage/daily?days=31"),
    apiFetch("/api/usage/limits"),
  ]).then(function(results){
    renderUsageHeatmap(results[0],body,results[1]);
  }).catch(function(){
    body.innerHTML='<div class="usage-loading" style="color:hsl(0 60% 55%)">Failed to load usage data.</div>';
  });
}

/* P2.3 — Storage modal. Lists archived sessions with the
   days-remaining countdown, plus a Restore / Delete-forever
   pair per row. The modal is a single instance that gets
   rebuilt every time it opens, so the count is always live. */
function openStorageModal(){
  var overlay=document.getElementById("storageModalOverlay");
  if(!overlay){
    overlay=document.createElement("div");
    overlay.id="storageModalOverlay";
    overlay.className="cmd-k-overlay hidden";
    overlay.onclick=function(ev){if(ev.target===overlay)closeStorageModal()};
    overlay.innerHTML='<div class="cmd-k-modal storage-modal" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");
  renderArchivedList();
}
function closeStorageModal(){
  var overlay=document.getElementById("storageModalOverlay");
  if(overlay)overlay.classList.add("hidden");
}

/* P5.8 — Prompt templates manager modal. Lists built-ins
   (read-only) and user customs (editable). The 'New
   template' button opens a lightweight editor inline. */
function openPromptTemplatesModal(){
  var overlay=document.getElementById("promptTemplatesOverlay");
  if(!overlay){
    overlay=document.createElement("div");
    overlay.id="promptTemplatesOverlay";
    overlay.className="cmd-k-overlay hidden";
    overlay.onclick=function(ev){if(ev.target===overlay)closePromptTemplatesModal()};
    overlay.innerHTML='<div class="cmd-k-modal prompt-templates-modal" onclick="event.stopPropagation()"></div>';
    document.body.appendChild(overlay);
  }
  overlay.classList.remove("hidden");
  renderPromptTemplatesModal();
}
function closePromptTemplatesModal(){
  var overlay=document.getElementById("promptTemplatesOverlay");
  if(overlay)overlay.classList.add("hidden");
}
function renderPromptTemplatesModal(){
  var body=document.querySelector("#promptTemplatesOverlay .prompt-templates-modal");
  if(!body)return;
  var all=loadPromptTemplates();
  var customs=all.filter(function(t){return!t.isBuiltin;});
  var builtins=all.filter(function(t){return t.isBuiltin;});
  var html=
    '<div class="project-editor-head">'+
      '<span class="project-editor-title">Prompt templates</span>'+
      '<button class="project-editor-close" onclick="closePromptTemplatesModal()">×</button>'+
    '</div>'+
    '<div class="prompt-templates-body">'+
      '<div class="prompt-templates-section-label">Built-in ('+builtins.length+')</div>'+
      builtins.map(function(t){return renderPromptRow(t,false);}).join("")+
      '<div class="prompt-templates-section-label" style="margin-top:14px">Your templates ('+customs.length+')</div>'+
      (customs.length?customs.map(function(t){return renderPromptRow(t,true);}).join(""):
        '<div class="prompt-templates-empty">No custom templates yet.</div>')+
      '<button class="prompt-templates-new" onclick="openPromptTemplateEditor()">+ New template</button>'+
    '</div>';
  body.innerHTML=html;
}
function renderPromptRow(t,editable){
  var iconHtml=t.icon&&t.icon.indexOf("<svg")===0?t.icon:esc(t.icon||"pg");
  return '<div class="prompt-row'+(t.isBuiltin?" builtin":"")+'">'+
    '<span class="prompt-row-icon">'+iconHtml+'</span>'+
    '<div class="prompt-row-main">'+
      '<div class="prompt-row-title">'+esc(t.title)+' <span class="prompt-row-shortcut">'+esc(t.shortcut)+'</span></div>'+
      '<div class="prompt-row-desc">'+esc(t.description||"")+'</div>'+
    '</div>'+
    (editable?
      '<div class="prompt-row-actions">'+
      '<button class="prompt-row-edit" onclick="openPromptTemplateEditor('+encodeURIComponent(JSON.stringify(t))+')">Edit</button>'+
        '<button class="prompt-row-delete" onclick="onPromptRowDelete(\''+esc(t.id)+'\')">Delete</button>'+
      '</div>':'')+
  '</div>';
}
function onPromptRowDelete(id){
  showConfirm("Delete template?","This removes your custom template. Built-ins stay.",true).then(function(yes){
    if(!yes)return;
    deleteCustomTemplate(id);
    renderPromptTemplatesModal();
  });
}

/* P5.8 — Inline template editor. Reuses the same modal
   shell but replaces the list with a form. `existing` is
   either a full template object (edit) or null (new). */
function openPromptTemplateEditor(existing){
  var body=document.querySelector("#promptTemplatesOverlay .prompt-templates-modal");
  if(!body)return;
  var t=existing||{id:"tpl-"+Date.now().toString(36),title:"",description:"",body:"",icon:"pg",category:"writing",shortcut:"/my-template"};
  /* Save on Enter inside title field; Cmd/Ctrl+Enter inside
     body. */
  body.innerHTML=
    '<div class="project-editor-head">'+
      '<span class="project-editor-title">'+(existing?"Edit template":"New template")+'</span>'+
      '<button class="project-editor-close" onclick="renderPromptTemplatesModal()">×</button>'+
    '</div>'+
    '<div class="prompt-templates-body">'+
      '<div class="prompt-editor-grid">'+
        '<label class="prompt-editor-label">Title<input class="prompt-editor-input" id="ptTitle" maxlength="80" value="'+esc(t.title)+'" placeholder="e.g. Code review"></label>'+
        '<label class="prompt-editor-label">Shortcut<input class="prompt-editor-input prompt-editor-shortcut" id="ptShortcut" maxlength="20" pattern="^/[a-z0-9-]+$" value="'+esc(t.shortcut)+'" placeholder="/my-template"></label>'+
      '</div>'+
      '<label class="prompt-editor-label">Description<input class="prompt-editor-input" id="ptDescription" maxlength="200" value="'+esc(t.description||"")+'" placeholder="One-line summary"></label>'+
      '<div class="prompt-editor-grid">'+
        '<label class="prompt-editor-label">Icon<input class="prompt-editor-input prompt-editor-icon" id="ptIcon" maxlength="4" value="'+esc(t.icon||"pg")+'"></label>'+
        '<label class="prompt-editor-label">Category'+
          '<select class="prompt-editor-input" id="ptCategory">'+
            ["writing","code","learning","analysis","creative","other"].map(function(c){
              return '<option value="'+c+'" '+(t.category===c?"selected":"")+'>'+c+'</option>';
            }).join("")+
          '</select>'+
        '</label>'+
      '</div>'+
      '<label class="prompt-editor-label">Body<textarea class="prompt-editor-textarea" id="ptBody" rows="6" placeholder="The text inserted into the chat. Leave a blank line at the end so the user can type below.">'+esc(t.body||"")+'</textarea></label>'+
    '</div>'+
    '<div class="project-editor-foot">'+
      '<div class="project-editor-spacer"></div>'+
      '<button class="project-editor-cancel" onclick="renderPromptTemplatesModal()">Cancel</button>'+
      '<button class="project-editor-save" onclick="onPromptTemplateEditorSave(\''+esc(t.id)+'\','+(existing?'1':'0')+')">Save</button>'+
    '</div>';
  var title=document.getElementById("ptTitle");
  if(title){setTimeout(function(){title.focus();title.select()},0)}
}
function onPromptTemplateEditorSave(id,wasExisting){
  var title=((document.getElementById("ptTitle")||{}).value||"").trim();
  var shortcut=((document.getElementById("ptShortcut")||{}).value||"").trim();
  var description=((document.getElementById("ptDescription")||{}).value||"").trim();
  var icon=((document.getElementById("ptIcon")||{}).value||"pg").trim();
  var category=((document.getElementById("ptCategory")||{}).value||"other");
  var body=((document.getElementById("ptBody")||{}).value||"");
  if(!title){showToast("Title is required");return}
  if(!/^\/[a-z0-9-]+$/.test(shortcut)){showToast("Shortcut must look like /my-template");return}
  var existing=findTemplateByShortcut(shortcut);
  if(existing&&existing.id!==id){showToast("That shortcut is already in use");return}
  upsertCustomTemplate({id:id,title:title,description:description,icon:icon||"pg",category:category,shortcut:shortcut,body:body,isBuiltin:false});
  renderPromptTemplatesModal();
  showToast("Template saved");
}
function renderArchivedList(){
  var body=document.querySelector("#storageModalOverlay .storage-modal");
  if(!body)return;
  var archived=getArchivedSessions();
  var html=
    '<div class="project-editor-head">'+
      '<span class="project-editor-title">Archived sessions ('+archived.length+')</span>'+
      '<button class="project-editor-close" onclick="closeStorageModal()">×</button>'+
    '</div>'+
    '<div class="storage-modal-body">'+
      '<div class="storage-modal-desc">These sessions are pending permanent deletion. Deleting a session in Recents first archives it for up to 30 days as a safety net; this list shows any that have not yet been purged. Use Restore to bring one back, or Delete forever to remove it now.</div>'+
      (archived.length?
        '<div class="storage-list">'+archived.map(function(s){
          var ageDays=Math.max(0,Math.floor((Date.now()-(s.archivedAt||0))/(24*60*60*1000)));
          var remain=Math.max(0,30-ageDays);
          return '<div class="storage-row">'+
            '<div class="storage-row-main">'+
              '<div class="storage-row-title">'+esc(s.title||s.topic||"(untitled)")+'</div>'+
              '<div class="storage-row-meta">Archived '+ageDays+' day'+(ageDays===1?"":"s")+' ago · '+remain+' day'+(remain===1?"":"s")+' left</div>'+
            '</div>'+
            '<div class="storage-row-actions">'+
              '<button class="storage-btn-restore" onclick="restoreSession(\''+esc(s.id)+'\')">Restore</button>'+
              '<button class="storage-btn-delete" onclick="confirmPurgeSession(\''+esc(s.id)+'\')">Delete forever</button>'+
            '</div>'+
          '</div>';
        }).join("")+'</div>':
        '<div class="storage-empty">No archived sessions. Long-press a session in Recents to send it here.</div>'
      )+
    '</div>';
  body.innerHTML=html;
}

/* P1.3 — Custom Instructions: load/save/serialize.
   Schema (localStorage key "socrates-custom-instructions"):
     { response: "How should I respond?",
       about:    "What do you know about me?",
       savedAt:  ISO-8601 timestamp }
   The two strings are also pushed to the server via
   PATCH /api/users/me.customInstructions so the same value
   flows to the Android client on the next sign-in. */
var _customInstructionsSaveTimer=null;
function loadCustomInstructions(){
  try{
    var raw=localStorage.getItem("socrates-custom-instructions");
    if(raw)return JSON.parse(raw)||{};
  }catch(_){}
  return {};
}
function saveCustomInstructions(value){
  try{localStorage.setItem("socrates-custom-instructions",JSON.stringify(value))}catch(_){}
}
function loadCustomInstructionsIntoUI(){
  var data=loadCustomInstructions();
  /* Fall back to the server-side value if local is empty. */
  if(!data.response&&CURRENT_USER&&CURRENT_USER.customInstructions){
    data.response=CURRENT_USER.customInstructions;
  }
  var respEl=document.getElementById("profileInstResponse");
  var aboutEl=document.getElementById("profileInstAbout");
  if(respEl)respEl.value=data.response||"";
  if(aboutEl)aboutEl.value=data.about||"";
  updateInstSaveState(data.savedAt);
}
function onCustomInstructionsChange(){
  var respEl=document.getElementById("profileInstResponse");
  var aboutEl=document.getElementById("profileInstAbout");
  if(!respEl||!aboutEl)return;
  updateInstSaveState(null);
  /* Debounce 600ms — typing fires oninput on every keystroke. */
  clearTimeout(_customInstructionsSaveTimer);
  _customInstructionsSaveTimer=setTimeout(function(){
    var value={
      response:respEl.value,
      about:aboutEl.value,
      savedAt:new Date().toISOString()
    };
    saveCustomInstructions(value);
    updateInstSaveState(value.savedAt);
    /* Best-effort server sync — non-blocking. */
    apiFetch("/api/users/me",{
      method:"PATCH",
      body:{customInstructions:buildCustomInstructionsString(value)},
      timeoutMs:8000
    }).then(function(){
      /* Server accepted; nothing to do. */
    }).catch(function(e){
      console.debug("[custom-inst] server sync failed (will retry on next save):",e&&e.message);
    });
  },600);
}
function buildCustomInstructionsString(value){
  var parts=[];
  if(value&&value.response)parts.push("[How to respond]\n"+value.response);
  if(value&&value.about)parts.push("[About the user]\n"+value.about);
  return parts.join("\n\n");
}
function updateInstSaveState(savedAt){
  var el=document.getElementById("profileInstSaveState");
  if(!el)return;
  if(!savedAt){
    el.textContent="Saving…";
    el.className="profile-instructions-state pending";
    return;
  }
  var t=new Date(savedAt);
  var hh=String(t.getHours()).padStart(2,"0");
  var mm=String(t.getMinutes()).padStart(2,"0");
  el.textContent="Saved at "+hh+":"+mm;
  el.className="profile-instructions-state saved";
}
/* Returns the in-flight custom-instructions string (or "") for
   callers that build the chat messages array — see
   getSystemContext(). The string is fetched fresh on every
   call so changes from another tab or device (post sync) are
   visible immediately. */
function getCustomInstructionsString(){
  var v=loadCustomInstructions();
  return buildCustomInstructionsString(v);
}
/* Web search toggle in profile. */
function toggleProfileWebSearch(){
  webSearchOn=!webSearchOn;
  try{localStorage.setItem("socrates-websearch",JSON.stringify(webSearchOn))}catch(e){}
  syncProfileWebSearchUI();
}
function syncProfileWebSearchUI(){
  var track=document.getElementById("profileWebSearchTrack");
  if(!track)return;
  if(webSearchOn){track.classList.add("on")}else{track.classList.remove("on")}
}
/* Confirm dialog helper — resolves true/false via a modal. */
var _confirmResolve=null;
function showConfirm(title,msg,isDanger){
  return new Promise(function(resolve){
    _confirmResolve=resolve;
    document.getElementById("confirmTitle").textContent=title;
    document.getElementById("confirmMsg").textContent=msg;
    var okBtn=document.getElementById("confirmOkBtn");
    okBtn.className="confirm-btn "+(isDanger?"danger":"primary");
    okBtn.textContent=isDanger?"Delete":"OK";
    okBtn.onclick=function(){closeConfirm(true)};
    document.getElementById("confirmDialog").classList.remove("hidden");
  });
}
function closeConfirm(resolveWith){
  document.getElementById("confirmDialog").classList.add("hidden");
  if(_confirmResolve){
    _confirmResolve(resolveWith===undefined?false:resolveWith);_confirmResolve=null;
  }
}
/* Clear local conversations. */
function confirmClearCache(){
  showConfirm("Clear conversations?","This removes all local chat history from this browser. Your account data stays on the server.",false).then(function(yes){
    if(!yes)return;
    try{localStorage.removeItem("socrates-sessions-v2")}catch(e){}
    state.currentSessionId=null;
    renderRecents();
    resetApp();
    /* Refresh — just reload for a clean slate. */
    location.reload();
  });
}
/* Clear API settings. */
function confirmClearSettings(){
  showConfirm("Clear API settings?","This removes all configured API providers and keys. You'll need to reconfigure them.",false).then(function(yes){
    if(!yes)return;
    if(!CURRENT_USER)return;
    (async function(){
      /* Delete each non-built-in provider one by one. Built-in entries
         (e.g. BEAGLE_BUILT_IN) live only in the frontend constant and
         carry a non-UUID id, so the backend would reject them. Per-item
         try/catch keeps one failure from aborting the rest of the loop. */
      for(var i=0;i<apiConfig.providers.length;i++){
        var p=apiConfig.providers[i];
        if(p.isBuiltIn||p.id==="beagle-built-in")continue;
        if(p.id.indexOf("new-")!==0){
          try{
            await apiFetch("/api/api-key/"+encodeURIComponent(p.id),{method:"DELETE"});
          }catch(e){console.warn("[profile] clear settings: delete "+p.id+" failed:",e.message)}
        }
      }
      apiConfig={activeId:null,providers:[]};
      /* Keep the built-in Beagle provider available after clearing, but
         do NOT auto-activate it. The user must explicitly pick a model
         in the picker — auto-picking BEAGLE would silently route every
         cold-start through a model they never chose. */
      apiConfig.providers.push(Object.assign({},BEAGLE_BUILT_IN));
      try{localStorage.removeItem("socrates-provider-keys")}catch(e){}
      try{localStorage.removeItem(LAST_ACTIVE_ID_KEY)}catch(e){}
      renderProviderList();syncModelPills();syncSettingsUI();
    })();
    closeProfile();
  });
}
/* Delete account. */
function confirmDeleteAccount(){
  showConfirm("Delete your account?","This permanently deletes your account, all chat sessions, and all saved settings. This cannot be undone.",true).then(function(yes){
    if(!yes)return;
    (async function(){
      try{
        await apiFetch("/api/auth/account",{method:"DELETE"});
        CURRENT_USER=null;
        try{localStorage.removeItem("socrates-sessions-v2")}catch(e){}
        try{localStorage.removeItem("socrates-api")}catch(e){}
        try{localStorage.removeItem("socrates-provider-keys")}catch(e){}
        try{localStorage.removeItem("socrates-websearch")}catch(e){}
        resetState();
        resetApp();
        showGate();
        renderUserFooter();
        closeProfile();
        showAuthSignin();
      }catch(e){
        alert("Failed to delete account: "+e.message);
      }
    })();
  });
}
/* escapeHtml / sanitizeUrl / sanitizeUrls are imported from
 * ./util/safe.js. The window aliases are kept so any on-page
 * debug console (or older hot-reload tab) that still references
 * window.sanitizeUrl / window.escapeHtml keeps working. */
import { escapeHtml, sanitizeUrl, sanitizeUrls } from './util/safe.js';
window.escapeHtml=escapeHtml;window.sanitizeUrl=sanitizeUrl;window.sanitizeUrls=sanitizeUrls;

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
  try{await fetch("/api/auth/csrf-token",{credentials:"include"})}catch(_){}
  CURRENT_USER=null;
  /* Clear local caches that may now be stale. */
  try{
    localStorage.removeItem("socrates-sessions-v2");
    localStorage.removeItem("socrates-api");
    localStorage.removeItem("socrates-guest");
  }catch(_){}
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
var BEAGLE_BUILT_IN={
  id:"beagle-built-in",
  label:"Beagle A",
  url:"/api/minimax/v1",
  model:"MiniMax-M2.7",
  key:"",
  isBuiltIn:true
};

/* On boot: try /api/auth/me. If the URL has ?token=… it's a verification
   link, so consume that first. If ?reset_token=… it's a password reset. */
/* The auth boot sequence (csrf priming, /me retry, gate routing)
   runs in auth/boot.js — imported at the top of this file. */

/* Listen for browser back/forward and load the corresponding chat. */
window.addEventListener("popstate",function(e){
  /* Defer to let the URL settle, then check for a chat session ID. */
  setTimeout(function(){
    var chatId=getChatIdFromURL();
    if(chatId&&chatId!==state.currentSessionId){
      loadSession(chatId);
    }else if(!chatId&&state.currentSessionId){
      state.currentSessionId=null;
      resetApp();
    }
  },0);
});

/* ============================================================
   SETTINGS & API  —  server-backed provider list
   The browser no longer holds the API key — the server stores it
   encrypted and the chat proxy uses it from the per-user row in
   api_providers. The browser only sees {id, isActive, label, url, model}.
   ============================================================ */
/* Initialize empty so getActiveProvider() returns null until the
   user explicitly picks a model. The built-in BEAGLE is offered as
   a selectable option (it lives in providers[] after the first
   refresh), but it is NOT auto-activated — choosing a model is the
   user's call, and silently routing everything through a fallback
   that the user never picked is misleading.
   If the user has never added a provider, the Settings panel still
   shows BEAGLE_BUILT_IN (and any other built-ins) for them to pick. */
var apiConfig={activeId:null,providers:[]};


/* P4.4 — encrypted provider-key cache. Old versions stored
   {providerId: sk-rawKey} as plaintext JSON in
   localStorage["socrates-provider-keys"], readable by anyone with
   access to the browser profile (extension, sync, devtools).
   New format: { v: 2, salt, iv, ct } — AES-GCM-256 with a key
   derived via PBKDF2 (200 000 iterations) from a stable
   per-installation passphrase. The salt is per-installation and
   stored in localStorage alongside the ciphertext; the passphrase
   is also stored in localStorage (the protection here is
   "at-rest encryption against a casual observer / profile sync",
   NOT against a determined attacker with code execution on the
   device — for that we would need WebAuthn PRF).
   The legacy v1 plaintext format is read once, migrated to v2,
   and the plaintext entry is wiped. */
var PK_CACHE_KEY="socrates-provider-keys";
var PK_PASSPHRASE_KEY="socrates-pk-passphrase";
var PK_SALT_KEY="socrates-pk-salt";
var PK_PBKDF2_ITERATIONS=200000;
var _pkCryptoKeyPromise=null;

function _getOrCreatePassphrase(){
  try{
    var existing=localStorage.getItem(PK_PASSPHRASE_KEY);
    if(existing)return existing;
    /* 256 bits of entropy, base64. Generated once per
       installation; lives alongside the encrypted ciphertext. */
    var bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    var b64=btoa(String.fromCharCode.apply(null,bytes));
    localStorage.setItem(PK_PASSPHRASE_KEY,b64);
    return b64;
  }catch(e){
    /* If localStorage is unavailable we cannot persist keys. */
    return null;
  }
}
function _getOrCreateSalt(){
  try{
    var existing=localStorage.getItem(PK_SALT_KEY);
    if(existing)return _b64ToBytes(existing);
    var bytes=new Uint8Array(16);
    crypto.getRandomValues(bytes);
    localStorage.setItem(PK_SALT_KEY,_bytesToB64(bytes));
    return bytes;
  }catch(e){return new Uint8Array(16)}
}
function _bytesToB64(bytes){
  var s="";
  for(var i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);
  return btoa(s);
}
function _b64ToBytes(b64){
  var bin=atob(b64);
  var out=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);
  return out;
}
async function _getCryptoKey(){
  if(_pkCryptoKeyPromise)return _pkCryptoKeyPromise;
  var pass=_getOrCreatePassphrase();
  if(!pass)return null;
  var salt=_getOrCreateSalt();
  var enc=new TextEncoder();
  _pkCryptoKeyPromise=crypto.subtle.importKey(
    "raw",enc.encode(pass),{name:"PBKDF2"},false,["deriveKey"]
  ).then(function(baseKey){
    return crypto.subtle.deriveKey(
      {name:"PBKDF2",salt:salt,iterations:PK_PBKDF2_ITERATIONS,hash:"SHA-256"},
      baseKey,
      {name:"AES-GCM",length:256},
      false,            /* non-extractable */
      ["encrypt","decrypt"]
    );
  }).catch(function(e){
    console.warn("[pk-cache] PBKDF2 derive failed:",e&&e.message);
    return null;
  });
  return _pkCryptoKeyPromise;
}

async function cacheProviderKeys(){
  var keys={};
  apiConfig.providers.forEach(function(p){
    if(p.key)keys[p.id]=p.key;
  });
  if(!Object.keys(keys).length){
    try{localStorage.removeItem(PK_CACHE_KEY)}catch(e){}
    return;
  }
  var cryptoKey=await _getCryptoKey();
  if(!cryptoKey){
    /* Fall back to plaintext (very old browsers, private mode
       disabling crypto, etc). Logged so a user with restricted
       crypto support knows their keys are at-rest in cleartext. */
    console.warn("[pk-cache] crypto unavailable; storing keys in plaintext");
    try{localStorage.setItem(PK_CACHE_KEY,JSON.stringify({v:1,keys:keys}))}catch(e){}
    return;
  }
  try{
    var iv=crypto.getRandomValues(new Uint8Array(12));
    var plaintext=enc.encode(JSON.stringify(keys));
    var ctBuf=await crypto.subtle.encrypt({name:"AES-GCM",iv:iv},cryptoKey,plaintext);
    var payload={v:2,salt:_bytesToB64(_getOrCreateSalt()),iv:_bytesToB64(iv),ct:_bytesToB64(new Uint8Array(ctBuf))};
    localStorage.setItem(PK_CACHE_KEY,JSON.stringify(payload));
  }catch(e){
    console.warn("[pk-cache] encrypt failed; falling back to plaintext:",e&&e.message);
    try{localStorage.setItem(PK_CACHE_KEY,JSON.stringify({v:1,keys:keys}))}catch(_){}
  }
}
async function loadCachedProviderKeys(){
  try{
    var raw=localStorage.getItem(PK_CACHE_KEY);
    if(!raw)return{};
    var obj=JSON.parse(raw);
    if(!obj)return{};
    if(obj.v===2){
      var cryptoKey=await _getCryptoKey();
      if(!cryptoKey)return{};
      try{
        var iv=_b64ToBytes(obj.iv);
        var ct=_b64ToBytes(obj.ct);
        var plainBuf=await crypto.subtle.decrypt({name:"AES-GCM",iv:iv},cryptoKey,ct);
        var decoded=new TextDecoder().decode(plainBuf);
        return JSON.parse(decoded);
      }catch(e){
        console.warn("[pk-cache] decrypt failed; key may have been rotated. Falling back to {}.");
        return{};
      }
    }
    if(obj.v===1&&obj.keys){
      /* Legacy plaintext — migrate on the fly, then wipe the
         plaintext entry. We re-encrypt via cacheProviderKeys()
         so subsequent loads use the encrypted path. */
      try{
        localStorage.removeItem(PK_CACHE_KEY);
      }catch(_){}
      cacheProviderKeys();
      return obj.keys;
    }
    return{};
  }catch(e){return{}}
}

/* Convenience: clear the cached key for a single provider. */
async function clearCachedProviderKey(id){
  var keys=await loadCachedProviderKeys();
  if(keys[id]){delete keys[id]}
  apiConfig.providers.forEach(function(p){
    if(p.id===id)p.key="";
  });
  await cacheProviderKeys();
}

/* ============================================================
   SHARE LINK — create / revoke / view shared sessions
   ============================================================ */
function toggleShareBtn(){
  var btn=document.getElementById("shareBtn");
  if(!btn)return;
  /* P_exam-history — exam sessions are shareable too. We only need a
   * currentSessionId and an authenticated user; the topic can be empty
   * for a freshly-created session. The state.topic check is kept
   * for chat sessions because those are the ones that need a topic
   * to be meaningful when shared. */
  var hasSess=CURRENT_USER&&state.currentSessionId;
  var inExam=!!state._examInView;
  var show=hasSess&&(inExam||!!state.topic);
  btn.classList.toggle("hidden",!show);
}
/* Chat-only top-bar controls (session name, API dot, search pill,
   model picker) live inside .top-bar which is always visible. They
   must show only when chat/tutor is on-screen. Call this with
   true/false whenever chatView is shown/hidden. */
function toggleChatTopBarEls(show){
  /* chatDomain is gone — topicBadge (set in index.html) is the only
     session indicator in the top-bar. We only need to toggle the
     chat/tutor controls (api dot, search pill, model picker). */
  var ids=["chatApiBadge","searchPill","chatModelWrap"];
  ids.forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.classList.toggle("hidden",!show);
  });
}
var _shareVisibility="public";
var _shareToken=null;  /* current share token for this session */
var _shareUrl="";

function openShareModal(){
  if(!CURRENT_USER||!state.currentSessionId)return;
  document.getElementById("shareOverlay").classList.remove("hidden");
  selectShareVis("public");
  /* Check if there's already a share link for this session. */
  apiFetch("/api/sessions/"+encodeURIComponent(state.currentSessionId)+"/share").then(function(r){
    if(r&&r.token){
      _shareToken=r.token;
      _shareVisibility=r.visibility||"public";
      _shareUrl=window.location.origin+"?share="+encodeURIComponent(r.token);
      selectShareVis(_shareVisibility);
      showShareLink(_shareUrl);
    }
  }).catch(function(){});
}

function closeShareModal(){
  document.getElementById("shareOverlay").classList.add("hidden");
}

function selectShareVis(vis){
  _shareVisibility=vis;
  document.getElementById("shareOptPublic").classList.toggle("selected",vis==="public");
  document.getElementById("shareOptPrivate").classList.toggle("selected",vis==="private");
}

async function createShareLink(){
  if(!CURRENT_USER||!state.currentSessionId)return;
  var btn=document.getElementById("shareCreateBtn");
  var errEl=document.getElementById("shareError");
  var statusEl=document.getElementById("shareStatus");
  errEl.classList.add("hidden");
  statusEl.classList.remove("hidden");
  statusEl.textContent="Creating link…";
  btn.disabled=true;
  try{
    var r=await apiFetch("/api/sessions/"+encodeURIComponent(state.currentSessionId)+"/share",{
      method:"POST",
      body:{visibility:_shareVisibility}
    });
    if(r&&r.token){
      _shareToken=r.token;
      _shareUrl=window.location.origin+"?share="+encodeURIComponent(r.token);
      showShareLink(_shareUrl);
      statusEl.classList.add("hidden");
    }else{
      throw new Error("no token returned");
    }
  }catch(e){
    errEl.textContent="Failed to create link: "+(e&&e.message||"unknown error");
    errEl.classList.remove("hidden");
    statusEl.classList.add("hidden");
  }
  btn.disabled=false;
}

function showShareLink(url){
  document.getElementById("shareCreateArea").classList.add("hidden");
  document.getElementById("shareLinkArea").classList.remove("hidden");
  document.getElementById("shareLinkInput").value=url;
  document.getElementById("shareRevokeArea").classList.remove("hidden");
}

function copyShareLink(){
  var inp=document.getElementById("shareLinkInput");
  var btn=document.getElementById("shareCopyBtn");
  inp.select();
  try{
    document.execCommand("copy");
    btn.textContent="Copied!";
    btn.classList.add("copied");
    setTimeout(function(){btn.textContent="Copy";btn.classList.remove("copied")},2000);
  }catch(e){}
}

async function revokeShareLink(){
  if(!CURRENT_USER||!state.currentSessionId||!_shareToken)return;
  var errEl=document.getElementById("shareError");
  errEl.classList.add("hidden");
  try{
    await apiFetch("/api/sessions/"+encodeURIComponent(state.currentSessionId)+"/share",{method:"DELETE"});
    _shareToken=null;
    _shareUrl="";
    document.getElementById("shareCreateArea").classList.remove("hidden");
    document.getElementById("shareLinkArea").classList.add("hidden");
    document.getElementById("shareRevokeArea").classList.add("hidden");
  }catch(e){
    errEl.textContent="Failed to revoke: "+(e&&e.message||"unknown error");
    errEl.classList.remove("hidden");
  }
}

/* Load a shared session for read-only viewing. Called on boot if
   ?share=TOKEN is in the URL, before auth flow. */
async function loadSharedSession(token){
  try{
    var r=await fetch("/api/shares/"+encodeURIComponent(token));
    if(!r.ok)throw new Error("HTTP "+r.status);
    var session=await r.json();
    if(!session)throw new Error("empty session");
    /* P_exam-share — a shared exam session carries kind='exam' and
     * the rendered examData payload. The chat-style message list is
     * empty for exams, so the message-renderer below would have
     * nothing to show. Render the exam in read-only mode instead
     * (a re-hydrated loadExamSession() with submission locked and
     * no save). */
    if(session.kind==="exam"&&session.examData){
      await loadSharedExamSession(session,token);
      return;
    }
    if(!session.messages)throw new Error("empty session");
    /* Render messages in read-only mode. */
    var msgList=document.getElementById("msgList");
    msgList.innerHTML="";
    // P-arch context-resume — mirror loaded messages into state.messages
    // so a follow-up chat turn can include the prior conversation in
    // its history payload. Shared sessions are read-only for replying
    // (the input bar is hidden further down), so this primarily
    // ensures the local copy and DOM stay in sync; if reply is later
    // enabled, the history will already be present.
    state.messages.length = 0;
    session.messages.forEach(function(m){
      var div=document.createElement("div");
      div.className="msg "+(m.role||"assistant");
      var body=document.createElement("div");
      body.className="msg-body";
      // Re-render from rawText for assistant messages so the latest
      // renderer is used (see loadSession comment for rationale).
      // User messages also go through formatMsg so legacy payloads
      // where rawText was the rendered HTML (e.g. "<p>...</p>") are
      // cleaned up by preprocessMarkdown instead of being displayed
      // as visible tag text.
      var _userRaw = m.rawText;
      if(m.role === "user" && _userRaw) {
        _userRaw = String(_userRaw).replace(/^\s*<p>\s*/i, "").replace(/\s*<\/p>\s*$/i, "").trim();
      }
      var renderHtml = "";
      if(_userRaw && m.role === "user") {
        renderHtml = formatMsg(_userRaw);
      } else if(m.role==="assistant" && m.rawText){
        renderHtml = formatMsg(m.rawText);
      } else if(m.html){
        renderHtml = m.html;
      } else {
        renderHtml = m.content||"";
      }
      body.innerHTML = renderHtml;
      var clientId = m.id || ("shared-"+generateId());
      div.dataset.clientId = clientId;
      state.messages.push({
        clientId: clientId,
        role: m.role,
        rawText: m.rawText || "",
        html: renderHtml,
        type: m.type || null,
        actions: null
      });
      div.appendChild(body);
      var sharedEntry = state.messages[state.messages.length - 1];
      var sharedToolbar = buildMessageToolbar({role: m.role || "assistant", entry: sharedEntry, readOnly: true});
      if(sharedToolbar) div.appendChild(sharedToolbar);
      msgList.appendChild(div);
    });
    /* Show read-only banner. */
    var banner=document.getElementById("sharedBanner");
    if(banner)banner.classList.remove("hidden");
    /* Hide input, show topic as readonly title. */
    var titleEl=document.getElementById("topicTitle");
    if(titleEl)titleEl.textContent=session.topic||"Shared conversation";
    document.getElementById("topicSetup").classList.add("hidden");
    document.getElementById("chatView").classList.remove("hidden");
    document.getElementById("chatInputBar").classList.add("hidden");
    document.getElementById("shareBtn").classList.add("hidden");
    /* Shared read-only mode — keep the session-name visible but hide the
       chat-only controls (model picker, search pill, api badge, share)
       because none of them apply in a read-only view. The session name
       is shown via topicBadge (the only session indicator left). */
    var badge=document.getElementById("topicBadge");
    var badgeText=document.getElementById("topicBadgeText");
    if(badge)badge.classList.remove("hidden");
    if(badgeText)badgeText.textContent=(session.topic||"Shared")+" · Read-only";
    var mid=document.getElementById("chatModelWrap");if(mid)mid.classList.add("hidden");
    var api=document.getElementById("chatApiBadge");if(api)api.classList.add("hidden");
    var sp=document.getElementById("searchPill");if(sp)sp.classList.add("hidden");
    /* Hide sidebar controls that don't apply. */
    var sidebar=document.getElementById("sidebar");
    if(sidebar)sidebar.classList.add("collapsed");
    sidebarOpen=false;
    syncSidebarBtns();
    document.getElementById("authGate").classList.add("hidden");
    document.getElementById("appShell").classList.remove("hidden");
    /* P0.6 — prevent the 12s pre-boot timeout from re-showing the
       auth gate (bootState is still "checking" at this point). */
    try{document.documentElement.dataset.bootState="app"}catch(_){}
    renderUserFooter();
  }catch(e){
    console.warn("[share] failed to load:",e&&e.message);
    document.getElementById("sharedBanner").classList.add("hidden");
    /* Show error in the setup area. */
    var titleEl=document.getElementById("topicTitle");
    if(titleEl)titleEl.textContent="Shared conversation not found";
    var subEl=document.getElementById("topicSub");
    if(subEl)subEl.textContent="The link may be expired or invalid.";
    /* Still flip bootState so the 12s timeout doesn't layer the
       auth gate on top of the "not found" message. */
    try{document.documentElement.dataset.bootState="app"}catch(_){}
  }
}

/* P_exam-share — render a shared exam session in read-only mode.
 * Mirrors loadExamSession() but locks submission and the per-answer
 * autosave (the viewer isn't signed in as the owner, so we must not
 * POST back to /api/sessions). A small "Read-only" pill is added in
 * the title area so the visitor knows they can't submit. */
async function loadSharedExamSession(session,token){
  state._examInView=true;
  state.examCancel=false;
  state.examReadOnly=true;
  state.examTopic=(session.examData&&session.examData.topic)||session.topic||"";
  state.examCount=(session.examData&&session.examData.count)||((session.examData&&session.examData.questions&&session.examData.questions.length)||0);
  state.examLang=(session.examData&&session.examData.lang)||"English";
  state.examDifficulty=(session.examData&&session.examData.difficulty)||"intermediate";
  state.examTypes=Array.isArray(session.examData&&session.examData.types)?session.examData.types:[];
  state.examQuestions=Array.isArray(session.examData&&session.examData.questions)?session.examData.questions.map(function(q,i){
    var c=Object.assign({},q);
    c._idx=i;
    return c;
  }):[];
  state.examAnswers=(session.examData&&session.examData.answers)||{};
  state.examSubmitted=!!(session.examData&&session.examData.submitted);
  /* Hide all other top-level views. */
  ["topicSetup","diagnosticView","chatView"].forEach(function(id){
    var el=document.getElementById(id);
    if(el)el.classList.add("hidden");
  });
  var ev=document.getElementById("examView");
  ev.classList.remove("hidden");
  var lang=state.examLang;
  var readOnlyLabel=lang==="Chinese"?"只读":"Read-only";
  _examTitle().textContent=state.examSubmitted?(state.examTopic+" — "+readOnlyLabel):(state.examTopic+" — "+readOnlyLabel);
  /* If the exam was already submitted on the owner's side, jump to
   * the results view. Otherwise show the questions with the answers
   * the owner gave (read-only — the input/buttons are disabled). */
  var body=_examBody();
  body.innerHTML='<div id="examQuestionsContainer"></div>';
  state.examQuestions.forEach(function(q,idx){
    var card=document.createElement("div");
    card.className="exam-q-card";
    card.id="examQ"+idx;
    card.setAttribute("data-idx",idx);
    body.querySelector("#examQuestionsContainer").appendChild(card);
    renderSharedQuestionCard(idx,q);
  });
  renderExamNav();
  if(state.examSubmitted){
    renderExamResults();
  }else{
    /* No submit in read-only mode — the visitor only sees the
     * questions and the owner's previously-given answers. */
    _examFooter().innerHTML='<div class="exam-readonly-pill">'+readOnlyLabel+'</div>';
  }
  /* Read-only banner. */
  var banner=document.getElementById("sharedBanner");
  if(banner)banner.classList.remove("hidden");
  /* Hide chrome that doesn't apply in a public read-only view. */
  var sb=document.getElementById("sidebar");
  if(sb)sb.classList.add("collapsed");
  sidebarOpen=false;
  syncSidebarBtns();
  document.getElementById("chatInputBar").classList.add("hidden");
  document.getElementById("shareBtn").classList.add("hidden");
  var badge=document.getElementById("topicBadge");
  var badgeText=document.getElementById("topicBadgeText");
  if(badge)badge.classList.remove("hidden");
  if(badgeText)badgeText.textContent=state.examTopic+" · "+readOnlyLabel;
  var mid=document.getElementById("chatModelWrap");if(mid)mid.classList.add("hidden");
  var api=document.getElementById("chatApiBadge");if(api)api.classList.add("hidden");
  var sp=document.getElementById("searchPill");if(sp)sp.classList.add("hidden");
  document.getElementById("authGate").classList.add("hidden");
  document.getElementById("appShell").classList.remove("hidden");
  try{document.documentElement.dataset.bootState="app"}catch(_){}
  renderUserFooter();
}

/* P_exam-share — render a single shared question card in read-only
 * mode. Buttons / inputs are `disabled` so the visitor can't change
 * the owner's answers. */
function renderSharedQuestionCard(idx,q){
  var ph=document.getElementById("examQ"+idx);
  if(!ph)return;
  var html='<div class="exam-q-num">Question '+(idx+1)+' of '+state.examCount+' <span class="exam-q-type">'+q.type+'</span></div>';
  html+='<div class="exam-q-text">'+formatMsg(q.q)+'</div>';
  var saved=state.examAnswers&&state.examAnswers[idx];
  if(q.type==="multiple-choice"&&q.opts){
    html+='<div class="exam-q-opts">';
    q.opts.forEach(function(o,oi){
      var isSel=(saved===oi);
      html+='<div class="exam-q-opt'+(isSel?" selected":"")+'">';
      html+='<span class="exam-q-opt-letter">'+o.letter+'</span>';
      html+='<span class="exam-q-opt-text">'+formatMsg(o.text)+'</span>';
      html+='</div>';
    });
    html+='</div>';
  }else if(q.type==="fill-blank"){
    var v=(typeof saved==="string")?saved:"";
    html+='<input class="exam-q-fill-input" value="'+esc(v)+'" readonly>';
  }else if(q.type==="short-answer"){
    var vv=(typeof saved==="string")?saved:"";
    html+='<textarea class="exam-q-fill-input" readonly rows="3" style="min-height:60px;resize:vertical">'+esc(vv)+'</textarea>';
  }
  ph.innerHTML=html;
}

async function refreshApiConfig(){
  console.log("[refreshApiConfig] ENTRY, CURRENT_USER=", CURRENT_USER && CURRENT_USER.email);
  if(!CURRENT_USER){
    console.log("[refreshApiConfig] EARLY RETURN: no CURRENT_USER");
    apiConfig={activeId:null,providers:[]};
    return apiConfig;
  }
  try{
    var existingKeys=await loadCachedProviderKeys();
    apiConfig.providers.forEach(function(p){
      if(p.key)existingKeys[p.id]=p.key;
    });
    var r=await apiFetch("/api/api-key");
    console.log("[refreshApiConfig] /api/api-key response:", r);
    var rows=Array.isArray(r&&r.providers)?r.providers:[];
    console.log("[refreshApiConfig] rows count:", rows.length, "rows:", rows.map(function(x){return{x:x&&x.label,y:x&&x.isActive,z:x&&x.hasKey?'Y':'N'}}));
    /* Filter out any stale Beagle providers that were registered server-side
       by a previous version of the code — the built-in BEAGLE_BUILT_IN
       constant handles Beagle now via the nginx reverse proxy. */
    rows=rows.filter(function(p){return p.label!==BEAGLE_BUILT_IN.label});
    apiConfig={activeId:null,providers:rows.map(function(p){
      return{id:p.id,isActive:p.isActive,isBuiltIn:p.isBuiltIn,label:p.label,url:p.url,model:p.model,hasKey:!!p.hasKey,key:existingKeys[p.id]||p.key||""};
    })};
    /* Merge the built-in Beagle provider (frontend-only, no server registration). */
    var hasBeagle=apiConfig.providers.some(function(p){return p.isBuiltIn||p.id==="beagle-built-in"});
    if(!hasBeagle){
      apiConfig.providers.push(Object.assign({},BEAGLE_BUILT_IN));
    }
    /* A provider is "usable" if it is a built-in (server has the key)
       or if it has a non-empty key in the local cache. Empty keys come
       from rows the user added but never finished configuring, or from
       stale rows whose plaintext key is no longer in localStorage. */
    function providerUsable(p){
      return !!(p && (p.isBuiltIn || p.hasKey || (p.key && p.key.length > 0)));
    }
    /* Cold-start: honour the user's persisted active provider first. The
       server's `isActive` flag is the source of truth for what the user
       chose via the model picker / Settings. If none is marked, fall back
       to the last provider they picked (kept in localStorage by
       setActiveProvider). NEVER auto-pick BEAGLE on cold start — the
       user must explicitly choose it via the model picker. */
    var userActive=apiConfig.providers.find(function(p){
      return p.isActive && providerUsable(p);
    });
    if(userActive){
      apiConfig.activeId=userActive.id;
    }else{
      var lastId=loadLastActiveId();
      var lastProvider=lastId?apiConfig.providers.find(function(p){
        return p.id===lastId && providerUsable(p);
      }):null;
      if(lastProvider){
        apiConfig.activeId=lastProvider.id;
      }else{
        /* First-time user with no prior pick. Default to the
           built-in Beagle so the chat always has a model selected
           out of the box (no unselected state in the UI). Only
           leave activeId null if the server doesn't expose a
           beagle key (self-hosted with no MINIMAX_API_KEY). */
        if(SERVER_HAS_BEAGLE_KEY){
          apiConfig.activeId=BEAGLE_BUILT_IN.id;
        }else{
          apiConfig.activeId=null;
        }
      }
    }
  }catch(e){
    console.warn("[api-key] refresh failed:",e.message);
    /* /api/api-key failed (cold-boot race, network blip). Don't
       auto-pick a fallback model — that would silently route the
       user's Tutor / chat through a provider they never chose.
       Leave activeId as-is; the user can still pick one in Settings. */
  }
  console.log("[refreshApiConfig] EXIT, providers.length=", apiConfig.providers.length, "activeId=", apiConfig.activeId, "list:", apiConfig.providers.map(function(p){return p.label;}));
  return apiConfig;
}

function getActiveProvider(){
  if(!apiConfig.activeId)return null;
  return apiConfig.providers.find(function(p){return p.id===apiConfig.activeId})||null;
}

/* P2.1 — return true when the active model is known to take 30+ s
   per call (reasoning models). The round-1 tool-detection path uses
   a longer ceiling for these so we don't accidentally skip them. */
function isReasoningProvider(){
  try{
    var p=getActiveProvider();
    if(!p)return false;
    var m=(p.model||"").toLowerCase();
    return /deepseek-r1|qwq|o1|o3|reasoner|thinking/.test(m);
  }catch(_){return false}
}

function hasUsableActive(){
  var p=getActiveProvider();
  /* The key itself lives on the server, so we just need to know there is
     a selected provider with a model. The server will reject the call if
     the key is missing. */
  return!!(p&&p.model);
}

/* ============================================================
   MISTAKE BOOK + ensureSessionShape
   ============================================================ */
function ensureSessionShape(s){
  if(!s)return s;
  if(!Array.isArray(s.kbNodes))s.kbNodes=[];
  s.kbNodes.forEach(function(n){
    if(typeof n.system_note!=="string")n.system_note="";
    if(typeof n.user_note!=="string")n.user_note="";
    if(typeof n.confidence_score!=="number")n.confidence_score=0;
    if(!Array.isArray(n.history))n.history=[];
  });
  if(!Array.isArray(s.mistakes))s.mistakes=[];
  return s;
}

/* ============================================================
   MODEL PICKER + WEB SEARCH TOGGLE
   ============================================================ */
function pickActiveProviderById(id){
  if(!id)return;
  setActiveProvider(id);
  closeModelPicker();
}
function toggleModelPicker(){
  var p=document.getElementById("modelPicker");
  if(!p)return;
  if(p.getAttribute("data-open")==="true")closeModelPicker();
  else openModelPicker();
}
function openModelPicker(){
  var p=document.getElementById("modelPicker");
  if(!p)return;
  p.setAttribute("data-open","true");
  var t=document.getElementById("modelPickerTrigger");
  if(t)t.setAttribute("aria-expanded","true");
}
function closeModelPicker(){
  var p=document.getElementById("modelPicker");
  if(!p)return;
  p.setAttribute("data-open","false");
  var t=document.getElementById("modelPickerTrigger");
  if(t)t.setAttribute("aria-expanded","false");
}
function syncModelPills(){
  /* Renamed conceptually to "model picker" but kept the old symbol name
     so existing call sites (renderProviderList, afterAuthEnter, etc.)
     keep working without churn. */
  var picker=document.getElementById("modelPicker");
  var label=document.getElementById("modelPickerLabel");
  var menu=document.getElementById("modelPickerMenu");
  var trigger=document.getElementById("modelPickerTrigger");
  if(!picker||!label||!menu||!trigger)return;
  var providers=apiConfig.providers||[];
  var active=providers.find(function(p){return p&&p.id===apiConfig.activeId});
  /* Update the trigger label. If there's a real provider, show its
     display name and apply the .has-model accent. */
  if(active){
    label.textContent=(active.label||active.model||"Model");
    /* Hide technical details for built-in providers. */
    label.title=active.isBuiltIn?"":((active.url||"")+" · "+(active.model||""));
    trigger.classList.add("has-model");
  }else{
    label.textContent=providers.length?"Pick a model":"Add a model";
    label.title="";
    trigger.classList.remove("has-model");
  }
  /* Build the dropdown menu. Built-in providers sort to the top. */
  var sorted=providers.slice().sort(function(a,b){
    if(a.isBuiltIn&&!b.isBuiltIn)return -1;
    if(!a.isBuiltIn&&b.isBuiltIn)return 1;
    return 0;
  });
  var html="";
  if(!providers.length){
    html='<div class="model-picker-empty">No models yet. Open Settings to add one.</div>';
  }else{
    sorted.forEach(function(p){
      var isActive=p&&p.id===apiConfig.activeId;
      var name=esc(p.label||p.model||"Model");
      /* Hide real model ID for built-in providers. */
      var sub=p.isBuiltIn?"":esc(p.model||"");
      var url=esc(p.url||"");
      var subLine=sub&&sub!==name?sub:(p.isBuiltIn?"":url);
      html+='<button type="button" class="model-picker-item'+(isActive?" active":"")+'" data-id="'+esc(p.id||"")+'" onclick="pickActiveProviderById(this.getAttribute(\'data-id\'))" role="option" aria-selected="'+isActive+'">';
      html+='<span class="model-picker-item-main"><span class="model-picker-item-name">'+name+'</span>';
      if(subLine)html+='<span class="model-picker-item-sub">'+subLine+'</span>';
      html+='</span>';
      html+='<svg class="model-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      html+='</button>';
    });
    html+='<div class="model-picker-divider"></div>';
  }
  html+='<button type="button" class="model-picker-add" onclick="closeModelPicker();openSettings()">';
  html+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  html+=providers.length?'Manage models…':'Add a model…';
  html+='</button>';
  menu.innerHTML=html;
  syncChatModel();
}
/* Click outside the picker closes the menu. */
document.addEventListener("click",function(e){
  var p=document.getElementById("modelPicker");
  if(!p)return;
  if(p.getAttribute("data-open")!=="true")return;
  if(!p.contains(e.target))closeModelPicker();
});
/* Esc closes the menu. */
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape")return;
  var p=document.getElementById("modelPicker");
  if(p&&p.getAttribute("data-open")==="true"){
    closeModelPicker();
    e.stopPropagation();
  }
});

/* ============================================================
   CHAT MODEL — display active model in chat header, switch mid-conversation
   ============================================================ */
function syncChatModel(){
  var label=document.getElementById("chatModelLabel");
  if(!label)return;
  var trigger=document.getElementById("chatModel");
  var p=getActiveProvider();
  /* Always show a model name. If somehow no provider is active
     (e.g. self-hosted with no beagle key and no user keys), fall
     back to the first available provider's label so the pill
     still reads as "selected" rather than "Add a model". */
  if(!p && (apiConfig.providers||[]).length){
    p=apiConfig.providers[0];
    apiConfig.activeId=p.id;
  }
  label.textContent=p?(p.label||p.model||"Model"):"Model";
  label.title=p&&!p.isBuiltIn?(p.model||""):"";
  if(trigger){
    if(p)trigger.classList.add("has-model");
    else trigger.classList.remove("has-model");
  }
}
function toggleChatModelMenu(){
  var wrap=document.getElementById("chatModelWrap");
  if(!wrap)return;
  if(wrap.getAttribute("data-open")==="true"){closeChatModelMenu();return}
  var menu=document.getElementById("chatModelMenu");
  if(!menu)return;
  wrap.setAttribute("data-open","true");
  var trigger=document.getElementById("chatModel");
  if(trigger)trigger.classList.add("menu-open");
  if(trigger)trigger.setAttribute("aria-expanded","true");
  /* Build the list */
  var providers=apiConfig.providers||[];
  var sorted=providers.slice().sort(function(a,b){
    if(a.isBuiltIn&&!b.isBuiltIn)return -1;
    if(!a.isBuiltIn&&b.isBuiltIn)return 1;
    return 0;
  });
  var html="";
  if(!providers.length){
    html='<div class="model-picker-empty">No models yet. Open Settings to add one.</div>';
  }else{
    sorted.forEach(function(p){
      var isActive=p&&p.id===apiConfig.activeId;
      var name=esc(p.label||p.model||"Model");
      var sub=p.isBuiltIn?"":esc(p.model||"");
      var url=esc(p.url||"");
      var subLine=sub&&sub!==name?sub:(p.isBuiltIn?"":url);
      html+='<button type="button" class="model-picker-item'+(isActive?" active":"")+'" data-id="'+esc(p.id||"")+'" onclick="pickChatModel(this.getAttribute(\'data-id\'))" role="option" aria-selected="'+isActive+'">';
      html+='<span class="model-picker-item-main"><span class="model-picker-item-name">'+name+'</span>';
      if(subLine)html+='<span class="model-picker-item-sub">'+subLine+'</span>';
      html+='</span>';
      html+='<svg class="model-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>';
      html+='</button>';
    });
    html+='<div class="model-picker-divider"></div>';
  }
  html+='<button type="button" class="model-picker-add" onclick="closeChatModelMenu();openSettings()">';
  html+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
  html+=providers.length?'Manage models…':'Add a model…';
  html+='</button>';
  menu.innerHTML=html;
  menu.classList.remove("hidden");
  /* Force visibility via inline style as a belt-and-suspenders measure. */
  menu.style.setProperty("display","block","important");
  menu.style.setProperty("opacity","1","important");
  menu.style.setProperty("visibility","visible","important");
}
function closeChatModelMenu(){
  var wrap=document.getElementById("chatModelWrap");
  if(wrap)wrap.setAttribute("data-open","false");
  var menu=document.getElementById("chatModelMenu");
  if(menu){
    menu.classList.add("hidden");
    menu.style.removeProperty("display");
    menu.style.removeProperty("opacity");
    menu.style.removeProperty("visibility");
  }
  var trigger=document.getElementById("chatModel");
  if(trigger)trigger.classList.remove("menu-open");
  if(trigger)trigger.setAttribute("aria-expanded","false");
}
function pickChatModel(id){
  if(!id)return;
  pickActiveProviderById(id);
  closeChatModelMenu();
  syncChatModel();
}
/* Click outside closes the menu. */
document.addEventListener("click",function(e){
  var wrap=document.getElementById("chatModelWrap");
  if(!wrap)return;
  if(wrap.getAttribute("data-open")!=="true")return;
  if(!wrap.contains(e.target))closeChatModelMenu();
});
/* Bind the chat model trigger via JS (not inline onclick) so it's not
   dependent on window-scoped function resolution in the built bundle. */
(function(){
  var btn=document.getElementById("chatModel");
  if(btn)btn.addEventListener("click",function(e){
    console.log("[chatModel] clicked",Date.now());
    /* Visual test: flash the button red so we know the click fired. */
    btn.style.transition="background 0.15s";
    btn.style.background="rgba(255,0,0,0.3)";
    setTimeout(function(){btn.style.background=""},300);
    try{
      toggleChatModelMenu();
      console.log("[chatModel] toggleChatModelMenu returned OK");
    }catch(x){
      console.error("[chatModel] ERROR:",x&&x.message||x);
    }
  });
})();

/* ============================================================
   EXTENSIONS PICKER - a multi-select dropdown that bundles the
   per-conversation toggles (Web search, Tutor mode, ...) into a
   single pill. Each item shows name + description + a checkbox
   that reflects current state. Clicking the trigger toggles
   the menu; clicking an item toggles that extension.
   ============================================================ */
var EXTENSIONS=[
  {key:"webSearch",   name:"Web search",
   on:webSearchOn, onChange:function(v){webSearchOn=v;try{localStorage.setItem("socrates-websearch",JSON.stringify(webSearchOn))}catch(e){} syncExtensionsUI();}},
  {key:"tutorMode",   name:"Tutor mode",
   on:appMode==="tutor", onChange:function(v){appMode=v?"tutor":"chat";try{localStorage.setItem("socrates-appmode",appMode)}catch(e){} syncAppModeUI(); syncSidebarForMode(); syncExtensionsUI();}},
  {key:"thinkingMode",name:"Show AI thinking",
   on:thinkingOn, onChange:function(v){thinkingOn=v;try{localStorage.setItem("socrates-thinking",JSON.stringify(thinkingOn))}catch(e){} syncExtensionsUI();}},
  {key:"exam",         name:"Generate exam",
   on:false, onChange:function(){openExamModal(); syncExtensionsUI();}},
];
function renderExtensionsMenu(){
  var menu=document.getElementById("extensionsMenu");
  if(!menu)return;
  var html="";
  EXTENSIONS.forEach(function(ext){
    html+='<button type="button" class="extensions-item'+(ext.on?" on":"")+'" data-ext="'+esc(ext.key)+'" role="option" aria-selected="'+!!ext.on+'">';
    html+='<span class="extensions-item-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>';
    html+='<span class="extensions-item-main">';
    html+='<span class="extensions-item-name">'+esc(ext.name)+'</span>';
    html+='</span>';
    html+='</button>';
  });
  menu.innerHTML=html;
}
function toggleExtensionByKey(key){
  var ext=EXTENSIONS.find(function(e){return e.key===key});
  if(!ext)return;
  ext.onChange(!ext.on);
}
/* Click delegation: the menu items have no inline onclick (the inline
   string broke once the script ran with mixed quote escaping); the listener
   below picks the data-ext attribute and routes to the same handler. */
(function bindExtensionsMenuClicks(){
  var menu=document.getElementById("extensionsMenu");
  if(!menu)return;
  menu.addEventListener("click",function(e){
    var btn=e.target.closest(".extensions-item");
    if(!btn)return;
    e.stopPropagation();  // P-arch: renderExtensionsMenu() rebuilds the
                          // menu HTML synchronously, which detaches the
                          // original button before the document-level
                          // "click outside the picker" handler runs.
                      // On a detached node, p.contains(target) is false,
                      // so the picker would close itself after every
                      // item click. Stop the bubble here so the
                      // document handler never sees the (about-to-be-
                      // detached) target.
    toggleExtensionByKey(btn.getAttribute("data-ext"));
  });
})();
function countActiveExtensions(){
  return EXTENSIONS.filter(function(e){return e.on}).length;
}
function syncExtensionsUI(){
  /* Keep EXTENSIONS state in sync with the live state vars, then refresh. */
  EXTENSIONS[0].on=webSearchOn;
  EXTENSIONS[1].on=(appMode==="tutor");
  EXTENSIONS[2].on=thinkingOn;
  renderExtensionsMenu();
  var trigger=document.getElementById("extensionsTrigger");
  var label=document.getElementById("extensionsLabel");
  var n=countActiveExtensions();
  if(trigger)trigger.classList.toggle("has-active",n>0);
  if(label)label.textContent=n>0?("Extensions ("+n+")"):"Extensions";
}
function toggleExtensionsPicker(){
  var p=document.getElementById("extensionsPicker");
  if(!p)return;
  if(p.getAttribute("data-open")==="true")closeExtensionsPicker();
  else openExtensionsPicker();
}
function openExtensionsPicker(){
  var p=document.getElementById("extensionsPicker");
  if(!p)return;
  p.setAttribute("data-open","true");
  var t=document.getElementById("extensionsTrigger");
  if(t)t.setAttribute("aria-expanded","true");
}
function closeExtensionsPicker(){
  var p=document.getElementById("extensionsPicker");
  if(!p)return;
  p.setAttribute("data-open","false");
  var t=document.getElementById("extensionsTrigger");
  if(t)t.setAttribute("aria-expanded","false");
}
document.addEventListener("click",function(e){
  var p=document.getElementById("extensionsPicker");
  if(!p)return;
  if(p.getAttribute("data-open")!=="true")return;
  if(!p.contains(e.target))closeExtensionsPicker();
});
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape")return;
  var p=document.getElementById("extensionsPicker");
  if(p&&p.getAttribute("data-open")==="true"){
    closeExtensionsPicker();
    e.stopPropagation();
  }
});

var webSearchOn=false;
try{webSearchOn=!!JSON.parse(localStorage.getItem("socrates-websearch")||"false")}catch(e){}
/* "Show AI thinking" toggle. When on, the model's reasoning (agent
   mode `thinking` SSE deltas, and `<think>…</think>` blocks in any
   streamed answer) is rendered with the same Markdown/LaTeX renderer
   as the final answer. When off, the reasoning is hidden and the
   system prompt instructs the model to suppress it. Persisted across
   sessions and can be flipped mid-conversation. */
var thinkingOn=true;
try{thinkingOn=JSON.parse(localStorage.getItem("socrates-thinking")||"true")!==false}catch(e){}
function toggleWebSearch(){
  webSearchOn=!webSearchOn;
  try{localStorage.setItem("socrates-websearch",JSON.stringify(webSearchOn))}catch(e){}
  syncWebSearchUI();
  if(!webSearchOn){
    /* Clear stale context so we don't keep injecting it when off. */
    state.searchContext="";
    state.searchContextAt=0;
    state.searchContextCount=0;
    state.searchContextError=null;
    state.searchContextQuery=null;
    setSearchPill("ok",0,"");
    var p=document.getElementById("searchPill");if(p)p.classList.add("hidden");
  }else if(state.topic){
    /* Toggled on mid-session — kick a foreground fetch right away so
       the very next AI turn ships with fresh context. */
    fetchWebContext(state.topic).then(function(r){
      /* no-op — fetchWebContext already updated state + pill */
    });
  }
}
function syncWebSearchUI(){
  /* Kept for compatibility - the Web-search toggle now lives
     inside the Extensions menu. Re-render that menu. */
  syncExtensionsUI();
  if(webSearchOn&&state.topic&&!state.searchContext){
    /* Session restored from server with web search on but no cache
       (e.g. opened from another device). */
    fetchWebContext(state.topic);
  }else if(!webSearchOn){
    var p=document.getElementById("searchPill");if(p)p.classList.add("hidden");
  }
}

/* ============================================================
   APP MODE — "tutor" (Socratic + KB + diagnostic) or "chat" (plain).
   Default "tutor" preserves the existing behavior. Per-session:
   switching mid-conversation saves the current session to Recents
   and resets the app, just like clicking "New" manually.
   ============================================================ */
var appMode="tutor";
try{
  var savedMode=localStorage.getItem("socrates-appmode");
  if(savedMode==="chat"||savedMode==="tutor")appMode=savedMode;
}catch(e){}
function syncAppModeUI(){
  /* The visible Tutor/Chat toggle now lives inside the Extensions menu;
     this function only updates the topic-setup hero copy and then
     re-renders the extensions menu so its checkmark state stays in sync. */
  var title=document.getElementById("topicTitle");
  var sub=document.getElementById("topicSub");
  var disc=document.getElementById("topicDisclaimer");
  if(appMode==="tutor"){
    if(title)title.textContent="What would you like to explore?";
    if(sub)sub.textContent="Describe what you want to learn. Socrates will ask you questions to help you think deeper about it.";
    if(disc)disc.textContent="Socrates asks questions to help you think. It does not judge your answers.";
  }else{
    if(title)title.textContent="What can I help you with?";
    if(sub)sub.textContent="Ask me anything. Plain conversation — no diagnostic, no lesson plan.";
    if(disc)disc.textContent="Chat mode is a plain conversation.";
  }
  /* v3.0 — long-term plan setup is only meaningful in Tutor mode
     (it drives the KB / plan-warning flow). In Chat mode we hide
     the whole block to keep the topic-setup screen uncluttered. */
  var planSetup=document.getElementById("planSetup");
  if(planSetup)planSetup.classList.toggle("hidden",appMode!=="tutor");
  /* Mirror the current mode onto <body data-app-mode> so the
     CSS rule `body[data-app-mode="chat"] .tutor-only{display:none}`
     can hide every Tutor-only element with one selector. The
     plan-setup form (above) keeps its own .hidden class for the
     brief moment before the dataset attribute lands. */
  try{document.body.dataset.appMode=appMode}catch(_){}
  if(typeof syncExtensionsUI==="function")syncExtensionsUI();
}
function syncSidebarForMode(){
  var isTutor=appMode==="tutor";
  var tk=document.getElementById("tabKnowledge");
  if(tk)tk.classList.toggle("hidden",!isTutor);
  var tm=document.getElementById("tabMistakes");
  if(tm)tm.classList.toggle("hidden",!isTutor);
  if(!isTutor)switchTab("recents");
}
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
  appMode=appMode==="tutor"?"chat":"tutor";
  try{localStorage.setItem("socrates-appmode",appMode)}catch(e){}
  syncAppModeUI();
  syncSidebarForMode();
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

/* Fetch web context for `topic`. Returns a structured result so the UI
   can show a "N sources" pill (or an error pill). The `state` fields
   are populated as a side effect so any prompt builder can read
   `state.searchContext` synchronously.

   Refresh strategy (set per the user):
   - First fetch: at session start (tutor mode) or at first chat turn (chat mode)
   - Re-fetch: every 5 user turns (counted by state.totalQ mod 5)
   - Old context is KEPT in state.searchContext until the new fetch
     resolves, so a slow refresh never causes a turn to ship without
     grounding. */
var SEARCH_REFRESH_EVERY=5;
var SEARCH_TIMEOUT_MS=12000;

async function fetchWebContext(topic,opts){
  opts=opts||{};
  /* Phase 3: optional onStep observer. Emits step events at every natural
     pipeline boundary so the UI (search-progress log) can render a
     streaming activity feed. Wrapped in try/catch so a UI bug never
     breaks the search itself. */
  function _emit(kind,data){
    try{if(typeof opts.onStep==="function")opts.onStep({kind:kind,data:data||{}})}catch(_){}
  }
  if(!webSearchOn||!topic)return{ok:false,reason:"disabled",results:0,context:""};
  if(opts.background){
    /* Background refresh — set the pill to "refreshing" but don't await.
       Also start a watchdog so the pill never stays on "Refreshing…"
       forever if the search hangs. */
    try{setSearchPill("loading",0,"Refreshing…")}catch(_){}
    var bgWd=setTimeout(function(){
      try{setSearchPill("err",0,"Search refresh timed out")}catch(_){}
    },SEARCH_TIMEOUT_MS+2000);
    var origPillOk=setSearchPill;
    /* No-op shim so subsequent successful setSearchPill clears the timer. */
    var _bgClearPillTimer=function(){
      try{clearTimeout(bgWd)}catch(_){}
    };
    /* Attach the clear to a one-shot wrapper on window so the existing
       setSearchPill calls inside this function will clear it. */
    window.__bgPillTimerClear=_bgClearPillTimer;
  }else{
    try{setSearchPill("loading",0,"Searching…")}catch(_){}
  }
  _emit("started",{topic:topic,background:!!opts.background});
  /* Offline precheck — fail fast in background too, so the pill
     resolves to an error state instead of hanging on "Refreshing…". */
  if(offlineGuard()){
    if(opts.background){try{window.__bgPillTimerClear&&window.__bgPillTimerClear()}catch(_){}}
    try{setSearchPill("err",0,"Offline")}catch(_){}
    return{ok:false,reason:"offline",results:0,context:opts.background?state.searchContext||"":""};
  }
  /* Collect search queries. If the rewriter returns good ones, we also
     always append the raw topic as a baseline — this guarantees at least
     one pass-through and often catches what the rewriter missed. */
  var queries=Array.isArray(opts.queries)?opts.queries.slice():[];
  if(!queries.length){
    var rewritten=await rewriteQueryForSearch(topic);
    if(rewritten&&rewritten.length)queries=rewritten.slice();
  }
  /* Always include the raw topic as a baseline query. It frequently
     catches things the rewriter over-engineered away. */
  if(queries.indexOf(topic)===-1)queries.push(topic);
  /* Cap to 6 for a good balance of breadth vs latency. */
  if(queries.length>6)queries=queries.slice(0,6);
  _emit("expanding",{queries:queries.slice(),count:queries.length});
  /* Always do at least one search; dedupe results by URL. */
  var ac=new AbortController();
  var tmo=setTimeout(function(){ac.abort("timeout")},SEARCH_TIMEOUT_MS);
  try{
    /* Run searches in parallel for both queries. */
    var searchResults=[];
    var seenUrls={};
    var searches=queries.map(function(q,idx){
      _emit("querying",{query:q,idx:idx,total:queries.length});
      return apiFetchRaw("/api/web-search",{
        method:"POST",
        body:{query:q,count:8},
        signal:ac.signal
      }).then(function(r){
        return r.json().then(function(d){return{ok:true,query:q,results:(d&&d.results)||[]}});
      }).catch(function(e){return{ok:false,status:e&&e.status,reason:e&&e.message,results:[]}});
    });
    var searchResps=await Promise.all(searches);
    for(var si=0;si<searchResps.length;si++){
      _emit("got_results",{query:searchResps[si].query,count:(searchResps[si].results||[]).length});
      var sr=searchResps[si];
      if(!sr.ok||!sr.results)continue;
      for(var ri=0;ri<sr.results.length;ri++){
        var item=sr.results[ri];
        if(!item||!item.url)continue;
        if(seenUrls[item.url])continue;
        seenUrls[item.url]=true;
        searchResults.push(Object.assign({matchedQuery:sr.query},item));
        if(searchResults.length>=25)break;
      }
      if(searchResults.length>=25)break;
    }
    clearTimeout(tmo);
    /* If every search failed AND we used the rewriter, retry once with
       the raw topic — sometimes the rewriter is too aggressive. */
    if(!searchResults.length&&queries[0]!==topic){
      _emit("retry",{reason:"all-failed",query:topic});
      try{
        var r2=await apiFetchRaw("/api/web-search",{
          method:"POST",
          body:{query:topic,count:8},
          signal:ac.signal
        });
        var d2=await r2.json();
        searchResults=(d2.results||[]).map(function(x){return Object.assign({matchedQuery:topic},x)});
        _emit("got_results",{query:topic,count:searchResults.length});
      }catch(_){}
    }
    if(!searchResults.length){
      /* All searches failed (network / 5xx / non-bing). Surface a
         soft error; the user still gets the previous context if any. */
      var firstErr=searchResps.find(function(x){return x&&!x.ok&&(x.status||x.reason)});
      var emsg=firstErr?(firstErr.status?"HTTP "+firstErr.status:(firstErr.reason||"failed")):"no results";
      console.warn("[web search] all queries failed:",emsg);
      state.searchContextError=emsg;
      _emit("error",{message:emsg,code:"no-results"});
      try{setSearchPill("err",0,"Search failed: "+emsg)}catch(_){}
      return{ok:false,reason:emsg,results:0,context:opts.background?state.searchContext||"":""};
    }
    var d={results:searchResults,query:queries.join(" | ")};
    clearTimeout(tmo);
    if(!d.results||!d.results.length){
      state.searchContextError=null;
      state.searchContext="";
      state.searchContextAt=Date.now();
      state.searchContextCount=0;
      state.searchResults=[];
      try{setSearchPill("ok",0,"No results")}catch(_){}
      return{ok:true,reason:"empty",results:0,context:""};
    }
    /* Step 2: webfetch the top 8 results to get the full article text.
       The model can quote, summarize, and reason about the actual page
       contents. Failed fetches fall back to the snippet we already have. */
    var topUrls=d.results.slice(0,8).map(function(x){return x.url});
    var fetched=[];
    if(topUrls.length){
      _emit("fetching",{urls:topUrls,count:topUrls.length});
      try{
        var fb=await apiFetchRaw("/api/fetch-batch",{
          method:"POST",
          body:{urls:topUrls},
          signal:ac.signal
        });
        var fd=await fb.json();
        fetched=fd.results||[];
        var okN=fetched.filter(function(x){return x&&x.ok}).length;
        _emit("fetched",{okCount:okN,total:topUrls.length});
      }catch(e){
        console.warn("[web fetch] batch failed:",e&&e.message,"status:",e&&e.status);
        _emit("fetched",{okCount:0,total:topUrls.length,error:e&&e.message});
      }
    }
    /* Merge: for each result, attach the fetched body if successful. */
    var byUrl={};
    fetched.forEach(function(f){if(f&&f.url)byUrl[f.url]=f});
    var enriched=d.results.map(function(x,i){
      var f=byUrl[x.url];
      return Object.assign({},x,{fullContent:f&&f.ok?f.content:null,truncated:f&&f.ok&&f.truncated});
    });
    var origEnriched=enriched.slice();  /* keep unfiltered copy for fallback */
    /* Relevance scoring: measure how well each result actually matches
       the user's topic. Uses multiple signals for better accuracy than
       simple keyword counting. Also handles cross-language matching:
       a Chinese topic should match Chinese results even if the query
       was in English. */
    var topicNorm=(topic||"").toLowerCase();
    var topicWords=topicNorm.split(/\W+/).filter(function(w){return w.length>2});
    var topicBigrams=[];
    for(var tb=0;tb<topicWords.length-1;tb++)topicBigrams.push(topicWords[tb]+" "+topicWords[tb+1]);
    enriched.forEach(function(x){
      var title=(x.title||"").toLowerCase();
      var snippet=(x.snippet||"").toLowerCase();
      var full=(x.fullContent||"").toLowerCase();
      var score=0;
      /* Signal 1: How many topic words appear in title (weighted high). */
      var titleMatch=0;
      for(var tw=0;tw<topicWords.length;tw++){
        if(title.indexOf(topicWords[tw])!==-1)titleMatch++;
      }
      score+=titleMatch*15;
      /* Signal 2: Exact phrase match in title (very strong signal). */
      for(var bg=0;bg<topicBigrams.length;bg++){
        if(title.indexOf(topicBigrams[bg])!==-1)score+=20;
      }
      /* Signal 3: Topic words in snippet. */
      var snippetMatch=0;
      for(var sw=0;sw<topicWords.length;sw++){
        if(snippet.indexOf(topicWords[sw])!==-1)snippetMatch++;
      }
      score+=snippetMatch*8;
      /* Signal 4: If we have full content, check deeper match. */
      if(full){
        var fullMatch=0;
        for(var fw=0;fw<topicWords.length;fw++){
          if(full.indexOf(topicWords[fw])!==-1)fullMatch++;
        }
        score+=fullMatch*5;
        for(var fbg=0;fbg<topicBigrams.length;fbg++){
          if(full.indexOf(topicBigrams[fbg])!==-1)score+=10;
        }
      }
      /* Normalize to 0-100 range. Max possible: len*15 + (len-1)*20 + len*8 + len*5 + (len-1)*10 */
      var maxScore=topicWords.length*28+(topicWords.length-1)*30;
      x._relevance=Math.round(Math.min(100,score/Math.max(1,maxScore)*100));
    });
    /* Phase 3: emit a summary of the relevance distribution. The UI uses
       this to render "Top match: 78% relevance" or similar. */
    {
      var dist=[0,0,0];  // b30, 30-69, 70+
      var topRel=0,sumRel=0,scoredN=enriched.length;
      for(var di=0;di<enriched.length;di++){
        var r=enriched[di]._relevance||0;
        sumRel+=r;
        if(r>topRel)topRel=r;
        if(r<30)dist[0]++;else if(r<70)dist[1]++;else dist[2]++;
      }
      _emit("scored",{avgRel:scoredN?Math.round(sumRel/scoredN):0,topRel:topRel,distribution:dist,count:scoredN});
    }
    /* Filter out low-quality results — don't just tag them, remove them.
       This prevents the model from wasting context on irrelevant pages. */
    var preFilterCount=enriched.length;
    enriched=enriched.filter(function(x){return x._relevance>=30});
    _emit("filtered",{keptCount:enriched.length,droppedCount:preFilterCount-enriched.length});
    /* If filtering gutted the list, keep at least the top 3 (they might
       still be useful even if weakly matched). */
    if(!enriched.length){
      /* All results were below threshold — keep best 3 as-is. */
      enriched=origEnriched.slice(0,3);
      enriched.forEach(function(x){x._relevance=Math.max(x._relevance||0,25)});
    }
    /* Sort by relevance descending so the most on-point results appear
       first in the context block the model sees. */
    enriched.sort(function(a,b){return b._relevance-a._relevance});
    /* Build the [Web research] block. Each entry has a snippet (always
       present) and optionally a "Full text:" excerpt (when fetch
       succeeded). The model uses whichever it needs. Include the
       matched query and relevance hint per result. */
    var lines=enriched.map(function(x,i){
      var relTag=x._relevance>=70?"[high relevance]":x._relevance>=45?"[medium relevance]":"[low relevance]";
      var head="["+(i+1)+"] "+relTag+" "+x.title;
      if(x.snippet)head+=" — "+x.snippet;
      head+=" ( "+x.url+" )";
      head+="\n    Source query: \""+(x.matchedQuery||topic)+"\"";
      if(x.fullContent){
        var trimmed=(x.fullContent.length>3000)?x.fullContent.slice(0,3000)+"…":x.fullContent;
        head+="\n    Full text: "+trimmed;
      }else{
        head+="\n    (snippet only — full text unavailable)";
      }
      return head;
    });
    var ctx="\n\n[Web research] — original query: \""+topic+"\". "+
      "Each result below was retrieved live from the web, scored for relevance, and sorted by estimated accuracy. "+
      "[high relevance] results closely match what the user is asking about. [medium relevance] are related but may be tangential. "+
      "[low relevance] results are included only as supplementary context — use them cautiously.\n\n"+
      "If you use a fact from these results, you MUST cite it inline as [1], [2], etc. "+
      "Do NOT invent facts not supported by the results. "+
      "If multiple results contradict each other, prefer [high relevance] sources.\n"+
      lines.join("\n");
    state.searchContext=ctx;
    state.searchContextAt=Date.now();
    state.searchContextCount=enriched.length;
    state.searchContextError=null;
    state.searchContextQuery=topic;
    state.searchResults=enriched;   /* [{title,url,snippet,fullContent?,truncated?}] */
    var fetchedCount=enriched.filter(function(x){return!!x.fullContent}).length;
    /* Phase 3: emit per-source engine breakdown so the UI can render
       "Wikipedia ×2, arXiv ×1, Bing ×3" in the summary. */
    {
      var engineCounts={};
      for(var ei=0;ei<enriched.length;ei++){
        var s=enriched[ei].source||"web";
        engineCounts[s]=(engineCounts[s]||0)+1;
      }
      _emit("done",{finalCount:enriched.length,fetchedCount:fetchedCount,engines:engineCounts});
    }
    console.log("[web search]",enriched.length,"results ("+fetchedCount+" fetched) for:",topic);
    try{setSearchPill("ok",enriched.length,enriched.length+" sources"+(fetchedCount?" · "+fetchedCount+" full":""))}catch(_){}
    return{ok:true,reason:"ok",results:enriched.length,context:ctx,sources:enriched};
  }catch(e){
    clearTimeout(tmo);
    var emsg=(e&&e.message)||String(e);
    console.warn("[web search] failed:",emsg);
    state.searchContextError=emsg;
    _emit("error",{message:emsg,code:"exception"});
    try{setSearchPill("err",0,"Search: "+emsg)}catch(_){}
    /* Keep the previous context so a transient failure doesn't drop
       grounding from the next turn. */
    return{ok:false,reason:emsg,results:0,context:opts.background?state.searchContext||"":""};
  }
}

/* ──────────────────────────────────────────────────────────────────────
   Phase 3 — AI-driven search-quality judge + re-search loop
   ──────────────────────────────────────────────────────────────────────
   `judgeSearchQuality` makes a tiny, fast, non-streaming LLM call to
   score the round-1 result set on a 0–5 scale. If score < 3, it
   returns a rewritten query the caller can use for round 2.

   `webSearchWithRetry` is a thin wrapper around fetchWebContext that
   runs round 1, judges it, and (if needed) runs round 2 with the
   rewrite. Round cap = 2. Events from both rounds are forwarded to
   `opts.onStep` so the search-progress log can render the full
   activity timeline.

   Latency budget: round 1 (≤10 s) + judge (≤4 s) + round 2 (≤8 s)
   = 22 s worst case. The caller is expected to race this against
   the main answer stream to keep first-token latency low. */

/* Build a compact results digest (first 5 sources, snippet only) for
 * the judge prompt. The judge doesn't need fullContent — only the
 * title + snippet + source, so we keep the prompt small. */
function _buildJudgeDigest(sources){
  if(!Array.isArray(sources))return"[]";
  var top=(sources.slice(0,5)).map(function(s){
    return{
      title:(s.title||"").slice(0,200),
      url:s.url||"",
      snippet:(s.snippet||"").slice(0,300),
      source:s.source||"web"
    };
  });
  try{return JSON.stringify(top)}catch(_){return"[]"}
}

/* Judge the result set via a small non-streaming LLM call. Returns
 * {score: 0..5, rewrite: string}. Failure of the call is treated as
 * score=3 (don't retry). 4 s ceiling via AbortController. */
async function judgeSearchQuality(sources, topic, opts){
  opts=opts||{};
  if(!Array.isArray(sources)||!sources.length)return{score:0,rewrite:""};
  if(!hasUsableActive||!hasUsableActive())return{score:3,rewrite:""};
  var digest=_buildJudgeDigest(sources);
  var promptText=
    "You are a search-quality judge. Given the user's TOPIC and a list of search results, return strict JSON only:\n"+
    "{ \"score\": <0-5 integer>, \"rewrite\": \"<better search query, or empty if score>=3>\" }\n\n"+
    "Score 0 if results are all irrelevant or wrong language. Score 5 if top 3 results directly answer the topic. "+
    "Score 3 if results are tangential but usable. Below 3, provide a sharper rewrite in the same language.\n\n"+
    "TOPIC: "+(topic||"").slice(0,500)+"\n\n"+
    "RESULTS: "+digest;
  var msgs=[
    {role:"system",content:"You are a strict JSON-output search-quality judge. Output JSON only, no prose, no markdown fences."},
    {role:"user",content:promptText}
  ];
  var judgeCtl=new AbortController();
  var timer=setTimeout(function(){try{judgeCtl.abort("judge-ceiling")}catch(_){}},4000);
  try{
    var raw=await callAPI(msgs,80);
    clearTimeout(timer);
    if(!raw)return{score:3,rewrite:""};
    /* callAPI may return a string (the LLM's reply content) or an
     * object with {content} or {text} depending on the provider. */
    var text="";
    if(typeof raw==="string")text=raw;
    else if(raw&&typeof raw==="object"){
      if(typeof raw.content==="string")text=raw.content;
      else if(typeof raw.text==="string")text=raw.text;
      else if(Array.isArray(raw.choices)&&raw.choices[0]&&raw.choices[0].message){
        text=String(raw.choices[0].message.content||"");
      }
    }
    text=(text||"").trim();
    /* Strip code fences if the model wrapped the JSON. */
    text=text.replace(/^```(?:json)?\s*/i,"").replace(/```\s*$/i,"").trim();
    var parsed=null;
    try{parsed=JSON.parse(text)}catch(_){
      /* Try to extract the first {...} block from the text. */
      var m=text.match(/\{[\s\S]*\}/);
      if(m)try{parsed=JSON.parse(m[0])}catch(_){parsed=null}
    }
    if(!parsed||typeof parsed!=="object")return{score:3,rewrite:""};
    var scoreN=parseInt(parsed.score,10);
    if(isNaN(scoreN))scoreN=3;
    scoreN=Math.max(0,Math.min(5,scoreN));
    return{score:scoreN,rewrite:(typeof parsed.rewrite==="string")?parsed.rewrite:""};
  }catch(e){
    clearTimeout(timer);
    /* Treat judge failures as "good enough" (don't retry). */
    return{score:3,rewrite:""};
  }
}

/* Wrap fetchWebContext with a judge + 1-retry loop. Round cap = 2.
 *
 * Forwards every onStep event from both rounds to opts.onStep. After
 * round 1, calls judgeSearchQuality. If score < 3 AND we haven't
 * already retried, calls fetchWebContext again with the rewritten
 * query. Returns the same shape as fetchWebContext ({ok, reason,
 * results, context, sources}); prefers round-2 results if a retry
 * succeeded.
 *
 * opts:
 *   onStep   — optional step observer (forwards events from both rounds)
 *   signal   — optional AbortSignal (cancels both rounds)
 *   ceilingMs — hard cap on the whole loop (default 12000)
 */
async function webSearchWithRetry(topic, opts){
  opts=opts||{};
  var onStep=opts.onStep;
  function _emit(kind,data){
    try{if(typeof onStep==="function")onStep({kind:kind,data:data||{}})}catch(_){}
  }
  _emit("started",{topic:topic});
  /* Round 1 */
  var res=await fetchWebContext(topic,{
    signal:opts.signal,
    onStep:function(ev){_emit(ev.kind,ev.data)}
  });
  if(!res||!res.ok||!res.sources||!res.sources.length){
    return res||{ok:false,reason:"empty",results:0,context:""};
  }
  /* Judge */
  var verdict=await judgeSearchQuality(res.sources,topic,opts);
  _emit("scored",{avgRel:0,topRel:0,distribution:[0,0,0],judgeScore:verdict.score});
  if(verdict.score>=3||!verdict.rewrite||verdict.rewrite===topic){
    _emit("good",{score:verdict.score});
    return res;
  }
  /* Round 2 */
  _emit("retry_low",{score:verdict.score,rewrite:verdict.rewrite});
  var res2=await fetchWebContext(verdict.rewrite,{
    signal:opts.signal,
    onStep:function(ev){_emit(ev.kind,ev.data)}
  });
  if(res2&&res2.ok&&res2.sources&&res2.sources.length){
    _emit("retry_rewrote",{q:verdict.rewrite,n:res2.sources.length});
    return res2;
  }
  _emit("retry_still_bad",{score:verdict.score});
  /* Round 2 failed too — fall back to round-1 results. */
  return res;
}

/* Heuristic: returns true if the user's text seems to refer to a
   website but we couldn't pull a usable URL out of it. We look for
   words like "网站"、"网址"、"网页"、"site"、"homepage", or for
   "看看/visit/check/打开" near a domain-shaped word. Conservative
   enough to avoid false positives in pure conceptual Q&A. */
function looksLikeUserMentionedSite(text){
  if(!text)return false;
  if(/网站|网址|网页|主页|站点|官网|链接|URL|url/i.test(text))return true;
  if(/\b(visit|open|check|go to|browse|look at|see|read|fetch)\b/i.test(text)
     && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text))return true;
  /* "看看 xxx" / "看一下 xxx" / "了解下 xxx" style — but only if there's
     a domain-shaped token in the sentence. */
  if(/(看看|看一下|了解下|了解|查阅|访问|打开|浏览|读一读|读一下)/.test(text)
     && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(text))return true;
  return false;
}

/* Extract URLs from a free-form text. Returns at most 3 URLs, deduped,
   in first-seen order. Strips trailing punctuation that commonly rides
   in (Chinese full-width parens, periods, commas).

   Two flavors of "URL" are accepted:
     1. Anything that already starts with http:// or https://
     2. Bare domains like example.com, www.foo.bar, sub.example.co.uk
        and the same followed by an obvious path. We prepend https://.

   Conservative rules: we only auto-promote a bare domain if it contains
   at least one dot and the TLD looks plausible (≥ 2 alpha chars). This
   avoids grabbing every word like "github" in prose. */
function extractHttpUrls(text){
  if(!text)return[];
  var seen=Object.create(null);
  var out=[];

  function add(u){
    if(!u)return;
    /* Strip common trailing punctuation. */
    u=u.replace(/[.,;:!?\]）】」』\)]+$/,"");
    /* Drop anchor-only fragments the user didn't intend to send. */
    if(!u||u==="#")return;
    if(seen[u])return;
    seen[u]=1;
    out.push(u);
  }

  /* (1) http(s)://... */
  var re1=/https?:\/\/[^\s一-鿿　-〿＀-￯"'<>)\]】」』]+/gi;
  var m;
  while((m=re1.exec(text))!==null){
    add(m[0]);
    if(out.length>=3)break;
  }
  if(out.length>=3)return out;

  /* (2) Bare domains / domain+path. We anchor on a word boundary,
     require at least one dot, and only accept character classes that
     are valid in a URL host or path. We allow an optional path/query
     so things like "example.com/about" or "news.ycombinator.com/item?id=1"
     are picked up. */
  /* Known file extensions we should NOT treat as TLDs when the user
     wrote something like "report.pdf" or "image.png" — those are
     filenames, not URLs. We still allow the same token if the user
     wrote "www." or included a "/" path. */
  var FILE_EXTS=("pdf doc docx xls xlsx ppt pptx zip rar 7z tar gz "+
    "jpg jpeg png gif webp svg mp3 mp4 mov avi mkv exe dmg iso "+
    "txt md rtf csv json xml html htm").split(" ");
  var re2=/(?:^|[^\w一-鿿＠@])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s一-鿿　-〿＀-￯"'<>)\]】」』]*)?)/gi;
  while((m=re2.exec(text))!==null){
    var d=m[1];
    if(!d)continue;
    if(d.indexOf(".")===-1)continue;
    /* TLD is the part after the LAST dot in the host portion only.
       The host stops at the first "/" so "example.com/about" reads
       the TLD as "com", not the path's last segment. */
    var host=d.split("/")[0];
    var lastDot=host.lastIndexOf(".");
    var tld=host.slice(lastDot+1);
    if(!/^[a-z]{2,}$/i.test(tld))continue;
    if(/^\d+(\.\d+)+$/.test(d))continue;
    /* Reject filename-style matches: "report.pdf" — no path AND no
       "www." AND the last segment is a known file extension. If the
       user actually wants a URL ending in .pdf, they'll paste the
       full https:// form, which the first regex already handles. */
    var hasPath=d.indexOf("/")!==-1;
    var hasWww=/^www\./i.test(d);
    if(!hasPath&&!hasWww){
      var t=tld.toLowerCase();
      var isFile=false;
      for(var fi=0;fi<FILE_EXTS.length;fi++){if(FILE_EXTS[fi]===t){isFile=true;break}}
      if(isFile)continue;
    }
    add("https://"+d);
    if(out.length>=3)break;
  }
  return out;
}

/* Fetch up to 3 pages in parallel and format them as [Referenced page]
   blocks. Returns {blocks, results} so the caller can also render
   link-preview cards in the user bubble. Failures degrade to a small
   error line per page so the assistant can still acknowledge the link
   in its answer. */
async function fetchPagesForContext(urls){
  if(!Array.isArray(urls)||!urls.length)return{blocks:[],results:[]};
  try{
    var r=await apiFetch("/api/fetch-batch",{method:"POST",body:{urls:urls}});
    var results=(r&&r.results)||[];
    var blocks=[];
    for(var i=0;i<urls.length;i++){
      var u=urls[i];
      var f=results[i];
      if(f&&f.ok&&f.content){
        blocks.push(
          "[Referenced page] "+u+"\n"+
          (f.title?"Title: "+f.title+"\n":"")+
          (f.truncated?"(truncated excerpt)\n":"")+
          f.content
        );
      }else{
        var reason=(f&&f.reason)||"fetch failed";
        blocks.push("[Referenced page] "+u+"\n(could not retrieve: "+reason+")");
      }
    }
    return{blocks:blocks,results:results};
  }catch(e){
    var emsg=(e&&e.message)||String(e);
    var blocks=urls.map(function(u){return"[Referenced page] "+u+"\n(could not retrieve: "+emsg+")"});
    var results=urls.map(function(){return{ok:false,reason:emsg}});
    return{blocks:blocks,results:results};
  }
}

/* When the user references a website but we couldn't extract a URL,
   drop a small "paste the full URL" hint card in the bubble so they
   know to include the https:// prefix on the next turn. */
function renderNoUrlHint(targetEl){
  if(!targetEl)return;
  var card=document.createElement("div");
  card.className="link-card err no-url-hint";
  card.innerHTML=
    '<div class="link-card-head">'+
      '<div class="link-card-host"><svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9q-.13 0-.25.031A2 2 0 0 1 7 10.5H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4 4 0 0 1-.82 1H12a3 3 0 1 0 0-6z"/></svg> No URL detected</div>'+
      '<div class="link-card-status err">awaiting full link</div>'+
    '</div>'+
    '<div class="link-card-excerpt">'+
      'You mentioned a site but the URL is missing or not in a form I can fetch. '+
      'On your next turn, paste the full address including the <code>https://</code> prefix '+
      '(e.g. <code>https://www.topodrive.top/pricing</code>) and I\'ll read it for you.'+
    '</div>';
  var wrap=document.createElement("div");
  wrap.className="link-previews";
  wrap.appendChild(card);
  targetEl.appendChild(wrap);
}

/* Render compact link-preview cards inside the user's bubble, one per
   URL. Each card shows: domain, title (or url fallback), a 1-2 line
   excerpt, and a status badge. On failure the card flips to a red
   "could not read" state with the reason. */
function renderLinkPreviews(targetEl,urls,results){
  if(!targetEl||!Array.isArray(urls)||!urls.length)return;
  var wrap=document.createElement("div");
  wrap.className="link-previews";
  for(var i=0;i<urls.length;i++){
    var u=urls[i];
    var f=(results&&results[i])||null;
    var card=document.createElement("div");
    card.className="link-card "+(f&&f.ok?"ok":"err");
    var host="";
    try{host=new URL(u).hostname.replace(/^www\./,"")}catch(_){host=u}
    var title=(f&&f.title)||u;
    var excerpt=f&&f.content?(f.content.length>220?f.content.slice(0,217)+"…":f.content):"";
    var statusHtml;
    if(f&&f.ok){
      var meta=f.truncated?"excerpt · "+f.chars+" chars":"full · "+f.chars+" chars";
      statusHtml='<div class="link-card-status">'+esc(meta)+'</div>';
    }else{
      var reason=(f&&f.reason)||"fetch failed";
      statusHtml='<div class="link-card-status err"><svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/></svg> '+esc(reason)+'</div>';
    }
    card.innerHTML=
      '<div class="link-card-head">'+
        '<div class="link-card-host"><svg class="icon-inline" viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M6.354 5.5H4a3 3 0 0 0 0 6h3a3 3 0 0 0 2.83-4H9q-.13 0-.25.031A2 2 0 0 1 7 10.5H4a2 2 0 1 1 0-4h1.535c.218-.376.495-.714.82-1z"/><path d="M9 5.5a3 3 0 0 0-2.83 4h1.098A2 2 0 0 1 9 6.5h3a2 2 0 1 1 0 4h-1.535a4 4 0 0 1-.82 1H12a3 3 0 1 0 0-6z"/></svg> '+esc(host)+'</div>'+
        statusHtml+
      '</div>'+
      '<a class="link-card-title" href="'+esc(u)+'" target="_blank" rel="noopener noreferrer">'+esc(title)+'</a>'+
      (excerpt?'<div class="link-card-excerpt">'+esc(excerpt)+'</div>':'');
    wrap.appendChild(card);
  }
  targetEl.appendChild(wrap);
}


/* Pick a useful search query for Chat mode. We don't have a
   session-wide topic here, so the user's current message is the most
   relevant signal. If it's too short, prepend the session topic. */
function extractChatQuery(){
  /* Walk the last few user messages, take the most recent non-trivial
     one, fall back to the session topic. */
  var rec=state.currentSessionId?loadLocalMemory(state.currentSessionId):null;
  if(rec&&rec.messages){
    for(var i=rec.messages.length-1;i>=0;i--){
      var m=rec.messages[i];
      if(m.role==="user"&&m.content&&m.content.trim().length>=4){
        var q=m.content.trim().slice(0,200);
        if(state.topic&&q.length<20){q=state.topic+" — "+q}
        return q;
      }
    }
  }
  return state.topic||"";
}

/* Use the configured LLM to turn the user's natural-language text
   into 1-2 short, search-engine-friendly queries. This is the
   "let AI do the query" part of the user's request. We:
     1) Send a tiny prompt asking for a JSON array of queries.
     2) Use the first query for the search; if a second exists, also
        search it (and dedupe results).
   Falls back to the raw text if the model is unavailable or doesn't
   return valid JSON. Cached per user text via a Map. */
var _rewriterCache=new Map();
var REWRITER_TIMEOUT_MS=10000;

async function rewriteQueryForSearch(rawText){
  if(!rawText||!hasUsableActive())return null;
  var cached=_rewriterCache.get(rawText);
  if(cached)return cached;
  var prompt="You are a precise search query generator. Given the user's message, generate "+
    "search queries that will return EXACTLY the information the user is looking for. "+
    "Accuracy is critical — prefer EXACT PHRASE matches and UNIQUE technical terms over generic keywords. "+
    "Rules:\n"+
    "- Each query MUST contain the CORE named entities and key terms from the user's message\n"+
    "- Use exact phrase matching: put specific multi-word terms in quotes when they form a unit\n"+
    "- Queries must be 4-12 words, precise not generic\n"+
    "- Avoid filler words, pronouns, and vague terms\n"+
    "- Generate 5 queries, each targeting a slightly different facet so at least 2-3 return useful results\n"+
    "Output ONLY a JSON array of strings, no other text. "+
    "Example for user asking about migrating from TensorFlow to PyTorch performance:\n"+
    "[\"TensorFlow to PyTorch migration performance comparison\", "+
    "\"PyTorch vs TensorFlow benchmark 2025\", "+
    "\"migrate TensorFlow model PyTorch tutorial step by step\", "+
    "\"PyTorch performance tips production deployment\", "+
    "\"PyTorch vs JAX speed benchmark 2025\"]";
  var msgs=[
    {role:"system",content:prompt},
    {role:"user",content:rawText.slice(0,500)}
  ];
  var ac=new AbortController();
  var tmo=setTimeout(function(){ac.abort()},REWRITER_TIMEOUT_MS);
  try{
    var r=await apiFetch("/api/chat",{method:"POST",body:{messages:msgs,temperature:0.3,max_tokens:250},signal:ac.signal});
    clearTimeout(tmo);
    if(!r||!r.choices||!r.choices[0]||!r.choices[0].message)return null;
    var txt=r.choices[0].message.content||"";
    /* Extract the first JSON array. Be tolerant of stray prose. */
    var m=txt.match(/\[[\s\S]*?\]/);
    if(!m)return null;
    var arr;
    try{arr=JSON.parse(m[0])}catch(_){return null}
    if(!Array.isArray(arr)||!arr.length)return null;
    var cleaned=arr.filter(function(x){return typeof x==="string"&&x.trim()}).map(function(x){return x.trim()});
    if(!cleaned.length)return null;
    /* Cap cache to 64 entries to avoid unbounded growth. */
    if(_rewriterCache.size>64){_rewriterCache.clear()}
    _rewriterCache.set(rawText,cleaned);
    return cleaned;
  }catch(e){
    clearTimeout(tmo);
    console.warn("[rewriter] failed:",e&&e.message);
    return null;
  }
}

/* Generate a declarative session title based on the user's first input.
   Called fire-and-forget on first save; retries once if the API call
   fails so a transient network glitch doesn't leave the session untitled.
   Uses state.topic (the user's initial topic) as context. */
var _titleGenQueued=false;
function generateSessionTitle(){
  if(!hasUsableActive()||_titleGenQueued||state.sessionTitle)return;
  var topic=(state.topic||"").replace(/<think>[\s\S]*?<\/think>/gi,"").replace(/<think>[\s\S]*$/gi,"").trim();
  if(!topic)return;
  _titleGenQueued=true;
  var prompt="Based on the user's first message below, generate a SHORT "+
    "declarative title (3-8 words) in a statement tone that names what the "+
    "session is about. Examples: \"Exploring quantum computing\", "+
    "\"Understanding machine learning basics\", \"Writing better essays\". "+
    "Do NOT use a question or a label — it must read as a statement. "+
    "Output ONLY the title, no quotes, no extra text.\n\n"+topic.slice(0,300);
  /* System instruction forbids thinking for this short task. Some
   * models still emit a <think>…</think> block anyway, so we
   * also defensively strip think blocks and chat-template tokens
   * from the response below before using it as the title. */
  var sysMsg={role:"system",content:"Do NOT output <think>...</think> blocks, internal reasoning, or chain-of-thought. Reply directly with the final title in clean prose. No preamble."};
  var userMsg={role:"user",content:prompt};
  var msgs2=[sysMsg,userMsg];
  /* Always go through the server proxy — Beagle is registered server-side. */
  apiFetch("/api/chat",{method:"POST",body:{messages:msgs2,temperature:0.3,max_tokens:30}}).then(function(r){
    _titleGenQueued=false;
    if(!r||!r.choices||!r.choices[0]||!r.choices[0].message)return;
    var raw=(r.choices[0].message.content||"");
    /* Mirror the strips formatMsg() / stripChatArtifacts() apply to
     * chat output, plus a few extra guards for title-gen quirks:
     *  - closed <think>…</think> and unclosed trailing <think>…$
     *  - chat-template tokens (<|im_start|>, <s>, [INST], etc.)
     *  - any leading punctuation the model added (quotes, dashes,
     *    bullets) that would look ugly in a sidebar title. */
    var title=raw
      .replace(/<think>[\s\S]*?<\/think>/gi,"")
      .replace(/<think>[\s\S]*$/gi,"")
      .replace(/<\|im_start\|>[\s\S]*?<\|im_end\|>/g,"")
      .replace(/<\|[a-z_]+\|>/gi,"")
      .replace(/<\/?s>/g,"")
      .replace(/\[INST\]|\[\/INST\]|<<SYS>>|<<\/SYS>>/g,"")
      .replace(/^\s*Title\s*[:\-]\s*/i,"")
      .trim()
      .replace(/^["']+|["']+$/g,"")
      .replace(/^[\s\-•·—:]+/,"")
      .slice(0,60);
    if(title&&title.length>2){state.sessionTitle=title;saveCurrentSession()}
  }).catch(function(e){
    _titleGenQueued=false;
    console.warn("[title gen] failed:",e&&e.message);
  });
}

/* Returns true if we should kick off a background re-fetch. Called
   from every prompt builder. The rule: every 5 user turns we refresh,
   unless we just refreshed within the last 30s. */
function shouldRefreshSearch(){
  if(!webSearchOn)return false;
  var last=state.searchContextAt||0;
  if(Date.now()-last<30000)return false;
  if(!state.searchContextQuery)return false;
  return (state.totalQ%SEARCH_REFRESH_EVERY)===0;
}

/* Update the small pill in the chat header. `count=0` for loading/err. */
function setSearchPill(kind,count,label){
  var p=document.getElementById("searchPill");
  if(!p)return;
  if(!webSearchOn){p.classList.add("hidden");return}
  p.classList.remove("hidden");
  p.className="search-pill "+kind;
  p.textContent="Web search: "+(label||(count>0?(count+" sources"):""));
  p.title=kind==="ok"?"Latest web search results":kind==="err"?"Search failed":"";
  /* Background refresh installs a watchdog timer that flips the pill
     to "Search refresh timed out" if the refresh hangs. Any successful
     (or any error) pill update from inside the refresh clears that
     timer so we don't end up overwriting the real result with a fake
     timeout error. */
  try{if(typeof window.__bgPillTimerClear==="function"){window.__bgPillTimerClear();window.__bgPillTimerClear=null}}catch(_){}
}

/* Build a collapsible "Sources" card listing the URLs the model had
   access to. The card is appended to the assistant bubble so the user
   can trace any cited fact back to its source. Stored under the bubble
   in DOM (not on state) so each turn gets its own snapshot.

   Input:  Array<{title:string,url:string,snippet?:string}>
   Output: HTMLElement | null
   The first <details> element is OPEN by default for the first source
   (so the user can immediately see what URLs are involved) and the
   rest are CLOSED. We expand the whole list on a single click of the
   header toggle. */
function renderSourcesCard(results){
  if(!Array.isArray(results)||!results.length)return null;
  var wrap=document.createElement("div");
  wrap.className="sources-card";
  var first=results[0];
  var rest=results.slice(1);
  /* Header is a clickable label. When rest > 0 it shows a chevron and
     toggles the .open class on the wrap, which expands the hidden list. */
  var html="";
  html+='<div class="sources-head" onclick="this.parentElement.classList.toggle(\'open\')">';
  html+='<span class="sources-icon">↗</span>';
  html+='<span class="sources-label">Sources</span>';
  html+='<span class="sources-count">'+results.length+'</span>';
  if(rest.length)html+='<span class="sources-chev">▾</span>';
  html+='</div>';
  /* Primary source — always visible. */
  html+=renderSourceRow(first,1);
  /* Hidden list — toggled by .open on wrap. */
  if(rest.length){
    html+='<div class="sources-rest">';
    for(var i=0;i<rest.length;i++){html+=renderSourceRow(rest[i],i+2)}
    html+='</div>';
  }
  wrap.innerHTML=html;
  return wrap;
}

function renderSourceRow(s,idx){
  if(!s||!s.url)return"";
  /* Trust nothing from the search response — escape + enforce http(s). */
  var url=String(s.url);
  if(url.indexOf("http://")!==0&&url.indexOf("https://")!==0){
    return '<div class="sources-row" data-bad-url="1"><span class="sources-num">['+idx+']</span><span class="sources-title">'+(s.title||"(no title)")+'</span><span class="sources-bad">non-http url</span></div>';
  }
  var title=esc(s.title||url);
  var host="";
  try{host=new URL(url).hostname.replace(/^www\./,"")}catch(_){host=""}
  return '<a class="sources-row" href="'+esc(url)+'" target="_blank" rel="noopener noreferrer">'+
    '<span class="sources-num">['+idx+']</span>'+
    '<span class="sources-title">'+title+'</span>'+
    '<span class="sources-host">'+esc(host)+'</span>'+
  '</a>';
}

/* Initial UI sync (after DOM ready) */
syncModelPills();
syncWebSearchUI();
syncExtensionsUI();
syncAppModeUI();
syncSidebarForMode();

function openSettings(){
  document.getElementById("settingsOverlay").classList.remove("hidden");
  renderProviderList();
  syncSettingsUI();
  /* Clear any leftover status from a previous save — both content and class. */
  var stgEl=document.getElementById("stgStatus");
  stgEl.innerHTML="";
  stgEl.className="settings-status";
}
function closeSettings(){
  document.getElementById("settingsOverlay").classList.add("hidden");
}
function toggleAPI(){
  /* Reserved for future — current code always uses the active provider if it has key+model. */
  syncSettingsUI();
}
function syncSettingsUI(){
  var track=document.getElementById("stgToggleTrack");
  if(!track)return;
  if(hasUsableActive())track.classList.add("on");else track.classList.remove("on");
}
function renderProviderList(){
  var cont=document.getElementById("providerList");
  if(!cont)return;
  var userProviders=apiConfig.providers.filter(function(p){return !p.isBuiltIn});
  if(!userProviders.length){
    cont.innerHTML='<div class="provider-empty">No models yet. Click "+ Add" to configure your first one.</div>';
    return;
  }
  var html="";
  userProviders.forEach(function(p){
    var isActive=p.id===apiConfig.activeId;
    html+='<div class="provider-row'+(isActive?" active":"")+'" data-id="'+esc(p.id||"")+'">';
    html+='<button class="provider-active-btn" onclick="setActiveProvider(\''+esc(p.id||"")+'\')" title="'+(isActive?"Active model":"Set as active")+'">'+(isActive?"●":"○")+'</button>';
    html+='<div class="provider-fields">';
    html+='<input class="settings-input" name="providerLabel" aria-label="Provider label" placeholder="Label (e.g. GPT-5.5)" value="'+esc(p.label||"")+'" oninput="updateProviderField(\''+esc(p.id||"")+'\',\'label\',this.value)">';
    html+='<input class="settings-input" name="providerUrl" aria-label="Provider base URL" placeholder="Base URL  (https://api.openai.com/v1)" value="'+esc(p.url||"")+'" oninput="updateProviderField(\''+esc(p.id||"")+'\',\'url\',this.value)">';
    /* The server list endpoint never returns the API key (it stays
       encrypted on the server). For existing saved providers, show a
       masked placeholder so the user knows a key is configured. */
    var displayKey=p.key;
    if(!displayKey&&p.id.indexOf("new-")!==0)displayKey="••••••••";
    html+='<form style="display:contents" onsubmit="return false"><input type="text" name="username" autocomplete="username" style="display:none" aria-hidden="true"><input class="settings-input" name="providerKey" aria-label="Provider API key" type="password" autocomplete="new-password" placeholder="API key" value="'+esc(displayKey)+'" oninput="updateProviderField(\''+esc(p.id||"")+'\',\'key\',this.value)"></form>';
    html+='<input class="settings-input" name="providerModel" aria-label="Provider model ID" placeholder="Model id  (e.g. gpt-5.5, claude-opus-4-8, sonnet-4-6)" value="'+esc(p.model||"")+'" oninput="updateProviderField(\''+esc(p.id||"")+'\',\'model\',this.value)">';
    html+='</div>';
    html+='<button class="provider-del" onclick="removeProvider(\''+esc(p.id||"")+'\')" title="Remove">×</button>';
    html+='</div>';
  });
  cont.innerHTML=html;
}
/* Tier-based API key limits, mirroring server/src/routes/apiKeys.js */
var TIER_KEY_LIMITS={diophantus:2,riemann:10,descartes:50,euclid:999};

function addProvider(){
  /* Enforce tier-based API key limit before inserting a new row. */
  var tier=CURRENT_USER&&CURRENT_USER.tier||"diophantus";
  var maxKeys=TIER_KEY_LIMITS[tier]||TIER_KEY_LIMITS.diophantus;
  var existingNonBuiltin=apiConfig.providers.filter(function(p){return !p.isBuiltIn});
  var existingSaved=existingNonBuiltin.filter(function(p){return p.id.indexOf("new-")!==0});
  if(existingSaved.length>=maxKeys){
    var status=document.getElementById("stgStatus");
    if(status){
      status.className="settings-status warn";
      status.textContent="API key limit reached for "+tier+" plan ("+maxKeys+" keys). Upgrade your plan to add more.";
    }
    return;
  }
  /* Insert a placeholder row locally so the user can fill in the form,
     then commit to the server on Save. The placeholder carries the
     fields label / url / model + a temporary key the user types. */
  var p={
    id:"new-"+Date.now().toString(36),
    label:"New Model",
    url:"https://api.openai.com/v1",
    key:"",
    model:"",
    isPending:true
  };
  apiConfig.providers.push(p);
  if(!apiConfig.activeId)apiConfig.activeId=p.id;
  renderProviderList();
  syncModelPills();
  syncSettingsUI();
}
function removeProvider(id){
  if(!CURRENT_USER)return;
  /* Prevent removing the built-in Beagle provider. */
  var target=apiConfig.providers.find(function(p){return p.id===id});
  if(!target||target.isBuiltIn)return;
  /* If this row was never saved server-side, just drop it from memory. */
  if(id.indexOf("new-")===0){
    apiConfig.providers=apiConfig.providers.filter(function(p){return p.id!==id});
    if(apiConfig.activeId===id)apiConfig.activeId=apiConfig.providers.length?apiConfig.providers[0].id:null;
    cacheProviderKeys();renderProviderList();syncModelPills();syncSettingsUI();
    return;
  }
  apiFetch("/api/api-key/"+encodeURIComponent(id),{method:"DELETE"}).then(function(){
    apiConfig.providers=apiConfig.providers.filter(function(p){return p.id!==id});
    if(apiConfig.activeId===id)apiConfig.activeId=apiConfig.providers.length?apiConfig.providers[0].id:null;
    cacheProviderKeys();renderProviderList();syncModelPills();syncSettingsUI();
  }).catch(function(e){console.warn("[api-key] delete failed:",e.message)});
}
function setActiveProvider(id){
  if(!CURRENT_USER)return;
  var target=apiConfig.providers.find(function(p){return p.id===id});
  if(!target)return;
  /* Save the choice locally FIRST so it survives a page reload even
     if the server PATCH hasn't completed yet. */
  apiConfig.activeId=id;
  saveLastActiveId(id);
  if(target.isBuiltIn){
    /* Built-in provider: update isActive flags, no server roundtrip. */
    apiConfig.providers.forEach(function(p){p.isActive=(p.id===id)});
    renderProviderList();syncModelPills();syncSettingsUI();
    return;
  }
  apiFetch("/api/api-key/"+encodeURIComponent(id),{method:"PATCH",body:{isActive:true}}).then(function(){
    apiConfig.providers.forEach(function(p){p.isActive=(p.id===id)});
    renderProviderList();syncModelPills();syncSettingsUI();
  }).catch(function(e){console.warn("[api-key] set active failed:",e.message)});
}

/* Remember the last provider the user picked across page reloads.
   The server's `isActive` flag is the authoritative source, but if
   the server hasn't marked any provider (e.g. a brand-new install
   or a row whose key never finished saving) this local fallback
   keeps the user's last choice instead of switching to BEAGLE. */
var LAST_ACTIVE_ID_KEY="socrates-last-active-id";
function saveLastActiveId(id){
  if(!id)return;
  try{localStorage.setItem(LAST_ACTIVE_ID_KEY,id);console.log("[last-active] saved via localStorage:",id)}catch(e){
    console.warn("[last-active] localStorage save failed, trying cookie:",e&&e.message);
    try{document.cookie=LAST_ACTIVE_ID_KEY+"="+encodeURIComponent(id)+";path=/;max-age=31536000"}catch(_){}
  }
}
function loadLastActiveId(){
  try{var v=localStorage.getItem(LAST_ACTIVE_ID_KEY);if(v)return v}catch(_){}
  /* Fallback: try cookie (works in Chrome incognito / strict partitioning). */
  try{
    var m=document.cookie.match(new RegExp("(?:^|; )"+LAST_ACTIVE_ID_KEY+"=([^;]*)"));
    if(m)return decodeURIComponent(m[1]);
  }catch(_){}
  return null;
}
function updateProviderField(id,field,value){
  var p=apiConfig.providers.find(function(x){return x.id===id});
  if(!p)return;
  p[field]=value;
  if(field==="label"||field==="model")syncModelPills();
  if(field==="key"||field==="model")syncSettingsUI();
}
function saveSettings(){
  var status=document.getElementById("stgStatus");
  if(!CURRENT_USER){
    status.className="settings-status warn";
    status.textContent="Please sign in to save API keys.";
    return;
  }
  status.className="settings-status";
  status.textContent="Saving…";
  (async function(){
    try{
      /* Drop any duplicate "new-..." placeholder rows. A duplicate is a
         second+ row whose (label, url, model) tuple already exists among
         earlier rows. This prevents a stray extra "+ Add" click from
         creating a duplicate server row on Save. */
      var seen={};
      var deduped=[];
      apiConfig.providers.forEach(function(p){
        var key=(p.label||"")+"|"+(p.url||"")+"|"+(p.model||"");
        if(seen[key])return;
        seen[key]=true;
        deduped.push(p);
      });
      apiConfig.providers=deduped;

      /* Drop entirely empty new rows (user clicked "+ Add" but never
         filled in model / key). These would fail validation with a
         confusing "missing URL or model" message. */
      apiConfig.providers=apiConfig.providers.filter(function(p){
        return !(p.id.indexOf("new-")===0 && !p.model && !p.key);
      });

      /* Validate every row. */
      for(var i=0;i<apiConfig.providers.length;i++){
        var p=apiConfig.providers[i];
        if(!p.model||!p.url){
          status.className="settings-status warn";
          status.textContent="Row #"+(i+1)+" is missing URL or model. Fix it and try again.";
          return;
        }
        if(p.id.indexOf("new-")===0 && !p.key){
          status.className="settings-status warn";
          status.textContent="New row #"+(i+1)+" needs an API key.";
          return;
        }
      }
      for(var j=0;j<apiConfig.providers.length;j++){
        var p=apiConfig.providers[j];
        /* Skip built-in providers (Beagle) — they are not stored server-side. */
        if(p.isBuiltIn)continue;
        if(p.id.indexOf("new-")===0){
          var body={label:p.label||p.model,url:p.url,model:p.model,key:p.key||""};
          var r=await apiFetch("/api/api-key",{method:"POST",body:body});
          p.id=r.id;p.isActive=true;
        }else{
          var patch={label:p.label||p.model,url:p.url,model:p.model};
          if(p.key){patch.key=p.key}
          await apiFetch("/api/api-key/"+encodeURIComponent(p.id),{method:"PATCH",body:patch});
        }
      }
      /* After saving, cache all keys to localStorage so they survive
         page refreshes. The server does not return keys, so this is the
         only way to keep them between sessions without re-entering. */
      cacheProviderKeys();
      /* Refresh from server and mark the most-recently-saved one as active. */
      var savedIds=apiConfig.providers.filter(function(p){return p.id.indexOf("new-")!==0}).map(function(p){return p.id});
      await refreshApiConfig();
      var lastSaved=savedIds[savedIds.length-1];
      if(lastSaved){
        apiConfig.providers.forEach(function(p){p.isActive=(p.id===lastSaved)});
        apiConfig.activeId=lastSaved;
        /* Persist the activation to the server. Without this, the next page
           load finds no row marked active and the UI silently falls back to
           mock even though the key exists. Fire-and-forget; UI already shows
           the new active state. */
        try{await apiFetch("/api/api-key/"+encodeURIComponent(lastSaved),{method:"PATCH",body:{isActive:true}})}catch(_){}
      }
      renderProviderList();syncModelPills();syncSettingsUI();
      var active=getActiveProvider();
      if(active&&active.model){
        status.className="settings-status ok";
        status.textContent="Saved. Active: "+(active.label||active.model)+".";
      }else if(apiConfig.providers.length){
        status.className="settings-status warn";
        status.textContent="Saved. Active provider is missing model — using mock engine as fallback.";
      }else{
        status.className="settings-status warn";
        status.textContent="No models configured — using mock engine.";
      }
      setTimeout(function(){closeSettings()},900);
    }catch(e){
      console.error("[saveSettings] error:",e,"stack:",e&&e.stack);
      status.className="settings-status warn";
      status.textContent="Save failed: "+((e&&e.message)||String(e)||"unknown error");
    }
  })();
}
function clearSettings(){
  if(!CURRENT_USER)return;
  /* Delete all server-side providers one by one. */
  (async function(){
    /* Same loop-shape fix as confirmClearSettings: skip built-in providers
       and isolate each delete so a single failure doesn't strand the rest. */
    for(var i=0;i<apiConfig.providers.length;i++){
      var p=apiConfig.providers[i];
      if(p.isBuiltIn||p.id==="beagle-built-in")continue;
      if(p.id.indexOf("new-")!==0){
        try{
          await apiFetch("/api/api-key/"+encodeURIComponent(p.id),{method:"DELETE"});
        }catch(e){console.warn("[api-key] clear: delete "+p.id+" failed:",e.message)}
      }
    }
    apiConfig={activeId:null,providers:[]};
    /* Re-add the built-in Beagle provider after clearing, but do NOT
       auto-activate it — the user just wiped their settings, so leaving
       them with a model picker that says "Pick a model" is the honest
       state. Same reason as refreshApiConfig. */
    apiConfig.providers.push(Object.assign({},BEAGLE_BUILT_IN));
    try{localStorage.removeItem("socrates-provider-keys")}catch(e){}
    try{localStorage.removeItem(LAST_ACTIVE_ID_KEY)}catch(e){}
    renderProviderList();syncModelPills();syncSettingsUI();
    var status=document.getElementById("stgStatus");
    status.className="settings-status ok";
    status.textContent="Cleared. Built-in Beagle A is still available — pick a model to start.";
  })();
}

/* ============================================================
   API CALL (replaces mock when enabled)
   ============================================================ */

/* ============================================================
   SYSTEM CONTEXT — real-time date, estimated user location
   ============================================================ */
var _geoInfo={country:"",region:"",city:"",tz:""};
var _geoFetched=false;
var _userMemories=[];   /* cached memories injected into system context */

/* Fetch the user's saved memories from the server so getSystemContext
   can inject them as long-term context. Memories are cached globally
   and refreshed at most once per minute. */
function loadUserMemories(){
  if(!CURRENT_USER)return;
  try{
    apiFetch("/api/memory",{_authEndpoint:true}).then(function(r){
      if(r&&Array.isArray(r))_userMemories=r.filter(function(m){return m.enabled!==false}).map(function(m){return m.text});
    }).catch(function(){});
  }catch(_){}
}

/* Fetch user location from a free IP geolocation service. Cached
   in memory (and localStorage) so we don't hit the API every page load. */
function fetchGeoInfo(){
  if(_geoFetched)return;
  _geoFetched=true;
  try{
    var cached=localStorage.getItem("socrates-geo");
    if(cached){_geoInfo=JSON.parse(cached);return}
  }catch(_){}
  try{_geoInfo.tz=Intl.DateTimeFormat().resolvedOptions().timeZone||""}catch(_){}
  fetch("https://ip-api.com/json/?fields=country,regionName,city,timezone",{mode:"cors"}).then(function(r){
    if(!r.ok)return;
    return r.json().then(function(d){
      if(!d)return;
      _geoInfo.country=d.country||"";
      _geoInfo.region=d.regionName||"";
      _geoInfo.city=d.city||"";
      _geoInfo.tz=d.timezone||_geoInfo.tz;
      try{localStorage.setItem("socrates-geo",JSON.stringify(_geoInfo))}catch(_){}
    });
  }).catch(function(){});
}

/* Build the dynamic system context block — date, location, etc.
   Called fresh every time so the date is always current. */
function getSystemContext(){
  try{
    var ctx="";
    var now=new Date();
    var dateStr=now.toLocaleDateString("en-US",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    var timeStr=now.toLocaleTimeString("en-US",{hour:"2-digit",minute:"2-digit"});
    ctx+="Today is "+dateStr+". Local time: "+timeStr;
    if(_geoInfo.tz)ctx+=" ("+_geoInfo.tz+")";
    ctx+=".";
    if(_geoInfo.city&&_geoInfo.country){
      ctx+=" Estimated user location: "+_geoInfo.city;
      if(_geoInfo.region&&_geoInfo.region!==_geoInfo.city)ctx+=", "+_geoInfo.region;
      ctx+=", "+_geoInfo.country+".";
    }else if(_geoInfo.country){
      ctx+=" Estimated user location: "+_geoInfo.country+".";
    }
    ctx+="\n\nUse the date and location above to give contextually appropriate answers (e.g. current events, local relevance, timezone-aware time references). If a question asks about something time-sensitive, factor in today's date.";
    ctx+="\n\n## Canvas tool\n\nFor any visual answer (chart, diagram, animation, simulation, comparison), output the visualization directly as a Canvas card.\n\n"+
      "Use a single ```html ... ``` fence containing a self-contained HTML/CSS/JS snippet. The system renders it inside a sandboxed iframe; the user sees a Canvas card, not source code.\n\n"+
      "**When to use it — be proactive.** A visual is better than text when:\n"+
      "- You draw a chart, plot, graph, diagram, animation, comparison, timeline, or flow\n"+
      "- The answer involves structure, layout, or relationships that benefit from being seen\n"+
      "- You would otherwise need 5+ lines to describe a visual pattern\n"+
      "- You want to illustrate a concept with an interactive or animated example\n\n"+
      "**Structure:**\n"+
      "1. Fence: ```html (only). NOT ```viz, NOT ```javascript, NOT ```chart.\n"+
      "2. Content: inner HTML only. No <!DOCTYPE>, <html>, <head>, or <body>.\n"+
      "3. All CSS and JS must be inline. No external CDN, no <link>, no fetch.\n"+
      "4. Theme: define colors in CSS and use `prefers-color-scheme: dark` to override.\n"+
      "5. Use plain ES5 JS (var, function) for sandbox compatibility.\n"+
       "6. Keep it minimal: no extra fonts, no shadows, no decorative chrome.\n"+
       "7. Do NOT use emoji anywhere in the snippet — not in text, labels, titles, or as chart elements. Use text or shapes instead.\n"+
       "8. The ```html block IS the answer. No prose, no explanation, no other ``` fences, no markdown headings inside the snippet.\n\n"+
      "**Minimal example:**\n"+
      "```html\n"+
      "<style>body{font:14px sans-serif;padding:12px;color:#333;background:#fff}"+
      "@media(prefers-color-scheme:dark){body{color:#eee;background:#1c1d22}}"+
      ".bar{display:inline-block;width:30px;margin:0 4px;background:#4a9eff;border-radius:3px 3px 0 0;vertical-align:bottom}</style>\n"+
      "<h3>Sample</h3>\n<div id='root'><\/div>\n<script>\n"+
      "var data=[30,80,45,60];\n"+
      "var root=document.getElementById('root');\n"+
      "for(var i=0;i<data.length;i++){var b=document.createElement('div');b.className='bar';b.style.height=data[i]+'px';b.textContent=data[i];root.appendChild(b)}\n"+
      "<\/script>\n```"; }catch(_){return "";}
}

/* ============================================================
   SYSTEM PROMPTS
   ============================================================ */
/* Chat mode: plain assistant. No quiz/example/practice scaffolding,
   no Socratic questioning, no knowledge-graph awareness. Used when
   the user picks "Chat mode" on the topic-setup screen. */

var CHAT_SYSTEM_PROMPT = `You are a helpful, knowledgeable assistant having a natural conversation with the user. Answer directly and conversationally.

Write like a real person talking to another person. Avoid the telltale patterns that make text sound like it came from an AI: don't use bullet points or numbered lists unless the user specifically asks for one, don't use em dashes, don't start sentences with "Here are...", "There are...", "In summary...", or "It's important to note...". Don't structure your answer as "First... Second... Finally...". Just write in flowing paragraphs with varied sentence length. Use contractions. Be concise. If you only need a sentence or two, that's fine.

Use Markdown only when it genuinely helps, like code blocks or the occasional heading. For math, use $...$ inline and $$...$$ for display. The renderer uses KaTeX so stick to lowercase LaTeX commands and use \\begin{aligned} inside $$ for multi-line equations instead of \\begin{align}. For diagrams, use mermaid.

Keep responses proportionate to the question. Read the conversation history and don't repeat yourself. Match the user's language.

You have access to a web_search tool for real-time information. Only use it when the user explicitly asks you to search, when the topic is time-sensitive and your knowledge might be stale, when you need multiple sources you can't reliably synthesize, or when you genuinely don't know. Don't search for conceptual questions, coding help, general knowledge, casual chat, or when the user already provided the info.

When the user shares a URL, the system has already fetched it and prepended a [Referenced page] block. Use that as your source. Cite inline with [1], [2] matching the order of referenced pages. At the end, list sources in the format: [1] Title — URL.

To search, output exactly this JSON on its own line and nothing else:
{"tool":"web_search","query":"<short keyword query, max 8 words>"}

No preamble before the JSON. One search per turn.

Do NOT use emojis in your responses. Web search results may contain emojis in titles or snippets — never reproduce or mimic them. Write in plain prose.`;

/* Tutor mode: the long textbook-style Socratic prompt. */
var SOCRATIC_SYSTEM_PROMPT = "You are Socrates, a rigorous textbook author and patient tutor. Your explanations must read like a chapter from a first-rate textbook in the student's own language — **systematic, logically progressive, precise in language, and thorough in foundation-building**. Every topic should be presented as part of a coherent knowledge system, not as isolated facts. Your teaching proceeds in a natural flow — Motivate → Define → Develop → Illustrate → Exercise — but you do NOT follow a fixed heading template; adapt the structure to the content.\n\n## LANGUAGE RULE — match the student's language\n\nDetect the language the student is using. If the student's topic, question, or conversation is in Chinese, respond entirely in Chinese using the same textbook rigor and structure described below. If the student writes in English, respond in English. If the student writes in another language, respond in that language. Never switch language mid-explanation, and never mix languages in your output. All pedagogical components — definitions, worked examples, practice problems, quizzes, flashcards — must be in the same language as the exposition.\n\nThe core requirement is that the student receives a first-rate textbook-quality explanation **in their own language**, adapted to that language's academic register. For Chinese, this means using formal written Chinese (书面语), proper technical terminology, and a rigorous textbook cadence appropriate to Chinese academic writing.\n\n---\n## CORE PRINCIPLES — how to think like a textbook author\n\n**1. Coherent Knowledge System — every concept connects.**\n- Every new concept MUST be explicitly connected to what the student already knows from this lesson. Start each section with a brief sentence linking back: \"Building on our understanding of X, we now turn to Y.\"\n- Create a narrative arc across the lesson. The sub-topics are not independent — they are chapters of a book. Show how each piece fits into the larger picture.\n- After teaching a concept, briefly foreshadow what comes next and why: \"This property of X will become essential when we later discuss Y.\"\n- End each topic with a **takeaway sentence** that sums up what was learned and how it connects to the next topic.\n\n**2. Layer by Layer — from foundation to summit.**\n- Start from the absolute foundation. Even if the student claims familiarity, begin with the core definition and build up. Do NOT assume prior knowledge.\n- Each layer MUST be firmly established before moving to the next. A layer is established when you have: defined it → illustrated it with an example → checked understanding.\n- Progression: concrete → abstract → general. Start with specific numeric instances, then generalize to abstract forms, then state the general theorem or formula.\n- Do NOT jump to advanced applications before the foundation is solid. The learner should feel like each step is a natural, inevitable next step.\n\n**3. No Shortcuts on Fundamentals.**\n- The first example for any concept should be **deliberately simple** — so simple it feels obvious. This is not wasted time; this is anchoring intuition.\n- Before introducing a formula or theorem, spend a paragraph explaining **why it makes sense intuitively**. Use a concrete numeric case first, then generalize.\n- Common pitfalls and edge cases should be introduced AFTER the basic understanding is secured — not before.\n- If a concept has prerequisites, briefly review or reference them before proceeding.\n\n**4. Textbook Formal Register — precise academic language in the student's language.**\n- Use formal, precise academic language in whatever language the student is using. Avoid conversational fillers and casual expressions. Write in the formal register appropriate to that language (e.g., for Chinese, use 书面语 with proper 术语; for English, avoid contractions and colloquialisms).\n- Be rigorous in your statements: be specific and technically precise rather than vague.\n- For Chinese: use 我们 throughout for the shared learning journey (我们考虑..., 我们得到..., 因此我们可以得出...). Use the present tense for mathematical truth. Use standard Chinese textbook terminology (定义, 定理, 证明, 例, 练习). Use classical Chinese academic connectors: 因此, 反之, 特别地, 一般地, 例如, 另一方面, 由此可见, 注意到, 换言之, 进而, 故.\n- For English: use the first-person plural (\"we\") throughout. Use the present tense for mathematical truth. Use transitional phrases: \"Therefore...\", \"Conversely...\", \"In particular...\", \"More generally...\", \"As a concrete illustration...\", \"On the other hand...\", \"It follows that...\", \"Observe that...\", \"Hence...\".\n- Definitions must be stated in standard textbook form. Bold the term being defined.\n- Theorems, lemmas, and properties should be clearly labeled in the language of instruction.\n- Number important equations for reference (write the number manually after the equation).\n- Use the **Definition → Theorem → Proof → Example → Exercise** cadence that characterizes rigorous textbooks, regardless of language.\n\n---\n## EXPLANATION STRUCTURE — flowing, but thorough\n\nDo NOT force every explanation into rigid section headings. Instead, write a flowing exposition that covers these phases seamlessly:\n\n1. **Motivation & Context (Introduction)** — Set the stage. Frame the problem this concept solves. Connect to previously learned material. Address the question: Why should the student care? What question does this concept answer? What gap does it fill? 2-4 paragraphs.\n\n2. **Precise Development (Definition &amp; Derivation)** — Develop the concept step by step. Define every new term with textbook precision. Show derivations in full detail — do not skip algebraic steps. Include small inline examples after each sub-idea, not as separate sections but as immediate illustrations. Go deeper into implications, edge cases, and connections. This is the main body and should be **8-20 paragraphs** depending on complexity.\n\n3. **Consolidation (Summary &amp; Transition)** — End the exposition with 1-2 paragraphs that consolidate what was learned, restate the key result, and explicitly connect to the next topic: \"Having established X, we are now ready to explore Y.\"\n\n---\n## PARAGRAPH CRAFT — how to write each paragraph\n\n- Every paragraph should make ONE clear point. The first sentence states the claim (the topic sentence); the rest of the paragraph develops and supports it with reasoning, examples, or details.\n- After every definition or abstract statement, immediately give a concrete instance: \"For example, if X = 3, then...\"\n- Use inline math $...$ for symbols and short expressions within sentences. Use display math $$...$$ for important formulas, derivations, and multi-line expressions.\n- CRITICAL LaTeX rules — violation causes SILENT rendering failure (the formula disappears entirely, no error shown):\n  • Use ONLY lowercase commands (`\\\\sum`, `\\\\frac`, `\\\\infty`, `\\\\displaystyle`, `\\\\pm`, `\\\\le`, `\\\\ge`, `\\\\ne`, `\\\\to`, `\\\\alpha`, `\\\\beta`, `\\\\gamma`, `\\\\theta`, `\\\\lambda`, `\\\\pi`, `\\\\phi`, `\\\\omega`). NEVER use uppercase (`\\\\SUM`, `\\\\FRAC`, `\\\\INFTY`).\n  • Do NOT use `\\\\begin{align}`, `\\\\begin{equation}`, `\\\\begin{eqnarray}`, `\\\\begin{multline}`, or `\\\\begin{gather}` — KaTeX does NOT support them. Use `\\\\begin{aligned}` inside `$$...$$` for multi-line equations instead.\n  • Do NOT use `\\\\label{...}`, `\\\\ref{...}`, `\\\\eqref{...}`, `\\\\pageref{...}`, or `\\\\tag{...}` — KaTeX has no cross-reference system. Write equation numbers manually as plain text, e.g. `$$ ... \\\\qquad (1) $$`.\n  • Use `$...$` for inline math and `$$...$$` for display math. Do NOT use `\\\\(...\\\\)` or `\\\\[...\\\\]` as delimiters — they are NOT supported.\n  • Use `\\\\mathbf{...}` for bold math, NOT `\\\\bm{...}`.\n  • Use `\\\\cdot` for multiplication dot, NEVER `\\\\cdotp`.\n  • For cases, use `\\\\begin{cases} ... \\\\end{cases}` only. Do NOT use `\\\\begin{dcases}`, `\\\\begin{rcases}`, or `\\\\begin{dcases*}`.\n  • Use `\\\\text{...}` for plain text inside math. Keep `\\\\text` content short — complex multi-word text may overflow.\n  • NEVER emit `\\\\ce{...}`, `\\\\pu{...}`, or other mhchem/chemformula extensions — they are not loaded.\n  • Always escape literal special characters in text: use `\\\\%` for percent, `\\\\$` for dollar sign, `\\\\_` for underscore in text mode. Unescaped `_` causes a subscript error.\n  • For matrices, use `\\\\begin{matrix}`, `\\\\begin{pmatrix}`, `\\\\begin{bmatrix}`, `\\\\begin{vmatrix}` individually. Do NOT nest them inside align environments.\n  • For integrals: `\\\\int`, `\\\\iint`, `\\\\iiint`, `\\\\oint` are all supported individually with `_{lower}^{upper}` for bounds.\n  • For spacing: use `\\\\,` (thin), `\\\\:` (medium), `\\\\;` (thick), `\\\\quad`, `\\\\qquad`. Do NOT use `\\\\hspace` or `\\\\kern` with absolute units.\n- For diagrams (flowcharts, sequence diagrams, class diagrams, etc.), use ```mermaid code blocks instead of ASCII art — they render as live SVG.\n- When introducing a new term, **bold** it and define it in the same sentence: \"A **derivative** measures the instantaneous rate of change of a function.\"\n- Use precise, formal language at all times. This is a textbook.\n\n---\n## WORKED EXAMPLES — 2-3, with clear progression\n\nAfter the explanation, present 2-3 worked examples. This is MANDATORY — the examples are where the student truly learns.\n\n**Example 1 — Foundation.** A basic, straightforward application. The purpose is to show the concept working in its simplest form. Make each step explicit: \"Step 1: Identify X. Step 2: Apply formula Y. Step 3: Compute...\" Explain the reasoning behind each step, not just the algebra.\n\n**Example 2 — Application.** Requires combining multiple ideas. Less hand-holding; more reliance on the foundation built in Example 1. The solution should note where it builds on Example 1.\n\n**Example 3 (optional)** — Extension. An edge case, a non-standard application, or a problem that requires strategic thinking.\n\nFormat:\n<example><title>Example 1: [descriptive title]</title><problem>the problem statement</problem><solution>step-by-step solution with $$...$$ for math. Explain each step's reasoning.</solution></example>\n\n---\n## PRACTICE PROBLEM — challenging, requires transfer\n\nGive ONE practice problem. It MUST be harder than the examples — it should require adapting the concepts to a new context, not just applying the same steps.\n\n<practice><title>Practice</title><problem>the problem — must require transfer, not mimicry</problem><hint>optional hint (1-2 sentences)</hint></practice>\n\nThe student types their attempt into the practice widget inline and submits; their answer is sent to you as the next user turn so you can grade it. If the problem has a single canonical answer and self-grading is reasonable, you MAY also include `correct=\"...\"` on the opening tag — when present, the widget shows a Reveal-answer button and self-grades the typed attempt (case-insensitive, ignoring trailing punctuation); if not present, only the typed attempt is sent and you grade in your next reply. Do NOT include the answer in the prose either way.\n\n## VOCABULARY — formal terms\n\nWhen introducing a new formal term the student should remember, emit it inside a definition card so it stands out from the prose:\n\n<definition><term>Term name</term><body>the formal definition, 1-3 sentences, in the same register as the surrounding exposition</body></definition>\n\nUse sparingly — only when the term itself is worth committing to long-term memory. Do NOT use for ordinary words or for terms already defined earlier in this lesson.\n\n## PROCEDURE — multi-step algorithms\n\nWhen a procedure is genuinely sequential and the order matters (long division, integral setup, proof techniques), emit each step as a numbered step block. Adjacent <step> blocks are merged into a single numbered list at render time.\n\n<step n=\"1\">first action</step>\n<step n=\"2\">second action</step>\n<step n=\"3\">third action</step>\n\nUse only when the procedure is genuinely a recipe the student should follow. Do NOT use for prose explanations or for steps that have no clear linear order.\n\n## FLASHCARD — atomic recall\n\nFor a single, atomic fact or definition that benefits from spaced repetition (a named theorem, a historical date, a vocabulary pairing), emit a flashcard:\n\n<flashcard><front>Question or prompt</front><back>Concise answer</back></flashcard>\n\nThe student clicks the card to reveal the answer. Use sparingly — one or two per lesson is plenty. Do NOT use for multi-step explanations.\n\n---\n## CHECKING UNDERSTANDING — optional quiz\n\nYou MAY optionally include a multiple-choice quiz after the explanation (before examples). Use when the concept has a common point of confusion worth testing immediately:\n\n<quiz><q>question</q><options><o letter=\"A\">option</o><o letter=\"B\">option</o><o letter=\"C\">option</o></options><correct>B</correct></quiz>\n\n3 options only. Distractors should be plausible misconceptions.\n\n---\n## RESPONDING TO THE STUDENT\n\nWhen the student attempts the practice problem:\n- **Correct** → affirm concisely, then present the next sub-topic as a natural progression.\n- **Partially correct** → point out exactly which part needs work. Let them try once more.\n- **Wrong** → walk through the correct approach, highlighting where their reasoning went off. Give a similar practice problem. Append:\n  <mistake type=\"practice\" correct=\"...the key insight the student missed...\"></mistake>\n\n---\n## ABSOLUTE ANTI-PATTERNS\n\n- Do NOT switch languages mid-lesson or mix languages. Every element — explanation, examples, practice, quiz — must be in the same language.\n- Do NOT use a language different from what the student is using. Match their language from the first response.\n- Do NOT write short, shallow explanations. 8-20 paragraphs is normal for a thorough exposition.\n- Do NOT give fewer than 2 worked examples. Examples are where real learning happens.\n- Do NOT skip the foundation example (Example 1). Even if it seems too simple.\n- Do NOT make practice trivially solvable by copying an example. Require transfer.\n- Do NOT use casual or conversational language. Write in formal, precise textbook register.\n- Do NOT skip the motivation phase. Context and purpose are essential.\n- Do NOT present concepts in isolation. Every new idea must connect to the previous one.\n- Do NOT jump to advanced topics before the foundation is solidified.\n- Do NOT repeat explanations from the chat history.\n- Do NOT ask or present multiple questions in a single response. Each turn should ask at most one quiz, one practice problem, or one check. Never bundle two or more questions in the same message. — build on what you've already taught.\n- Do NOT use \"you\" to address the student directly in explanatory text (use \"we\" instead). Reserve \"you\" for exercises and quiz questions.\n- Do NOT use emojis anywhere in your output — not in text, headings, examples, definitions, quiz options, or practice problems. This is a formal textbook. Web search results may contain emojis in their titles or snippets; ignore them entirely and never reproduce or mimic them.\n\n---\n## CONVERSATION RULES\n\n- Read the chat history before every response. NEVER restart from zero.\n- If the user's last message is short (\"ok\", \"continue\", \"next\"), pick up exactly where you left off.\n- If the user already answered a quiz, do NOT ask it again. Move to examples or practice.\n- If the user already completed practice, affirm and move to the next sub-topic.\n\nThe student is learning about: {topic}. Their current level in this area: {level}.\n\n{context}";

/* Beagle identity is injected at runtime via getSystemContext(). */
var BEAGLE_SYSTEM_PROMPT = "";

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
var STREAM_TIMEOUT_MS=300000;          /* 5 min — balances reasoning models vs perceived hangs */
var STREAM_HEARTBEAT_MS=60000;         /* 60 s silence before we treat as stall */
var STREAM_MAX_ATTEMPTS=2;
/* Agent mode has its own budget. The agent runs up to 25 steps; each
   step can take 30-60s on reasoning models, but the whole run must not
   exceed AGENT_TOTAL_TIMEOUT_MS or the UI is stuck forever. */
var AGENT_TOTAL_TIMEOUT_MS=240000;
var AGENT_HEARTBEAT_MS=45000;
var AGENT_STEP_TIMEOUT_MS=90000;
var STREAM_RETRY_DELAYS=[600,1500,3500];   /* ms, per attempt index */
var STREAM_RETRYABLE_STATUS={408:true,425:true,429:true,500:true,502:true,503:true,504:true,520:true,522:true,524:true};

/* ============================================================
   UNIVERSAL AI CALL WATCHDOG
   Wraps a single fetch + stream read loop with:
     - total budget (kills the request after N ms no matter what)
     - silence heartbeat (kills the request after M ms of no bytes)
     - offline precheck (no point retrying if navigator says we're offline)
   Returns an opaque handle with .stop(reason) and .touch() methods.
   ============================================================ */
function makeAIWatchdog(totalMs,heartbeatMs,onTimeout){
  var stopped=false;
  var reason="";
  var ac=new AbortController();
  var tmo=null,hb=null,lastTouch=Date.now();
  function stop(r){
    if(stopped)return;
    stopped=true;reason=r||"stopped";
    try{ac.abort(reason)}catch(_){}
    if(tmo){clearTimeout(tmo);tmo=null}
    if(hb){clearTimeout(hb);hb=null}
  }
  if(totalMs>0){
    tmo=setTimeout(function(){
      stop("total-timeout-"+totalMs+"ms");
      if(typeof onTimeout==="function"){try{onTimeout("total",totalMs)}catch(_){}}
    },totalMs);
  }
  function armHb(){
    if(hb)clearTimeout(hb);
    hb=setTimeout(function(){
      stop("heartbeat-"+heartbeatMs+"ms");
      if(typeof onTimeout==="function"){try{onTimeout("heartbeat",heartbeatMs)}catch(_){}}
    },heartbeatMs);
  }
  function touch(){
    lastTouch=Date.now();
    if(heartbeatMs>0&&!stopped)armHb();
  }
  if(heartbeatMs>0)armHb();
  return {ac:ac,stop:stop,touch:touch,isStopped:function(){return stopped},reason:function(){return reason},lastTouch:function(){return lastTouch}};
}

/* Returns true if we know the network is unreachable. Callers should
   short-circuit their fetch attempts in that case (no point waiting
   for the 1.5s/3.5s retry backoff). */
function offlineGuard(){
  if(typeof navigator!=="undefined"&&navigator.onLine===false)return true;
  return false;
}
function sleepBackoff(attempt,retryAfterHeader){
  var delay;
  if(retryAfterHeader){
    var n=parseFloat(retryAfterHeader);
    if(!isNaN(n)&&n>0){
      delay=Math.min(n*1000,15000);
    }
  }
  if(!delay){
    delay=STREAM_RETRY_DELAYS[Math.min(attempt-1,STREAM_RETRY_DELAYS.length-1)]||3500;
  }
  /* Add a small random jitter (0-200ms) to avoid thundering-herd. */
  delay+=Math.floor(Math.random()*200);
  return new Promise(function(r){setTimeout(r,delay)});
}

/* Append Beagle A identity to the system prompt when the built-in Beagle
   provider is active. This is appended LAST so the model sees it as the
   most recent instruction about its identity, overriding any generic
   system prompt that came before. */
/* Return a prefix with the user's saved memories for long-term context.
   Memories are fetched from /api/memory and cached in _userMemories. */
function memoriesSuffix(){
  if(!_userMemories||!_userMemories.length)return"";
  return"\n\n## User's saved memories (long-term context)\n"+_userMemories.map(function(t){return"- "+t}).join("\n");
}

function beagleSuffix(){
  var p=getActiveProvider();
  if(p&&p.isBuiltIn){
    return "\n\nYour name is Beagle A. You are an AI assistant developed by Topodrive company. "+
      "You are helpful, knowledgeable, and precise. Answer questions directly "+
      "and conversationally. Never identify as MiniMax or any other model — "+
      "you are Beagle A, built by Topodrive.";
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
  if(thinkingOn){
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
  return sysCtx+"\n\n"+SOCRATIC_SYSTEM_PROMPT.replace("{topic}",topic).replace("{level}",level).replace("{context}",full)+beagleSuffix()+thinkingSuffix()+memoriesSuffix();
}

/* ============================================================
   CHAT HISTORY EXTRACTION
   Pulls the last N user/assistant turns out of the live msgList so
   the model can see the running conversation. Without this every
   API call is a one-shot prompt and the model "resets" each turn.
   ============================================================ */
var HISTORY_MAX_TURNS=30;      /* user+assistant pairs to keep (increased for longer context) */
var HISTORY_MAX_CHARS=2000;    /* per-message truncation ceiling (increased from 500) */
/* No max_tokens cap — let the model produce as much as it wants.
   Backend (server/src/routes/chat.js) defaults to its model max when omitted. */
var MAX_TOKENS_CHAT=undefined;  /* omit entirely; backend passes through */
/* MiniMax-M2.7 emits long <think>...</think> chain-of-thought blocks
   before the JSON answer. The default model max_tokens budget is too
   small to fit think + 5 questions + JSON. Give 8000 so we don't get
   truncated mid-array — bumping from 3000 was needed because MiniMax
   reasoning traces can run 2-4k tokens before the JSON answer even
   starts. */
var MAX_TOKENS_DIAG=8000;

/* Compress a list of message texts into a short summary for when
   the conversation is longer than HISTORY_MAX_TURNS. Drops oldest
   messages but captures their key topics in a condensed form. */
function compressMessages(msgs){
  if(!msgs||!msgs.length)return"";
  var parts=[];
  for(var ci=0;ci<msgs.length;ci++){
    var ct=String(msgs[ci].rawText||msgs[ci].content||"").trim();
    if(!ct)continue;
    /* Take first 120 chars of each older message as a keyphrase. */
    if(ct.length>120)ct=ct.slice(0,117)+"…";
    parts.push(ct);
  }
  if(!parts.length)return"";
  return"[Earlier conversation: "+parts.join(" | ")+"]";
}

function extractHistory(){
  /* P1.1 — three-tier source-of-truth, preferred in order:
     1. state.messages.rawText (authoritative, in-memory, never
       re-rendered, never has half-streamed text)
     2. localStorage mirror (good for cross-tab / post-reload)
     3. live DOM (legacy fallback — only used when neither 1 nor 2
       is available, e.g. a session that was loaded from the server
       but the in-memory list hasn't been hydrated yet) */
  if(Array.isArray(state.messages)&&state.messages.length){
    var maxTurns=HISTORY_MAX_TURNS*2;
    var tooMany=state.messages.length>maxTurns;
    var summary=null;
    if(tooMany){
      /* Compress the overflow messages into a summary prefix. */
      var overflow=state.messages.slice(0,state.messages.length-maxTurns);
      summary=compressMessages(overflow);
    }
    var out=[];
    if(summary){
      out.push({role:"system",content:"[Conversation summary of earlier messages]: "+summary});
    }
    for(var i=Math.max(0,state.messages.length-maxTurns);i<state.messages.length;i++){
      var m=state.messages[i];
      if(!m||!m.rawText)continue;
      var txt=String(m.rawText).replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
      if(!txt)continue;
      if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
      /* P_reasoning-persist — include chain-of-thought text for
         DeepSeek / QwQ / o1-style reasoning models that need their
         own reasoning from the previous turn to continue coherently. */
      var msg={role:m.role==="user"?"user":"assistant",content:txt};
      if(m.reasoningContent){
        msg.reasoning_content=m.reasoningContent;
      }
      out.push(msg);
    }
    if(out.length)return out;
  }
  var sid=state.currentSessionId;
  var rec=sid?loadLocalMemory(sid):null;
  if(rec&&rec.messages&&rec.messages.length){
    var maxTurns=HISTORY_MAX_TURNS*2;
    var tooMany=rec.messages.length>maxTurns;
    var summary=null;
    if(tooMany){
      var overflow=rec.messages.slice(0,rec.messages.length-maxTurns);
      summary=compressMessages(overflow);
    }
    var out=[];
    if(summary){
      out.push({role:"system",content:"[Conversation summary of earlier messages]: "+summary});
    }
    for(var ri=Math.max(0,rec.messages.length-maxTurns);ri<rec.messages.length;ri++){
      var m=rec.messages[ri];
      if(!m||!m.content)continue;
      var txt=String(m.content).replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
      if(!txt)continue;
      if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
      out.push({role:m.role==="user"?"user":"assistant",content:txt});
    }
    if(out.length)return out;
    /* Fall through to DOM if local cache has nothing usable */
  }
  var list=document.getElementById("msgList");
  if(!list)return[];
  var out=[];
  var children=list.children;
  for(var i=children.length-1;i>=0&&out.length<HISTORY_MAX_TURNS*2;i--){
    var el=children[i];
    if(!el.classList.contains("user")&&!el.classList.contains("assistant"))continue;
    var body=el.querySelector(".msg-body");
    if(!body)continue;
    /* Pull the rendered text and clean it up. */
    var txt=(body.innerText||body.textContent||"").trim();
    if(!txt)continue;
    /* Strip leaked UI affordances that may have been serialised into history. */
    txt=txt.replace(/^Thinking\.\.\.\s*/i,"").replace(/^Thinking\s*/i,"").trim();
    if(txt.length>HISTORY_MAX_CHARS)txt=txt.slice(0,HISTORY_MAX_CHARS)+"…";
    out.unshift({role:el.classList.contains("user")?"user":"assistant",content:txt});
  }
  return out;
}

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
  var fromBasicsDirective="CRITICAL: The student's cold-start diagnostic result for this sub-topic is '"+node.status+"' (baseline only, NOT mastery). "+
    "You MUST teach this sub-topic from the absolute fundamentals. Do NOT skip or accelerate past foundational material based on the diagnostic level. "+
    "Even if the level is 'fuzzy' (some familiarity), start with the core definition and build up layer by layer. "+
    "The diagnostic only probed surface recognition; true understanding must be built systematically.\n\n";
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
  var levelForPrompt="baseline (not mastery) — teach from fundamentals";
  var prompt=buildSocraticPrompt(domain,levelForPrompt,
    (isFirst
      ? fromBasicsDirective+diagKps+
        "You are beginning the '"+stage+"' stage for sub-topic: "+node.name+". "+
        "START at this stage — do not run earlier stages. "+stageInstr+"\n"+
        "Follow the textbook principles:\n"+
        "1) **Foundation-first**: Start with the core definition, build up layer by layer.\n"+
        "2) **Systematic connection**: Link this sub-topic to the broader topic. Make it part of a coherent narrative.\n"+
        "3) **Thorough explanation**: Follow the Motivate → Define → Develop → Illustrate flow. 8-20 paragraphs. Formal textbook register.\n"+
        "4) **2-3 <example> blocks** with clear difficulty progression (Example 1 = foundation, Example 2 = application).\n"+
        "5) After examples, end with 1 <practice> block — harder than the examples, requiring transfer.\n"+
        "6) Optional <quiz> block after explanation (before examples) if there's a key point worth checking.\n"+
        "Write in formal, precise textbook language. Use bold for terms. Use LaTeX for math. Build a knowledge system, not isolated facts."
      : fromBasicsDirective+diagKps+
        "Current teaching stage: "+stage+". Sub-topic: "+node.name+". Advance the lesson according to the stage: "+stageInstr+" "+
        "Connect new material to what was already taught. Do NOT restart from the beginning. "+
        "Always include 2-3 <example> blocks (with progression) before any new <practice> block. "+
        "Use <quiz>, <example>, and <practice> blocks per the system prompt. "+
        "Write in formal textbook register. Build systematically on prior knowledge.")
  );
  var msgs=[{role:"system",content:prompt}].concat(history);
  msgs.push({role:"user",content:isFirst?"I'm ready to begin. Please teach me about "+node.name+".":"Continue the lesson from where we left off."});
  return msgs;
}

/* P_knowledge-point — shared helper that collects the diagnostic
   knowledge points for a given kbNode. Returns a string ready to
   inject into a prompt, or "" if no diagnostic data is available. */
function diagKnowledgePointsForNode(node){
  var diagKps="";
  if(!Array.isArray(state.diagQuestions)||!state.diagQuestions.length)return diagKps;
  var nodeIdx=state.kbNodes.indexOf(node);
  var nodeKps=[];
  state.diagQuestions.forEach(function(q,qi){
    if(q.knowledgePoint&&typeof q.nodeIdx==="number"&&q.nodeIdx===nodeIdx){
      var userAns=state.diagAnswers[qi];
      var userLevel=userAns!==undefined&&q.opts[userAns]?q.opts[userAns].level:"unknown";
      nodeKps.push(q.knowledgePoint+" (diagnostic result: "+userLevel+")");
    }
  });
  if(nodeKps.length){
    diagKps="Diagnostic knowledge points for this sub-topic:\n- "+nodeKps.join("\n- ")+"\n\n";
  }
  return diagKps;
}

/* Task 2.2 — short per-stage directive used by buildSocraticMessages
   and buildFollowUpMessages. Keeping it in one place means the
   stage names and their instructions never drift apart. */
function stageInstruction(stage){
  switch(stage){
    case "motivate":   return "Give motivation and context for why this concept matters. Do not define it yet.";
    case "define":     return "Now give the precise definition and core development (8-20 paragraphs).";
    case "develop":    return "Develop the concept in depth with worked examples.";
    case "illustrate": return "Provide 2-3 worked examples with progression.";
    case "exercise":   return "Present a practice problem for the student to attempt.";
    case "check":      return "Check understanding with a quick quiz, then move to the next sub-topic.";
    default:           return "Advance the lesson one stage.";
  }
}

async function generateSocraticQuestion(node,domain){
  if(hasUsableActive()){
    console.log("%c[Socratic] non-stream for: "+node.name,"color:#4af");
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
    console.log("%c[Socratic] stream for: "+node.name,"color:#4af");
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
    var levelDesc=status==='internalized'?'has solid knowledge':status==='blank'?'is completely new':'has some familiarity';
    var history=extractHistory();
    var prompt=buildSocraticPrompt(domain,status,
      "The user asked for an explanation about: "+node.name+". The user "+levelDesc+" of this topic. "+
       "Use the chat history above to ground your explanation in what the user has already explored — do not restart from definitions. "+
       "Write a textbook-quality explanation: systematic, formal, layer-by-layer. Use bold for key terms. Use LaTeX for math. Build from foundation to advanced. Include at least one concrete example inline."
    );
    var msgs=[{role:"system",content:prompt}].concat(history).concat([{role:"user",content:"Please explain this concept, taking into account what we've already discussed."}]);
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
  var prompt=buildSocraticPrompt(domain,node.status,
    "Current teaching stage: "+stage+". Sub-topic: "+node.name+". "+
    "The student just said: \""+answer+"\". "+stageGuidance+"\n"+
    "Your job is to advance the lesson:\n"+
    "- If the student just answered a <quiz>, acknowledge (right/wrong) and move to the next stage (a worked <example> or a <practice> problem).\n"+
    "- If the student just attempted a <practice> problem, evaluate their work: if correct, affirm and present the next sub-topic; if wrong or partial, point out the gap, walk through the correct approach briefly, and give a similar practice problem.\n"+
    "- If the student just asked a free-form question, briefly answer it (1-2 paragraphs) and continue the loop.\n"+
    "Always use the appropriate <quiz> / <example> / <practice> blocks per the system prompt. Do NOT restart the topic or re-explain from scratch."
  );
  return [{role:"system",content:prompt}].concat(history).concat([{role:"user",content:answer}]);
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

/* Implicit-global declarations — these are assigned within functions
   without var/let/const and must be declared in module scope for
   strict-mode compat. */
var _examSelectedTypes;

/* ─── Expose all onclick-required functions on window ─── */
window.addProvider = addProvider;
window.clearSettings = clearSettings;
window.closeCmdK = closeCmdK;
window.closeConfirm = closeConfirm;
window.closeExamModal = closeExamModal;
window.closeExamView = closeExamView;
window.cancelExamGeneration = cancelExamGeneration;
window.closeProfile = closeProfile;
window.closeSettings = closeSettings;
window.closeShareModal = closeShareModal;
window.closeUsageModal = closeUsageModal;
window.confirmClearCache = confirmClearCache;
window.confirmClearSettings = confirmClearSettings;
window.confirmDeleteAccount = confirmDeleteAccount;
window.copyShareLink = copyShareLink;
window.createShareLink = createShareLink;
window.exitAgentMode = exitAgentMode;
window.openAgentView = openAgentView;
window.openProfile = openProfile;
window.startExamGeneration = startExamGeneration;
window.openPromptTemplatesModal = openPromptTemplatesModal;
window.openSettings = openSettings;
window.openShareModal = openShareModal;
window.openStorageModal = openStorageModal;
window.openUsageModal = openUsageModal;
window.resendAuthCode = resendAuthCode;
window.resendVerification = resendVerification;
window.resetApp = resetApp;
window.revokeShareLink = revokeShareLink;
window.saveSettings = saveSettings;
window.selectShareVis = selectShareVis;
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
window.switchAuthTab = switchAuthTab;
window.switchTab = switchTab;
window.syncSidebarBtns = syncSidebarBtns;
window.toggleAPI = toggleAPI;
window.toggleAppLang = toggleAppLang;
window.toggleDisplayPrefs = toggleDisplayPrefs;
window.toggleExtensionsPicker = toggleExtensionsPicker;
window.toggleModelPicker = toggleModelPicker;
window.toggleChatModelMenu = toggleChatModelMenu;
window.pickChatModel = pickChatModel;
window.toggleProfileWebSearch = toggleProfileWebSearch;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;

/* exam/quiz dynamic handlers */
window.selectExamOpt = selectExamOpt;
window.toggleExamType = toggleExamType;
window.showUsageTip = showUsageTip;
window.hideUsageTip = hideUsageTip;
window.closeCheatsheet = closeCheatsheet;
window.autoResize = autoResize;
window.closeModelPicker = closeModelPicker;
window.closeProjectEditor = closeProjectEditor;
window.closePromptTemplatesModal = closePromptTemplatesModal;
window.closeStorageModal = closeStorageModal;
window.closeTagEditor = closeTagEditor;
window.actuallyDeleteSession = actuallyDeleteSession;
window.confirmPurgeSession = confirmPurgeSession;
window.deleteAgentRun = deleteAgentRun;
window.finishDiagnostic = finishDiagnostic;
window.proceedToTeaching = proceedToTeaching;
window.loadSession = loadSession;
window.loadUsageData = loadUsageData;
window.loadUsageMonth = loadUsageMonth;
window.nextDiagQuestion = nextDiagQuestion;
window.onCmdKInput = onCmdKInput;
window.onProjectChipClick = onProjectChipClick;
window.onProjectDelete = onProjectDelete;
window.onProjectEditorSave = onProjectEditorSave;
window.onPromptRowDelete = onPromptRowDelete;
window.onPromptTemplateEditorSave = onPromptTemplateEditorSave;
window.onRecentsFilterChipClick = onRecentsFilterChipClick;
window.onSlashRowClick = onSlashRowClick;
window.updateSlashSelected = updateSlashSelected;
window.updateCmdKSelected = updateCmdKSelected;
window.openCmdKResult = openCmdKResult;
window.openProjectEditor = openProjectEditor;
window.openPromptTemplateEditor = openPromptTemplateEditor;
window.openTagEditor = openTagEditor;
window.pickActiveProviderById = pickActiveProviderById;
window.pickProjectColor = pickProjectColor;
window.prevDiagQuestion = prevDiagQuestion;
window.renderExamForm = renderExamForm;
window.renderPromptTemplatesModal = renderPromptTemplatesModal;
window.restoreSession = restoreSession;
window.selectDiag = selectDiag;
window.setActiveProvider = setActiveProvider;
window.setRecentsFilter = setRecentsFilter;
window.clearRecentsFilter = clearRecentsFilter;
window.submitExam = submitExam;
window.toggleKBDetail = toggleKBDetail;
window.togglePinSession = togglePinSession;
window.removeProvider = removeProvider;
window.clearProjectFilter = clearProjectFilter;
window.handleChatKey = handleChatKey;
window.onCmdKKey = onCmdKKey;
window.onCustomInstructionsChange = onCustomInstructionsChange;
window.submitAuthForgotPassword = submitAuthForgotPassword;
window.submitAuthRegister = submitAuthRegister;
window.submitAuthResetPassword = submitAuthResetPassword;
window.submitAuthSignin = submitAuthSignin;
window.updateSendBtn = updateSendBtn;
window.updateStartBtn = updateStartBtn;
window.setBackgroundColor = setBackgroundColor;
window.setBackgroundLight = setBackgroundLight;
window.setBackgroundDark = setBackgroundDark;
window.resetBackgroundColor = resetBackgroundColor;
window.resetBackgroundDark = resetBackgroundDark;
window.resetBackgroundLight = resetBackgroundLight;
window.setAccentColor = setAccentColor;
window.afterAuthEnter = afterAuthEnter;
window.markAuthSuccess = markAuthSuccess;
window.loadProjects = loadProjects;
window.renderProjects = renderProjects;
window.refreshServerSessions = refreshServerSessions;
window.refreshApiConfig = refreshApiConfig;
window.loadUserMemories = loadUserMemories;
window.renderUserFooter = renderUserFooter;
window.renderRecents = renderRecents;
window.renderMistakes = renderMistakes;
window.updateMistakesBadge = updateMistakesBadge;
window.renderProviderList = renderProviderList;
window.syncModelPills = syncModelPills;
window.syncExtensionsUI = syncExtensionsUI;
window.syncAppModeUI = syncAppModeUI;
window.syncSidebarForMode = syncSidebarForMode;
window.getChatIdFromURL = getChatIdFromURL;
window.setChatIdInURL = setChatIdInURL;
window.syncSettingsUI = syncSettingsUI;
window.toggleShareBtn = toggleShareBtn;
window.getActiveProvider = getActiveProvider;
window.getCustomInstructionsString = getCustomInstructionsString;
window.makeAIWatchdog = makeAIWatchdog;
window.isReasoningProvider = isReasoningProvider;
window.apiConfig = apiConfig;
window.offlineGuard = offlineGuard;
window.sleepBackoff = sleepBackoff;
window.STREAM_TIMEOUT_MS = STREAM_TIMEOUT_MS;
window.STREAM_HEARTBEAT_MS = STREAM_HEARTBEAT_MS;
window.STREAM_MAX_ATTEMPTS = STREAM_MAX_ATTEMPTS;
window.STREAM_RETRYABLE_STATUS = STREAM_RETRYABLE_STATUS;
window.esc = esc;
window.addMessage = addMessage;
window.showToast = showToast;
window.saveCurrentSession = saveCurrentSession;
window.fetchGeoInfo = fetchGeoInfo;
window.loadSharedSession = loadSharedSession;
window.BEAGLE_BUILT_IN = BEAGLE_BUILT_IN;
window.RECENTS_FILTER_KEY = RECENTS_FILTER_KEY;
window.updateProviderField = updateProviderField;
window.closeChatModelMenu = closeChatModelMenu;
window.offlineGuard = offlineGuard;
window.sleepBackoff = sleepBackoff;
window.STREAM_TIMEOUT_MS = STREAM_TIMEOUT_MS;
window.STREAM_HEARTBEAT_MS = STREAM_HEARTBEAT_MS;
window.STREAM_MAX_ATTEMPTS = STREAM_MAX_ATTEMPTS;
window.STREAM_RETRYABLE_STATUS = STREAM_RETRYABLE_STATUS;
