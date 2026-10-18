/* render/katexRefresh.ts — extracted from main.js.
 * KaTeX-lazy re-render.
 * Zero-behavior-change lift.
 */
import { onKatexReady } from '../vendor/lazy.js';
import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions, reclaimVizCards } from './vizStubs.js';
import { wireCodeBlockHeaders } from './postRender.ts';

/** The subset of a session message this repaint touches. */
interface RepaintableMessage {
  role?: string;
  rawText?: string;
  clientId?: string;
  id?: string;
  _katexRenderedRev?: number;
}

/** Legacy globals this module reads through the window bridge. */
interface KatexLegacyWindow extends Window {
  renderAssistantHTML?: (rawText: string) => string;
  /** Legacy hook main.js calls after a vendor retry. */
  __socratesRerenderMath?: () => void;
}

function _renderAssistantHtml(rawText: unknown): string {
  const win = window as KatexLegacyWindow;
  if (typeof window !== 'undefined' && typeof win.renderAssistantHTML === 'function') {
    return win.renderAssistantHTML(String(rawText || ''));
  }
  return String(rawText || '');
}

export function rerenderMathAfterKatex(): void {
  try {
    const list = document.getElementById("msgList");
    if (!list) return;
    /* The declarative renderer paints prose from rawText through a per-turn
       cache of settled HTML (react/tool-run/AssistantTurn), so a re-render
       alone would hand back the SAME cached string — the one computed before
       KaTeX existed. Bumping this counter is what tells that cache to throw
       its entries away and re-typeset. */
    window.__socratesMathRenderRev = (window.__socratesMathRenderRev || 0) + 1;
    const rev = window.__socratesMathRenderRev;
    const messages = stateStore.read("messages");
    const msgs: RepaintableMessage[] = Array.isArray(messages) ? messages as RepaintableMessage[] : [];
    /* Collect first, render in slices: re-rendering every math message in
       one pass is a main-thread long task AND makes every formula on the
       page flip in the same frame. Newest first — that is the answer the
       reader is most likely looking at. */
    const targets: Array<{ index: number; clientId?: string }> = [];
    for (let mi = msgs.length - 1; mi >= 0; mi--) {
      const m = msgs[mi];
      if (!m || m.role !== "assistant" || typeof m.rawText !== "string") continue;
      if (!/\$|\\\(|\\\[/.test(m.rawText)) continue;
      /* Idempotent re-paint: a message whose html was recomputed after the
         katex-ready bump is already correct — touching it again (e.g. a
         second onKatexReady after a vendor retry) would only churn its DOM. */
      if (m._katexRenderedRev === rev) continue;
      targets.push({ index: mi, clientId: m.clientId });
    }
    if (!targets.length) return;
    const raf: (cb: () => void) => void = typeof requestAnimationFrame === "function"
      ? function (cb) { requestAnimationFrame(cb); }
      : function (cb) { setTimeout(cb, 0); };
    let ti = 0;
    const repaintSlice = function (): void {
      let changed = false;
      /* Two messages per frame keeps each slice well under a frame budget
         even on heavy formula pages; the rest lands on following frames. */
      for (let n = 0; n < 2 && ti < targets.length; n++, ti++) {
        const t = targets[ti];
        const liveMessages = stateStore.read("messages") as RepaintableMessage[];
        const live = liveMessages[t.index];
        /* Guard against a session swap between slices: only repaint the
           slot while it still holds the same message object identity. */
        if (!live || live.clientId !== t.clientId || live.role !== "assistant") continue;
        if (live._katexRenderedRev === rev) continue;
        let html: string;
        try { html = _renderAssistantHtml(live.rawText); } catch { continue; }
        /* React's MessageItem memo skips re-renders when the entry object
           reference is unchanged (the legacy finish() path relies on the
           entry being mounted fresh). Replacing the object with a shallow
           copy carrying the new html is what makes the katex-ready repaint
           actually land in the React message list. */
        stateStore.dispatch({
          type: "session/update-message", index: t.index, clientId: t.clientId,
          patch: { html: html, _katexRenderedRev: rev },
        });
        changed = true;
        const id = live.clientId || live.id || "";
        if (!id) continue;
        const escId = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : String(id).replace(/["\\]/g, "\\$&");
        const node = list.querySelector('[data-client-id="' + escId + '"] .msg-body');
        if (node && !node.closest('[data-react-owned]')) {
          node.innerHTML = html;
          try { reclaimVizCards(node); } catch { /* empty-catch: intentional — best-effort repaint */ }
          try { processPendingMermaid(); } catch { /* empty-catch: intentional — best-effort repaint */ }
          try { processPendingViz(); } catch { /* empty-catch: intentional — best-effort repaint */ }
          try { processPendingVizActions(); } catch { /* empty-catch: intentional — best-effort repaint */ }
          try { wireCodeBlockHeaders(node); } catch { /* empty-catch: intentional — best-effort repaint */ }
        }
      }
      if (changed) publishReactChatRuntime({ type: "state-synced", reason: "katex-ready" });
      if (ti < targets.length) raf(repaintSlice);
    };
    repaintSlice();
  } catch { /* empty-catch: intentional — a failed repaint must not break boot */ }
}

if (typeof window !== 'undefined') {
  (window as KatexLegacyWindow).__socratesRerenderMath = rerenderMathAfterKatex;
}
try { onKatexReady(rerenderMathAfterKatex); } catch { /* empty-catch: intentional — vendor loader is optional */ }
