/* Native visual cards. The model provides semantic data only; this module
 * owns Socrates styling, responsive layout, interaction, and export. */
import {
  mountSpecializedVisualization,
  usesSpecializedRenderer,
} from './visualizationAdapters.js';
import { whenFontsReady } from './helpers.js';
import { ensureEcharts } from '../vendor/lazy.js';
import { parseFunctionExpression, sampleFunction } from './visualizationMath.js';
import { categoryAxisLayout, formatCategoryLabel, truncateLabel } from './visualizationLabels.js';
import { optionForChart, VIZ_FONT_FAMILY } from './visualizationOptions.js';
import { dispatchExtensionRepair, renderExtension } from './visualizationExtensions.js';
import { renderStructureVisualization, renderVisualizationTable } from './visualizationStatic.js';
export { parseFunctionExpression, sampleFunction, categoryAxisLayout, formatCategoryLabel };

var echartsPromise = null;
var visualCounter = 0;
/* Track every live ECharts instance so we can re-apply the theme palette
 * when the user toggles day/night mode. The observer is installed lazily
 * on the first mount so this module stays side-effect-free when unused. */
var _liveCharts = [];
var _themeObserver = null;
/* P_viz-mount-dedup — per-host map of card IDs currently being mounted.
 * Guards against concurrent mountVisualization calls that pass the DOM
 * check (querySelector returns null) before the first call's
 * host.appendChild() runs. Cleared after appendChild. Keyed on the host
 * because the same output id can legitimately mount into two hosts (a
 * React host and a history-recovery host); a document-wide key would hand
 * the second host a card that lives in the first. */
var _mountingCards = new WeakMap();

function _mountingFor(host) {
  var map = _mountingCards.get(host);
  if (!map) { map = new Map(); _mountingCards.set(host, map); }
  return map;
}

/* Run a card's renderer cleanup exactly once. Never touches the DOM: legacy
 * callers (messageListDom, share) dispose cards that React may still own, and
 * removing those nodes behind React's back would crash its next commit. */
function cleanupCard(card) {
  if (!card || card._visualizationDisposed) return;
  card._visualizationDisposed = true;
  var cleanup = card._visualizationCleanup;
  card._visualizationCleanup = null;
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (_) {}
  }
}

function removeCard(card) {
  if (card && card.parentNode) card.parentNode.removeChild(card);
}

/* Full teardown for cards this module itself owns: cleanup, then detach. Used
 * by abort, remount and React's tracked-card dispose. */
function disposeCard(card) {
  cleanupCard(card);
  removeCard(card);
}

async function loadEcharts() {
  if (!echartsPromise) {
    /* P_perf-self-host — echarts UMD is copied as a static asset and
       injected only when a viz card mounts. The full bundle registers
       every chart / component / renderer, so no core.use([...]) step. */
    echartsPromise = ensureEcharts();
  }
  return echartsPromise;
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c];
  });
}

function token(name, fallback) {
  var value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value ? 'hsl(' + value + ')' : fallback;
}

function palette() {
  return {
    text: token('--text-100', '#1c2637'), muted: token('--text-300', '#68748a'),
    line: token('--border-200', '#dbe2ea'), grid: token('--border-100', '#edf1f5'),
    surface: token('--bg-100', '#ffffff'), primary: token('--accent-500', '#3a6df0'),
    secondary: '#16a394', comparison: '#8a62d6', highlight: '#dc8a2f', baseline: '#8893a5',
  };
}

/* P_viz-retry — mountVisualization has a dedup path keyed on
   `data-visualization-id`. The previous retry button just called
   `mountVisualization(spec, host, options)` which short-circuited
   and returned the existing card. Now we explicitly remove any
   card with the same id from the host (and any siblings of the
   current card) before re-mounting, AND bump the option's
   toolCallId so the dedup hash can't re-collide. The original
   error message is preserved in the closure for the next attempt. */
function remountVisualization(spec, host, options, currentCard) {
  if (!host) return Promise.resolve(null);
  var opts = Object.assign({}, options || {});
  var newCardId = (opts.toolCallId || ('visual-' + Date.now())) + '-r' + Math.random().toString(36).slice(2, 6);
  opts.toolCallId = newCardId;
  /* Remove every stale card in this host, not just `currentCard`: a failed
     attempt can leave partial siblings, and disposing through the one
     guarded teardown keeps extension listeners from leaking. */
  if (currentCard && currentCard.parentNode) {
    var siblings = currentCard.parentNode.querySelectorAll('.visualization-card');
    siblings.forEach(function (el) { disposeCard(el); });
  }
  return mountVisualization(spec, host, opts);
}

function downloadDataUrl(name, dataUrl) {
  var link = document.createElement('a'); link.href = dataUrl; link.download = name; document.body.appendChild(link); link.click(); link.remove();
}

function dataUrlExtension(dataUrl) {
  var mime = /^data:([^;,]+)/.exec(String(dataUrl || ''));
  return mime && mime[1] === 'image/svg+xml' ? '.svg' : '.png';
}

/* Structure diagrams are plain inline SVG; expose the same download contract
   the chart renderers provide so the Download button is never a dead end. */
function svgStageChart(stage) {
  return {
    dispatchAction: function () {},
    getDataURL: function () {
      var svg = stage.querySelector('svg');
      return svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)) : '';
    },
  };
}

function hideAction(btn) {
  if (btn) { btn.hidden = true; btn.setAttribute('aria-hidden', 'true'); }
}

function bindCard(card, spec, chart, opts) {
  opts = opts || {};
  var table = card.querySelector('.visualization-data');
  var tableBtn = card.querySelector('[data-viz-action="table"]');
  if (!table.querySelector('table')) hideAction(tableBtn);
  tableBtn.addEventListener('click', function () { table.hidden = !table.hidden; this.setAttribute('aria-expanded', String(!table.hidden)); });
  var fsBtn = card.querySelector('[data-viz-action="fullscreen"]');
  var requestFs = card.requestFullscreen || card.webkitRequestFullscreen;
  if (!requestFs) hideAction(fsBtn);
  fsBtn.addEventListener('click', function () {
    if (!card.requestFullscreen) {
      if (card.webkitRequestFullscreen) card.webkitRequestFullscreen();
      return;
    }
    /* P_viz-fullscreen-err — surface the failure instead of
       silently swallowing. Common causes: not in a user-gesture
       handler (we are), element hidden (rare), or the browser
       denying permission for cross-origin iframes inside the
       card. The toast uses the existing notify channel if any
       is exposed, otherwise a console warn. */
    card.requestFullscreen().catch(function (err) {
      try { console.warn('[visualization] fullscreen failed', err); } catch (_) {}
    });
  });
  var reset = card.querySelector('[data-viz-action="reset"]');
  if (!chart || opts.noReset) hideAction(reset);
  if (reset) reset.addEventListener('click', function () {
    if (opts.onReset) { opts.onReset(); return; }
    if (chart) chart.dispatchAction({ type: 'restore' });
  });
  var download = card.querySelector('[data-viz-action="download"]');
  if (!chart) hideAction(download);
  download.addEventListener('click', function () {
    if (!chart) return;
    var dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: token('--bg-100', '#fff') });
    Promise.resolve(dataUrl).then(function (resolved) {
      if (resolved) downloadDataUrl((spec.title || 'visualization').replace(/[^\w-]+/g, '-') + dataUrlExtension(resolved), resolved);
    });
  });
}

/* P_viz-i18n — read a translation key with an English fallback.
   Falls through to the fallback when:
   - `t` is missing (i18n.js hasn't loaded yet);
   - the key returns the key itself (untranslated);
   - any lookup throws. */
function vizT(key, fallback) {
  try {
    if (typeof window.t === 'function') {
      var value = window.t(key);
      if (typeof value === 'string' && value && value !== key) return value;
    }
  } catch (_) {}
  return fallback;
}

export async function mountVisualization(spec, host, options) {
  if (!spec || spec.version !== 1 || !host) return null;
  options = options || {};
  _ensureThemeWatcher();
  var cardId = options.toolCallId || ('visual-' + (++visualCounter));
  /* A mounted card whose React host is being torn down aborts the mount
     through this signal; every await below re-checks it and disposes the
     half-built card instead of attaching a renderer nobody can see. */
  var isCancelled = function () { return !!(options.signal && options.signal.aborted); };
  // Synchronous dedup: check DOM first, then the per-host in-memory map to
  // guard against concurrent calls that yield the event loop between the
  // DOM check and host.appendChild.
  var existing = Array.from(host.querySelectorAll('.visualization-card[data-visualization-id]'))
    .find(function (candidate) { return candidate.dataset.visualizationId === cardId; });
  if (existing) return existing;
  var mounting = _mountingFor(host);
  if (mounting.has(cardId)) {
    // Another call is already mounting this card for the same host.
    return mounting.get(cardId);
  }
  var card = document.createElement('section');
  card.className = 'visualization-card'; card.dataset.visualizationId = cardId;
  card.setAttribute('aria-label', spec.title + '. ' + spec.accessibilitySummary);
  // Register in the in-memory map BEFORE any async yield so concurrent
  // calls with the same cardId see it.
  mounting.set(cardId, card);
  var chartTemplates = ['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot'];
  var extension = ['svg_illustration', 'interactive_simulation'].includes(spec.template);
  /* P_viz-actions-i18n — the four action buttons used to be
     hardcoded Chinese with `title=` only. Now they go through
     `vizT` (with English fallbacks) AND get explicit `aria-label`s
     so screen readers announce a semantic label, not a tooltip. */
  var actionTable = vizT('viz.action.table', 'Data');
  var actionReset = vizT('viz.action.reset', 'Reset view');
  var actionDownload = vizT('viz.action.download', 'Download PNG');
  var actionFullscreen = vizT('viz.action.fullscreen', 'Fullscreen');
  card.innerHTML = '<header class="visualization-header"><div><h3>' + esc(spec.title) + '</h3></div><div class="visualization-actions"><button type="button" data-viz-action="table" aria-expanded="false" aria-label="' + esc(actionTable) + '" title="' + esc(actionTable) + '">' + esc(actionTable) + '</button><button type="button" data-viz-action="reset" aria-label="' + esc(actionReset) + '" title="' + esc(actionReset) + '">' + esc(actionReset) + '</button><button type="button" data-viz-action="download" aria-label="' + esc(actionDownload) + '" title="' + esc(actionDownload) + '">' + esc(actionDownload) + '</button><button type="button" data-viz-action="fullscreen" aria-label="' + esc(actionFullscreen) + '" title="' + esc(actionFullscreen) + '">' + esc(actionFullscreen) + '</button></div></header><div class="visualization-summary sr-only">' + esc(spec.accessibilitySummary) + '</div><figure class="visualization-figure"><div class="visualization-stage"></div>' + (spec.caption ? '<figcaption class="visualization-caption">' + esc(spec.caption) + '</figcaption>' : '') + '</figure><div class="visualization-data" hidden>' + renderVisualizationTable(spec, esc, vizT) + '</div>';
  host.appendChild(card);
  mounting.delete(cardId);
  try { if (typeof renderMathInElement === 'function') renderMathInElement(card, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] }); } catch (_) {}
  var stage = card.querySelector('.visualization-stage'), chart = null, liveEntry = null;
  try {
    if (usesSpecializedRenderer(spec.template)) {
      await whenFontsReady('Noto Sans SC');
      var specialized = await mountSpecializedVisualization(spec, stage, {
        sampleFunction: sampleFunction,
      });
      /* Register cleanup before any cancellation check so a torn-down mount
         releases whatever the adapter already created (RAF, observers,
         controls, WebGL context). */
      card._visualizationCleanup = specialized.cleanup || function () {};
      if (isCancelled()) { disposeCard(card); return null; }
      chart = specialized.chart || null;
      card.dataset.visualizationRenderer = spec.template === 'function' || spec.template === 'paper_chart'
        ? 'plotly'
        : spec.template === 'geometry_3d'
          ? 'three'
          : spec.template === 'math_construction'
            ? 'geogebra'
            : spec.template === 'whiteboard'
              ? 'tldraw'
              : 'mermaid';
    } else if (chartTemplates.includes(spec.template)) {
      await whenFontsReady('Noto Sans SC');
      var echarts = await loadEcharts();
      if (isCancelled()) { disposeCard(card); return null; }
      var useCanvas = spec.template === 'heatmap' || (spec.payload.series || []).some(function (series) { return series.data && series.data.length > 1200; });
      chart = echarts.init(stage, null, { renderer: useCanvas ? 'canvas' : 'svg' });
      var chartOpts = optionForChart(spec, palette());
      if (!chartOpts) {
        chart.dispose();
        stage.innerHTML = '<div class="visualization-fallback"><strong>视觉内容暂未渲染</strong><p>' + esc(spec.accessibilitySummary) + '</p><button type="button">' + esc(vizT('viz.action.retry', 'Retry locally')) + '</button></div>';
        stage.querySelector('button').addEventListener('click', function () { remountVisualization(spec, host, options, card); });
        chart = null;
      } else if (isCancelled()) {
        chart.dispose();
        chart = null;
        disposeCard(card);
        return null;
      } else {
        chart.setOption(chartOpts, { notMerge: true });
        liveEntry = { chart: chart, spec: spec };
        _liveCharts.push(liveEntry);
        /* P_viz-resize-guard — resizing synchronously from the
           ResizeObserver can re-enter ECharts while its progressive
           render pipeline is mid-flight (setOption(notMerge) or the
           theme refresh mutates the SVG, which changes the stage size
           and fires the observer in the same frame). That crashes
           inside chart views with "Cannot read properties of
           undefined (reading 'childAt')".
           Solution: track a pendingResize flag; try resize() inline
           (succeeds when the chart is idle), and if it fails (chart
           is animating), the 'finished' event retries after all
           entrance/transition animations settle. */
        var resizeRaf = 0;
        var pendingResize = false;
        chart.on('finished', function () {
          if (pendingResize) {
            pendingResize = false;
            if (!chart || chart.isDisposed() || !stage.clientWidth || !stage.clientHeight) return;
            try { chart.resize(); } catch (_) { /* chart was disposed mid-animation */ }
          }
        });
        var resize = new ResizeObserver(function () {
          if (resizeRaf) return;
          resizeRaf = requestAnimationFrame(function () {
            resizeRaf = 0;
            if (!chart || chart.isDisposed() || !stage.clientWidth || !stage.clientHeight) return;
            pendingResize = true;
            try { chart.resize(); pendingResize = false; } catch (_) { /* deferred to 'finished' */ }
          });
        });
        resize.observe(stage);
        card._visualizationCleanup = function () {
          resize.disconnect();
          if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
          chart.dispose();
          if (liveEntry) {
            var idx = _liveCharts.indexOf(liveEntry);
            if (idx >= 0) _liveCharts.splice(idx, 1);
          }
        };
      }
    } else if (extension) {
      stage.innerHTML = renderExtension(spec, cardId, esc);
      var frame = stage.querySelector('iframe');
      var receiveExtensionMsg = function (event) {
        var data = event.data || {};
        if (event.source !== frame.contentWindow || data.cardId !== cardId || data.nonce !== frame.dataset.nonce) return;
        if (data.type === 'socrates-viz-ready') {
          frame.dataset.ready = 'true';
        } else if (data.type === 'socrates-viz-error') {
          /* P_ext-viz-error — surface a script failure inside the
             sandboxed extension iframe, and offer "Fix with AI" so the
             error rides the tool-retry pipeline back to the model
             instead of dying silently in an opaque-origin frame. */
          var errMsg = String(data.message || 'render error').slice(0, 300);
          var errBanner = stage.querySelector('.visualization-ext-error');
          if (!errBanner) {
            errBanner = document.createElement('div');
            errBanner.className = 'visualization-ext-error viz-error';
            stage.insertBefore(errBanner, frame);
          }
          errBanner.innerHTML = '<span class="viz-error-icon">!</span><span class="viz-error-msg">' + esc(errMsg) + '</span>' +
            '<button type="button" class="viz-error-fix">' + esc(vizT('viz.action.fixWithAi', 'Fix with AI')) + '</button>';
          var fixBtn = errBanner.querySelector('.viz-error-fix');
          if (fixBtn && !fixBtn.__vizBound) {
            fixBtn.__vizBound = true;
            fixBtn.addEventListener('click', function (ev) {
              ev.preventDefault();
              ev.stopPropagation();
              dispatchExtensionRepair(card, spec, errMsg);
            });
          }
        }
      };
      window.addEventListener('message', receiveExtensionMsg);
      card._visualizationCleanup = function () { window.removeEventListener('message', receiveExtensionMsg); };
    } else {
      stage.innerHTML = renderStructureVisualization(spec, 'visual-arrow-' + (++visualCounter), esc, VIZ_FONT_FAMILY, truncateLabel);
      chart = svgStageChart(stage);
    }
    if (isCancelled()) { disposeCard(card); return null; }
    var echartsInstance = chartTemplates.includes(spec.template) ? chart : null;
    bindCard(card, spec, chart, {
      /* ECharts' toolbox `restore` action crashes some series types
         (radar: "reading 'childAt'"); re-applying the option is the
         reliable way to return to the initial view. */
      onReset: echartsInstance ? function () {
        if (echartsInstance.isDisposed()) return;
        var fresh = optionForChart(spec, palette());
        if (!fresh) return;
        echartsInstance.clear();
        echartsInstance.setOption(fresh, { notMerge: true });
      } : null,
      noReset: card.dataset.visualizationRenderer === 'mermaid' || !usesSpecializedRenderer(spec.template) && !chartTemplates.includes(spec.template) });
  } catch (error) {
    /* A cancelled mount must not paint a fallback into a host React has
       already abandoned; dispose and let the caller's teardown stay final. */
    if (isCancelled()) { disposeCard(card); return null; }
    stage.innerHTML = '<div class="visualization-fallback"><strong>视觉内容暂未渲染</strong><p>' + esc(spec.accessibilitySummary) + '</p>' +
      '<button type="button" data-viz-fallback="retry">' + esc(vizT('viz.action.retry', 'Retry locally')) + '</button>' +
      ' <button type="button" data-viz-fallback="fix">' + esc(vizT('viz.action.fixWithAi', 'Fix with AI')) + '</button></div>';
    /* "Retry locally" re-mounts the SAME spec — useful for transient
       renderer faults (CDN, init race). "Fix with AI" sends the error
       back through the tool-retry pipeline so the model can produce a
       corrected spec — the only useful move when the spec itself is
       the problem. */
    var retryBtn = stage.querySelector('[data-viz-fallback="retry"]');
    if (retryBtn) retryBtn.addEventListener('click', function () { remountVisualization(spec, host, options, card); });
    var fixBtn = stage.querySelector('[data-viz-fallback="fix"]');
    if (fixBtn) fixBtn.addEventListener('click', function () {
      dispatchExtensionRepair(card, spec, error && error.message);
    });
    console.warn('[visualization] render failed', error);
  }
  return card;
}

export function disposeVisualizations(host) {
  if (!host) return;
  host.querySelectorAll('.visualization-card').forEach(function (card) { cleanupCard(card); });
}

/* Full dispose for one card React tracked from the mount return value.
 * Needed when the host itself was emptied by legacy DOM work before React's
 * effect cleanup ran: the card reference is the only handle left, and this is
 * the one place a React-owned card may be detached. */
export function disposeVisualization(card) {
  disposeCard(card);
}

/* Re-apply the current theme palette to every live ECharts instance and
 * re-run KaTeX so LaTeX labels stay themed. Called from a MutationObserver
 * hooked on `data-mode` / `data-theme` in the <html> element. */
function _refreshCharts() {
  var colors = palette();
  for (var i = 0; i < _liveCharts.length; i++) {
    var entry = _liveCharts[i];
    if (!entry || !entry.chart || !entry.spec || !entry.chart.isDisposed || entry.chart.isDisposed()) {
      _liveCharts.splice(i, 1); i--;
      continue;
    }
    try {
      /* P_viz-theme-animation — setOption with {notMerge: true} triggers
       * ECharts' internal transition (entrance) animation pipeline that
       * calls _executeOneToOne → _update → childAt on old views that have
       * already been disposed by notMerge. The crash surfaces in a later
       * requestAnimationFrame frame, so the try-catch around setOption
       * itself does NOT catch it. Suppress animation entirely here: theme
       * colour changes don't need entrance/transition animations. */
      var chartOpts = optionForChart(entry.spec, colors);
      if (chartOpts) {
        chartOpts.animation = false;
        entry.chart.setOption(chartOpts, { notMerge: true });
      }
      /* Do NOT call resize() here. The ResizeObserver attached during
       * mount (P_viz-resize-guard) already handles container-size changes
       * via rAF. Calling resize() synchronously after setOption triggers
       * the ResizeObserver from setOption's SVG DOM mutations, which
       * queues a rAF callback that runs resize() while ECharts' view
       * hierarchy is still mid-construction from setOption's animation
       * pipeline — crashing with "Cannot read properties of undefined
       * (reading 'childAt')". setOption alone is sufficient for theme
       * colour changes; the ResizeObserver covers layout changes. */
    } catch (_) { /* ignore */ }
  }
  /* Re-run KaTeX on every live card so LaTeX renders pick up any token
   * change tied to the theme. We re-discover the cards via the data
   * attribute each time to avoid keeping strong references ourselves. */
  if (typeof renderMathInElement === 'function') {
    document.querySelectorAll('.visualization-card').forEach(function (card) {
      try { renderMathInElement(card, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] }); } catch (_) {}
    });
  }
}

function _ensureThemeWatcher() {
  if (_themeObserver || typeof MutationObserver === 'undefined') return;
  try {
    _themeObserver = new MutationObserver(function () { _refreshCharts(); });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-theme'] });
  } catch (_) { /* ignore */ }
}
