/* chat/templateSlash.js — extracted from main.js (B3/B6 batch).
 * Template mode state + slash-command palette + composer blur helper.
 * Zero-behavior-change lift. Template state is module-local; the
 * window._activeTemplate mirror is maintained for legacy readers
 * (toolCallbacks, streaming finish, send paths).
 */
import { configureTemplateSystemPrompt } from './templateSystemPrompt.ts';
import { toggleWebSearch } from '../pickers.js';
import {
  focusComposer,
  getComposerMarkdown,
  getVisibleComposerSurface,
  setComposerExtensionToken,
  setComposerMarkdown,
  subscribeComposer,
} from '../react/composer-input/controller.ts';
import { loadPromptTemplates } from './promptTemplates.js';
import { esc } from '../render/helpers.js';
import { updateSendBtn, updateStartBtn } from '../ui/topicSetup.js';

export var _slashSelected=0;
var _slashList=[];
var _slashQuery="";
/* P5.8 — Active template state. When the user picks a template
   from the palette we stash it here so the chat pipeline can
   inject the template's `systemPrompt` as a fresh system message
   on every turn while the template is active. The chip in the
   input bar shows the current mode; clicking × clears it. */
var _activeTemplate=null;
configureTemplateSystemPrompt({ getActiveTemplate: function(){ return _activeTemplate; } });
/* P_extension-chip — an "extension" template is just a template that
   also flips a piece of global mode state (e.g. window.deepResearchOn,
   window.webSearchOn) when it becomes active, and flips it back when
   it is cleared. The keys here are the canonical extension ids used by
   the + menu and the chip badge; they are also recognised by the
   send-paths (submitChatMessage / startSession) which read the same
   globals. Keeping the side-effects inside setActiveTemplate/clearActiveTemplate
   means every "×" on the chip and every menu click stay in sync. */
var EXTENSION_SIDE_EFFECTS={
  webSearch:function(on){ if(on!==!!window.webSearchOn && typeof toggleWebSearch==="function") toggleWebSearch(); },
  deepResearch:function(on){ window.deepResearchOn=!!on; if(typeof window.syncQuickChips==="function") window.syncQuickChips(); },
  extensiveThinking:function(on){
    window.extensiveThinkingOn=!!on;
    try{localStorage.setItem("socrates-extensive-thinking",JSON.stringify(!!window.extensiveThinkingOn))}catch {}
  }
};
export function _applyExtensionSideEffects(prevExt,nextExt){
  if(prevExt && EXTENSION_SIDE_EFFECTS[prevExt]){
    try{ EXTENSION_SIDE_EFFECTS[prevExt](false); }catch(_){}
  }
  if(nextExt && EXTENSION_SIDE_EFFECTS[nextExt]){
    try{ EXTENSION_SIDE_EFFECTS[nextExt](true); }catch(_){}
  }
}
/* P_extension-runs — the chat pipeline publishes workflow-stage events
   for template extensions that carry a runId (research/explore). The
   module's planning event and the chat pipeline's searching/completed
   events share that runId via _activeTemplate. web_search tool_use →
   searching; tool_result → reading; stream finish → completed. */
/* B3: publish*Workflow* events extracted to chat/toolCallbacks.js (imported at top). */
/* Strip the template body's leading prefix from the user-typed
   text, so the LLM sees only the user's actual content instead
   of "Paste the text you want summarized:\n\n<their text>".
   Whitespace-trimmed comparison so a stray newline from the
   cursor position doesn't throw the match off. */
export function stripTemplateBodyPrefix(text){
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
export function setActiveTemplate(t){
  var prevExt=_activeTemplate&&_activeTemplate.extensionKey||null;
  var nextExt=t&&t.extensionKey||null;
  _activeTemplate=t?{
    id:t.id,title:t.title,shortcut:t.shortcut,
    systemPrompt:t.systemPrompt||"",body:t.body||"",
    icon:t.icon,
    hint:t.hint||t.description||"",
    extensionKey:nextExt,
    runId:t.runId||null,
    workflow:t.workflow||null,
    /* P_canvas-mode — declared on ExtensionDefinition.outputMode, carried
       over so renderAssistantHTML can branch on _activeTemplate.outputMode
       at the streaming→finalized boundary. Default 'chat' preserves the
       legacy behaviour for every extension that doesn't opt in. */
    outputMode:t.outputMode||'chat'
  }:null;
  if(prevExt!==nextExt) _applyExtensionSideEffects(prevExt,nextExt);
  try { window._activeTemplate = _activeTemplate; } catch (_) {}
  renderTemplateModeChip();
}
export function clearActiveTemplate(){
  var prevExt=_activeTemplate&&_activeTemplate.extensionKey||null;
  if(prevExt) _applyExtensionSideEffects(prevExt,null);
  setActiveTemplate(null);
}
/* Keep the selected workflow inside both rich editors. The token is an
   editor node, so it stays in the text flow while getMarkdown() strips the
   visual affordance before the request is sent. */
export function renderTemplateModeChip(){
  var token=_activeTemplate?{
    key:_activeTemplate.extensionKey||_activeTemplate.id||"workflow",
    title:_activeTemplate.title||"Workflow",
    icon:_activeTemplate.icon||"",
    hint:_activeTemplate.hint||""
  }:null;
  setComposerExtensionToken("topic",token);
  setComposerExtensionToken("chat",token);
}
/* Template system-prompt injection now lives in
   chat/templateSystemPrompt.ts (configured above to read _activeTemplate). */
/* Parse the slash command from the input. Returns null if
   the input doesn't start with `/`, otherwise:
     { raw: "/sum",    — the `/query` chunk we will replace
       query:"sum",    — lowercased, no leading slash
       tail: " foo",   — what comes after the first whitespace
       end:  4 }       — character index where tail begins
   Used both for filtering and for the insert step (so the
   user's ` foo` argument survives the click). */
/* Slash commands are shared by the topic and chat rich composers. */
export function _getSlashSurface(){
  var visible=getVisibleComposerSurface();
  var value=getComposerMarkdown(visible);
  if(value && value.charAt(0)==="/") return visible;
  var other=visible==="chat"?"topic":"chat";
  value=getComposerMarkdown(other);
  if(value && value.charAt(0)==="/") return other;
  return null;
}
var _slashActiveSurface = null;
export function _currentSlashQuery(){
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
export function _slashAppEntries(){
  var apps=(typeof window.getSlashApps==="function")?window.getSlashApps():[];
  return (apps||[]).map(function(a){
    return { _kind:"app", id:a.id, title:a.title, shortcut:a.shortcut, description:a.description, icon:a.icon, insert:a.insert };
  });
}
export function _filterSlashList(query){
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
export function openSlashCommandPalette(){
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
export function isSlashCommandPaletteOpen(){
  var p=document.getElementById("slashCommandPalette");
  return !!(p && p.classList && p.classList.contains("visible"));
}
export function closeSlashCommandPalette(){
  var p=document.getElementById("slashCommandPalette");
  if(p)p.classList.remove("visible");
}
/* Anchor the palette to the chat input bar. Computing on
   open + on every filter change means the palette stays
   flush against the textarea even if the user resizes the
   window or scrolls. Falls back to the original centred-
   bottom layout if the input element can't be measured. */
export function positionSlashCommandPalette(){
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
export function updateSlashCommandPaletteFilter(){
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
export function renderSlashCommandPalette(){
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
        '<div class="slash-command-row '+(i===_slashSelected?"selected":"")+'" data-slash-index="'+i+'">'+
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
  p.querySelectorAll(".slash-command-row").forEach(function(row){
    var index=Number(row.getAttribute("data-slash-index"));
    row.addEventListener("click",function(){onSlashRowClick(index)});
    row.addEventListener("mouseenter",function(){_slashSelected=index;updateSlashSelected()});
  });
}
export function updateSlashSelected(){
  var rows=document.querySelectorAll("#slashCommandPalette .slash-command-row");
  rows.forEach(function(r,i){
    r.classList.toggle("selected",i===_slashSelected);
    if(i===_slashSelected)r.scrollIntoView({block:"nearest"});
  });
}
export function onSlashRowClick(i){_slashSelected=i;insertSelectedSlashTemplate()}
export function insertSelectedSlashTemplate(){
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

/* Blur whatever is focused inside the chat composer (editor root OR
   the wider input wrap, which includes the send/attach buttons) and
   collapse the selection Tiptap leaves behind, so the focus-driven
   visuals (border accent, expanded desktop layout) reset after a
   click-send. The `:focus-within` on `.chat-input-wrap` covers all
   descendants, so we must clear focus everywhere inside that wrap. */
export function blurChatComposer(){
  var rootEl=document.getElementById("chatComposerRoot");
  var wrapEl=document.getElementById("chatInputWrap");
  var active=document.activeElement;
  var withinComposer = (rootEl&&rootEl.contains(active))
    || (wrapEl&&wrapEl.contains(active));
  if(withinComposer && typeof active.blur==="function"){
    active.blur();
  }
  /* Also blur any descendant contenteditable editor element directly,
     in case Tiptap re-focused during the clearContent transaction. */
  if(rootEl){
    var editable=rootEl.querySelector('[contenteditable]');
    if(editable && editable!==document.activeElement
      && typeof editable.blur==="function"
      && (wrapEl||rootEl).contains(editable)){
      editable.blur();
    }
  }
  /* Clear DOM selection so the cursor caret / text highlight disappears
     and the selection-controlled CSS visuals reset. */
  try{
    var sel=window.getSelection();
    if(sel&&sel.rangeCount)sel.removeAllRanges();
  }catch(_){}
}


/* Legacy Enter-send fast path, superseded by the React composer (no listeners mounted; kept for reference). */
export function _handleChatKey(e){
  if(e.key==="Enter"&&!e.shiftKey){
    e.preventDefault();
    if(isSlashCommandPaletteOpen())closeSlashCommandPalette();
    if (typeof window !== "undefined" && typeof window.submitChatMessage === "function") window.submitChatMessage();
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
