/* ─── Model Picker + Chat Model + Extensions Picker Module ───
   Extracted from main.js sections (Model Picker, Chat Model, Extensions Picker).
   Cross-module dependencies accessed via window.* — these are set by main.js
   before any event handler fires.
   ============================================================ */

import { esc } from './render/helpers.js';

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
    syncChatModel();
    return;
  }
  var active=providers.find(function(p){return p&&p.id===window.apiConfig.activeId});
  if(active){
    label.textContent=(active.label||active.model||"Model");
    label.title=active.isBuiltIn?"":((active.url||"")+" · "+(active.model||""));
    trigger.classList.add("has-model");
  }else{
    label.textContent=providers.length?"Pick a model":"Add a model";
    label.title="";
    trigger.classList.remove("has-model");
  }
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
      var isActive=p&&p.id===window.apiConfig.activeId;
      var name=esc(p.label||p.model||"Model");
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
  html+='<button type="button" class="model-picker-add" onclick="closeModelPicker();window.openSettings()">';
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
  var providers=window.apiConfig.providers||[];
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
      var isActive=p&&p.id===window.apiConfig.activeId;
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
  html+='<button type="button" class="model-picker-add" onclick="closeChatModelMenu();window.openSettings()">';
  html+='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
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
var EXTENSIONS=[
  {key:"webSearch",   name:"Web search",
   on:window.webSearchOn, onChange:function(v){window.webSearchOn=v;try{localStorage.setItem("socrates-websearch",JSON.stringify(window.webSearchOn))}catch(e){} syncExtensionsUI();}},
  {key:"tutorMode",   name:"Tutor mode",
   on:window.appMode==="tutor", onChange:function(v){
     /* P_tutor-toggle — Extensions 메뉴에서 Tutor 모드를 토글할 때
        toggleAppMode()를 통해 세션 저장/확인 로직을 거치도록 함.
        직접 appMode를 변경하면 진행 중인 세션 데이터가 손실됨. */
     if(typeof window.toggleAppMode==="function"){
       window.toggleAppMode();
     }else{
       window.appMode=v?"tutor":"chat";
       try{localStorage.setItem("socrates-appmode",window.appMode)}catch(e){}
       window.syncAppModeUI();
       window.syncSidebarForMode();
     }
     syncExtensionsUI();
   }},
  {key:"thinkingMode",name:"Show AI thinking",
   on:window.thinkingOn, onChange:function(v){window.thinkingOn=v;try{localStorage.setItem("socrates-thinking",JSON.stringify(window.thinkingOn))}catch(e){} syncExtensionsUI();}},
  {key:"exam",         name:"Generate exam",
   on:false, onChange:function(){window.openExamModal(); syncExtensionsUI();}},
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
(function bindExtensionsMenuClicks(){
  var menu=document.getElementById("extensionsMenu");
  if(!menu)return;
  menu.addEventListener("click",function(e){
    var btn=e.target.closest(".extensions-item");
    if(!btn)return;
    e.stopPropagation();
    toggleExtensionByKey(btn.getAttribute("data-ext"));
  });
})();
function countActiveExtensions(){
  return EXTENSIONS.filter(function(e){return e.on}).length;
}
function syncExtensionsUI(){
  EXTENSIONS[0].on=window.webSearchOn;
  EXTENSIONS[1].on=(window.appMode==="tutor");
  EXTENSIONS[2].on=window.thinkingOn;
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
  window.webSearchOn=!window.webSearchOn;
  try{localStorage.setItem("socrates-websearch",JSON.stringify(window.webSearchOn))}catch(e){}
  syncWebSearchUI();
  if(!window.webSearchOn){
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
  if(window.webSearchOn&&window.state.topic&&!window.state.searchContext){
    window.fetchWebContext(window.state.topic);
  }else if(!window.webSearchOn){
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
