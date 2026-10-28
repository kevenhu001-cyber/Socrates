/* render/katexRefresh.ts — extracted from main.js.
 * KaTeX-lazy re-render.
 * Zero-behavior-change lift.
 */
import { onKatexReady } from '../vendor/lazy.js';
import { stateStore } from '../state/store.js';
import { publishReactChatRuntime } from '../ui/reactBridge.js';
import { processPendingMermaid, processPendingViz, processPendingVizActions, reclaimVizCards } from './vizStubs.js';
import { wireCodeBlockHeaders } from './postRender.ts';
import { bumpMathRenderRevision } from './mathRevision.ts';

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

interface MathRepaintTarget {
  index: number;
  clientId?: string;
}

function _renderAssistantHtml(rawText: unknown): string {
  const win = window as KatexLegacyWindow;
  if (typeof window !== 'undefined' && typeof win.renderAssistantHTML === 'function') {
    return win.renderAssistantHTML(String(rawText || ''));
  }
  return String(rawText || '');
}

function collectMathRepaintTargets(messages: RepaintableMessage[], revision: number): MathRepaintTarget[] {
  const targets: MathRepaintTarget[] = [];
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || message.role !== 'assistant' || typeof message.rawText !== 'string') continue;
    if (!/\$|\\\(|\\\[/.test(message.rawText)) continue;
    if (message._katexRenderedRev === revision) continue;
    targets.push({ index, clientId: message.clientId });
  }
  return targets;
}

function repaintLegacyMathNode(list: HTMLElement, clientId: string, html: string): void {
  const escapedId = typeof CSS !== 'undefined' && CSS.escape
    ? CSS.escape(clientId)
    : clientId.replace(/["\\]/g, '\\$&');
  const node = list.querySelector('[data-client-id="' + escapedId + '"] .msg-body');
  if (!node || node.closest('[data-react-owned]')) return;
  node.innerHTML = html;
  try { reclaimVizCards(node); } catch { /* empty-catch: intentional — best-effort repaint */ }
  try { processPendingMermaid(); } catch { /* empty-catch: intentional — best-effort repaint */ }
  try { processPendingViz(); } catch { /* empty-catch: intentional — best-effort repaint */ }
  try { processPendingVizActions(); } catch { /* empty-catch: intentional — best-effort repaint */ }
  try { wireCodeBlockHeaders(node); } catch { /* empty-catch: intentional — best-effort repaint */ }
}

function repaintMathTarget(
  list: HTMLElement,
  target: MathRepaintTarget,
  revision: number,
): boolean {
  const messages = stateStore.read('messages') as RepaintableMessage[];
  const live = messages[target.index];
  if (!live || live.clientId !== target.clientId || live.role !== 'assistant') return false;
  if (live._katexRenderedRev === revision) return false;
  let html: string;
  try { html = _renderAssistantHtml(live.rawText); } catch { return false; }
  stateStore.dispatch({
    type: 'session/update-message', index: target.index, clientId: target.clientId,
    patch: { html, _katexRenderedRev: revision },
  });
  const id = live.clientId || live.id || '';
  if (id) repaintLegacyMathNode(list, id, html);
  return true;
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
    const rev = bumpMathRenderRevision();
    const messages = stateStore.read("messages");
    const msgs: RepaintableMessage[] = Array.isArray(messages) ? messages as RepaintableMessage[] : [];
    /* Collect first, render in slices: re-rendering every math message in
       one pass is a main-thread long task AND makes every formula on the
       page flip in the same frame. Newest first — that is the answer the
       reader is most likely looking at. */
    const targets = collectMathRepaintTargets(msgs, rev);
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
        /* A session swap between slices invalidates the captured message ID/index. */
        if (repaintMathTarget(list, targets[ti], rev)) changed = true;
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
