import {renderGreeting} from './ui/greeting.js';
import {syncThemeUI} from './displayPrefs.js';
import { reportSwallow } from './util/reportSwallow.ts';
import { getCurrentLanguage, setCurrentLanguage } from './i18n/languageState.ts';
import { dispatchExam, examStore } from './store/index.ts';
import { appMode, syncAppModeUI } from './config/providers.ts';

// These hooks are published by the existing shell; keep their contract local.
interface I18nWindow extends Window {
  __i18nReady?: Promise<void>;
}
const browser = window as I18nWindow;

const I18N: Partial<Record<string, Record<string, string>>> = {};
/* Keep both locale tables out of the entry chunk. The saved locale loads in
   parallel with auth preflight; boot waits for that request before revealing
   either the app or auth gate. */
let _zhReady: Promise<void> | null = null;
let _enReady: Promise<void> | null = null;
const LANG_OPTION_IDS=["profileLangEn","profileLangZh"];
function ensureZh(){
  if(I18N.zh)return Promise.resolve();
  if(!_zhReady){
    _zhReady=import("./i18n/zh.ts").then(function(m){I18N.zh=m.zh;}).catch(function(err){_zhReady=null;try{console.error("[i18n] zh locale failed to load",err)}catch(e){reportSwallow(e, 'i18n.ensureZh.logError'); /* ignore */}});
  }
  return _zhReady;
}
function ensureEn(){
  if(I18N.en)return Promise.resolve();
  if(!_enReady){
    _enReady=import("./i18n/en.ts").then(function(m){I18N.en=m.en;}).catch(function(err){_enReady=null;try{console.error("[i18n] en locale failed to load",err)}catch(e){reportSwallow(e, 'i18n.ensureEn.logError'); /* ignore */}});
  }
  return _enReady;
}
function t(key: string){const table=I18N[getCurrentLanguage()];let v=table&&table[key];if(typeof v!=="undefined")return v;v=I18N.en&&I18N.en[key];if(typeof v!=="undefined")return v;return key;}
function syncLanguageToggleOptions(lang: string){
  for(let i=0;i<LANG_OPTION_IDS.length;i++){
    const el=document.getElementById(LANG_OPTION_IDS[i]);
    if(!el)continue;
    const optLang=LANG_OPTION_IDS[i].replace("profileLang","").toLowerCase();
    const active=optLang===lang;
    el.classList.toggle("active",active);
    el.setAttribute("aria-pressed",active?"true":"false");
  }
}
function requestLocale(lang: string): void {
  if (lang !== "zh" && lang !== "en") return;
  /* A locale may still be in flight — apply as soon as it lands. */
  const ready = lang === "zh" ? ensureZh() : ensureEn();
  ready.then(function () { if (I18N[lang]) setLang(lang); });
}
export function setLang(lang: string){
  if(!I18N[lang]){
    requestLocale(lang);
    return;
  }
  setCurrentLanguage(lang === "en" ? "en" : "zh");
  try{document.documentElement.lang=lang==="zh"?"zh":"en";}catch(e){reportSwallow(e, 'i18n.setLang.documentLang'); }
  try{localStorage.setItem("socrates-lang-app",lang)}catch(e){reportSwallow(e, 'i18n.setLang.persist'); }
  applyI18n();
  /* P_tutor-leak — applyI18n() rewrites #topicTitle / #topicSub /
     #topicDisclaimer using the current appMode. Without this call
     the topic-setup copy could drift if anything else touched those
     elements between mode-sync ticks. Cheap and idempotent. */
  try{syncAppModeUI()}catch(e){reportSwallow(e, 'i18n.setLang.syncAppModeUI'); }
  /* Update language toggle active state. Only en + zh are supported;
     removing ja/ko from this iteration avoids keeping dead UI states
     if the toggle HTML reverts. */
  syncLanguageToggleOptions(lang);
  /* Update the small "EN/中" label in the sidebar header so the
     quick-toggle button reflects the active language. */
  try{
    const lbl=document.getElementById("langToggleLabel");
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
  const els=document.querySelectorAll("[data-i18n-key]");
  for(let i=0;i<els.length;i++){
    const key=els[i].getAttribute("data-i18n-key") || "";
    const val=t(key);
    if(val&&val!==key)els[i].textContent=val;
  }
}

function translateAttribute(selector: string,keyAttribute: string,targetAttribute: string){
  const elements=document.querySelectorAll(selector);
  for(let i=0;i<elements.length;i++){
    const key=elements[i].getAttribute(keyAttribute) || "";
    const value=t(key);
    if(value&&value!==key)elements[i].setAttribute(targetAttribute,value);
  }
}

function refreshThemeLabel(){
  if(typeof syncThemeUI === "function"){
    try{syncThemeUI()}catch(e){reportSwallow(e, 'i18n.applyI18n.syncThemeUI'); /* theme UI may not be mounted yet */ }
  }
}

function updateComposerLabels(){
  const ch=document.getElementById("chatInputHint");
  if(ch)ch.textContent=t("chat.hint");
}

function updateTopicSetupCopy(){
  const tt=document.getElementById("topicTitle");
  if(tt){
    if(typeof renderGreeting==="function")renderGreeting();
    else tt.textContent=t(appMode==="chat"?"topic.titleChat":"topic.title");
  }
  const ts=document.getElementById("topicSub");
  if(ts)ts.textContent=t(appMode==="chat"?"topic.subChat":"topic.subtitle");
  const tdisc=document.getElementById("topicDisclaimer");
  if(tdisc)tdisc.textContent=t(appMode==="chat"?"topic.disclaimerChat":"profile.disclaimerTutor");
}

function refreshDynamicSurfaces(){
  /* Exam content is generated dynamically, so static data-i18n scanning
     cannot update it. The React-owned screen reads the locale and redraws
     from its store without replacing form values or answers. */
  if(browser.stateStore?.read("_examInView")){
    dispatchExam({ type: 'exam/set', key: 'examLocaleRevision', value: examStore.getState().examLocaleRevision + 1 });
  }
}

function applyI18n(){
  translateTextNodes();
  /* Keep the profile modal toggle aligned with the active locale. */
  try{syncLanguageToggleOptions(getCurrentLanguage())}catch(e){reportSwallow(e, 'i18n.applyI18n.profileLangChips'); }
  translateAttribute("[data-i18n-placeholder]","data-i18n-placeholder","placeholder");
  translateAttribute("[data-i18n-title]","data-i18n-title","title");
  translateAttribute("[data-i18n-aria]","data-i18n-aria","aria-label");
  refreshThemeLabel();
  updateComposerLabels();
  updateTopicSetupCopy();
  refreshDynamicSurfaces();
}
/* Load saved language preference. languageState.ts is the single source
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
  const s=localStorage.getItem("socrates-lang-app");
  /* Validate saved language against supported names, not the async-loaded
     locale table, or a valid preference would be wiped before it lands. */
  if(s==="en"||s==="zh"){
    setCurrentLanguage(s);
  }else if(!s){
    /* No preference recorded yet — persist the default so the
       next load picks up the same value instead of leaving the
       slot empty. */
    try{localStorage.setItem("socrates-lang-app",getCurrentLanguage())}catch(e){reportSwallow(e, 'i18n.bootstrap.persistDefault'); }
  }else{
    /* Stale value (e.g. user downgraded and we removed a locale) —
     * overwrite with the default so the entry stays canonical. */
    try{localStorage.removeItem("socrates-lang-app");localStorage.setItem("socrates-lang-app",getCurrentLanguage())}catch(e){reportSwallow(e, 'i18n.bootstrap.resetStale', 'expected'); }
  }
}catch(e){reportSwallow(e, 'i18n.bootstrap.readPref', 'expected'); }
/* Fetch only the saved locale in parallel with boot. When it lands, run the
   full setLang path so DOM-owned strings and React language listeners repaint. */
const _initialLocaleReady=getCurrentLanguage()==="zh"?ensureZh():ensureEn();
_initialLocaleReady.then(function(){if(I18N[getCurrentLanguage()]){try{setLang(getCurrentLanguage())}catch(e){reportSwallow(e, 'i18n.bootstrap.localeRetry'); /* applyI18n retry covers stragglers */ }}});
/* Set the document's language before boot. The selected async locale calls
   setLang() on arrival and applies every data-i18n string before auth boot
   reveals the app or gate. */
try{
  const lbl=document.getElementById("langToggleLabel");
  if(lbl)lbl.textContent=getCurrentLanguage()==="en"?"EN":"中";
  document.documentElement.lang=getCurrentLanguage()==="zh"?"zh":"en";
  if(I18N[getCurrentLanguage()])applyI18n();
}catch(e){reportSwallow(e, 'i18n.bootstrap.initialApply'); }

/* Expose translation helpers used by legacy markup and modules. */
browser.t = t;
browser.applyI18n = applyI18n;
/* auth/boot.js awaits this (bounded) before revealing UI. Always a Promise. */
browser.__i18nReady = _initialLocaleReady;
