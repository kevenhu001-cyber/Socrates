import {renderGreeting} from './ui/greeting.js';
import {syncThemeUI} from './displayPrefs.js';
import { reportSwallow } from './util/reportSwallow.ts';

var I18N={};
var _currentLang="zh";
/* Keep both locale tables out of the entry chunk. The saved locale loads in
   parallel with auth preflight; boot waits for that request before revealing
   either the app or auth gate. */
var _zhReady=null;
var _enReady=null;
var LANG_OPTION_IDS=["profileLangEn","profileLangZh"];
function ensureZh(){
  if(I18N.zh)return Promise.resolve();
  if(!_zhReady){
    _zhReady=import("./i18n/zh.js").then(function(m){I18N.zh=m.zh||m.default||m;}).catch(function(err){_zhReady=null;try{console.error("[i18n] zh locale failed to load",err)}catch(e){reportSwallow(e, 'i18n.ensureZh.logError'); /* ignore */}});
  }
  return _zhReady;
}
function ensureEn(){
  if(I18N.en)return Promise.resolve();
  if(!_enReady){
    _enReady=import("./i18n/en.js").then(function(m){I18N.en=m.en||m.default||m;}).catch(function(err){_enReady=null;try{console.error("[i18n] en locale failed to load",err)}catch(e){reportSwallow(e, 'i18n.ensureEn.logError'); /* ignore */}});
  }
  return _enReady;
}
function t(key){var table=I18N[_currentLang];var v=table&&table[key];if(typeof v!=="undefined")return v;v=I18N.en&&I18N.en[key];if(typeof v!=="undefined")return v;return key;}
function syncLanguageToggleOptions(lang){
  for(var i=0;i<LANG_OPTION_IDS.length;i++){
    var el=document.getElementById(LANG_OPTION_IDS[i]);
    if(!el)continue;
    var optLang=LANG_OPTION_IDS[i].replace("profileLang","").toLowerCase();
    var active=optLang===lang;
    el.classList.toggle("active",active);
    el.setAttribute("aria-pressed",active?"true":"false");
  }
}
function setLang(lang){
  if(!I18N[lang]){
    /* A locale may still be in flight — apply as soon as it lands. */
    if(lang==="zh"||lang==="en"){
      var ready=lang==="zh"?ensureZh():ensureEn();
      ready.then(function(){if(I18N[lang])setLang(lang)});
    }
    return;
  }
  _currentLang=lang;
  window._currentLang=lang;
  try{document.documentElement.lang=lang==="zh"?"zh":"en";}catch(e){reportSwallow(e, 'i18n.setLang.documentLang'); }
  try{localStorage.setItem("socrates-lang-app",lang)}catch(e){reportSwallow(e, 'i18n.setLang.persist'); }
  applyI18n();
  /* P_tutor-leak — applyI18n() rewrites #topicTitle / #topicSub /
     #topicDisclaimer using the current appMode. Without this call
     the topic-setup copy could drift if anything else touched those
     elements between mode-sync ticks. Cheap and idempotent. */
  try{if(typeof syncAppModeUI==="function")syncAppModeUI()}catch(e){reportSwallow(e, 'i18n.setLang.syncAppModeUI'); }
  /* Update language toggle active state. Only en + zh are supported;
     removing ja/ko from this iteration avoids keeping dead UI states
     if the toggle HTML reverts. */
  syncLanguageToggleOptions(lang);
  /* Update the small "EN/中" label in the sidebar header so the
     quick-toggle button reflects the active language. */
  try{
    var lbl=document.getElementById("langToggleLabel");
    if(lbl){
      if(lang==="zh")lbl.textContent="中";
      else lbl.textContent="EN";
    }
  }catch(e){reportSwallow(e, 'i18n.setLang.toggleLabel'); }
  /* Notify React-owned surfaces (Tiptap composer placeholders) that the
     active language changed, so they can re-localize without a reload. */
  try{
    if(typeof CustomEvent!=="undefined"){
      document.dispatchEvent(new CustomEvent("socrates:langchange",{detail:{lang:lang}}));
    }
  }catch(e){reportSwallow(e, 'i18n.setLang.langChangeEvent'); }
}
function translateTextNodes(){
  var els=document.querySelectorAll("[data-i18n-key]");
  for(var i=0;i<els.length;i++){
    var key=els[i].getAttribute("data-i18n-key");
    var val=t(key);
    if(val&&val!==key)els[i].textContent=val;
  }
}

function translateAttribute(selector,keyAttribute,targetAttribute){
  var elements=document.querySelectorAll(selector);
  for(var i=0;i<elements.length;i++){
    var key=elements[i].getAttribute(keyAttribute);
    var value=t(key);
    if(value&&value!==key)elements[i].setAttribute(targetAttribute,value);
  }
}

function refreshThemeLabel(){
  if(typeof syncThemeUI === "function"){
    try{syncThemeUI()}catch(e){reportSwallow(e, 'i18n.applyI18n.syncThemeUI'); /* theme UI may not be mounted yet */ }
  }
}

function updateComposerLabels(){
  var ci=document.getElementById("composerRoot");
  if(ci){
    var _cv=document.getElementById("chatView");
    var _inChat=!!_cv&&!_cv.classList.contains("hidden");
    ci.setAttribute("aria-label",t(_inChat?"chat.placeholder":"topic.inputPlaceholder"));
  }
  var ch=document.getElementById("chatInputHint");
  if(ch)ch.textContent=t("chat.hint");
}

function updateTopicSetupCopy(){
  var appMode=(typeof window!=="undefined"&&window.appMode)||"chat";
  var tt=document.getElementById("topicTitle");
  if(tt){
    if(typeof renderGreeting==="function")renderGreeting();
    else tt.textContent=t(appMode==="chat"?"topic.titleChat":"topic.title");
  }
  var ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t(appMode==="chat"?"topic.subChat":"topic.subtitle");
  var tdisc=document.getElementById("topicDisclaimer");
  if(tdisc)tdisc.textContent=t(appMode==="chat"?"topic.disclaimerChat":"profile.disclaimerTutor");
}

function updatePrimaryComposerButton(){
  var cpb=document.getElementById("composerPrimaryBtn");
  if(cpb&&!cpb.classList.contains("chat-stop")&&!cpb.classList.contains("agent-stop")){
    var composerLabel=t("chat.send");
    cpb.setAttribute("aria-label",composerLabel);
    cpb.setAttribute("title",composerLabel);
    if(typeof window.updateComposerBtn==="function"){
      try{window.updateComposerBtn();}catch(e){reportSwallow(e, 'i18n.applyI18n.updateComposerBtn'); }
    }else{
      cpb.disabled=!cpb.classList.contains("active");
    }
  }
}

function updateExtensionsLabel(){
  var el=document.getElementById("extensionsLabel");
  if(el)el.textContent=t("topic.extensions");
}

function refreshDynamicSurfaces(){
  /* Exam content is generated dynamically, so static data-i18n scanning
     cannot update it. Repaint its UI chrome while preserving form values,
     generated questions and answers. */
  if(window.stateStore.read("_examInView")&&typeof window.refreshExamI18n==="function"){
    try{window.refreshExamI18n()}catch(e){reportSwallow(e, 'i18n.applyI18n.refreshExam'); }
  }
  /* P_chatgpt-landing — the reasoning-effort trigger label (高/中/低) is
     driven by JS, not a data-i18n-key element, so refresh it here too. */
  if(typeof window.syncEffortUI==="function"){try{window.syncEffortUI();}catch(e){reportSwallow(e, 'i18n.applyI18n.syncEffortUI'); }}
}

function applyI18n(){
  translateTextNodes();
  /* Keep the profile modal toggle aligned with the active locale. */
  try{syncLanguageToggleOptions(_currentLang)}catch(e){reportSwallow(e, 'i18n.applyI18n.profileLangChips'); }
  translateAttribute("[data-i18n-placeholder]","data-i18n-placeholder","placeholder");
  translateAttribute("[data-i18n-title]","data-i18n-title","title");
  translateAttribute("[data-i18n-aria]","data-i18n-aria","aria-label");
  refreshThemeLabel();
  updateComposerLabels();
  updateTopicSetupCopy();
  updatePrimaryComposerButton();
  updateExtensionsLabel();
  refreshDynamicSurfaces();
}
/* Load saved language preference. _currentLang is the single source
   of truth at runtime; setLang() persists changes and applyI18n()
   pushes them onto the DOM.
   P_lang-persist — defensive dual-write on read: when the saved
   value resolves to a known language, we write it back to
   localStorage as well. Some browser flows (Safari private mode,
   cookie-expiry redirects, third-party-script-injected storage
   clears) can leave the entry null between sessions. Re-writing
   it here makes the preference resilient to a transient missing
   entry and gives a single load() call a self-healing behavior. */
try{
  var s=localStorage.getItem("socrates-lang-app");
  /* Validate saved language against supported names, not the async-loaded
     locale table, or a valid preference would be wiped before it lands. */
  if(s==="en"||s==="zh"){
    _currentLang=s;
  }else if(!s){
    /* No preference recorded yet — persist the default so the
       next load picks up the same value instead of leaving the
       slot empty. */
    try{localStorage.setItem("socrates-lang-app",_currentLang)}catch(e){reportSwallow(e, 'i18n.bootstrap.persistDefault'); }
  }else{
    /* Stale value (e.g. user downgraded and we removed a locale) —
     * overwrite with the default so the entry stays canonical. */
    try{localStorage.removeItem("socrates-lang-app");localStorage.setItem("socrates-lang-app",_currentLang)}catch(e){reportSwallow(e, 'i18n.bootstrap.resetStale', 'expected'); }
  }
}catch(e){reportSwallow(e, 'i18n.bootstrap.readPref', 'expected'); }
/* Fetch only the saved locale in parallel with boot. When it lands, run the
   full setLang path so DOM-owned strings and React language listeners repaint. */
var _initialLocaleReady=_currentLang==="zh"?ensureZh():ensureEn();
_initialLocaleReady.then(function(){if(I18N[_currentLang]){try{setLang(_currentLang)}catch(e){reportSwallow(e, 'i18n.bootstrap.localeRetry'); /* applyI18n retry covers stragglers */ }}});
/* Set the document's language before boot. The selected async locale calls
   setLang() on arrival and applies every data-i18n string before auth boot
   reveals the app or gate. */
try{
  var lbl=document.getElementById("langToggleLabel");
  if(lbl)lbl.textContent=_currentLang==="en"?"EN":"中";
  document.documentElement.lang=_currentLang==="zh"?"zh":"en";
  if(I18N[_currentLang])applyI18n();
}catch(e){reportSwallow(e, 'i18n.bootstrap.initialApply'); }

/* Expose i18n functions as globals for main.js and other modules. */
window._currentLang = _currentLang;
window.t = t;
window.setLang = setLang;
window.applyI18n = applyI18n;
/* auth/boot.js awaits this (bounded) before revealing UI. Always a Promise. */
window.__i18nReady = _initialLocaleReady;
