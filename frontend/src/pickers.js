/* ─── Model Picker + Chat Model + Extensions Picker Module ───
   Extracted from main.js sections (Model Picker, Chat Model, Extensions Picker).
   Cross-module dependencies accessed via window.* — these are set by main.js
   before any event handler fires.
   ============================================================ */

import { esc } from './render/helpers.js';
import { webSearchOn, setWebSearchOn } from './config/providers.js';
import { stateStore } from './state/store.js';
import { showToast } from './ui/toast.js';

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

/* ─── Model glyph — visual fingerprint per provider ─────────────────
   The chat-header model picker previously showed the model label as a
   plain string. Long names (e.g. user-defined providers with a full
   model id) would ellipsis-truncate, which looks incomplete and
   unreadable. This function returns a compact, unique SVG glyph per
   provider so the trigger button can show a recognisable visual
   marker instead of (or alongside) the text.

   Identification strategy:
     1. Built-in Beagle gets a dedicated "compass" mark.
     2. Known upstream providers (openai / anthropic / google / meta /
        mistral / deepseek / qwen / zhipu / moonshot / ollama) get a
        distinctive shape + provider accent colour, mapped from the
        configured base URL or model name.
     3. Anything else falls back to a deterministic hash of the model
        id + URL, picking one of the remaining glyphs so two
        differently-configured providers never collide.

   The returned object is plain data (kind + tint) so the SVG can be
   rendered into both the trigger button and the dropdown rows with
   matching visuals. */
var GLYPH_KINDS = ["compass", "hexagon", "diamond", "triangle", "tilt-square", "wave", "mountain", "leaf"];

function _hashString(s){
  /* djb2 — fast, deterministic, good enough for picking a stable
     visual variant for arbitrary user-defined providers. */
  var h = 5381;
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

function _glyphFromProvider(p){
  if (!p) return { kind: "compass", tint: "var(--accent-000)" };
  if (p.isBuiltIn) return { kind: "compass", tint: "var(--accent-000)" };
  var url = (p.url || "").toLowerCase();
  var model = (p.model || "").toLowerCase();
  var label = (p.label || "").toLowerCase();
  var id = (p.id || "").toLowerCase();
  var hay = url + " " + model + " " + label + " " + id;

  /* Provider fingerprint table — keyed by substring match. Order
     matters: more specific markers come first. */
  var markers = [
    { match: /openai|gpt-|o1-|o3-|chatgpt|api\.openai/,        kind: "hexagon",     tint: "#10a37f" },
    { match: /anthropic|claude/,                              kind: "diamond",     tint: "#cc785c" },
    { match: /google|gemini|gemma|generativelanguage/,        kind: "triangle",    tint: "#4a8af4" },
    { match: /meta\.com|llama|meta-llama/,                    kind: "tilt-square", tint: "#0866ff" },
    { match: /mistral|codestral|mixtral/,                     kind: "leaf",        tint: "#ff7000" },
    { match: /deepseek/,                                      kind: "wave",        tint: "#5b6cf2" },
    { match: /qwen|alibaba|dashscope|tongyi|aliyun/,          kind: "mountain",    tint: "#a855f7" },
    { match: /zhipu|glm|bigmodel|chatglm/,                    kind: "hexagon",     tint: "#3273ff" },
    { match: /moonshot|kimi/,                                 kind: "diamond",     tint: "#ffb800" },
    { match: /ollama|localhost|127\.0\.0\.1|0\.0\.0\.0/,      kind: "compass",     tint: "#7e8aa4" },
    { match: /cohere|command-r|command-/,                     kind: "wave",        tint: "#e879f9" },
    { match: /perplexity|pplx/,                               kind: "triangle",    tint: "#22b8cd" },
    { match: /xai|grok/,                                      kind: "tilt-square", tint: "#9aa3b2" },
    { match: /minimax|hailuo|abab/,                            kind: "leaf",        tint: "#f43f5e" },
  ];
  for (var i = 0; i < markers.length; i++) {
    if (markers[i].match.test(hay)) return markers[i];
  }
  /* Unknown provider — pick a stable glyph/tint pair by hashing the
     configuration so the same provider always renders the same mark. */
  var seed = (p.id || "") + "|" + (p.url || "") + "|" + (p.model || "");
  var h = _hashString(seed);
  var fallbackTints = ["#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#a855f7", "#22c55e", "#ec4899"];
  return { kind: GLYPH_KINDS[h % GLYPH_KINDS.length], tint: fallbackTints[h % fallbackTints.length] };
}

/* Render a model glyph as an inline SVG string. viewBox is 16x16 so
   it sits crisply at 14-18px. Every shape uses `currentColor` for
   its stroke and fill so the glyph inherits the parent colour
   (hover/active/menu-open).  Fill regions are dimmed with
   `opacity` instead of a different colour, which keeps the glyph
   readable on both light and dark surfaces and lets the trigger's
   accent colour show through on the active model. */
function modelGlyphSVG(g, opts){
  opts = opts || {};
  var size = opts.size || 16;
  var sw = 1.5;
  var k = g.kind;
  var body = "";
  if (k === "compass") {
    /* Outer circle + inner dot + tick marks — reads as a compass face. */
    body = '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="' + sw + '"/>' +
           '<circle cx="8" cy="8" r="1.6" fill="currentColor" fill-opacity="0.85" stroke="none"/>' +
           '<path d="M8 2.2v2.4M8 11.4v2.4M2.2 8h2.4M11.4 8h2.4" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" opacity="0.5"/>';
  } else if (k === "hexagon") {
    /* Pointy-top hex outline + softer inner hex. */
    body = '<path d="M8 1.6 13.7 4.8v6.4L8 14.4 2.3 11.2V4.8z" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
           '<path d="M8 5.4 11 7.2v3.6L8 12.6 5 10.8V7.2z" fill="currentColor" fill-opacity="0.22" stroke="none"/>';
  } else if (k === "diamond") {
    /* Rounded diamond + horizontal seam. */
    body = '<path d="M8 1.8 14.2 8 8 14.2 1.8 8z" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
           '<path d="M3.8 8h8.4" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" opacity="0.7"/>';
  } else if (k === "triangle") {
    /* Equilateral triangle + centre dot. */
    body = '<path d="M8 2 14.4 13.2H1.6z" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
           '<circle cx="8" cy="9.2" r="1.4" fill="currentColor" fill-opacity="0.85" stroke="none"/>';
  } else if (k === "tilt-square") {
    /* Tilted square + corner accent. */
    body = '<rect x="2.6" y="2.6" width="10.8" height="10.8" rx="1.6" transform="rotate(20 8 8)" fill="none" stroke="currentColor" stroke-width="' + sw + '"/>' +
           '<circle cx="11.6" cy="4.4" r="1.2" fill="currentColor" fill-opacity="0.85" stroke="none"/>';
  } else if (k === "wave") {
    /* Twin sine arcs + a small dot at the trough. */
    body = '<path d="M1.6 9.6c1.6-3.2 3.2-3.2 4.8 0s3.2 3.2 4.8 0 3.2-3.2 4.8 0" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round"/>' +
           '<circle cx="6.4" cy="9.6" r="1.1" fill="currentColor" fill-opacity="0.85" stroke="none"/>';
  } else if (k === "mountain") {
    /* Twin peaks with a third short peak between. */
    body = '<path d="M1.6 13.2 5.4 6.6 7.6 9.4 9.6 6.8 11.8 9.8 14.4 13.2z" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
           '<circle cx="11.8" cy="9.8" r="0.9" fill="currentColor" fill-opacity="0.85" stroke="none"/>';
  } else if (k === "leaf") {
    /* Two overlapping leaf curves meeting at a point. */
    body = '<path d="M3 13c0-5.5 4.5-10 10-10 0 5.5-4.5 10-10 10z" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linejoin="round"/>' +
           '<path d="M5.2 10.8C7 9 9 7.2 11.2 5.6" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" opacity="0.65"/>';
  } else {
    body = '<circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" stroke-width="' + sw + '"/>';
  }
  return '<svg class="model-glyph" viewBox="0 0 16 16" width="' + size + '" height="' + size + '" fill="none" aria-hidden="true">' + body + '</svg>';
}

/* Public helpers — used by the trigger renderer and the dropdown
   rows. `getModelGlyph` returns the {kind,tint} object; the SVG
   string is built on demand so callers can size it independently. */
export function getModelGlyph(p){ return _glyphFromProvider(p); }
export function renderModelGlyph(p, opts){ return modelGlyphSVG(_glyphFromProvider(p), opts); }

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
    /* The backend assigns "Default" when a user leaves the optional
       provider label blank.  In a picker that is not a useful model name;
       prefer the configured model id in that case. */
    var displayName = (p.label && p.label !== "Default") ? p.label : (p.model || p.label || "Model");
    var name = esc(displayName);
    var sub = p.isBuiltIn ? "" : esc(p.model || "");
    var url = esc(p.url || "");
    var subLine = sub && sub !== name ? sub : (p.isBuiltIn ? "" : url);
    /* Per-provider glyph — keeps the dropdown visually consistent with
       the trigger button so users can pair the two at a glance. */
    var glyph = modelGlyphSVG(_glyphFromProvider(p), { size: 18 });
    html += '<button type="button" class="model-picker-item' + (isActive ? " active" : "") +
            '" data-id="' + esc(p.id || "") + '" role="option" aria-selected="' + isActive + '">';
    html += '<span class="model-picker-item-glyph">' + glyph + '</span>';
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
  setActiveProvider(id);
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
    label.textContent=(active.label && active.label!=="Default") ? active.label : (active.model||active.label||"Model");
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
  html += '<button type="button" class="model-picker-add">';
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
  var add = e.target.closest(".model-picker-add");
  if (add && add.closest("#modelPickerMenu, #chatModelMenu")) {
    closeModelPicker();
    closeChatModelMenu();
    document.dispatchEvent(new CustomEvent("socrates:open-settings"));
    return;
  }
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
/* Internal version used by syncModelPills to avoid redundant calls.
   The visible trigger is just a glyph now (see index.html) — the model
   label is preserved on a sr-only <span> so screen readers still hear
   the provider name. The glyph itself swaps on every model change. */
function _syncChatModelInternal(){
  var label=document.getElementById("chatModelLabel");
  var trigger=document.getElementById("chatModel");
  var glyphEl=trigger && trigger.querySelector(".chat-model-glyph");
  if(!label && !glyphEl)return;
  var p=getActiveProvider();
  var displayName=p?((p.label&&p.label!=="Default")?p.label:(p.model||p.label||"Model")):"Model";
  if(label){
    label.textContent=displayName;
    label.title=p&&!p.isBuiltIn?(p.model||""):"";
  }
  if(trigger){
    if(p){
      trigger.classList.add("has-model");
      trigger.setAttribute("data-glyph", (_glyphFromProvider(p)).kind);
    } else {
      trigger.classList.remove("has-model");
      trigger.removeAttribute("data-glyph");
    }
    /* Update the accessible label to match the visible glyph so AT
       users hear the same provider name everyone else sees. */
    if(p) trigger.setAttribute("aria-label", "Model: " + displayName + ". Click to switch.");
    else trigger.setAttribute("aria-label", "Pick or configure the model for this conversation");
  }
  if(glyphEl){
    var g = p ? _glyphFromProvider(p) : { kind: "compass", tint: "var(--accent-000)" };
    glyphEl.innerHTML = modelGlyphSVG(g, { size: 14 });
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
  html += '<button type="button" class="model-picker-add">';
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
  if(btn)btn.addEventListener("click",function(){
    toggleChatModelMenu();
  });
})();

/* ============================================================
   EXTENSIONS PICKER — multi-select dropdown
   ============================================================ */
/* The Extension panel provides toggles the user actively controls
 * each turn:
 *   - Extensive thinking (verbose scholar prompt ↔ concise prompt)
 *   - Deep Research (autonomous multi-step research agent)
 *   - Generate exam (action button, no .on state)
 * Tutor/chat mode is now switched via the top-bar segmented control. */

/* SVG icons for each extension — used in both the picker menu and
   the inline chip display. */
var EXTENSION_ICONS = {
  extensiveThinking: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v1a3 3 0 0 0 3 3"/><path d="M12 22a3 3 0 0 0 3-3v-1h2a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1v-1a3 3 0 0 0-3-3"/><circle cx="12" cy="12" r="1.5" opacity="0.5"/></svg>',
  deepResearch: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21l6-3 6 3 6-3V3l-6 3-6-3-6 3z"/><path d="M9 3v15"/><path d="M15 6v15"/></svg>',
  exam: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3h16v18H4z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="m15 15 1.5 1.5L20 13"/></svg>',
};

var EXTENSIONS=[
  {key:"extensiveThinking", name:"Extensive thinking",
   icon: EXTENSION_ICONS.extensiveThinking,
   on:!!window.extensiveThinkingOn, onChange:function(v){
     window.extensiveThinkingOn=v;
     try{localStorage.setItem("socrates-extensive-thinking",JSON.stringify(!!window.extensiveThinkingOn))}catch {}
     /* Use setActiveTemplate to show the chip when active */
     if(v && typeof window.setActiveTemplate === "function"){
       window.setActiveTemplate({
         id: "tpl-extensive-thinking",
         title: "Extensive thinking",
         icon: EXTENSION_ICONS.extensiveThinking,
         systemPrompt: "",
         body: "",
         hint: (typeof window.t === "function" && window.t("effort.high.note")) || "More deliberate reasoning",
         extensionKey: "extensiveThinking"
       });
     }else if(!v && typeof window.clearActiveTemplate === "function"){
       /* Only clear if the active template is ours */
       if(window._activeTemplate && window._activeTemplate.extensionKey === "extensiveThinking"){
         window.clearActiveTemplate();
       }
     }
     syncExtensionsUI();
   }},
  {key:"deepResearch", name:"Deep Research",
   icon: EXTENSION_ICONS.deepResearch,
   on:false, onChange:function(v){
     var ext = EXTENSIONS.find(function(e){return e.key==="deepResearch"});
     if(ext) ext.on = !!v;
     try{ window.deepResearchOn = !!v; }catch(_){}
     /* Use setActiveTemplate to show the chip when active */
     if(v && typeof window.setActiveTemplate === "function"){
       window.setActiveTemplate({
         id: "tpl-deep-research",
         title: "Deep Research",
         icon: EXTENSION_ICONS.deepResearch,
         systemPrompt: "",
         body: "",
         hint: (typeof window.t === "function" && window.t("composer.deepResearchHint")) || "Plan, search, read, report",
         extensionKey: "deepResearch"
       });
     }else if(!v && typeof window.clearActiveTemplate === "function"){
       if(window._activeTemplate && window._activeTemplate.extensionKey === "deepResearch"){
         window.clearActiveTemplate();
       }
     }
     if(v){
       var surface = getVisibleComposerSurface();
       if(getComposerMarkdown(surface).trim() && typeof window.launchDeepResearch === "function"){
         window.launchDeepResearch();
       }else{
         focusComposer(surface);
         showToast((typeof window.t === "function" && window.t("composer.deepResearch.hint")) || "Enter a research topic, then press send.");
       }
     }
     if(typeof window.syncQuickChips === "function") window.syncQuickChips();
     syncExtensionsUI();
   }},
  {key:"exam",         name:"Generate exam",
   icon: EXTENSION_ICONS.exam,
   on:false, onChange:function(){
     if(typeof window.openNav==="function"){window.openNav('exam');}
     else if(typeof window.openExamPanel==="function"){window.openExamPanel();}
     else if(typeof window.openExamModal==="function"){window.openExamModal();}
     syncExtensionsUI();
   }},
];
function renderExtensionsMenu(){
  var menu=document.getElementById("extensionsMenu");
  if(!menu)return;
  var html="";
  EXTENSIONS.forEach(function(ext){
    html+='<button type="button" class="extensions-item'+(ext.on?" on":"")+'" data-ext="'+esc(ext.key)+'" role="option" aria-selected="'+!!ext.on+'">';
    html+='<span class="extensions-item-check" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/><circle cx="20" cy="5" r="1.2" opacity="0.4"/></svg></span>';
    html+='<span class="extensions-item-icon" aria-hidden="true">'+(ext.icon||'')+'</span>';
    html+='<span class="extensions-item-main">';
    html+='<span class="extensions-item-name">'+esc(ext.name)+'</span>';
    html+='</span>';
    html+='</button>';
  });
  menu.innerHTML=html;
}
function toggleExtensionByKey(key){
  /* Route through the extension registry when a module owns the key —
     it handles onActivate/onDeactivate (side effects, persistence,
     auto-launch). Falls back to the inline EXTENSIONS entry for keys
     not yet migrated so behavior is unchanged. */
  if (typeof window.__socratesExtensionDispatch === "function") {
    if (window.__socratesExtensionDispatch(key)) {
      syncExtensionsUI();
      return;
    }
  }
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
  /* Re-sync .on from window state so the checkmarks reflect the
   * registry-driven toggles (extensiveThinking + deepResearch). */
  EXTENSIONS.forEach(function(ext){
    if(ext.key==="extensiveThinking") ext.on = !!window.extensiveThinkingOn;
    if(ext.key==="deepResearch") ext.on = !!window.deepResearchOn;
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
    stateStore.dispatch({type:"state/batch",patch:{
      searchContext:"",
      searchContextAt:0,
      searchContextCount:0,
      searchContextError:null,
      searchContextQuery:null
    }});
    window.setSearchPill("ok",0,"");
  }else if(window.stateStore.read("topic")){
    window.fetchWebContext(window.stateStore.read("topic"));
  }
}
function syncWebSearchUI(){
  syncExtensionsUI();
  if(webSearchOn&&window.stateStore.read("topic")&&!window.stateStore.read("searchContext")){
    window.fetchWebContext(window.stateStore.read("topic"));
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
import {
  focusComposer,
  getComposerMarkdown,
  getVisibleComposerSurface,
} from './react/composer-input/controller.ts';

import { setActiveProvider } from './ui/settings.js';
