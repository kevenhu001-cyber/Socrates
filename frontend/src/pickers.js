/* ─── Model Picker + Chat Model + Extensions Picker Module ───
   Extracted from main.js sections (Model Picker, Chat Model, Extensions Picker).
   Cross-module dependencies accessed via window.* — these are set by main.js
   before any event handler fires.
   ============================================================ */

import { esc } from './render/helpers.js';
import { webSearchOn, setWebSearchOn } from './config/providers.js';

/* P_init-sync — providers가 서버에서 로드되었는지 추적.
   syncModelPills()가 providers=[] 상태에서 "Add a model"을 렌더링하지 않고
   중립 상태를 표시하도록 함. refreshApiConfig()가 완료되면 true 설정. */
var _providersFetched=false;
function markProvidersFetched(){_providersFetched=true;}

/* ── getActiveProvider — closely tied to model picker ── */
function getActiveProvider(){
  if(!window.apiConfig||!window.apiConfig.activeId)return null;
  return (window.apiConfig.providers||[]).find(function(p){return p.id===window.apiConfig.activeId})||null;
}

/* ─── Shared: render provider items HTML ───
   Used by syncModelPills() and toggleChatModelMenu() to avoid
   duplicating the same item rendering code. */
function renderProviderItemsHTML(providers, activeId){
  var html = "";
  if (!providers.length) {
    return '<div class="model-picker-empty">No models yet. Open Settings to add one.</div>';
  }
  var sorted = providers.slice().sort(function(a, b){
    if (a.isBuiltIn && !b.isBuiltIn) return -1;
    if (!a.isBuiltIn && b.isBuiltIn) return 1;
    return 0;
  });
  sorted.forEach(function(p){
    var isActive = p && p.id === activeId;
    var name = esc(p.label || p.model || "Model");
    var sub = p.isBuiltIn ? "" : esc(p.model || "");
    var url = esc(p.url || "");
    var subLine = sub && sub !== name ? sub : (p.isBuiltIn ? "" : url);
    html += '<button type="button" class="model-picker-item' + (isActive ? " active" : "") +
            '" data-id="' + esc(p.id || "") + '" role="option" aria-selected="' + isActive + '">';
    html += '<span class="model-picker-item-main"><span class="model-picker-item-name">' + name + '</span>';
    if (subLine) html += '<span class="model-picker-item-sub">' + subLine + '</span>';
    html += '</span>';
    html += '<svg class="model-picker-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/><circle cx="20" cy="5" r="1.2" opacity="0.4"/></svg>';
    html += '</button>';
  });
  return html;
}

/* ============================================================
   MODEL PICKER
   ============================================================ */
function pickActiveProviderById(id){
  if(!id)return;
  window.setActiveProvider(id);
  closeModelPicker();
  syncChatModel();
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
  var picker=document.getElementById("modelPicker");
  var label=document.getElementById("modelPickerLabel");
  var menu=document.getElementById("modelPickerMenu");
  var trigger=document.getElementById("modelPickerTrigger");
  if(!picker||!label||!menu||!trigger)return;
  /* P_init-order — on cold start, window.apiConfig may not be set yet
     (main.js exports it after calling syncModelPills during module
     init). Guard against undefined so a missing config doesn't blow
     up the entire boot sequence. */
  /* P_init-sync — providers가 아직 로드되지 않았으면 중립 상태 표시.
     "Add a model"은 서버 응답 후 진짜 빈 상태일 때만 노출. */
  var providers=(window.apiConfig&&window.apiConfig.providers)||[];
  if(!_providersFetched && !providers.length){
    label.textContent="Model";
    label.title="";
    trigger.classList.remove("has-model");
    menu.innerHTML='<div class="model-picker-empty" style="opacity:0.5">Loading…</div>';
    _syncChatModelInternal();
    return;
  }
  var active=providers.find(function(p){return p&&p.id===window.apiConfig.activeId});
  /* P_model-autofallback — if no activeId is set but the providers
     list includes BEAGLE_BUILT_IN, auto-select it so the model
     picker never shows "Pick a model" on cold boot. */
  if(!active && window.BEAGLE_BUILT_IN){
    var beagle = providers.find(function(p){return p && p.id === window.BEAGLE_BUILT_IN.id});
    if(beagle){
      window.apiConfig.activeId = beagle.id;
      active = beagle;
    }
  }
  if(active){
    label.textContent=(active.label||active.model||"Model");
    label.title=active.isBuiltIn?"":((active.url||"")+" · "+(active.model||""));
    trigger.classList.add("has-model");
  }else{
    label.textContent=providers.length?"Pick a model":"Add a model";
    label.title="";
    trigger.classList.remove("has-model");
  }
  var html = renderProviderItemsHTML(providers, window.apiConfig.activeId);
  if (html) {
    html += '<div class="model-picker-divider"></div>';
  }
  html += '<button type="button" class="model-picker-add" onclick="closeModelPicker();window.openSettings()">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="5" opacity="0.25"/><path d="M12 8v8M8 12h8"/></svg>';
  html += providers.length ? 'Manage models…' : 'Add a model…';
  html += '</button>';
  menu.innerHTML=html;
  _syncChatModelInternal();
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
/* Event delegation on model picker menu items */
document.addEventListener("click", function(e){
  var item = e.target.closest(".model-picker-item");
  if (!item) return;
  var menu = item.closest("#modelPickerMenu, #chatModelMenu");
  if (!menu) return;
  var id = item.getAttribute("data-id");
  if (!id) return;
  if (menu.id === "modelPickerMenu") {
    pickActiveProviderById(id);
  } else {
    pickChatModel(id);
  }
});

/* ============================================================
   CHAT MODEL — display active model in chat header, switch mid-conversation
   ============================================================ */
/* Internal version used by syncModelPills to avoid redundant calls */
function _syncChatModelInternal(){
  var label=document.getElementById("chatModelLabel");
  if(!label)return;
  var trigger=document.getElementById("chatModel");
  var p=getActiveProvider();
  label.textContent=p?(p.label||p.model||"Model"):"Model";
  label.title=p&&!p.isBuiltIn?(p.model||""):"";
  if(trigger){
    if(p)trigger.classList.add("has-model");
    else trigger.classList.remove("has-model");
  }
}
function syncChatModel(){
  _syncChatModelInternal();
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
  var providers=window.apiConfig.providers||[];
  /* Reuse the shared renderProviderItemsHTML to avoid duplication */
  var html = renderProviderItemsHTML(providers, window.apiConfig.activeId);
  if (html) {
    html += '<div class="model-picker-divider"></div>';
  }
  html += '<button type="button" class="model-picker-add" onclick="closeChatModelMenu();window.openSettings()">';
  html += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="5" opacity="0.25"/><path d="M12 8v8M8 12h8"/></svg>';
  html+=providers.length?'Manage models…':'Add a model…';
  html+='</button>';
  menu.innerHTML=html;
  menu.classList.remove("hidden");
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
/* Bind the chat model trigger via JS. */
(function(){
  var btn=document.getElementById("chatModel");
  if(btn)btn.addEventListener("click",function(e){
    toggleChatModelMenu();
  });
})();

/* ============================================================
   EXTENSIONS PICKER — multi-select dropdown
   ============================================================ */
/* The Extension panel provides toggles the user actively controls
 * each turn:
 *   - Extensive thinking (verbose scholar prompt ↔ concise prompt)
 *   - Generate exam (action button, no .on state)
 * Tutor/chat mode is now switched via the top-bar segmented control. */
var EXTENSIONS=[
  {key:"extensiveThinking", name:"Extensive thinking",
   on:!!window.extensiveThinkingOn, onChange:function(v){
     window.extensiveThinkingOn=v;
     try{localStorage.setItem("socrates-extensive-thinking",JSON.stringify(!!window.extensiveThinkingOn))}catch(e){}
     syncExtensionsUI();
   }},
  {key:"deepResearch", name:"Deep Research",
   on:false, onChange:function(v){
     var ext = EXTENSIONS.find(function(e){return e.key==="deepResearch"});
     if(ext) ext.on = !!v;
     /* P_deep-research-fix — mirror the mode onto a window-level flag.
        main.js runs in a separate module scope and cannot see the
        module-local EXTENSIONS array, so the send path must read
        window.deepResearchOn to know whether to route to research. */
     try{ window.deepResearchOn = !!v; }catch(_){}
     if(v){
       /* Prefer the VISIBLE composer (chat when a session is live,
          else the landing topic input) — the hidden one is empty and
          would swallow the launch. */
       var input = document.getElementById("chatInputArea");
       if(!input || input.offsetParent === null){
         var ti = document.getElementById("topicInput");
         if(ti) input = ti;
       }
       if(input && input.value.trim() && typeof window.launchDeepResearch === "function"){
         /* There's already a query — kick off research immediately. */
         window.launchDeepResearch();
       }else{
         /* No query yet — focus the composer and tell the user what to
            do next so the click has visible, understandable effect. */
         if(input && input.focus) input.focus();
         if(typeof window.showToast === "function"){
           window.showToast((typeof window.t === "function" && window.t("composer.deepResearch.hint")) || "Enter a research topic, then press send.");
         }
       }
     }
     if(typeof window.syncQuickChips === "function") window.syncQuickChips();
     syncExtensionsUI();
   }},
  {key:"exam",         name:"Generate exam",
   on:false, onChange:function(){window.openExamModal(); syncExtensionsUI();}},
];
function renderExtensionsMenu(){
  var menu=document.getElementById("extensionsMenu");
  if(!menu)return;
  var html="";
  EXTENSIONS.forEach(function(ext){
    html+='<button type="button" class="extensions-item'+(ext.on?" on":"")+'" data-ext="'+esc(ext.key)+'" role="option" aria-selected="'+!!ext.on+'">';
    html+='<span class="extensions-item-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/><circle cx="20" cy="5" r="1.2" opacity="0.4"/></svg></span>';
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
var _extMenuBound=false;
function bindExtensionsMenuClicks(){
  if(_extMenuBound)return;
  var menu=document.getElementById("extensionsMenu");
  if(!menu)return;
  _extMenuBound=true;
  menu.addEventListener("click",function(e){
    var btn=e.target.closest(".extensions-item");
    if(!btn)return;
    e.stopPropagation();
    toggleExtensionByKey(btn.getAttribute("data-ext"));
  });
}
/* P_timing-DCL — same rationale as attachments/render.js: the IIFE
 * runs before the DOM is ready, so getElementById("extensionsMenu")
 * returns null. Defer to DOMContentLoaded like the attachment wiring. */
function extDcl(){
  if(extDcl.ran)return; extDcl.ran=true;
  bindExtensionsMenuClicks();
  syncExtensionsUI();
}
if(typeof window !== "undefined"){
  window.addEventListener("DOMContentLoaded", extDcl);
  if(document.readyState !== "loading"){ try{ extDcl(); }catch(_){} }
}
function countActiveExtensions(){
  return EXTENSIONS.filter(function(e){return e.on}).length;
}
function syncExtensionsUI(){
  /* Only extensiveThinking needs .on re-synced from window state.
   * The exam entry is an action button; its .on stays false. */
  EXTENSIONS.forEach(function(ext){
    if(ext.key==="extensiveThinking") ext.on = !!window.extensiveThinkingOn;
  });
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

/* ── Web search toggle (used by extensions picker and settings) ── */
function toggleWebSearch(){
  var next = setWebSearchOn(!webSearchOn);
  syncWebSearchUI();
  if(!next){
    window.state.searchContext="";
    window.state.searchContextAt=0;
    window.state.searchContextCount=0;
    window.state.searchContextError=null;
    window.state.searchContextQuery=null;
    window.setSearchPill("ok",0,"");
    var p=document.getElementById("searchPill");if(p)p.classList.add("hidden");
  }else if(window.state.topic){
    window.fetchWebContext(window.state.topic).then(function(r){});
  }
}
function syncWebSearchUI(){
  syncExtensionsUI();
  if(webSearchOn&&window.state.topic&&!window.state.searchContext){
    window.fetchWebContext(window.state.topic);
  }else if(!webSearchOn){
    var p=document.getElementById("searchPill");if(p)p.classList.add("hidden");
  }
}

/* ── exports ── */
export {
  getActiveProvider,
  pickActiveProviderById,
  toggleModelPicker,
  openModelPicker,
  closeModelPicker,
  syncModelPills,
  syncChatModel,
  toggleChatModelMenu,
  closeChatModelMenu,
  pickChatModel,
  renderExtensionsMenu,
  toggleExtensionByKey,
  countActiveExtensions,
  syncExtensionsUI,
  toggleExtensionsPicker,
  openExtensionsPicker,
  closeExtensionsPicker,
  toggleWebSearch,
  syncWebSearchUI,
  markProvidersFetched,
};
export { EXTENSIONS };
