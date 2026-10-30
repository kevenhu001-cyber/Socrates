import type { VisualizationCard, VisualizationMountOptions, LiveChart, VisualizationRenderState, ExportableChart } from './visualizationRuntime.ts';
import type { ChartInstance } from '../types/vendorRuntime.ts';
/* Native visual cards. The model provides semantic data only; this module
 * owns Socrates styling, responsive layout, interaction, and export. */
import { mountSpecializedVisualization, usesSpecializedRenderer } from './visualizationAdapters.ts';
import { whenFontsReady } from './helpers.ts';
import { ensureEcharts } from '../vendor/lazy.ts';
import { parseFunctionExpression, sampleFunction } from '@socrates/core/visualizationMath';
import { categoryAxisLayout, formatCategoryLabel, truncateLabel } from './visualizationLabels.ts';
import { optionForChart, VIZ_FONT_FAMILY } from './visualizationOptions.ts';
import { dispatchExtensionRepair, renderExtension } from './visualizationExtensions.ts';
import { asVisualizationSpec, VizSpec } from './visualizationSpec.ts';
import { renderSemanticVisualization, renderStructureVisualization, renderVisualizationTable } from './visualizationStatic.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { openWorkbench } from '../react/workbench/workbenchStore';
import { createElement, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../react/lib/boot/ownedRoot';
import { VisualizationActions, VisualizationFallbackActions } from '../react/visualization/VisualizationActions.tsx';
import { Button } from '../react/ui/shadcn/button';
import { runtimeWindow as browserWindow } from "../types/runtimeWindow.ts";

export { parseFunctionExpression, sampleFunction, categoryAxisLayout, formatCategoryLabel };

let echartsPromise: ReturnType<typeof ensureEcharts> | null = null;
let visualCounter = 0;
/* Track every live ECharts instance so we can re-apply the theme palette
 * when the user toggles day/night mode. The observer is installed lazily
 * on the first mount so this module stays side-effect-free when unused. */
const _liveCharts: LiveChart[] = [];
let _themeObserver: MutationObserver|null = null;
/* P_viz-mount-dedup — per-host map of card IDs currently being mounted.
 * Guards against concurrent mountVisualization calls that pass the DOM
 * check (querySelector returns null) before the first call's
 * host.appendChild() runs. Cleared after appendChild. Keyed on the host
 * because the same output id can legitimately mount into two hosts (a
 * React host and a history-recovery host); a document-wide key would hand
 * the second host a card that lives in the first. */
const _mountingCards = new WeakMap<HTMLElement, Map<string, VisualizationCard>>();

function _mountingFor(host: HTMLElement) {
  let map = _mountingCards.get(host);
  if (!map) { map = new Map(); _mountingCards.set(host, map); }
  return map;
}

/* Run a card's renderer cleanup exactly once. Never touches the DOM: legacy
 * callers (messageListDom, share) dispose cards that React may still own, and
 * removing those nodes behind React's back would crash its next commit. */
function cleanupCard(card: VisualizationCard) {
  if (!card || card._visualizationDisposed) return;
  card._visualizationDisposed = true;
  disposeCardReactRoots(card);
  const cleanup = card._visualizationCleanup;
  card._visualizationCleanup = null;
  if (typeof cleanup === 'function') {
    try { cleanup(); }
    catch (error) { reportSwallow(error, 'visualization.cleanupCard'); }
  }
}

function disposeCardReactRoots(card: VisualizationCard) {
  const reactRoots = card._visualizationReactRoots || [];
  card._visualizationReactRoots = [];
  reactRoots.forEach(function (root: { destroy: () => void; }) {
    try { root.destroy(); }
    catch (error) { reportSwallow(error, 'visualization.disposeReactActions'); }
  });
}

function mountCardReactSurface(card: VisualizationCard, host: HTMLElement | null, label: string, content: ReactNode) {
  if (!host) return null;
  const root = mountOwnedRoot(host, 'visualization-' + label, content);
  if (!card._visualizationReactRoots) card._visualizationReactRoots = [];
  if (!card._visualizationReactRoots.includes(root)) card._visualizationReactRoots.push(root);
  flushSync(function () { root.render(content); });
  return root;
}

function removeCard(card: VisualizationCard) {
  if (card && card.parentNode) card.parentNode.removeChild(card);
}

/* Full teardown for cards this module itself owns: cleanup, then detach. Used
 * by abort, remount and React's tracked-card dispose. */
function disposeCard(card: VisualizationCard) {
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

function esc(value: unknown) {
  return String(value == null ? '' : value).replace(/[&<>'"]/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' } as Record<string, string>)[c];
  });
}

function token(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
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
function remountVisualization(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, currentCard?: VisualizationCard) {
  if (!host) return Promise.resolve(null);
  const opts = Object.assign({}, options || {});
  const newCardId = (opts.toolCallId || ('visual-' + Date.now())) + '-r' + Math.random().toString(36).slice(2, 6);
  opts.toolCallId = newCardId;
  /* Remove every stale card in this host, not just `currentCard`: a failed
     attempt can leave partial siblings, and disposing through the one
     guarded teardown keeps extension listeners from leaking. */
  if (currentCard && currentCard.parentNode) {
    const siblings = currentCard.parentNode.querySelectorAll<VisualizationCard>('.visualization-card');
    siblings.forEach(function (el) { disposeCard(el); });
  }
  return mountVisualization(spec, host, opts);
}

function downloadDataUrl(name: string, dataUrl: string) {
  const link = document.createElement('a'); link.href = dataUrl; link.download = name; document.body.appendChild(link); link.click(); link.remove();
}

function dataUrlExtension(dataUrl: string) {
  const mime = /^data:([^;,]+)/.exec(String(dataUrl || ''));
  return mime && mime[1] === 'image/svg+xml' ? '.svg' : '.png';
}

/* Structure diagrams are plain inline SVG; expose the same download contract
   the chart renderers provide so the Download button is never a dead end. */
function svgStageChart(stage: HTMLElement) {
  return {
    getDataURL: function () {
      const svg = stage.querySelector('svg');
      return svg ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg)) : '';
    },
  };
}

function renderCardMath(card: Element) {
  try {
    if (typeof browserWindow.renderMathInElement === 'function') browserWindow.renderMathInElement(card, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] });
  } catch (error) { reportSwallow(error, 'visualization.renderCardMath'); }
}

function bindCard(card: VisualizationCard, spec: VizSpec, chart: ExportableChart | null, opts: VisualizationMountOptions = {}) {
  opts = opts || {};
  const table = card.querySelector('.visualization-data');
  const requestFs = card.requestFullscreen || card.webkitRequestFullscreen;
  const labels = {
    workbench: vizT('workbench.title', 'Workbench'),
    table: vizT('viz.action.table', 'Data'),
    reset: vizT('viz.action.reset', 'Reset view'),
    download: vizT('viz.action.download', 'Download PNG'),
    fullscreen: vizT('viz.action.fullscreen', 'Fullscreen'),
  };
  const content = createElement(VisualizationActions, {
    labels: labels,
    tableAvailable: !!(table && table.querySelector('table')),
    resetAvailable: !opts.noReset && (!!opts.onReset || typeof chart?.dispatchAction === 'function'),
    downloadAvailable: !!chart,
    fullscreenAvailable: !!requestFs,
    onWorkbench: function () {
      const preview = card.cloneNode(true) as HTMLElement;
      (preview as Element).querySelector('[data-viz-actions-root]')?.remove();
      openWorkbench({
        id: card.dataset.visualizationId || ('viz-' + Date.now()),
        title: spec.title || vizT('workbench.chartTitle', 'Visualization'),
        titleKey: spec.title ? undefined : 'workbench.chartTitle',
        type: 'chart',
        code: JSON.stringify(spec, null, 2),
        language: 'json',
        previewHtml: preview.outerHTML,
      }, 'preview');
    },
    onReset: function () {
      if (opts.onReset) { opts.onReset(); return; }
      chart?.dispatchAction?.({ type: 'restore' });
    },
    onDownload: function () {
      if (!chart) return;
      const dataUrl = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: token('--bg-100', '#fff') });
      Promise.resolve(dataUrl).then(function (resolved) {
        if (resolved) downloadDataUrl((spec.title || 'visualization').replace(/[^\w-]+/g, '-') + dataUrlExtension(resolved), resolved);
      });
    },
    onFullscreen: function () {
      if (!card.requestFullscreen) {
        if (card.webkitRequestFullscreen) card.webkitRequestFullscreen();
        return;
      }
      Promise.resolve(card.requestFullscreen()).catch(function (error) {
        reportSwallow(error, 'visualization.fullscreen');
      });
    },
  });
  mountCardReactSurface(card, card.querySelector<HTMLElement>('[data-viz-actions-root]')!, 'actions', content);
}

function mountFallbackActions(card: VisualizationCard, host: HTMLElement, spec: VizSpec, options: VisualizationMountOptions, error: unknown) {
  const content = createElement(VisualizationFallbackActions, {
    retryLabel: vizT('viz.action.retry', 'Retry locally'),
    fixLabel: vizT('viz.action.fixWithAi', 'Fix with AI'),
    onRetry: function () { remountVisualization(spec, host, options, card); },
    onFix: function () { dispatchExtensionRepair(card, spec, (error as Error | null)?.message || 'renderer returned no chart option'); },
  });
  mountCardReactSurface(card, card.querySelector<HTMLElement>('[data-viz-fallback-root]')!, 'fallback-actions', content);
}

/* P_viz-i18n — read a translation key with an English fallback.
   Falls through to the fallback when:
   - `t` is missing (i18n.ts hasn't loaded yet);
   - the key returns the key itself (untranslated);
   - any lookup throws. */
function vizT(key: string, fallback?: string) {
  try {
    if (typeof browserWindow.t === 'function') {
      const value = browserWindow.t(key);
      if (typeof value === 'string' && value && value !== key) return value;
    }
  } catch (error) { reportSwallow(error, 'visualization.translate'); }
  return fallback || key;
}

const CHART_TEMPLATES = ['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot'];
const EXTENSION_TEMPLATES = ['svg_illustration', 'interactive_simulation'];

function createVisualizationCard(spec: VizSpec, host: HTMLElement, cardId: string, mounting: Map<string, VisualizationCard>): VisualizationCard {
  const card: VisualizationCard = document.createElement('section');
  card.className = 'visualization-card';
  card.dataset.visualizationId = cardId;
  card.setAttribute('aria-label', spec.title + '. ' + spec.accessibilitySummary);
  mounting.set(cardId, card);
  card.innerHTML = '<header class="visualization-header"><div><h3>' + esc(spec.title) + '</h3></div><div class="visualization-actions" data-viz-actions-root></div></header><div class="visualization-summary sr-only">' + esc(spec.accessibilitySummary) + '</div><figure class="visualization-figure"><div class="visualization-stage"></div>' + (spec.caption ? '<figcaption class="visualization-caption">' + esc(spec.caption) + '</figcaption>' : '') + '</figure><div class="visualization-data" hidden></div>';
  host.appendChild(card);
  mounting.delete(cardId);
  renderCardMath(card);
  return card;
}

function rendererName(template: string) {
  if (template === 'function' || template === 'paper_chart') return 'plotly';
  if (template === 'geometry_3d') return 'three';
  if (template === 'math_construction') return 'geogebra';
  if (template === 'whiteboard') return 'tldraw';
  return 'mermaid';
}

async function mountSpecializedRenderer(spec: VizSpec, card: VisualizationCard, stage: HTMLElement, renderState: VisualizationRenderState, isCancelled: () => boolean) {
  await whenFontsReady('Noto Sans SC');
  const specialized = await mountSpecializedVisualization(spec, stage, { sampleFunction: sampleFunction });
  if (!specialized.handled) return false;
  card._visualizationCleanup = specialized.cleanup || null;
  if (isCancelled()) { disposeCard(card); return true; }
  renderState.chart = specialized.chart || null;
  card.dataset.visualizationRenderer = rendererName(spec.template);
  return false;
}

function watchChartResize(card: VisualizationCard, stage: HTMLElement, chart: ChartInstance, liveEntry: LiveChart) {
  let resizeRaf = 0;
  let pendingResize = false;
  chart.on('finished', function () {
    if (!pendingResize) return;
    pendingResize = false;
    if (!chart || chart.isDisposed() || !stage.clientWidth || !stage.clientHeight) return;
    try { chart.resize(); } catch (_) {
      reportSwallow(_, 'empty catch: render/visualization.ts:291', 'expected');
      /* chart was disposed mid-animation */
    }
  });
  const resize = new ResizeObserver(function () {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(function () {
      resizeRaf = 0;
      if (!chart || chart.isDisposed() || !stage.clientWidth || !stage.clientHeight) return;
      pendingResize = true;
      try { chart.resize(); pendingResize = false; } catch (_) {
        reportSwallow(_, 'empty catch: render/visualization.ts:299');
        /* deferred to 'finished' */
      }
    });
  });
  resize.observe(stage);
  card._visualizationCleanup = function () {
    resize.disconnect();
    if (resizeRaf) { cancelAnimationFrame(resizeRaf); resizeRaf = 0; }
    chart.dispose();
    if (liveEntry) {
      const index = _liveCharts.indexOf(liveEntry);
      if (index >= 0) _liveCharts.splice(index, 1);
    }
  };
}

function renderChartFallback(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement) {
  stage.innerHTML = '<div class="visualization-fallback"><strong>视觉内容暂未渲染</strong><p>' + esc(spec.accessibilitySummary) + '</p><div data-viz-fallback-root></div></div>';
  mountFallbackActions(card, host, spec, options, null);
  reportSwallow(new Error('renderer returned no chart option'), 'visualization/' + spec.template + '/empty_options', 'recoverable');
}

async function mountChartRenderer(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement, renderState: VisualizationRenderState, isCancelled: () => boolean) {
  await whenFontsReady('Noto Sans SC');
  const echarts = await loadEcharts();
  if (isCancelled()) { disposeCard(card); return true; }
  const useCanvas = spec.template === 'heatmap' || (spec.payload.series || []).some(function (series: { data: unknown[] }) {
    return series.data && series.data.length > 1200;
  });
  const chart = echarts.init(stage, null, { renderer: useCanvas ? 'canvas' : 'svg' });
  renderState.chart = chart;
  card.dataset.visualizationRenderer = 'echarts';
  const chartOptions = optionForChart(spec, palette());
  if (!chartOptions) {
    chart.dispose();
    renderChartFallback(spec, host, options, card, stage);
    renderState.chart = null;
    return false;
  }
  if (isCancelled()) {
    chart.dispose();
    renderState.chart = null;
    disposeCard(card);
    return true;
  }
  chart.setOption(chartOptions, { notMerge: true });
  renderState.liveEntry = { chart: chart, spec: spec };
  _liveCharts.push(renderState.liveEntry);
  watchChartResize(card, stage, chart, renderState.liveEntry);
  return false;
}

function mountExtensionRenderer(spec: VizSpec, card: VisualizationCard, stage: HTMLElement, cardId: string) {
  stage.innerHTML = renderExtension(spec, cardId, esc);
  const frame = stage.querySelector('iframe')!;
  const receiveExtensionMsg = function (event: MessageEvent<{ cardId?: string; nonce?: string; type?: string; message?: string }>) {
    const data = event.data || {};
    if (event.source !== frame.contentWindow || data.cardId !== cardId || data.nonce !== frame.dataset.nonce) return;
    if (data.type === 'socrates-viz-ready') {
      frame.dataset.ready = 'true';
      return;
    }
    if (data.type !== 'socrates-viz-error') return;
    const errorMessage = String(data.message || 'render error').slice(0, 300);
    reportSwallow(new Error('sandboxed visualization reported a runtime error'), 'visualization/' + spec.template + '/iframe_runtime_error', 'recoverable');
    let errorBanner = stage.querySelector('.visualization-ext-error');
    if (!errorBanner) {
      errorBanner = document.createElement('div');
      errorBanner.className = 'visualization-ext-error viz-error';
      const errorIcon = document.createElement('span');
      errorIcon.className = 'viz-error-icon';
      errorIcon.textContent = '!';
      const errorText = document.createElement('span');
      errorText.className = 'viz-error-msg';
      const errorAction = document.createElement('div');
      errorAction.className = 'viz-error-action-host';
      errorAction.setAttribute('data-viz-error-action-root', '');
      errorBanner.append(errorIcon, errorText, errorAction);
      stage.insertBefore(errorBanner, frame);
    }
    errorBanner.querySelector('.viz-error-msg')!.textContent = errorMessage;
    const fixButton = createElement(Button, {
      variant: 'outline',
      size: 'sm',
      className: 'viz-error-fix',
      type: 'button',
      onClick: function (clickEvent) {
        clickEvent.stopPropagation();
        dispatchExtensionRepair(card, spec, errorMessage);
      },
      children: vizT('viz.action.fixWithAi', 'Fix with AI'),
    });
    mountCardReactSurface(card, errorBanner.querySelector('[data-viz-error-action-root]'), 'extension-error-action', fixButton);
  };
  browserWindow.addEventListener('message', receiveExtensionMsg);
  frame.addEventListener('error', function () {
    reportSwallow(new Error('sandboxed visualization iframe failed to load'), 'visualization/' + spec.template + '/iframe_load_error', 'recoverable');
  });
  card!._visualizationCleanup = function () { browserWindow.removeEventListener('message', receiveExtensionMsg); };
}

function mountSemanticRenderer(spec: VizSpec, stage: HTMLElement) {
  const semanticSvg = renderSemanticVisualization(spec, 'visual-arrow-' + (++visualCounter), esc, VIZ_FONT_FAMILY, truncateLabel);
  stage.innerHTML = semanticSvg || renderStructureVisualization(spec, 'visual-arrow-' + (++visualCounter), esc, VIZ_FONT_FAMILY, truncateLabel);
  return svgStageChart(stage);
}

async function mountTemplateRenderer(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement, cardId: string, renderState: VisualizationRenderState, isCancelled: () => boolean) {
  if (usesSpecializedRenderer(spec.template)) {
    return mountSpecializedRenderer(spec, card, stage, renderState, isCancelled);
  }
  if (CHART_TEMPLATES.includes(spec.template)) {
    return mountChartRenderer(spec, host, options, card, stage, renderState, isCancelled);
  }
  if (EXTENSION_TEMPLATES.includes(spec.template)) {
    mountExtensionRenderer(spec, card, stage, cardId);
    return false;
  }
  renderState.chart = mountSemanticRenderer(spec, stage);
  return false;
}

function invalidVisualizationInput(spec: unknown, host: HTMLElement | null | undefined) {
  return !spec || typeof spec !== 'object' || (spec as { version?: number }).version !== 1 || !host;
}

function findExistingCard(host: HTMLElement, cardId: string) {
  const existing = Array.from(host.querySelectorAll('.visualization-card[data-visualization-id]'))
    .find(function (candidate) { return (candidate as HTMLElement).dataset.visualizationId === cardId; });
  if (existing) return { card: existing, mounting: null };
  const mounting = _mountingFor(host);
  return { card: mounting.has(cardId) ? mounting.get(cardId) : null, mounting: mounting };
}

function stopCancelledMount(cancelled: boolean, card: VisualizationCard, isCancelled: () => boolean) {
  if (cancelled) return true;
  if (!isCancelled()) return false;
  disposeCard(card);
  return true;
}

function chartRuntimeForCard(spec: VizSpec, card: VisualizationCard, renderState: VisualizationRenderState) {
  if (!CHART_TEMPLATES.includes(spec.template) || !renderState.chart) return null;
  const runtime = createChartRuntime(card, renderState.chart as ChartInstance, spec, renderState.liveEntry);
  card._visualizationUpdate = runtime.update;
  return runtime;
}

function cardSkipsChartReset(spec: VizSpec, card: VisualizationCard) {
  return card.dataset.visualizationRenderer === 'mermaid'
    || !usesSpecializedRenderer(spec.template) && !CHART_TEMPLATES.includes(spec.template);
}

function createChartRuntime(card: VisualizationCard, chart: ChartInstance, initialSpec: VizSpec, liveEntry: LiveChart | null) {
  let currentSpec = initialSpec;
  function update(next: VizSpec) {
    if (card._visualizationDisposed || chart.isDisposed() || next.template !== currentSpec.template) return false;
    const nextOptions = optionForChart(next, palette());
    if (!nextOptions) return false;
    chart.setOption(nextOptions, { replaceMerge: ['series'] });
    currentSpec = next;
    if (liveEntry) liveEntry.spec = next;
    card.querySelector('.visualization-header h3')!.textContent = next.title || '';
    card.querySelector('.visualization-summary')!.textContent = next.accessibilitySummary || '';
    card.setAttribute('aria-label', (next.title || '') + '. ' + (next.accessibilitySummary || ''));
    card.querySelector('.visualization-data')!.innerHTML = renderVisualizationTable(next, esc, vizT);
    let caption = card.querySelector<HTMLElement>('.visualization-caption');
    if (!caption && next.caption) {
      caption = document.createElement('figcaption');
      caption.className = 'visualization-caption';
      card.querySelector('.visualization-figure')!.appendChild(caption);
    }
    if (caption) caption.textContent = next.caption || '';
    return true;
  }
  function reset() {
    if (chart.isDisposed()) return;
    const fresh = optionForChart(currentSpec, palette());
    if (!fresh) return;
    chart.clear();
    chart.setOption(fresh, { notMerge: true });
  }
  return { update: update, reset: reset };
}

function handleVisualizationMountFailure(error: unknown, spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement, renderState: VisualizationRenderState, isCancelled: () => boolean) {
  if (isCancelled()) { disposeCard(card); return null; }
  disposeCardReactRoots(card);
  const cleanup = card._visualizationCleanup;
  card._visualizationCleanup = null;
  if (typeof cleanup === 'function') {
    try { cleanup(); } catch (_) {
      reportSwallow(_, 'empty catch: render/visualization.ts:489', 'expected');
      /* empty-catch: visualization cleanup must not hide the original render failure */
    }
  }
  if (renderState.liveEntry) {
    const failedChartIndex = _liveCharts.indexOf(renderState.liveEntry);
    if (failedChartIndex >= 0) _liveCharts.splice(failedChartIndex, 1);
  }
  const chart = renderState.chart;
  if (chart && typeof chart.dispose === 'function') {
    try { if (!chart.isDisposed || !chart.isDisposed()) chart.dispose(); } catch (_) {
      reportSwallow(_, 'empty catch: render/visualization.ts:497', 'expected');
      /* empty-catch: visualization cleanup must not hide the original render failure */
    }
  }
  reportSwallow(error, 'visualization/' + spec.template + '/render_failure', 'recoverable');
  stage!.innerHTML = '<div class="visualization-fallback"><strong>视觉内容暂未渲染</strong><p>' + esc(spec.accessibilitySummary) + '</p><div data-viz-fallback-root></div></div>';
  mountFallbackActions(card, host, spec, options, error);
  bindCard(card, spec, null, { noReset: true });
  console.warn('[visualization] render failed', (error as Error | null)?.name || 'Error');
  return card;
}

export async function mountVisualization(rawSpec: unknown, host: HTMLElement | null | undefined, options: VisualizationMountOptions = {}) {
  if (invalidVisualizationInput(rawSpec, host) || !host) return null;
  const spec = asVisualizationSpec(rawSpec);
  if (!spec) return null;
  options = options || {};
  _ensureThemeWatcher();
  const cardId = options.toolCallId || ('visual-' + (++visualCounter));
  const isCancelled = function () { return !!(options.signal && options.signal.aborted); };
  const mounted = findExistingCard(host, cardId);
  if (mounted.card) return mounted.card;
  const card = createVisualizationCard(spec, host, cardId, mounted.mounting!);
  const stage = card.querySelector<HTMLElement>('.visualization-stage')!;
  const renderState: VisualizationRenderState = { chart: null, liveEntry: null };
  try {
    card.querySelector('.visualization-data')!.innerHTML = renderVisualizationTable(spec, esc, vizT);
    const cancelled = await mountTemplateRenderer(spec, host, options, card, stage, cardId, renderState, isCancelled);
    if (stopCancelledMount(cancelled, card, isCancelled)) return null;
    const chart = renderState.chart;
    const chartRuntime = chartRuntimeForCard(spec, card, renderState);
    bindCard(card, spec, chart, {
      /* ECharts' toolbox `restore` action crashes some series types
         (radar: "reading 'childAt'"); re-applying the option is the
         reliable way to return to the initial view. */
      onReset: chartRuntime ? chartRuntime.reset : null,
      noReset: cardSkipsChartReset(spec, card),
    });
  } catch (error) {
    return handleVisualizationMountFailure(error, spec, host, options, card, stage, renderState, isCancelled);
  }
  return card;
}
export function disposeVisualizations(host: ParentNode) {
  if (!host) return;
  host.querySelectorAll<VisualizationCard>('.visualization-card').forEach(function (card) { cleanupCard(card); });
}

/* Full dispose for one card React tracked from the mount return value.
 * Needed when the host itself was emptied by legacy DOM work before React's
 * effect cleanup ran: the card reference is the only handle left, and this is
 * the one place a React-owned card may be detached. */
export function disposeVisualization(card: VisualizationCard) {
  disposeCard(card);
}

/* Re-apply the current theme palette to every live ECharts instance and
 * re-run KaTeX so LaTeX labels stay themed. Called from a MutationObserver
 * hooked on `data-mode` / `data-theme` in the <html> element. */
function _refreshCharts() {
  const colors = palette();
  for (let i = 0; i < _liveCharts.length; i++) {
    const entry = _liveCharts[i];
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
      const chartOpts = optionForChart(entry.spec, colors);
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
    } catch (_) {
      reportSwallow(_, 'empty catch: render/visualization.ts:584', 'expected');
      /* ignore */
    }
  }
  /* Re-run KaTeX on every live card so LaTeX renders pick up any token
   * change tied to the theme. We re-discover the cards via the data
   * attribute each time to avoid keeping strong references ourselves. */
  if (typeof browserWindow.renderMathInElement === 'function') {
    document.querySelectorAll('.visualization-card').forEach(function (card) {
      renderCardMath(card);
    });
  }
}

function _ensureThemeWatcher() {
  if (_themeObserver || typeof MutationObserver === 'undefined') return;
  try {
    _themeObserver = new MutationObserver(function () { _refreshCharts(); });
    _themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode', 'data-theme'] });
  } catch (_) {
    reportSwallow(_, 'empty catch: render/visualization.ts:601', 'expected');
    /* ignore */
  }
}
