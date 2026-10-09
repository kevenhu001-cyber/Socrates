import {renderGreeting} from './ui/greeting.js';
import {en} from './i18n/en.js';
import {syncThemeUI} from './displayPrefs.js';
import { reportSwallow } from './util/reportSwallow.ts';

var I18N={en};
var _currentLang="zh";
/* P_perf-i18n-split — the zh table (~39 KB) ships as its own async chunk
   (src/i18n/zh.js). It is fetched in parallel with the boot auth fetches
   for zh users (the default locale), or on first setLang("zh") for en
   users. Until it lands, t() falls back to the en table; the boot-loading
   mask hides the brief English flash, and auth/boot.js gives the chunk a
   bounded grace before revealing any UI. */
var _zhReady=null;
function ensureZh(){
  if(I18N.zh)return Promise.resolve();
  if(!_zhReady){
    _zhReady=import("./i18n/zh.js").then(function(m){I18N.zh=m.zh||m.default||m;}).catch(function(err){_zhReady=null;try{console.error("[i18n] zh locale failed to load",err)}catch(e){reportSwallow(e, 'i18n.ensureZh.logError'); /* ignore */}});
  }
  return _zhReady;
}
function t(key){var v=I18N[_currentLang]&&I18N[_currentLang][key];if(typeof v!=="undefined")return v;v=I18N.en[key];if(typeof v!=="undefined")return v;return key;}
function setLang(lang){
  if(!I18N[lang]){
    /* zh may still be in flight — apply as soon as it lands. */
    if(lang==="zh"){ensureZh().then(function(){if(I18N.zh)setLang("zh")});}
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
  var optionIds=["profileLangEn","profileLangZh"];
  for(var i=0;i<optionIds.length;i++){
    var el=document.getElementById(optionIds[i]);
    if(!el)continue;
    var optLang=optionIds[i].replace("profileLang","").toLowerCase();
    var active=optLang===lang;
    el.classList.toggle("active",active);
    el.setAttribute("aria-pressed",active?"true":"false");
  }
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
function applyI18n(){
  /* Translate all elements with data-i18n-key attribute */
  var els=document.querySelectorAll("[data-i18n-key]");
  for(var i=0;i<els.length;i++){
    var key=els[i].getAttribute("data-i18n-key");
    var val=t(key);
    if(val&&val!==key)els[i].textContent=val;
  }
  /* P_profile-lang-active — sync the profile modal language toggle's
     `active` class with the current language. The toggle's static HTML
     hard-codes "English" as `.active` so on first paint with
     `_currentLang === "zh"` the chip stayed on English until the user
     clicked. Sync here so both the sidebar quick-toggle and any consumer
     of applyI18n share one source of truth. setLang() also calls this
     block (kept its loop for redundancy with the sidebar path). */
  try{
    var langIds=["profileLangEn","profileLangZh"];
    for(var li=0;li<langIds.length;li++){
      var langEl=document.getElementById(langIds[li]);
      if(!langEl)continue;
      var langOpt=langIds[li].replace("profileLang","").toLowerCase();
      var langActive=langOpt===_currentLang;
      langEl.classList.toggle("active",langActive);
      langEl.setAttribute("aria-pressed",langActive?"true":"false");
    }
  }catch(e){reportSwallow(e, 'i18n.applyI18n.profileLangChips'); }
  /* Translate all elements with data-i18n-placeholder attribute
     (used on <input>/<textarea> where textContent doesn't apply). */
  var phs=document.querySelectorAll("[data-i18n-placeholder]");
  for(var j=0;j<phs.length;j++){
    var ph=phs[j].getAttribute("data-i18n-placeholder");
    var phv=t(ph);
    if(phv&&phv!==ph)phs[j].setAttribute("placeholder",phv);
  }
  /* Translate elements with data-i18n-title / data-i18n-aria — used
   * by the attachment paperclip button. Same pattern as the
   * placeholder block above. */
  var titles=document.querySelectorAll("[data-i18n-title]");
  for(var ti=0;ti<titles.length;ti++){
    var tk=titles[ti].getAttribute("data-i18n-title");
    var tv=t(tk);
    if(tv&&tv!==tk)titles[ti].setAttribute("title",tv);
  }
  var arias=document.querySelectorAll("[data-i18n-aria]");
  for(var ai=0;ai<arias.length;ai++){
    var ak=arias[ai].getAttribute("data-i18n-aria");
    var av=t(ak);
    if(av&&av!==ak)arias[ai].setAttribute("aria-label",av);
  }
  /* The selected theme label is generated from the active preference, so
     refresh it after a language switch alongside the static selector copy. */
  if(typeof syncThemeUI === "function"){
    try{syncThemeUI()}catch(e){reportSwallow(e, 'i18n.applyI18n.syncThemeUI'); /* theme UI may not be mounted yet */ }
  }
  /* Placeholder / value updates — done selectively for now. */
  var ci=document.getElementById("composerRoot");
  if(ci){
    var _cv=document.getElementById("chatView");
    var _inChat=!!_cv&&!_cv.classList.contains("hidden");
    ci.setAttribute("aria-label",t(_inChat?"chat.placeholder":"topic.inputPlaceholder"));
  }
  var ch=document.getElementById("chatInputHint");
  if(ch)ch.textContent=t("chat.hint");
  /* Topic-setup title/sub/disclaimer. syncAppModeUI() rewrote these
     as either the tutor-mode or chat-mode versions; re-route through
     t() but keep the mode-aware mapping so toggling the language
     doesn't revert them to the wrong mode's text.
     P_tutor-leak — appMode is a top-level `var` in main.js and is
     mirrored onto `window.appMode` at boot (see main.js:13243). It is
     NOT a field on `window.state` (state/store.js has no `appMode`), so
     reading `window.state.appMode` was always undefined and we fell
     back to "tutor" — silently flipping a chat-mode user into tutor
     copy on every language toggle. Read the real global and default
     to "chat" so a fresh page (window.appMode not yet set) doesn't
     paint tutor text. */
  var appMode=(typeof window!=="undefined"&&window.appMode)||"chat";
  var tt=document.getElementById("topicTitle");
  /* P_chatgpt-landing — #topicTitle is now the personalized greeting
     (renderGreeting from src/ui/greeting.js). When a localized
     greeting renderer is wired up, defer to it so the name survives
     language toggles. Otherwise fall back to the legacy static copy. */
  if(tt){
    if(typeof renderGreeting==="function")renderGreeting();
    else tt.textContent=t(appMode==="chat"?"topic.titleChat":"topic.title");
  }
  var ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t(appMode==="chat"?"topic.subChat":"topic.subtitle");
  var tdisc=document.getElementById("topicDisclaimer");
  if(tdisc)tdisc.textContent=t(appMode==="chat"?"topic.disclaimerChat":"profile.disclaimerTutor");
  var cpb=document.getElementById("composerPrimaryBtn");
  if(cpb&&!cpb.classList.contains("chat-stop")&&!cpb.classList.contains("agent-stop")){
    var composerLabel=t(cpb.classList.contains("active")?"chat.send":"chrome.startVoiceInput");
    cpb.setAttribute("aria-label",composerLabel);
    cpb.setAttribute("title",composerLabel);
    if(typeof window.updateComposerBtn==="function"){
      try{window.updateComposerBtn();}catch(e){reportSwallow(e, 'i18n.applyI18n.updateComposerBtn'); }
    }else{
      cpb.disabled=false;
    }
  }
  var el=document.getElementById("extensionsLabel");
  if(el)el.textContent=t("topic.extensions");
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
  /* The zh table may still be in flight (async chunk) — validate the
     stored value against the locale NAMES, not I18N membership, or a
     stored "zh" would be wiped as "stale" before the chunk lands. */
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
/* Fetch the zh chunk in parallel with boot for zh users; en users never
   pay for it until they toggle. When it lands, run the full setLang path
   so JS-rendered strings (greeting, topic copy, toggles) repaint too. */
if(_currentLang==="zh"){
  ensureZh().then(function(){if(_currentLang==="zh"){try{setLang("zh")}catch(e){reportSwallow(e, 'i18n.bootstrap.zhRetry'); /* applyI18n retry covers stragglers */ }}});
}
/* P_lang-init — run applyI18n SYNCHRONOUSLY at module load so every
   data-i18n-key element is in the saved language BEFORE main.js
   finishes initializing (syncAppModeUI, renderRecents, etc.). The
   previous setTimeout(0) deferred translation to the next event-loop
   tick, which meant main.js rendered a flash of English first —
   and the partial re-render that followed left the page in a
   mixed-language state. */
try{
  var lbl=document.getElementById("langToggleLabel");
  if(lbl)lbl.textContent=_currentLang==="en"?"EN":"中";
  document.documentElement.lang=_currentLang==="zh"?"zh":"en";
  applyI18n();
}catch(e){reportSwallow(e, 'i18n.bootstrap.initialApply'); }

/* Expose i18n functions as globals for main.js and other modules. */
window._currentLang = _currentLang;
window.t = t;
window.setLang = setLang;
window.applyI18n = applyI18n;
/* auth/boot.js awaits this (bounded) before revealing UI so zh users
   never see an English first paint. Always a Promise. */
window.__i18nReady = _zhReady || Promise.resolve();
