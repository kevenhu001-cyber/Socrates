/* viz.js — Interactive canvas/HTML/SVG/Mermaid/Plot renderer.
 *
 * Renders a fenced ```html / ```viz / ```svg / ```plot block inside a
 * sandboxed <iframe srcdoc="..."> so the user's canvas / WebGL / DOM
 * code can run without leaking into the parent page. The card chrome
 * (.viz / .viz-body / .viz-actions) lives in the parent; the iframe
 * itself only holds the user's content.
 *
 * Lifecycle for each card:
 *   1. renderViz() / renderPlot() / renderMermaid() builds the
 *      iframe HTML and pushes an id onto _pendingViz / _pendingMermaid.
 *   2. processPendingViz() / processPendingMermaid() runs after the
 *      cards land in the DOM. It attaches a 'load' listener + a
 *      short polling fallback to the iframe, and flips the card's
 *      data-viz-state to "ready" once the iframe fires its
 *      postMessage "viz-ready" event.
 *   3. The iframe content posts {type:'viz-ready'} via parent.postMessage
 *      when it has finished rendering. The parent listens once per
 *      card and resolves the ready state.
 *
 * Why postMessage instead of the load event:
 *   The previous design used `iframe.addEventListener('load', ...)` +
 *   a 80ms setTimeout fallback. Both paths were fragile: the load
 *   event fires before the inline <script> has run (for cached /
 *   synchronous srcdoc parses), and the 80ms timeout was a guess.
 *   With sandbox="allow-scripts" (no allow-same-origin) we cannot
 *   read iframe.contentDocument, so there's no other way to know
 *   when the user's code finished. postMessage is the only signal
 *   that works across all browsers under that sandbox.
 */

import { ensureMermaid } from '../vendor/lazy.js';
import { esc } from './helpers.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import {
  _pendingMermaid,
  _pendingViz,
  validMermaid,
  vizErrorHtml,
  dropPendingVizId,
  takePendingViz,
  takePendingMermaid,
  takePendingActions,
  nextVizId,
  setVizViewPref,
} from './vizStubs.js';

/* P_viz-keepalive — cards that finished rendering (viz-ready handshake or a
   completed mermaid render) are registered here so a later innerHTML rewrite
   of the surrounding message can adopt the LIVE element instead of letting
   the fresh placeholder's iframe reload / diagram re-render. Reinserting a
   same-task detached iframe preserves its document (the HTML "magic move"
   rule), so the adopt path is flash-free; where a browser still reloads,
   the card simply re-handshakes like before. Keyed by the content-derived
   stable id, so the same card reclaimed across stream→finish and across
   history re-renders is always the same payload. */
var _liveVizCards = new Map();
/* Each live card pins a full iframe document (canvas/WebGL contexts
   included), so the registry stays deliberately small — a long session
   keeps the most recent cards adoptable and lets older iframes be GC'd
   once their message HTML is actually replaced. */
var LIVE_VIZ_CARDS_MAX = 40;

function _rememberLiveVizCard(id, el) {
  if (!id || !el) return;
  if (_liveVizCards.has(id)) _liveVizCards.delete(id);
  _liveVizCards.set(id, el);
  _observeVizPark(el);
  while (_liveVizCards.size > LIVE_VIZ_CARDS_MAX) {
    var oldest = _liveVizCards.keys().next().value;
    if (oldest === undefined) break;
    var evicted = _liveVizCards.get(oldest);
    if (evicted) _unobserveVizPark(evicted);
    _liveVizCards.delete(oldest);
  }
}

/* P_viz-park — long sessions accumulate rendered cards and every live
   iframe pins a full document (canvas/WebGL contexts included). A card
   that has been scrolled out of view for a while gets "parked": the
   iframe's srcdoc attribute is removed, which navigates the frame to
   about:blank and releases the document. The markup keeps
   `data-srcdoc`, so re-entering the viewport restores it and the card
   re-runs the normal viz-ready handshake.
   Guards: only park fully rendered (ready) cards, never while the tab
   is hidden (IntersectionObserver reports everything offscreen on tab
   switch, which would stampede every card into a reload on return),
   and never a card currently inside fullscreen. */
var VIZ_PARK_DELAY_MS = 45000;
var _vizParkObserver = null;

function _ensureVizParkObserver() {
  if (_vizParkObserver || typeof IntersectionObserver !== 'function') return;
  _vizParkObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var en = entries[i];
      var card = en.target;
      if (en.isIntersecting) {
        if (card.__vizParkTimer) { clearTimeout(card.__vizParkTimer); card.__vizParkTimer = null; }
        if (card.getAttribute('data-viz-parked') === '1') _unparkVizCard(card);
      } else if (!card.__vizParkTimer && card.getAttribute('data-viz-parked') !== '1') {
        card.__vizParkTimer = setTimeout(function () {
          card.__vizParkTimer = null;
          _parkVizCard(card);
        }, VIZ_PARK_DELAY_MS);
      }
    }
    /* Generous bottom margin so a parked card remounts before the
       user scrolls it into view — the reload happens offscreen. */
  }, { rootMargin: '0px 0px 320px 0px' });
}

function _observeVizPark(card) {
  _ensureVizParkObserver();
  if (_vizParkObserver && card) {
    try { _vizParkObserver.observe(card); } catch (e) { reportSwallow(e, 'viz._observeVizPark.observe'); /* ignore */ }
  }
}

function _unobserveVizPark(card) {
  if (_vizParkObserver && card) {
    try { _vizParkObserver.unobserve(card); } catch (e) { reportSwallow(e, 'viz._unobserveVizPark.unobserve'); /* ignore */ }
  }
  if (card && card.__vizParkTimer) { clearTimeout(card.__vizParkTimer); card.__vizParkTimer = null; }
}

function _parkVizCard(card) {
  if (!card || !card.isConnected) return;
  if (card.getAttribute('data-viz-state') !== 'ready') return;
  if (card.getAttribute('data-viz-parked') === '1') return;
  try { if (document.visibilityState === 'hidden') return; } catch (e) { reportSwallow(e, 'viz._parkVizCard.visibilityState'); /* ignore */ }
  try { if (document.fullscreenElement && card.contains(document.fullscreenElement)) return; } catch (e) { reportSwallow(e, 'viz._parkVizCard.fullscreenElement'); /* ignore */ }
  var iframe = card.querySelector('iframe');
  if (!iframe || !iframe.getAttribute('data-srcdoc')) return;
  /* Removing srcdoc navigates the frame to about:blank, tearing down
     the user document and its canvas/WebGL contexts. The inline style
     height stays, so the card holds its size while parked. */
  iframe.removeAttribute('srcdoc');
  card.setAttribute('data-viz-parked', '1');
}

function _unparkVizCard(card) {
  if (!card) return;
  card.removeAttribute('data-viz-parked');
  var iframe = card.querySelector('iframe');
  var srcdoc = iframe && iframe.getAttribute('data-srcdoc');
  if (!iframe || !srcdoc) return;
  card.setAttribute('data-viz-state', 'loading');
  iframe.setAttribute('srcdoc', srcdoc);
  if (card.id && !_pendingViz.some(function (item) { return item.id === card.id; })) {
    _pendingViz.push({ id: card.id });
  }
  try { processPendingViz(); } catch (e) { reportSwallow(e, 'viz._unparkVizCard.processPendingViz'); /* ignore */ }
}

/* Test hooks — the IntersectionObserver path needs a real layout
   engine, but the park/unpark mechanics are plain DOM and worth
   unit coverage (see test/vizPark.test.mjs). */
export function parkVizCardForTest(card) { _parkVizCard(card); }
export function unparkVizCardForTest(card) { _unparkVizCard(card); }

/* Viewport-gate test hooks (P_mermaid-viewport-gate). The gate is plain
   rect math, so it is unit-testable without a layout engine by driving the
   rect directly; see test/mermaidViewportGate.test.mjs. */
export function mermaidCardIsNearViewportForTest(el) { return _mermaidCardIsNearViewport(el); }
export function resetMermaidGateForTest() {
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


/**
 * Swap freshly-parsed `data-viz-state="loading"` placeholders inside `root`
 * for the already-rendered card element bearing the same id. Run BEFORE
 * processPendingViz/processPendingMermaid so the reclaimed cards are skipped
 * by the handshake/render passes. No-op for ids never rendered before.
 */
export function reclaimVizCards(root) {
  if (!root || typeof root.querySelectorAll !== 'function' || !_liveVizCards.size) return;
  var fresh = root.querySelectorAll('.viz[id][data-viz-state="loading"]');
  for (var i = 0; i < fresh.length; i++) {
    var card = fresh[i];
    var cached = _liveVizCards.get(card.id);
    /* Only adopt a detached element — a still-connected twin belongs to a
       different message that happens to share the same content hash. */
    if (!cached || cached === card || cached.isConnected) continue;
    try {
      card.replaceWith(cached);
      dropPendingVizId(card.id);
    } catch (e) { reportSwallow(e, 'viz.reclaimVizCards.replaceWith'); /* leave the placeholder to render normally */ }
  }
}





/* P_viz-fix-loop — feed a client-side render failure back to the
   model. The banner's own text + the card's source attribute are
   everything the model needs; it still has the original block in
   context. The prompt rides the existing `tool-retry` CustomEvent
   (detail.prompt) so no new wiring is needed — the live-turn
   listener in liveTurn.js/streamingTurn.js sends it as the next
   user-turn message. */
function vizRepairPrompt(card, errMsg) {
  var iframe = card && card.querySelector('iframe');
  var src = iframe ? (iframe.getAttribute('data-source') || '') : '';
  if (!src) {
    var pre = card && card.querySelector('.viz-error-source');
    src = pre ? pre.textContent : '';
  } else {
    src = decodeSrcdoc(src);
  }
  var prompt = 'A visualization block in your previous answer failed to render in the client'
    + (errMsg ? ': "' + String(errMsg).slice(0, 300) + '"' : '')
    + '. Please rewrite it as a corrected self-contained fenced ```viz or ```html block — no external network resources, no <script> that depends on globals.';
  if (src) prompt += '\nFailing source (truncated):\n' + src.slice(0, 1200);
  return prompt;
}

function dispatchVizRepair(card, errMsg) {
  if (!card || typeof card.dispatchEvent !== 'function') return;
  card.dispatchEvent(new CustomEvent('tool-retry', {
    bubbles: true,
    detail: { tool: 'viz_block', prompt: vizRepairPrompt(card, errMsg) },
  }));
}



/* Track in-flight mermaid renders per id so a streaming re-render
   of the same id (rAF tick while a previous `mermaid.render` is
   still pending) doesn't race the first promise's `.then`. The
   previous implementation stomped the second render's output with
   the first `.then` callback, or vice versa. */
var _mermaidInFlight = Object.create(null);

function renderMermaidFallback(item) {
  var el = document.getElementById(item.id);
  if (!el) return;
  var body = el.querySelector('.viz-body');
  if (!body) return;
  body.innerHTML = '<pre><code class="language-mermaid">' + esc(item.code) + '</code></pre>';
  el.setAttribute('data-viz-state', 'ready');
  _rememberLiveVizCard(item.id, el);
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
var MERMAID_RENDERS_PER_FRAME = 2;
var MERMAID_FRAME_BUDGET_MS = 8;

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
var MERMAID_VIEWPORT_MARGIN_PX = 600;
/* Bounded look-ahead: how many off-screen items one drain may rotate past
   before yielding the frame. Keeps a 40-diagram backlog from turning the
   drain itself into a long task. */
var MERMAID_GATE_SCAN_MAX = 12;
/* Slow safety net for cards the observer will never wake (see below). */
var MERMAID_IDLE_DRAIN_MS = 2000;
var _mermaidIdleTimer = null;

function armMermaidIdleDrain() {
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
    if (_mermaidIdleTimer && typeof _mermaidIdleTimer.unref === 'function') {
      _mermaidIdleTimer.unref();
    }
  } catch (e) { reportSwallow(e, 'viz.armMermaidIdleDrain.unref'); /* ignore */ }
}

var _mermaidGateObserver = null;
var _mermaidGateSeen = Object.create(null);

function _ensureMermaidGateObserver() {
  if (_mermaidGateObserver || typeof IntersectionObserver !== 'function') return _mermaidGateObserver;
  _mermaidGateObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var el = entries[i].target;
      if (!entries[i].isIntersecting) continue;
      try { _mermaidGateObserver.unobserve(el); } catch (e) { reportSwallow(e, 'viz._ensureMermaidGateObserver.unobserve'); }
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
function _mermaidCardIsNearViewport(el) {
  if (typeof IntersectionObserver !== 'function') return true;
  try {
    /* A hidden tab makes every card report offscreen; render rather than
       hold an entire backlog until the user returns. */
    if (document.visibilityState === 'hidden') return true;
  } catch (e) { reportSwallow(e, 'viz._mermaidCardIsNearViewport.visibilityState'); /* ignore */ }
  var rect;
  try { rect = el.getBoundingClientRect(); } catch (_) { return true; }
  /* An unlaid-out element (display:none ancestor, freshly detached) has a
     zero rect. Treat it as visible: the observer will not report it again,
     so holding it would strand the diagram permanently. */
  if (!rect || (!rect.width && !rect.height)) return true;
  var vh = window.innerHeight || 0;
  if (vh > 0 && rect.top < vh + MERMAID_VIEWPORT_MARGIN_PX && rect.bottom > -MERMAID_VIEWPORT_MARGIN_PX) {
    return true;
  }
  return false;
}

function _holdMermaidUntilVisible(item, el) {
  var obs = _ensureMermaidGateObserver();
  if (!obs || _mermaidGateSeen[el.id]) return false;
  _mermaidGateSeen[el.id] = 1;
  try { obs.observe(el); } catch (_) { return false; }
  return true;
}

function renderPendingMermaidItem(item) {
  var liveEl = document.getElementById(item.id);
  /* A card reclaimed from the live-card registry is already rendered —
     re-rendering it would flash its SVG away and back. */
  if (liveEl && liveEl.getAttribute('data-viz-state') !== 'loading') return;
  /* P_mermaid-parse-once — renderMermaid already ran mermaid.parse on
     this code unless mermaid was still loading when it was queued, so
     only pay for the check when that result is genuinely missing. */
  if (!item.validated && !validMermaid(item.code)) {
    const el = document.getElementById(item.id);
    if (!el) return;
    const body = el.querySelector('.viz-body');
    if (!body) return;
    body.innerHTML = vizErrorHtml('Diagram syntax error', item.code);
    el.setAttribute('data-viz-state', 'error');
    return;
  }
  if (_mermaidInFlight[item.id]) return;
  try {
    var inflight = mermaid.render('mermaid-svg-' + item.id, item.code);
    _mermaidInFlight[item.id] = inflight;
    inflight
      .then(function (result) {
        var el = document.getElementById(item.id);
        if (!el) return;
        var body = el.querySelector('.viz-body');
        if (!body) return;
        body.innerHTML = result.svg;
        el.setAttribute('data-viz-state', 'ready');
        _rememberLiveVizCard(item.id, el);
        if (result.bindFunctions) result.bindFunctions(body);
        var svg = body.querySelector('svg');
        if (svg) { svg.style.maxWidth = '100%'; svg.style.height = 'auto'; }
      })
      .catch(function (err) {
        var el = document.getElementById(item.id);
        if (!el) return;
        var body = el.querySelector('.viz-body');
        if (!body) return;
        var msg = esc(err.message || String(err)).slice(0, 300);
        var src = esc(item.code || '');
        body.innerHTML = vizErrorHtml(msg, src);
        el.setAttribute('data-viz-state', 'error');
        _rememberLiveVizCard(item.id, el);
      })
      .then(function () {
        delete _mermaidInFlight[item.id];
      });
  } catch (e) {
    const el = document.getElementById(item.id);
    if (!el) return;
    const body = el.querySelector('.viz-body');
    if (!body) return;
    var msg = esc(e.message || String(e)).slice(0, 300);
    var src = esc(item.code || '');
    body.innerHTML = vizErrorHtml(msg, src);
    el.setAttribute('data-viz-state', 'error');
    _rememberLiveVizCard(item.id, el);
    delete _mermaidInFlight[item.id];
  }
}

export function processPendingMermaid() {
  if (typeof mermaid === "undefined") {
    ensureMermaid().then(function () {
      processPendingMermaid();
    }).catch(function () {
      var pending = takePendingMermaid();
      pending.forEach(renderMermaidFallback);
    });
    return;
  }
  var frameStart = Date.now();
  var rendered = 0;
  var held = 0;
  while (_pendingMermaid.length && rendered < MERMAID_RENDERS_PER_FRAME) {
    /* Always start at least one diagram, even when this frame is already
       over budget — otherwise a coarse clock could stall the queue. */
    if (rendered > 0 && Date.now() - frameStart >= MERMAID_FRAME_BUDGET_MS) break;
    var item = _pendingMermaid[0];
    /* P_mermaid-viewport-gate — look at the head item without consuming
       it. An off-screen card stays at the head for a later pass; the
       observer wakes us when it nears the viewport. A bounded scan keeps
       one long off-screen run from spinning here. */
    var headEl = item ? document.getElementById(item.id) : null;
    if (headEl && !_mermaidCardIsNearViewport(headEl)) {
      if (_holdMermaidUntilVisible(item, headEl)) {
        held++;
        /* Skip this item for this frame but keep the rest of the queue
           moving — a visible diagram further down must not wait behind
           an off-screen one. */
        _pendingMermaid.shift();
        _pendingMermaid.push(item);
        if (held >= MERMAID_GATE_SCAN_MAX) break;
        continue;
      }
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
  try { processPendingVizActions(); } catch (e) { reportSwallow(e, 'viz.processPendingMermaid.drainActions'); }
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
var _mermaidDrainScheduled = false;
export function schedulePendingMermaid() {
  if (_mermaidDrainScheduled) return;
  _mermaidDrainScheduled = true;
  var next = typeof requestAnimationFrame === 'function'
    ? requestAnimationFrame
    : function (cb) { return setTimeout(cb, 16); };
  next(function () {
    _mermaidDrainScheduled = false;
    try { processPendingMermaid(); } catch (e) { reportSwallow(e, 'viz.processPendingMermaid'); }
  });
}







/* Track which card ids we are still waiting for. Each entry holds a
   timeout handle + a list of callbacks. When the iframe posts
   viz-ready (or the max-wait timeout fires), we resolve the entry
   and remove it from the map. */
var _pendingReady = Object.create(null);
var _vizCards = Object.create(null);
var VIZ_MAX_WAIT_MS = 5000;
/* Grace window after the parent pings the iframe: vizRuntime answers
   viz-ping with a fresh viz-ready almost instantly, so a short wait
   is enough — long enough to cover a still-parsing huge srcdoc, short
   enough that a truly dead card doesn't linger. */
var VIZ_PING_WAIT_MS = 800;
/* Height bounds applied to viz-ready and viz-resize reports. The
   iframe is width-constrained by the card; the cap keeps a runaway
   document from producing a kilometre-tall card. */
var VIZ_IFRAME_MIN_H = 60;
var VIZ_IFRAME_MAX_H = 2400;

export function processPendingViz(root) {
  /* A React-owned message may be recreated from already-rendered HTML.
     Such cards have no fresh renderViz() call to enqueue them, so register
     only loading cards inside the supplied message body for a new iframe
     handshake. This deliberately avoids a document-wide scan. */
  if (root && typeof root.querySelectorAll === 'function') {
    var queued = root.querySelectorAll('.viz[id][data-viz-state="loading"]');
    for (var qi = 0; qi < queued.length; qi++) {
      var queuedId = queued[qi].id;
      if (queuedId && !_pendingViz.some(function (item) { return item.id === queuedId; })) {
        _pendingViz.push({ id: queuedId });
      }
    }
  }
  var pending = takePendingViz();
  pending.forEach(function (item) {
    var el = document.getElementById(item.id);
    if (!el) return;
    /* A card adopted from the live registry already completed its
       handshake — re-registering would slap a loading handshake + 5s
       max-timer onto a fully rendered iframe. */
    if (el.getAttribute('data-viz-state') !== 'loading') return;
    var iframe = el.querySelector('iframe');
    if (!iframe) return;
    var existing = _pendingReady[item.id];
    if (existing) {
      /* React can replace a finalized message's HTML after the legacy
         stream renderer already registered this id. Reuse only the exact
         live card; otherwise the ready event would update the detached
         iframe/card pair and leave the visible replacement loading. */
      if (existing.card === el && existing.iframe === iframe && el.isConnected) return;
      clearTimeout(existing.maxTimer);
      if (existing.pingTimer) clearTimeout(existing.pingTimer);
      delete _pendingReady[item.id];
      delete _vizCards[item.id];
    }

    // Stash the iframe + a ready resolver on the card so the global
    // postMessage listener (installed once on first use) can find
    // the right iframe to update.
    var entry = {
      iframe: iframe,
      card: el,
      pingTimer: 0,
      maxTimer: setTimeout(function () {
        // Max wait expired without a viz-ready message. This
        // usually means the iframe never finished loading
        // (network error, infinite loop in the user's script,
        // or the contentDocument was blocked by the sandbox
        // policy). Flip the card to error and surface a
        // diagnostic.
        //
        // P_viz-no-autoreload — the previous version auto-
        // reloaded the iframe here, which produced a visible
        // "Rendering…" → error → "Rendering…" → … flicker. The
        // user can re-trigger via the Reload button, which
        // surfaces the error to them with full intent. We never
        // re-enter `loading` state from a timeout.
        //
        // P_viz-ping-ack — replaces the old iframeIsBlank DOM
        // probe, which read iframe.contentWindow.document — an
        // opaque-origin access that always throws under
        // sandbox="allow-scripts", so the "already rendered"
        // escape hatch it was meant to provide never actually
        // worked. Instead we ASK the iframe: vizRuntime answers
        // viz-ping with a fresh viz-ready, which lands on the
        // normal _markReady path. Only silence after a grace
        // window earns the warning banner.
        var card = entry.card;
        if (!card || card.getAttribute('data-viz-state') === 'ready') return;
        if (!card.isConnected) return;
        try { iframe.contentWindow && iframe.contentWindow.postMessage({ type: 'viz-ping', vizId: item.id }, '*'); }
        catch (e) { reportSwallow(e, 'viz.processPendingViz.pingCard'); /* cannot even post → the grace window lapses into the banner */ }
        entry.pingTimer = setTimeout(function () {
          // A ping answer arrives as an ordinary viz-ready; if the
          // card flipped state in the meantime, stand down.
          if (card.getAttribute('data-viz-state') === 'ready') return;
          if (!card.isConnected) return;
          card.setAttribute('data-viz-state', 'error');
          var body = card.querySelector('.viz-body');
          if (body) {
            // Keep the iframe mounted so the user can see what
            // was rendered (it might be partially done) but show
            // a thin warning bar.
            var banner = document.createElement('div');
            banner.className = 'viz-error';
            banner.innerHTML = '<span class="viz-error-icon">!</span><span class="viz-error-msg">Canvas took too long to render</span>' +
              '<button type="button" class="viz-error-btn">Show source</button>' +
              '<button type="button" class="viz-error-fix">Fix with AI</button>' +
              '<pre class="viz-error-source" hidden>' + esc(iframe.getAttribute('data-srcdoc') || '').slice(0, 2000) + '</pre>';
            // Insert banner ABOVE the iframe
            if (iframe.parentNode === body) body.insertBefore(banner, iframe);
            // Bind the buttons immediately. The card self-binds;
            // there is no global data-action scan anymore.
            _bindAction(banner.querySelector('.viz-error-btn'));
            _bindAction(banner.querySelector('.viz-error-fix'));
          }
          _rememberLiveVizCard(item.id, card);
          _hideLoading(card);
          delete _pendingReady[item.id];
          delete _vizCards[item.id];
        }, VIZ_PING_WAIT_MS);
      }, VIZ_MAX_WAIT_MS),
      ready: false,
    };
    _pendingReady[item.id] = entry;
    _vizCards[item.id] = entry;
  });
  try { processPendingVizActions(); } catch (e) { reportSwallow(e, 'viz.processPendingViz.drainActions'); }
  _ensureMessageListener();
}

function _hideLoading(card) {
  if (!card) return;
  var loading = card.querySelector('.viz-loading');
  if (loading) loading.style.display = 'none';
}

function _markReady(id) {
  var entry = _pendingReady[id];
  if (!entry) return;
  var card = entry.card;
  if (!card) { delete _pendingReady[id]; return; }
  if (card.getAttribute('data-viz-state') === 'ready') {
    clearTimeout(entry.maxTimer);
    if (entry.pingTimer) clearTimeout(entry.pingTimer);
    delete _pendingReady[id];
    delete _vizCards[id];
    return;
  }
  card.setAttribute('data-viz-state', 'ready');
  _rememberLiveVizCard(id, card);
  // If the iframe posted a height, adopt it so the card doesn't
  // show a fixed min-height when the content is shorter/longer.
  // Clamped to the same bounds viz-resize uses so a pathological
  // document can't grow a card without limit.
  if (entry.lastHeight && entry.lastHeight > 16) {
    entry.iframe.style.height = Math.min(Math.max(entry.lastHeight, VIZ_IFRAME_MIN_H), VIZ_IFRAME_MAX_H) + 'px';
  }
  _hideLoading(card);
  clearTimeout(entry.maxTimer);
  if (entry.pingTimer) clearTimeout(entry.pingTimer);
  delete _pendingReady[id];
  delete _vizCards[id];
}

function _markError(id, message) {
  /* P_viz-cleanup — the iframe may report a viz-error after the
     registry entry has already been removed (e.g. timeout fired
     first). Resolve the live card via the DOM in that case so the
     error still surfaces without resurrecting a strong reference to
     a card that should be GC-able. */
  var entry = _pendingReady[id] || _vizCards[id];
  var card = entry && entry.card;
  if (!card) card = document.getElementById(id);
  if (!card) { delete _pendingReady[id]; delete _vizCards[id]; return; }
  if (card.getAttribute('data-viz-state') === 'error') return;
  card.setAttribute('data-viz-state', 'error');
  _rememberLiveVizCard(id, card);
  _hideLoading(card);
  var body = card.querySelector('.viz-body');
  if (body) {
    var banner = document.createElement('div');
    banner.className = 'viz-error';
    banner.innerHTML = '<span class="viz-error-icon">!</span><span class="viz-error-msg">' + esc(message || 'Canvas failed to render') + '</span>' +
      '<button type="button" class="viz-error-btn">Show source</button>' +
      '<button type="button" class="viz-error-fix">Fix with AI</button>' +
      '<pre class="viz-error-source" hidden>' + esc((entry && entry.iframe && entry.iframe.getAttribute('data-srcdoc')) || card.querySelector('iframe') && card.querySelector('iframe').getAttribute('data-srcdoc') || '').slice(0, 2000) + '</pre>';
    var iframeEl = entry && entry.iframe;
    if (!iframeEl) iframeEl = card.querySelector('iframe');
    if (iframeEl && iframeEl.parentNode === body) body.insertBefore(banner, iframeEl);
    _bindAction(banner.querySelector('.viz-error-btn'));
    _bindAction(banner.querySelector('.viz-error-fix'));
  }
  if (entry && entry.maxTimer) clearTimeout(entry.maxTimer);
  if (entry && entry.pingTimer) clearTimeout(entry.pingTimer);
  delete _pendingReady[id];
  delete _vizCards[id];
}

/* P_viz-source-check — viz ids are predictable (`viz-card-N`), so
   without sender validation any iframe posting {type:'viz-ready',
   vizId:'viz-card-3'} could flip a foreign card's state. contentWindow
   identity can't be forged, so we resolve the SENDER's iframe and use
   its id — the claimed vizId in the payload is ignored entirely.
   Cards that finished the handshake live in _liveVizCards; their
   iframes still legitimately post viz-resize and late viz-error. */
function _vizSenderFrame(source) {
  if (!source) return null;
  var id, entry;
  for (id in _pendingReady) {
    entry = _pendingReady[id];
    if (entry && entry.iframe && entry.iframe.contentWindow === source) return { id: id, iframe: entry.iframe };
  }
  for (id in _vizCards) {
    entry = _vizCards[id];
    if (entry && entry.iframe && entry.iframe.contentWindow === source) return { id: id, iframe: entry.iframe };
  }
  var hit = null;
  _liveVizCards.forEach(function (card, cardId) {
    if (hit) return;
    var iframe = card && card.querySelector ? card.querySelector('iframe') : null;
    if (iframe && iframe.contentWindow === source) hit = { id: cardId, iframe: iframe };
  });
  return hit;
}

var _msgListenerInstalled = false;
function _ensureMessageListener() {
  if (_msgListenerInstalled || typeof window === 'undefined') return;
  _msgListenerInstalled = true;
  window.addEventListener('message', function (ev) {
    var data = ev && ev.data;
    if (!data || typeof data !== 'object') return;
    var type = data.type;
    if (type !== 'viz-ready' && type !== 'viz-error' && type !== 'viz-resize') return;
    var sender = _vizSenderFrame(ev.source);
    if (!sender) return;
    var id = sender.id;
    if (type === 'viz-ready') {
      var entry = _pendingReady[id];
      if (!entry) return;
      entry.lastHeight = data.h || 0;
      if (!entry.ready) {
        entry.ready = true;
        _markReady(id);
      }
    } else if (type === 'viz-error') {
      _markError(id, data.message);
    } else if (type === 'viz-resize') {
      var h = Number(data.h);
      if (!isFinite(h)) return;
      var clamped = Math.min(Math.max(h, VIZ_IFRAME_MIN_H), VIZ_IFRAME_MAX_H);
      sender.iframe.style.height = clamped + 'px';
      /* A pending card keeps lastHeight current so a viz-ready
         arriving later doesn't snap the iframe back to a stale size. */
      var pending = _pendingReady[id];
      if (pending) pending.lastHeight = clamped;
    }
  });
}

export function renderVizError(htmlStr, errorMsg) {
  var id = "viz-card-" + (nextVizId());
  var msg = esc((errorMsg || 'Could not load canvas').slice(0, 240));
  return '<div class="viz" id="' + id + '" data-viz-state="error">' +
    '<div class="viz-body"><div class="viz-error"><span class="viz-error-icon">!</span><span>' + msg + '</span></div></div>' +
  '</div>';
}

function decodeSrcdoc(srcdoc) {
  return String(srcdoc || '')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function openVizModal(srcdoc, title) {
  if (!srcdoc) return;
  // srcdoc is HTML-attribute-encoded when it comes from
  // data-srcdoc. Decode it back to raw HTML before stuffing it
  // into the modal iframe, which expects a raw srcdoc value.
  var decoded = decodeSrcdoc(srcdoc);
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  var dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas fullscreen");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";

  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Canvas";
  head.appendChild(titleEl);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body";

  var iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts");
  iframe.setAttribute("title", "Canvas fullscreen");
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  iframe.style.border = "0";
  iframe.style.background = "transparent";
  iframe.style.display = "block";
  iframe.srcdoc = decoded;
  modalBody.appendChild(iframe);

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

/* P_modal-raw — like openVizModal but the body is raw HTML, not a
   sandboxed iframe. Used by the image lightbox (matplotlib output)
   and the code-block fullscreen view where we don't need sandboxing
   — the content is our own, not user-input. Shares the same shell,
   close button, Esc handler, and click-outside-to-close behaviour
   as the sandboxed version so the two modals feel identical. */
export function openVizModalRaw(html, title) {
  if (!html) return;
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  modal.onclick = function (e) { if (e.target === modal) close(); };
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  var dialog = document.createElement("div");
  dialog.className = "viz-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", title || "Fullscreen");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";
  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = title || "Fullscreen";
  head.appendChild(titleEl);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var modalBody = document.createElement("div");
  modalBody.className = "viz-modal-body viz-modal-body-raw";
  modalBody.innerHTML = html;

  dialog.appendChild(head);
  dialog.appendChild(modalBody);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

function openVizSourceModal(srcdoc, title) {
  if (!srcdoc) return;
  var decoded = decodeSrcdoc(srcdoc);
  var opener = document.activeElement;
  var modal = document.createElement("div");
  modal.className = "viz-modal-backdrop";
  function close() {
    modal.remove();
    document.removeEventListener("keydown", onKey);
    if (opener && typeof opener.focus === "function") opener.focus();
  }
  function onKey(e) { if (e.key === "Escape") close(); }
  document.addEventListener("keydown", onKey);
  modal.addEventListener("click", function (event) { if (event.target === modal) close(); });

  var dialog = document.createElement("div");
  dialog.className = "viz-modal viz-source-modal";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-label", "Canvas source");
  dialog.setAttribute("aria-modal", "true");

  var head = document.createElement("div");
  head.className = "viz-modal-head";
  var titleEl = document.createElement("span");
  titleEl.className = "viz-modal-title";
  titleEl.textContent = (title || "Canvas") + " source";
  head.appendChild(titleEl);

  var copyButton = document.createElement("button");
  copyButton.type = "button";
  copyButton.className = "viz-source-copy";
  copyButton.textContent = "Copy source";
  copyButton.addEventListener("click", function () {
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") return;
    navigator.clipboard.writeText(decoded).then(function () {
      copyButton.textContent = "Copied";
      setTimeout(function () { copyButton.textContent = "Copy source"; }, 1200);
    }).catch(function () { copyButton.textContent = "Copy failed"; });
  });
  head.appendChild(copyButton);

  var closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "viz-modal-close";
  closeButton.setAttribute("aria-label", "Close");
  closeButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);

  var body = document.createElement("div");
  body.className = "viz-modal-body viz-source-body";
  var pre = document.createElement("pre");
  pre.className = "viz-source-code";
  pre.textContent = decoded;
  body.appendChild(pre);

  dialog.appendChild(head);
  dialog.appendChild(body);
  modal.appendChild(dialog);
  document.body.appendChild(modal);
  closeButton.focus();
}

/* P_viz-testability — expose the live card registry on window so
   E2E tests can assert iframe GC-eligibility. We only expose a
   read-only view (a frozen snapshot) rather than the live
   mutable map, to keep the module's GC assumptions intact while
   letting the test harness verify that the registry entry was
   released after `viz-ready` fires. The internal `_pendingReady`
   is still mutated directly by `_markReady` / `_markError`. */
export function getLiveVizCardIds() {
  var ids = [];
  for (var id in _vizCards) {
    if (Object.prototype.hasOwnProperty.call(_vizCards, id)) ids.push(id);
  }
  return ids;
}


export function processPendingVizActions(root) {
  /* React can recreate a completed card without going through renderViz(),
     so bind only actions within the supplied message body. Calls without a
     root keep the pending-queue-only behavior and never scan the document. */
  if (root && typeof root.querySelectorAll === 'function') {
    var rootActions = root.querySelectorAll('.viz .viz-btn, .viz .viz-error-btn, .viz .viz-seg-btn');
    for (var ri = 0; ri < rootActions.length; ri++) _bindAction(rootActions[ri]);
  }
  var pending = takePendingActions();
  pending.forEach(_bindActionsInCard);
}

function _bindActionsInCard(item) {
  var el = document.getElementById(item && item.id);
  if (!el) return;
  var actions = el.querySelectorAll('.viz-btn, .viz-error-btn, .viz-error-fix, .viz-seg-btn');
  for (var i = 0; i < actions.length; i++) _bindAction(actions[i]);
}

function _bindAction(el) {
  if (!el || el.__vizActionBound) return;
  /* Dispatch by class, not data-action: the buttons no longer carry the
     attribute (M4 Step 4.2). A data-action fallback is kept only for any
     legacy markup still floating around during the migration. */
  var act = el.classList.contains('viz-btn-reload') ? 'viz-reload'
    : el.classList.contains('viz-btn-source') ? 'viz-source'
    : el.classList.contains('viz-btn-expand') ? 'viz-expand'
    : el.classList.contains('viz-error-btn') ? 'viz-toggle-source'
    : el.classList.contains('viz-error-fix') ? 'viz-fix'
    : el.classList.contains('viz-seg-btn') ? 'viz-set-view'
    : el.getAttribute('data-action');
  if (act === 'viz-reload') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      reloadVizCard(c);
    });
  } else if (act === 'viz-source') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      if (!c) return;
      var f = c.querySelector('iframe');
      openVizSourceModal((f && (f.dataset.source || f.dataset.srcdoc)) || '', c.dataset.title || 'Canvas');
    });
  } else if (act === 'viz-expand') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      if (!c) return;
      var f = c.querySelector('iframe');
      openVizModal(
        (f && f.dataset.srcdoc) || '',
        c.dataset.title || 'Canvas'
      );
    });
  } else if (act === 'viz-toggle-source') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      /* The banner may carry extra buttons between the toggle and the
         <pre> (e.g. viz-error-fix), so resolve the source block by
         class inside the banner rather than nextElementSibling. */
      var banner = el.closest('.viz-error');
      var n = (banner && banner.querySelector('.viz-error-source')) || el.nextElementSibling;
      if (n) n.hidden = !n.hidden;
    });
  } else if (act === 'viz-fix') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      var banner = el.closest('.viz-error');
      var card = el.closest('.viz');
      var msgEl = banner && banner.querySelector('.viz-error-msg');
      dispatchVizRepair(card, msgEl ? msgEl.textContent : '');
    });
  } else if (act === 'viz-set-view') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var cardId = el.getAttribute('data-viz-card');
      var c = cardId && document.getElementById(cardId);
      if (!c) return;
      var view = el.getAttribute('data-viz-view-opt') === 'code' ? 'code' : 'preview';
      c.setAttribute('data-viz-view', view);
      var segs = c.querySelectorAll('.viz-seg-btn');
      for (var si = 0; si < segs.length; si++) {
        segs[si].classList.toggle('is-on', segs[si].getAttribute('data-viz-view-opt') === view);
      }
      setVizViewPref(view);
      try { localStorage.setItem('socrates-viz-view', view); } catch (e) { reportSwallow(e, 'viz.setVizViewPref.persist'); /* ignore */ }
    });
  } else if (act === 'viz-close-modal') {
    el.addEventListener('click', function (ev) {
      ev.preventDefault();
      var m = el.closest('.viz-modal-backdrop');
      if (m) m.remove();
    });
  }
  el.__vizActionBound = true;
}

function reloadVizCard(card) {
  var iframe = card && card.querySelector('iframe');
  if (!iframe || !iframe.dataset.srcdoc) return;
  if (card.id && _pendingReady[card.id]) {
    clearTimeout(_pendingReady[card.id].maxTimer);
    delete _pendingReady[card.id];
  }
  if (card.id) delete _vizCards[card.id];
  card.removeAttribute('data-viz-parked');
  card.setAttribute('data-viz-state', 'loading');
  var oldError = card.querySelector('.viz-error');
  if (oldError) oldError.remove();
  var loading = card.querySelector('.viz-loading');
  if (loading) loading.style.display = '';
  iframe.removeAttribute('srcdoc');
  iframe.setAttribute('srcdoc', iframe.dataset.srcdoc);
  if (card.id) _pendingViz.push({ id: card.id });
  processPendingViz();
}

