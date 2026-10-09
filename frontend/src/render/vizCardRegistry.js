/* Bounded cache and viewport parking for rendered visualization cards. */
import { reportSwallow } from '../util/reportSwallow.ts';
import { _pendingViz, dropPendingVizId } from './vizStubs.js';

var _processPendingViz = function () {};
export function configureVizCardRegistry(processPendingViz) {
  if (typeof processPendingViz === 'function') _processPendingViz = processPendingViz;
}

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

export function rememberLiveVizCard(id, el) {
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
  try { _processPendingViz(); } catch (e) { reportSwallow(e, 'viz._unparkVizCard.processPendingViz'); /* ignore */ }
}

/* Test hooks — the IntersectionObserver path needs a real layout
   engine, but the park/unpark mechanics are plain DOM and worth
   unit coverage (see test/vizPark.test.mjs). */
export function parkVizCardForTest(card) { _parkVizCard(card); }
export function unparkVizCardForTest(card) { _unparkVizCard(card); }

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





export function findLiveVizFrame(source) {
  if (!source) return null;
  var hit = null;
  _liveVizCards.forEach(function (card, cardId) {
    if (hit) return;
    var iframe = card && card.querySelector ? card.querySelector('iframe') : null;
    if (iframe && iframe.contentWindow === source) hit = { id: cardId, iframe: iframe };
  });
  return hit;
}
