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

import { esc } from './helpers.js';
import { reportSwallow } from '../util/reportSwallow.ts';
import { decodeSrcdoc, openVizModal, openVizSourceModal } from './vizModals.js';
import {
  configureVizCardRegistry, findLiveVizFrame, parkVizCardForTest, reclaimVizCards,
  rememberLiveVizCard as _rememberLiveVizCard, unparkVizCardForTest,
} from './vizCardRegistry.js';
import {
  configureVizMermaidQueue, mermaidCardIsNearViewportForTest, processPendingMermaid,
  resetMermaidGateForTest, schedulePendingMermaid,
} from './vizMermaidQueue.js';
export { parkVizCardForTest, unparkVizCardForTest, reclaimVizCards };
export { mermaidCardIsNearViewportForTest, resetMermaidGateForTest };
export { processPendingMermaid, schedulePendingMermaid };
export { openVizModal };
export { openVizModalRaw } from './vizModals.js';
import {
  _pendingViz,
  takePendingViz,
  takePendingActions,
  nextVizId,
  setVizViewPref,
} from './vizStubs.js';

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
  return findLiveVizFrame(source);
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

configureVizCardRegistry(processPendingViz);
configureVizMermaidQueue({
  rememberLiveVizCard: _rememberLiveVizCard,
  processPendingVizActions: processPendingVizActions,
});
