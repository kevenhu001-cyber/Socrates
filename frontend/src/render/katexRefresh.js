/* render/katexRefresh.js — extracted from main.js.
 * KaTeX-lazy re-render + hljs language-safe patch.
 * Zero-behavior-change lift.
 */
import { onKatexReady } from '../vendor/lazy.js';
import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions } from './viz.js';
import { wireCodeBlockHeaders } from './postRender.js';
import { safeHljsLang } from './helpers.js';

function _renderAssistantHtml(rawText) {
  if (typeof window !== 'undefined' && typeof window.renderAssistantHTML === 'function') {
    return window.renderAssistantHTML(rawText);
  }
  return String(rawText || '');
}

export function rerenderMathAfterKatex() {

  try{
    var list=document.getElementById("msgList");
    if(!list)return;
    /* The declarative renderer paints prose from rawText through a per-turn
       cache of settled HTML (react/tool-run/AssistantTurn), so a re-render
       alone would hand back the SAME cached string — the one computed before
       KaTeX existed. Bumping this counter is what tells that cache to throw
       its entries away and re-typeset. */
    window.__socratesMathRenderRev=(window.__socratesMathRenderRev||0)+1;
    var rev=window.__socratesMathRenderRev;
    var msgs=Array.isArray(stateStore.read("messages"))?stateStore.read("messages"):[];
    var changed=false;
    for(var mi=0;mi<msgs.length;mi++){
      var m=msgs[mi];
      if(!m||m.role!=="assistant"||typeof m.rawText!=="string")continue;
      if(!/\$|\\\(/.test(m.rawText))continue;
      /* Idempotent re-paint: a message whose html was recomputed after the
         katex-ready bump is already correct — touching it again (e.g. a
         second onKatexReady after a vendor retry) would only churn its DOM. */
      if(m._katexRenderedRev===rev)continue;
      var html=_renderAssistantHtml(m.rawText);
      /* React's MessageItem memo skips re-renders when the entry object
         reference is unchanged (the legacy finish() path relies on the
         entry being mounted fresh). Replacing the object with a shallow
         copy carrying the new html is what makes the katex-ready repaint
         actually land in the React message list. */
      stateStore.dispatch({
        type:"session/update-message",index:mi,clientId:m.clientId,
        patch:{html:html,_katexRenderedRev:rev}
      });
      changed=true;
      var id=m.clientId||m.id||"";
      if(!id)continue;
      var escId=typeof CSS!=="undefined"&&CSS.escape?CSS.escape(id):String(id).replace(/["\\]/g,"\\$&");
      var node=list.querySelector('[data-client-id="'+escId+'"] .msg-body');
      if(node&&!node.closest('[data-react-owned]')){
        node.innerHTML=html;
        try{processPendingMermaid()}catch(_){}
        try{processPendingViz()}catch(_){}
        try{processPendingVizActions()}catch(_){}
        try{wireCodeBlockHeaders(node)}catch(_){}
      }
    }
    if(changed)publishReactChatRuntime({type:"state-synced",reason:"katex-ready"});
  }catch(_){}
}

try { onKatexReady(rerenderMathAfterKatex); } catch (_) {}

/* P_hljs-unknown-lang — monkey-patch hljs.highlightElement. */
export function patchHljsHighlightElement() {
if (typeof window === 'undefined') return;
  var hl = window.hljs;
  if (!hl || typeof hl.highlightElement !== 'function' || hl.__socratesSafePatched) return;
  var orig = hl.highlightElement.bind(hl);
  hl.highlightElement = function patchedHighlightElement(el){
    try {
      if (el && el.classList && typeof hl.getLanguage === 'function') {
        var classes = Array.prototype.slice.call(el.classList || []);
        for (var i = 0; i < classes.length; i++) {
          var c = classes[i];
          if (c.indexOf('language-') !== 0) continue;
          if (!safeHljsLang(c.slice('language-'.length))) el.classList.remove(c);
        }
      }
    } catch (_) { /* swallow — fall through to the original call */ }
    return orig(el);
  };
  hl.__socratesSafePatched = true;
}

try { patchHljsHighlightElement(); } catch (_) {}
