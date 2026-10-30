/* Viewport-gated, frame-budgeted Mermaid rendering queue. */
import { ensureMermaid } from '../vendor/lazy.ts';
import { esc } from './helpers.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { _pendingMermaid, validMermaid, vizErrorHtml, takePendingMermaid } from './vizStubs.ts';

/** The vendored Mermaid global, injected by the lazy loader. */
declare const mermaid: {
  render(id: string, code: string): Promise<{ svg: string; bindFunctions?: (element: Element) => void }>;
};

/** Queue entry produced by the markdown scanner (see vizStubs). */
interface MermaidItem {
  id: string;
  code: string;
  validated?: boolean;
}

let _rememberLiveVizCard: ((id: string, el: Element) => void) | undefined;
let _processPendingVizActions: ((root?: ParentNode) => void) | undefined;
export function configureVizMermaidQueue(handlers: {
  rememberLiveVizCard?: (id: string, el: Element) => void;
  processPendingVizActions?: (root?: ParentNode) => void;
}): void {
  if (handlers && typeof handlers.rememberLiveVizCard === 'function') _rememberLiveVizCard = handlers.rememberLiveVizCard;
  if (handlers && typeof handlers.processPendingVizActions === 'function') _processPendingVizActions = handlers.processPendingVizActions;
}

/* Viewport-gate test hooks (P_mermaid-viewport-gate). The gate is plain
   rect math, so it is unit-testable without a layout engine by driving the
   rect directly; see test/mermaidViewportGate.test.mjs. */
export function mermaidCardIsNearViewportForTest(el: Element): boolean { return _mermaidCardIsNearViewport(el); }
export function resetMermaidGateForTest(): void {
  if (_mermaidGateObserver) {
    try { _mermaidGateObserver.disconnect(); } catch (e) { reportSwallow(e, 'viz.resetMermaidGateForTest.disconnect'); /* ignore */ }
  }
  _mermaidGateObserver = null;
  _mermaidGateSeen = Object.create(null);
  _mermaidIdleTimer = null;
  /* Drop anything the gate was holding so one test's backlog cannot leak
     into the next. */
  _pendingMermaid.length = 0;
}


/* Track in-flight mermaid renders per id so a streaming re-render
   of the same id (rAF tick while a previous `mermaid.render` is
   still pending) doesn't race the first promise's `.then`. The
   previous implementation stomped the second render's output with
   the first `.then` callback, or vice versa. */
const _mermaidInFlight: Record<string, Promise<{ svg: string; bindFunctions?: (element: Element) => void }> | undefined> = Object.create(null);

function renderMermaidFallback(item: MermaidItem): void {
  const el = document.getElementById(item.id);
  if (!el) return;
  const body = el.querySelector('.viz-body');
  if (!body) return;
  body.innerHTML = '<pre><code class="language-mermaid">' + esc(item.code) + '</code></pre>';
  el.setAttribute('data-viz-state', 'ready');
  _rememberLiveVizCard?.(item.id, el);
}

/* P_mermaid-frame-budget — every mermaid.render pays a synchronous
   parse + layout, so draining the whole queue in one forEach was the
   dominant first-visit long task in the 2026-09-27 profile. The drain
   now starts at most MERMAID_RENDERS_PER_FRAME diagrams per frame and
   bails out early once MERMAID_FRAME_BUDGET_MS of the frame is spent,
   then hands the remainder to schedulePendingMermaid() — the same
   rAF-coalescing entry point MessageItem's useLayoutEffect uses, so a
   row mount landing mid-drain joins the pending pass instead of racing
   a second concurrent drain. One diagram is indivisible (a single huge
   render can still overrun a frame), but N diagrams now cost N/2
   frames instead of one ~2s task. */
const MERMAID_RENDERS_PER_FRAME = 2;
const MERMAID_FRAME_BUDGET_MS = 8;

/* P_mermaid-viewport-gate — the frame budget above splits an N-diagram
   backlog across frames, but it still renders every diagram in a long
   session: opening a 200-message history with 40 diagrams pays 40
   synchronous mermaid.parse+layout calls for the 2 the user can actually
   see. The gate defers a queued diagram until its card nears the
   viewport, so the first-visit long task becomes O(visible cards).

   Gating is decided per item at drain time from the card's live rect
   (getBoundingClientRect), not from where it sits in the queue — a queue
   that is scanned in order would starve the visible tail whenever the
   head is full of off-screen diagrams.

   Guards:
     - No IntersectionObserver (or a zero-size rect from a not-yet-laid-out
       element) ⇒ render now. Deferring on a rect we cannot trust would
       strand a card that will never be reported again.
     - A card whose element is not in the DOM yet (streaming markup not yet
       mounted) is left in the queue exactly as before, so the existing
       "element lands later, a later pass finds it" contract holds.
     - The tab being hidden is treated as "render": IntersectionObserver
       reports everything offscreen on a tab switch, which would hold the
       whole backlog until the user comes back.
   Deferred items keep their queue entry, so the idle fallback below still
   reaches them; the observer only decides WHEN they render, never WHETHER. */
const MERMAID_VIEWPORT_MARGIN_PX = 600;
/* Bounded look-ahead: how many off-screen items one drain may rotate past
   before yielding the frame. Keeps a 40-diagram backlog from turning the
   drain itself into a long task. */
const MERMAID_GATE_SCAN_MAX = 12;
/* Slow safety net for cards the observer will never wake (see below). */
const MERMAID_IDLE_DRAIN_MS = 2000;
let _mermaidIdleTimer: ReturnType<typeof setTimeout> | null = null;

function armMermaidIdleDrain(): void {
  if (_mermaidIdleTimer) return;
  _mermaidIdleTimer = setTimeout(function () {
    _mermaidIdleTimer = null;
    if (!_pendingMermaid.length) return;
    /* Re-run the gate rather than force-rendering. If the observer is
       healthy it wakes us on its own and this is a no-op; if a card was
       orphaned (its element was swapped by a message re-render while
       observed), the element is gone or zero-size now, which the gate
       treats as visible and renders. */
    schedulePendingMermaid();
  }, MERMAID_IDLE_DRAIN_MS);
  try {
    const timer = _mermaidIdleTimer as { unref?: () => void };
    if (_mermaidIdleTimer && typeof timer.unref === 'function') {
      timer.unref();
    }
  } catch (e) { reportSwallow(e, 'viz.armMermaidIdleDrain.unref'); /* ignore */ }
}

let _mermaidGateObserver: IntersectionObserver | null = null;
let _mermaidGateSeen: Record<string, 1> = Object.create(null);

function _ensureMermaidGateObserver(): IntersectionObserver | null {
  if (_mermaidGateObserver || typeof IntersectionObserver !== 'function') return _mermaidGateObserver;
  _mermaidGateObserver = new IntersectionObserver(function (entries) {
    for (let i = 0; i < entries.length; i++) {
      const el = entries[i].target;
      if (!entries[i].isIntersecting) continue;
      try { _mermaidGateObserver?.unobserve(el); } catch (e) { reportSwallow(e, 'viz._ensureMermaidGateObserver.unobserve'); }
      delete _mermaidGateSeen[el.id];
      /* The item stayed in _pendingMermaid the whole time; all this needs
         to do is hand control back to the normal drain. */
      schedulePendingMermaid();
    }
  }, { rootMargin: MERMAID_VIEWPORT_MARGIN_PX + 'px 0px ' + MERMAID_VIEWPORT_MARGIN_PX + 'px 0px' });
  return _mermaidGateObserver;
}

/* True when the card is close enough to the viewport to be worth its
   synchronous mermaid.render right now. */
function _mermaidCardIsNearViewport(el: Element): boolean {
  if (typeof IntersectionObserver !== 'function') return true;
  try {
    /* A hidden tab makes every card report offscreen; render rather than
       hold an entire backlog until the user returns. */
    if (document.visibilityState === 'hidden') return true;
  } catch (e) { reportSwallow(e, 'viz._mermaidCardIsNearViewport.visibilityState'); /* ignore */ }
  let rect: DOMRect;
  try { rect = el.getBoundingClientRect(); } catch { return true; }
  /* An unlaid-out element (display:none ancestor, freshly detached) has a
     zero rect. Treat it as visible: the observer will not report it again,
     so holding it would strand the diagram permanently. */
  if (!rect || (!rect.width && !rect.height)) return true;
  const vh = window.innerHeight || 0;
  if (vh > 0 && rect.top < vh + MERMAID_VIEWPORT_MARGIN_PX && rect.bottom > -MERMAID_VIEWPORT_MARGIN_PX) {
    return true;
  }
  return false;
}

function _holdMermaidUntilVisible(item: MermaidItem, el: Element): boolean {
  const obs = _ensureMermaidGateObserver();
  if (!obs || _mermaidGateSeen[el.id]) return false;
  _mermaidGateSeen[el.id] = 1;
  try { obs.observe(el); } catch { return false; }
  return true;
}

function findMermaidCard(id: string): { el: HTMLElement; body: Element } | null {
  const el = document.getElementById(id);
  if (!el) return null;
  const body = el.querySelector('.viz-body');
  return body ? { el, body } : null;
}

function renderMermaidError(item: MermaidItem, message: string, source: string): HTMLElement | null {
  const card = findMermaidCard(item.id);
  if (!card) return null;
  card.body.innerHTML = vizErrorHtml(message, source);
  card.el.setAttribute('data-viz-state', 'error');
  _processPendingVizActions?.(card.body);
  return card.el;
}

function renderMermaidResult(
  item: MermaidItem,
  result: { svg: string; bindFunctions?: (element: Element) => void },
): void {
  const card = findMermaidCard(item.id);
  if (!card) return;
  card.body.innerHTML = result.svg;
  card.el.setAttribute('data-viz-state', 'ready');
  _rememberLiveVizCard?.(item.id, card.el);
  if (result.bindFunctions) result.bindFunctions(card.body);
  const svg = card.body.querySelector('svg') as SVGElement | null;
  if (svg) { svg.style.maxWidth = '100%'; svg.style.height = 'auto'; }
}

function mermaidErrorMessage(error: unknown): string {
  return esc((error as Error)?.message || String(error)).slice(0, 300);
}

function renderMermaidFailure(item: MermaidItem, error: unknown): void {
  const card = renderMermaidError(item, mermaidErrorMessage(error), esc(item.code || ''));
  if (card) _rememberLiveVizCard?.(item.id, card);
}

function renderPendingMermaidItem(item: MermaidItem): void {
  const liveEl = document.getElementById(item.id);
  /* A card reclaimed from the live-card registry is already rendered —
     re-rendering it would flash its SVG away and back. */
  if (liveEl && liveEl.getAttribute('data-viz-state') !== 'loading') return;
  /* P_mermaid-parse-once — renderMermaid already ran mermaid.parse on
     this code unless mermaid was still loading when it was queued, so
     only pay for the check when that result is genuinely missing. */
  if (!item.validated && !validMermaid(item.code)) {
    renderMermaidError(item, 'Diagram syntax error', item.code);
    return;
  }
  if (_mermaidInFlight[item.id]) return;
  try {
    const inflight = mermaid.render('mermaid-svg-' + item.id, item.code);
    _mermaidInFlight[item.id] = inflight;
    inflight
      .then((result) => renderMermaidResult(item, result))
      .catch((error: unknown) => renderMermaidFailure(item, error))
      .then(function () {
        delete _mermaidInFlight[item.id];
      });
  } catch (error) {
    renderMermaidFailure(item, error);
    delete _mermaidInFlight[item.id];
  }
}

function holdOffscreenMermaidItem(item: MermaidItem): boolean {
  const el = item ? document.getElementById(item.id) : null;
  return Boolean(el && !_mermaidCardIsNearViewport(el) && _holdMermaidUntilVisible(item, el));
}

export function processPendingMermaid(): void {
  if (typeof mermaid === "undefined") {
    ensureMermaid().then(function () {
      processPendingMermaid();
    }).catch(function () {
      const pending = takePendingMermaid() as MermaidItem[];
      pending.forEach(renderMermaidFallback);
    });
    return;
  }
  const frameStart = Date.now();
  let rendered = 0;
  let held = 0;
  while (_pendingMermaid.length && rendered < MERMAID_RENDERS_PER_FRAME) {
    /* Always start at least one diagram, even when this frame is already
       over budget — otherwise a coarse clock could stall the queue. */
    if (rendered > 0 && Date.now() - frameStart >= MERMAID_FRAME_BUDGET_MS) break;
    const item = _pendingMermaid[0] as MermaidItem;
    /* P_mermaid-viewport-gate — look at the head item without consuming
       it. An off-screen card stays at the head for a later pass; the
       observer wakes us when it nears the viewport. A bounded scan keeps
       one long off-screen run from spinning here. */
    if (holdOffscreenMermaidItem(item)) {
      held++;
      /* Skip this item for this frame but keep the rest of the queue
         moving — a visible diagram further down must not wait behind
         an off-screen one. */
      _pendingMermaid.shift();
      _pendingMermaid.push(item);
      if (held >= MERMAID_GATE_SCAN_MAX) break;
      continue;
    }
    _pendingMermaid.shift();
    renderPendingMermaidItem(item);
    rendered++;
  }
  /* Work left over continues on the next frame; the queue stays
     module-level so a card whose element lands in the DOM later is
     still found by a later pass.

     Only re-arm on rAF when this frame actually made progress (or nothing
     was gated). If every remaining card is off-screen the gate has taken
     over and the observer wakes us when one approaches — re-arming here
     would spin rAF forever, rendering nothing. The idle drain below is
     the safety net for a card the observer will never wake (e.g. its
     element was replaced by a message re-render under the same id). */
  if (_pendingMermaid.length && (rendered > 0 || !held)) schedulePendingMermaid();
  if (held) armMermaidIdleDrain();
  try { _processPendingVizActions?.(); } catch (e) { reportSwallow(e, 'viz.processPendingMermaid.drainActions'); }
}

/* P_mermaid-coalesce — processPendingMermaid() works off the global
 * _pendingMermaid queue (a frame-budgeted slice of it, see
 * P_mermaid-frame-budget) and (via the trailing call) the viz-actions queue.
 * It used to be invoked once per mounted React row from MessageItem's
 * useLayoutEffect, so a single history commit of N rows ran N full scans in
 * one layout phase — the biggest session-switch long task in the 2026-09-27
 * profile. This scheduler collapses any number of same-frame requests into
 * one drain on the next frame, and is also where the drain hands back its
 * leftover work. The pending queue is module-level and
 * survives across frames, so a deferred drain still finds every card whose
 * element has landed in the DOM. Callers that need a synchronous pass
 * (streaming, widget mounting) keep calling processPendingMermaid directly. */
let _mermaidDrainScheduled = false;
export function schedulePendingMermaid(): void {
  if (_mermaidDrainScheduled) return;
  _mermaidDrainScheduled = true;
  const next: (cb: () => void) => void = typeof requestAnimationFrame === 'function'
    ? function (cb) { requestAnimationFrame(cb); }
    : function (cb) { setTimeout(cb, 16); };
  next(function () {
    _mermaidDrainScheduled = false;
    try { processPendingMermaid(); } catch (e) { reportSwallow(e, 'viz.processPendingMermaid'); }
  });
}
