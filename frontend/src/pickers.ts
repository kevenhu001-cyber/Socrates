/* ─── Model Picker + Chat Model + Extensions Picker Module ───
   Extracted from main.js sections (Model Picker, Chat Model, Extensions Picker).
   Cross-module dependencies accessed via window.* — these are set by main.js
   before any event handler fires.
   ============================================================ */

import { webSearchOn, setWebSearchOn } from './config/providers.ts';
import { getProviderConfigSnapshot, getActiveProvider as getActiveProviderConfig, setActiveProvider, setActiveProviderLocal, ProviderConfig } from './config/providerConfig.service.ts';
import { subscribeToProviderConfig } from './config/providerConfig.store.ts';
import { stateStore } from './state/store.ts';
import { openNav } from './sidebar/navigation.service.ts';
import { dispatchExtension } from './extensions/index.ts';
import { reportSwallow } from './util/reportSwallow.ts';
import { runtimeWindow as browserWindow } from "./types/runtimeWindow.ts";


/* ── getActiveProvider — closely tied to model picker ── */
function getActiveProvider(){
  return getActiveProviderConfig();
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
const GLYPH_KINDS = ["compass", "hexagon", "diamond", "triangle", "tilt-square", "wave", "mountain", "leaf"];
type GlyphProvider = Pick<ProviderConfig, 'id' | 'url' | 'model' | 'label' | 'isBuiltIn'>;
interface ModelGlyph { kind: string; tint: string }

function _hashString(s: string){
  /* djb2 — fast, deterministic, good enough for picking a stable
     visual variant for arbitrary user-defined providers. */
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) + s.charCodeAt(i);
    h = h & 0xffffffff;
  }
  return Math.abs(h);
}

function _glyphFromProvider(p: GlyphProvider | null){
  if (!p) return { kind: "compass", tint: "var(--accent-000)" };
  if (p.isBuiltIn) return { kind: "compass", tint: "var(--accent-000)" };
  const url = (p.url || "").toLowerCase();
  const model = (p.model || "").toLowerCase();
  const label = (p.label || "").toLowerCase();
  const id = (p.id || "").toLowerCase();
  const hay = url + " " + model + " " + label + " " + id;

  /* Provider fingerprint table — keyed by substring match. Order
     matters: more specific markers come first. */
  const markers = [
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
  for (let i = 0; i < markers.length; i++) {
    if (markers[i].match.test(hay)) return markers[i];
  }
  /* Unknown provider — pick a stable glyph/tint pair by hashing the
     configuration so the same provider always renders the same mark. */
  const seed = (p.id || "") + "|" + (p.url || "") + "|" + (p.model || "");
  const h = _hashString(seed);
  const fallbackTints = ["#6366f1", "#0ea5e9", "#14b8a6", "#f59e0b", "#ef4444", "#a855f7", "#22c55e", "#ec4899"];
  return { kind: GLYPH_KINDS[h % GLYPH_KINDS.length], tint: fallbackTints[h % fallbackTints.length] };
}

/* Render a model glyph as an inline SVG string. viewBox is 16x16 so
   it sits crisply at 14-18px. Every shape uses `currentColor` for
   its stroke and fill so the glyph inherits the parent colour
   (hover/active/menu-open).  Fill regions are dimmed with
   `opacity` instead of a different colour, which keeps the glyph
   readable on both light and dark surfaces and lets the trigger's
   accent colour show through on the active model. */
function modelGlyphSVG(g: ModelGlyph, opts: { size?: number } = {}){
  opts = opts || {};
  const size = opts.size || 16;
  const sw = 1.5;
  const k = g.kind;
  let body;
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
export function getModelGlyph(p: GlyphProvider | null): ModelGlyph { return _glyphFromProvider(p); }
export function renderModelGlyph(p: GlyphProvider | null, opts?: { size?: number }){ return modelGlyphSVG(_glyphFromProvider(p), opts); }

/* Shared typed data for the model menu rows in the landing and chat headers. */
function providerPickerItems(providers: readonly ProviderConfig[]){
  return providers.map(function(provider){
    return {
      id: String(provider && provider.id || ""),
      label: provider && provider.label ? String(provider.label) : undefined,
      model: provider && provider.model ? String(provider.model) : undefined,
      url: provider && provider.url ? String(provider.url) : undefined,
      isBuiltIn: Boolean(provider && provider.isBuiltIn),
      glyph: modelGlyphSVG(_glyphFromProvider(provider), { size: 18 }),
    };
  });
}

/* ============================================================
   MODEL PICKER
   ============================================================ */
function pickActiveProviderById(id: string){
  if(!id)return;
  Promise.resolve(setActiveProvider(id)).then(function () {
    closeModelPicker();
    syncChatModel();
  });
}
function getModelPickerElements() {
  const picker = document.getElementById("modelPicker");
  if (!picker) return null;
  return {
    picker,
    label: document.getElementById("modelPickerLabel"),
    menu: document.getElementById("modelPickerMenu"),
    trigger: document.getElementById("modelPickerTrigger"),
  };
}

function toggleModelPicker(){
  const els = getModelPickerElements();
  if(!els) return;
  if(els.picker.getAttribute("data-open")==="true") closeModelPicker();
  else return openModelPicker();
}

function openModelPicker(){
  const els = getModelPickerElements();
  if(!els) return;
  let ready;
  if(els.menu){
    const config=getProviderConfigSnapshot();
    if(config.fetched || (config.providers||[]).length) ready=renderPickerMenu(els.menu, config.providers||[], config.activeId);
    else {
      els.menu.textContent="Loading…";
      els.menu.setAttribute("aria-busy", "true");
    }
  }
  els.picker.setAttribute("data-open","true");
  if(els.trigger) els.trigger.setAttribute("aria-expanded","true");
  return ready;
}

function closeModelPicker(){
  const els = getModelPickerElements();
  if(!els) return;
  els.picker.setAttribute("data-open","false");
  if(els.trigger) els.trigger.setAttribute("aria-expanded","false");
}

function resolvePickerProvider(providers: readonly ProviderConfig[], activeId: string|null) {
  const active = providers.find(function (provider) { return provider.id === activeId; });
  if (!active) {
    const builtIn = providers.find(function (provider: { id: string; }) { return provider && provider.id === 'beagle-built-in'; });
    if (builtIn) {
      setActiveProviderLocal(builtIn.id);
      return { active: builtIn, activeId: builtIn.id };
    }
  }
  return { active: active, activeId: activeId };
}

function showPickerLoading(label: HTMLElement, trigger: HTMLElement, menu: HTMLElement) {
  label.textContent = "Model";
  label.title = "";
  trigger.classList.remove("has-model");
  menu.textContent = "Loading…";
  menu.setAttribute("aria-busy", "true");
}

function updatePickerSelection(label: HTMLElement, trigger: HTMLElement, providers: readonly ProviderConfig[], active: ProviderConfig | undefined) {
  if (active) {
    label.textContent = (active.label && active.label !== "Default")
      ? active.label
      : (active.model || active.label || "Model");
    label.title = active.isBuiltIn ? "" : ((active.url || "") + " · " + (active.model || ""));
    trigger.classList.add("has-model");
    return;
  }
  label.textContent = providers.length ? "Pick a model" : "Add a model";
  label.title = "";
  trigger.classList.remove("has-model");
}

function renderPickerMenu(menu: HTMLElement, providers: readonly ProviderConfig[], activeId: string|null|undefined) {
  const request = Number(menu.dataset.pickerRenderRequest || 0) + 1;
  menu.dataset.pickerRenderRequest = String(request);
  menu.setAttribute("aria-busy", "true");
  const host = import('./react/pickers/pickerMenuHost.tsx');
  return host.then(function (pickerMenu) {
    if (!menu.isConnected || Number(menu.dataset.pickerRenderRequest) !== request) return;
    pickerMenu.renderModelPickerMenu(menu, providerPickerItems(providers), activeId ?? undefined);
    menu.setAttribute("aria-busy", "false");
  }).catch(function (error) {
    reportSwallow(error, 'pickers.js:renderPickerMenu');
  });
}

function syncModelPills(){
  const els = getModelPickerElements();
  const providerConfig = getProviderConfigSnapshot();
  const providers=providerConfig.providers||[];

  if(els && els.label && els.menu && els.trigger){
    /* P_init-sync — providers가 아직 로드되지 않았으면 중립 상태 표시.
       "Add a model"은 서버 응답 후 진짜 빈 상태일 때만 노出. */
    if(!providerConfig.fetched && !providers.length){
      showPickerLoading(els.label, els.trigger, els.menu);
    } else {
      const { active, activeId } = resolvePickerProvider(providers, providerConfig.activeId);
      /* P_model-autofallback — if no activeId is set but the providers
         list includes the configured built-in provider, auto-select it so the model
         picker never shows "Pick a model" on cold boot. */
      updatePickerSelection(els.label, els.trigger, providers, active);
      if (els.picker.getAttribute("data-open") === "true") renderPickerMenu(els.menu, providers, activeId);
    }
  }
  _syncChatModelInternal();
}
/* Click outside the picker closes the menu. */
document.addEventListener("click",function(e){
  const p=document.getElementById("modelPicker");
  if(!p || p.getAttribute("data-open")!=="true")return;
  if(!p.contains((e.target as Node | null)))closeModelPicker();
});
/* Esc closes the menu. */
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape")return;
  const p=document.getElementById("modelPicker");
  if(!p || p.getAttribute("data-open")!=="true")return;
  closeModelPicker();
  e.stopPropagation();
});

subscribeToProviderConfig(function () {
  syncModelPills();
  syncChatModel();
});
/* Event delegation on model picker menu items */
document.addEventListener("click", function(e){
  const add = (e.target as Element)?.closest?.(".model-picker-add");
  if (add && add.closest("#modelPickerMenu, #chatModelMenu")) {
    closeModelPicker();
    closeChatModelMenu();
    document.dispatchEvent(new CustomEvent("socrates:open-settings"));
    return;
  }
  const item = (e.target as Element)?.closest?.(".model-picker-item");
  if (!item) return;
  const menu = item.closest("#modelPickerMenu, #chatModelMenu");
  if (!menu) return;
  const id = item.getAttribute("data-id");
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
function getChatModelElements() {
  const trigger = document.getElementById("chatModel");
  return {
    trigger,
    wrap: document.getElementById("chatModelWrap"),
    menu: document.getElementById("chatModelMenu"),
    label: document.getElementById("chatModelLabel"),
    glyphEl: trigger ? trigger.querySelector(".chat-model-glyph") : null,
  };
}

function _syncChatModelInternal(){
  const els = getChatModelElements();
  if(!els.label && !els.glyphEl)return;
  const p=getActiveProvider();
  const displayName = providerDisplayName(p);
  updateChatModelLabel(els.label, p, displayName);
  updateChatModelTrigger(els.trigger, p, displayName);
  updateChatModelGlyph(els.glyphEl, p);
}

function providerDisplayName(provider: ProviderConfig|null) {
  if (!provider) return "Model";
  return (provider.label && provider.label !== "Default")
    ? provider.label
    : (provider.model || provider.label || "Model");
}

function updateChatModelLabel(label: HTMLElement|null, provider: ProviderConfig|null, displayName: string) {
  if (!label) return;
  label.textContent = displayName;
  label.title = provider && !provider.isBuiltIn ? (provider.model || "") : "";
}

function updateChatModelTrigger(trigger: HTMLElement|null, provider: ProviderConfig|null, displayName: string) {
  if (!trigger) return;
  trigger.classList.toggle("has-model", !!provider);
  if (provider) trigger.setAttribute("data-glyph", _glyphFromProvider(provider).kind);
  else trigger.removeAttribute("data-glyph");
  /* Keep the accessible label aligned with the visible model glyph. */
  trigger.setAttribute(
    "aria-label",
    provider ? "Model: " + displayName + ". Click to switch." : "Pick or configure the model for this conversation",
  );
}

function updateChatModelGlyph(glyphEl: Element|null, provider: ProviderConfig|null) {
  if (!glyphEl) return;
  const glyph = provider ? _glyphFromProvider(provider) : { kind: "compass", tint: "var(--accent-000)" };
  glyphEl.innerHTML = modelGlyphSVG(glyph, { size: 14 });
}
function syncChatModel(){
  _syncChatModelInternal();
}
function toggleChatModelMenu(){
  const els = getChatModelElements();
  if(!els.wrap || !els.menu)return;
  if(els.wrap.getAttribute("data-open")==="true"){closeChatModelMenu();return}
  els.wrap.setAttribute("data-open","true");
  if(els.trigger){
    els.trigger.classList.add("menu-open");
    els.trigger.setAttribute("aria-expanded","true");
  }
  const providerConfig = getProviderConfigSnapshot();
  const providers=providerConfig.providers||[];
  renderPickerMenu(els.menu, providers, providerConfig.activeId);
  els.menu.classList.remove("hidden");
  els.menu.style.setProperty("display","block","important");
  els.menu.style.setProperty("opacity","1","important");
  els.menu.style.setProperty("visibility","visible","important");
}
function closeChatModelMenu(){
  const els = getChatModelElements();
  if(els.wrap)els.wrap.setAttribute("data-open","false");
  if(els.menu){
    els.menu.classList.add("hidden");
    els.menu.style.removeProperty("display");
    els.menu.style.removeProperty("opacity");
    els.menu.style.removeProperty("visibility");
  }
  if(els.trigger){
    els.trigger.classList.remove("menu-open");
    els.trigger.setAttribute("aria-expanded","false");
  }
}
function pickChatModel(id: string){
  if(!id)return;
  pickActiveProviderById(id);
  closeChatModelMenu();
  syncChatModel();
}
/* Click outside closes the menu. */
document.addEventListener("click",function(e){
  const els = getChatModelElements();
  if(!els.wrap)return;
  if(els.wrap.getAttribute("data-open")!=="true")return;
  if(!els.wrap.contains((e.target as Node | null)))closeChatModelMenu();
});
/* Bind the chat model trigger via JS. */
(function(){
  const btn=document.getElementById("chatModel");
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
 *   - Generate exam (action button, no .on state)
 * Tutor/chat mode is now switched via the top-bar segmented control. */

/* SVG icons for each extension — used in both the picker menu and
   the inline chip display. */
const EXTENSION_ICONS = {
  extensiveThinking: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v1H7a2 2 0 0 0-2 2v1a2 2 0 0 0 2 2h1v1a3 3 0 0 0 3 3"/><path d="M12 22a3 3 0 0 0 3-3v-1h2a2 2 0 0 0 2-2v-1a2 2 0 0 0-2-2h-1v-1a3 3 0 0 0-3-3"/><circle cx="12" cy="12" r="1.5" opacity="0.5"/></svg>',
  exam: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 3h16v18H4z"/><path d="M8 8h8M8 12h5M8 16h3"/><path d="m15 15 1.5 1.5L20 13"/></svg>',
};

const EXTENSIONS=[
  {key:"extensiveThinking", name:"Extensive thinking",
   icon: EXTENSION_ICONS.extensiveThinking,
   on:!!browserWindow.extensiveThinkingOn, onChange:function(v: boolean){
     browserWindow.extensiveThinkingOn=v;
     try{localStorage.setItem("socrates-extensive-thinking",JSON.stringify(!!browserWindow.extensiveThinkingOn))}catch (error) { reportSwallow(error, 'pickers.js:433', 'expected'); }
     /* Use setActiveTemplate to show the chip when active */
     if(v && typeof browserWindow.setActiveTemplate === "function"){
       browserWindow.setActiveTemplate({
         id: "tpl-extensive-thinking",
         title: "Extensive thinking",
         icon: EXTENSION_ICONS.extensiveThinking,
         systemPrompt: "",
         body: "",
         hint: (typeof browserWindow.t === "function" && browserWindow.t("effort.high.note")) || "More deliberate reasoning",
         extensionKey: "extensiveThinking"
       });
     }else if(!v && typeof browserWindow.clearActiveTemplate === "function"){
       /* Only clear if the active template is ours */
       if(browserWindow._activeTemplate && browserWindow._activeTemplate.extensionKey === "extensiveThinking"){
         browserWindow.clearActiveTemplate();
       }
     }
     syncExtensionsUI();
   }},
  {key:"exam",         name:"Generate exam",
   icon: EXTENSION_ICONS.exam,
   on:false, onChange:function(){
     openNav('exam');
     syncExtensionsUI();
   }},
];
function getExtensionsPickerElements() {
  const picker = document.getElementById("extensionsPicker");
  return {
    picker,
    menu: document.getElementById("extensionsMenu"),
    trigger: document.getElementById("extensionsTrigger"),
    label: document.getElementById("extensionsLabel"),
  };
}

function renderExtensionsMenu(){
  const els = getExtensionsPickerElements();
  if(!els.menu)return;
  const request = Number(els.menu.dataset.pickerRenderRequest || 0) + 1;
  els.menu.dataset.pickerRenderRequest = String(request);
  els.menu.setAttribute("aria-busy", "true");
  import('./react/pickers/pickerMenuHost.tsx').then(function (pickerMenu) {
    if (!els.menu || !els.menu.isConnected || Number(els.menu.dataset.pickerRenderRequest) !== request) return;
    pickerMenu.renderExtensionPickerMenu(els.menu, EXTENSIONS.map(function(extension){
      return { key: extension.key, name: extension.name, icon: extension.icon, on: Boolean(extension.on) };
    }));
    els.menu.setAttribute("aria-busy", "false");
  }).catch(function (error) {
    reportSwallow(error, 'pickers.js:renderExtensionsMenu');
  });
}
function toggleExtensionByKey(key: string){
  /* Route through the extension registry when a module owns the key —
     it handles onActivate/onDeactivate (side effects, persistence,
     auto-launch). Falls back to the inline EXTENSIONS entry for keys
     not yet migrated so behavior is unchanged. */
  if (dispatchExtension(key)) {
    syncExtensionsUI();
    return;
  }
  const ext=EXTENSIONS.find(function(e){return e.key===key});
  if(!ext)return;
  ext.onChange(!ext.on);
}
let _extMenuBound=false;
function bindExtensionsMenuClicks(){
  if(_extMenuBound)return;
  const els = getExtensionsPickerElements();
  if(!els.menu)return;
  _extMenuBound=true;
  els.menu.addEventListener("click",function(e){
    const btn=(e.target as Element)?.closest?.(".extensions-item");
    if(!btn)return;
    e.stopPropagation();
    const key = btn.getAttribute("data-ext");
    if (key) toggleExtensionByKey(key);
  });
}
/* P_timing-DCL — same rationale as attachments/render.ts: the IIFE
 * runs before the DOM is ready, so getElementById("extensionsMenu")
 * returns null. Defer to DOMContentLoaded like the attachment wiring. */
let extDclRan = false;
function extDcl(){
  if(extDclRan)return; extDclRan=true;
  bindExtensionsMenuClicks();
  syncExtensionsUI();
}
if(typeof window !== "undefined"){
  browserWindow.addEventListener("DOMContentLoaded", extDcl);
  if(document.readyState !== "loading"){ try{ extDcl(); }catch (error) { reportSwallow(error, 'pickers.js:513'); } }
}
function countActiveExtensions(){
  return EXTENSIONS.filter(function(e){return e.on}).length;
}
function syncExtensionsUI(){
  /* Re-sync .on from window state so the checkmarks reflect the
   * registry-driven extensiveThinking toggle. */
  EXTENSIONS.forEach(function(ext){
    if(ext.key==="extensiveThinking") ext.on = !!browserWindow.extensiveThinkingOn;
  });
  const els = getExtensionsPickerElements();
  if (els.picker?.getAttribute("data-open") === "true") renderExtensionsMenu();
  const n=countActiveExtensions();
  if(els.trigger)els.trigger.classList.toggle("has-active",n>0);
  if(els.label)els.label.textContent=n>0?("Extensions ("+n+")"):"Extensions";
}
function toggleExtensionsPicker(){
  const els = getExtensionsPickerElements();
  if(!els.picker)return;
  if(els.picker.getAttribute("data-open")==="true")closeExtensionsPicker();
  else openExtensionsPicker();
}
function openExtensionsPicker(){
  const els = getExtensionsPickerElements();
  if(!els.picker)return;
  renderExtensionsMenu();
  els.picker.setAttribute("data-open","true");
  if(els.trigger)els.trigger.setAttribute("aria-expanded","true");
}
function closeExtensionsPicker(){
  const els = getExtensionsPickerElements();
  if(!els.picker)return;
  els.picker.setAttribute("data-open","false");
  if(els.trigger)els.trigger.setAttribute("aria-expanded","false");
}
document.addEventListener("click",function(e){
  const els = getExtensionsPickerElements();
  if(!els.picker || els.picker.getAttribute("data-open")!=="true")return;
  if(!els.picker.contains((e.target as Node | null)))closeExtensionsPicker();
});
document.addEventListener("keydown",function(e){
  if(e.key!=="Escape")return;
  const els = getExtensionsPickerElements();
  if(!els.picker || els.picker.getAttribute("data-open")!=="true")return;
  closeExtensionsPicker();
  e.stopPropagation();
});

/* ── Web search toggle (used by extensions picker and settings) ── */
function toggleWebSearch(){
  const next = setWebSearchOn(!webSearchOn);
  syncWebSearchUI();
  if(!next){
    stateStore.dispatch({type:"state/batch",patch:{
      searchContext:"",
      searchContextAt:0,
      searchContextCount:0,
      searchContextError:null,
      searchContextQuery:null
    }});
    browserWindow.setSearchPill?.("ok",0,"");
  }else if(browserWindow.stateStore.read("topic")){
    browserWindow.fetchWebContext(browserWindow.stateStore.read("topic"));
  }
}
function syncWebSearchUI(){
  syncExtensionsUI();
  if(webSearchOn&&browserWindow.stateStore.read("topic")&&!browserWindow.stateStore.read("searchContext")){
    browserWindow.fetchWebContext(browserWindow.stateStore.read("topic"));
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
};
export { EXTENSIONS };

/* Provider selection is owned by config/providerConfig.service.ts. */
