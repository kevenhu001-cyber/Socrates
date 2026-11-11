import { renderInlineMathHtml } from './inlineMath.ts';
import { ensureKatex } from '../vendor/lazy.ts';
import { installVisualizationMath } from './visualizationMath.ts';
import type { VisualizationCard, VisualizationMountOptions, LiveChart, VisualizationRenderState } from './visualizationRuntime.ts';
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
import { CHART_TEMPLATES, EXTENSION_TEMPLATES, chartPrefersCanvas, visualizationRendererKind } from './visualizationRendererKind.ts';
import { normalizeVisualizationSpec } from '@socrates/core/visualizationNormalize';
import { renderSemanticVisualization, renderStructureVisualization, renderVisualizationTable, semanticLayoutWidth, SEMANTIC_LAYOUT_WIDTH } from './visualizationStatic.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { createElement, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { mountOwnedRoot } from '../react/lib/boot/ownedRoot';
import { VisualizationFallbackActions } from '../react/visualization/VisualizationActions.tsx';
import { Button } from '../react/ui/shadcn/button';
import { t } from '../i18n.ts';

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
  card._visualizationMathCleanup?.();
  card._visualizationMathCleanup = null;
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


function mountFallbackActions(card: VisualizationCard, host: HTMLElement, spec: VizSpec, options: VisualizationMountOptions, error: unknown) {
  const table = card.querySelector<HTMLElement>('.visualization-data');
  const tableAvailable = !!(table && table.querySelector('table'));
  const content = createElement(VisualizationFallbackActions, {
    retryLabel: vizT('viz.action.retryRender', 'Retry'),
    fixLabel: vizT('viz.action.fixWithAi', 'Fix with AI'),
    tableLabel: vizT('viz.action.viewTable', 'View as table'),
    hideTableLabel: vizT('viz.action.hideTable', 'Hide table'),
    tableAvailable: tableAvailable,
    tableInitiallyOpen: tableAvailable && !!table && !table.hidden,
    onToggleTable: function (open: boolean) { if (table) table.hidden = !open; },
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
    const value = t(key);
    if (typeof value === 'string' && value && value !== key) return value;
  } catch (error) { reportSwallow(error, 'visualization.translate'); }
  return fallback || key;
}


function createVisualizationCard(spec: VizSpec, host: HTMLElement, cardId: string, mounting: Map<string, VisualizationCard>): VisualizationCard {
  const card: VisualizationCard = document.createElement('section');
  card.className = 'visualization-card';
  card.dataset.visualizationId = cardId;
  card.setAttribute('aria-label', spec.title + '. ' + spec.accessibilitySummary);
  mounting.set(cardId, card);
  card.innerHTML = '<header class="visualization-header"><div><h3>' + esc(spec.title) + '</h3></div></header><div class="visualization-summary sr-only">' + esc(spec.accessibilitySummary) + '</div><figure class="visualization-figure"><div class="visualization-stage"><p class="visualization-stage-progress" role="status">' + esc(vizT('viz.state.loadingRenderer', 'Loading the chart renderer…')) + '</p></div>' + (spec.caption ? '<figcaption class="visualization-caption">' + esc(spec.caption) + '</figcaption>' : '') + '</figure><div class="visualization-data" hidden></div>';
  host.appendChild(card);
  mounting.delete(cardId);

  return card;
}

/* Specialized templates only: every one of them is drawn by one of these
   engines, and the stage CSS sizes itself by this name. */
function rendererName(template: string) {
  const kind = visualizationRendererKind(template);
  return kind === 'echarts' || kind === 'semantic' || kind === 'extension' ? 'mermaid' : kind;
}

async function mountSpecializedRenderer(spec: VizSpec, card: VisualizationCard, stage: HTMLElement, renderState: VisualizationRenderState, isCancelled: () => boolean) {
  await whenFontsReady('Noto Sans SC');
  clearStageProgress(stage);
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

type FallbackReason = 'dataMissing' | 'render' | 'library';

const FALLBACK_REASON_TEXT: Record<FallbackReason, [string, string]> = {
  dataMissing: ['viz.reason.dataMissing', 'The chart has no data to draw.'],
  render: ['viz.reason.render', 'The chart renderer hit an error.'],
  library: ['viz.reason.library', 'The chart library failed to load.'],
};

function fallbackReasonOf(error: unknown): FallbackReason {
  const message = String((error as Error | null)?.message || '');
  if (/load|script|chunk|network/i.test(message)) return 'library';
  if (/no chart option|no data|empty/i.test(message)) return 'dataMissing';
  return 'render';
}

/* One failure surface for every renderer. When the data table exists the
   card switches to it automatically (the numbers are still readable) and
   says why; otherwise it states the reason. Never the old fixed
   "视觉内容暂未渲染" with the accessibility summary in place of a reason. */
function renderVisualizationFailure(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement, error: unknown) {
  const table = card.querySelector<HTMLElement>('.visualization-data');
  const hasTable = !!(table && table.querySelector('table'));
  const reason = FALLBACK_REASON_TEXT[fallbackReasonOf(error)];
  const reasonText = vizT('viz.state.reasonLabel', 'Reason: ') + vizT(reason[0], reason[1]);
  card.dataset.visualizationState = hasTable ? 'fallback-table' : 'failed';
  if (hasTable && table) {
    table.hidden = false;
    stage.classList.add('visualization-stage-collapsed');
    stage.innerHTML = '<div class="visualization-fallback visualization-fallback-inline" role="status"><p><strong>' + esc(vizT('viz.state.fellBack', 'The chart could not be displayed, so the data is shown as a table.')) + '</strong> ' + esc(reasonText) + '</p><div data-viz-fallback-root></div></div>';
  } else {
    stage.innerHTML = '<div class="visualization-fallback" role="status"><strong>' + esc(vizT('viz.state.failedTitle', 'The chart could not be drawn')) + '</strong><p>' + esc(reasonText) + '</p><div data-viz-fallback-root></div></div>';
  }
  mountFallbackActions(card, host, spec, options, error);
}

function renderChartFallback(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement) {
  const error = new Error('renderer returned no chart option');
  renderVisualizationFailure(spec, host, options, card, stage, error);
  reportSwallow(error, 'visualization/' + spec.template + '/empty_options', 'recoverable');
}

/* A chart option with no series or no data points draws an empty axis with
   no error at all (the audit's F1). Treat it as a failure instead. */
function chartOptionIsEmpty(spec: VizSpec, chartOptions: Record<string, unknown>) {
  if (spec.template === 'function') return false;
  const series = Array.isArray(chartOptions.series) ? chartOptions.series as Array<{ data?: unknown }> : [];
  if (!series.length) return true;
  return series.every(function (entry) {
    const data = entry && entry.data;
    if (!Array.isArray(data) || !data.length) return true;
    return data.every(function (point) {
      if (point === null || point === undefined || point === '-') return true;
      if (typeof point === 'object' && !Array.isArray(point)) {
        const value = (point as { value?: unknown }).value;
        return value === null || value === undefined || (Array.isArray(value) && value.every(function (cell) { return cell === null || cell === undefined; }));
      }
      return false;
    });
  });
}

function clearStageProgress(stage: HTMLElement) {
  stage.querySelectorAll('.visualization-stage-progress').forEach(function (node) { node.remove(); });
}

async function mountChartRenderer(spec: VizSpec, host: HTMLElement, options: VisualizationMountOptions, card: VisualizationCard, stage: HTMLElement, renderState: VisualizationRenderState, isCancelled: () => boolean) {
  await whenFontsReady('Noto Sans SC');
  const echarts = await loadEcharts();
  if (isCancelled()) { disposeCard(card); return true; }
  /* SVG keeps the chart sharp at any zoom and pixel ratio; canvas only for
     data large enough that SVG nodes would cost more than they give. */
  const useCanvas = chartPrefersCanvas(spec.template, spec.payload as Record<string, unknown>);
  clearStageProgress(stage);
  const chartOptions = optionForChart(spec, palette());
  if (!chartOptions || chartOptionIsEmpty(spec, chartOptions as Record<string, unknown>)) {
    renderChartFallback(spec, host, options, card, stage);
    return false;
  }
  const chart = echarts.init(stage, null, { renderer: useCanvas ? 'canvas' : 'svg' });
  renderState.chart = chart;
  card.dataset.visualizationRenderer = 'echarts';
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
  const receiveExtensionMsg = function (event: MessageEvent<{ cardId?: string; nonce?: string; type?: string; message?: string; id?: number; source?: string }>) {
    const data = event.data || {};
    if (event.source !== frame.contentWindow || data.cardId !== cardId || data.nonce !== frame.dataset.nonce) return;
    if (data.type === 'socrates-viz-math') {
      if (!Number.isSafeInteger(data.id) || typeof data.source !== 'string' || data.source.length > 8000) return;
      void ensureKatex().then(() => {
        if (!frame.isConnected) return;
        frame.contentWindow?.postMessage({ type: 'socrates-viz-math-result', cardId, nonce: frame.dataset.nonce, id: data.id, html: renderInlineMathHtml(data.source!, 'mathml') }, '*');
      }).catch(error => reportSwallow(error, 'visualization.extensionMath'));
      return;
    }
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
  window.addEventListener('message', receiveExtensionMsg);
  frame.addEventListener('error', function () {
    reportSwallow(new Error('sandboxed visualization iframe failed to load'), 'visualization/' + spec.template + '/iframe_load_error', 'recoverable');
  });
  card!._visualizationCleanup = function () { window.removeEventListener('message', receiveExtensionMsg); };
}

function mountSemanticRenderer(spec: VizSpec, stage: HTMLElement) {
  /* Lay the diagram out at the stage's width on a phone, so labels keep
     their size instead of a 760-wide drawing being scaled down. */
  const layoutWidth = semanticLayoutWidth(stage.clientWidth);
  const semanticSvg = renderSemanticVisualization(spec, 'visual-arrow-' + (++visualCounter), esc, VIZ_FONT_FAMILY, truncateLabel, layoutWidth);
  /* A narrow layout is drawn 1:1, so the stage takes the drawing's height
     instead of the fixed chart height that would shrink a tall one again. */
  if (layoutWidth < SEMANTIC_LAYOUT_WIDTH && ['timeline', 'process', 'number_line'].includes(spec.template)) stage.dataset.semanticLayout = 'narrow';
  else delete stage.dataset.semanticLayout;
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

/** Update the text, table and optional caption after the chart accepts data. */
function updateChartCardMetadata(card: VisualizationCard, next: VizSpec): void {
  card.querySelector('.visualization-header h3')!.textContent = next.title || '';
  card.querySelector('.visualization-summary')!.textContent = next.accessibilitySummary || '';
  card.setAttribute('aria-label', (next.title || '') + '. ' + (next.accessibilitySummary || ''));
  try {
    card.querySelector('.visualization-data')!.innerHTML = renderVisualizationTable(next, esc, vizT);
  } catch (error) {
    reportSwallow(error, 'visualization/' + next.template + '/table_failure', 'recoverable');
  }
  let caption = card.querySelector<HTMLElement>('.visualization-caption');
  if (!caption && next.caption) {
    caption = document.createElement('figcaption');
    caption.className = 'visualization-caption';
    card.querySelector('.visualization-figure')!.appendChild(caption);
  }
  if (caption) caption.textContent = next.caption || '';
}

function createChartRuntime(card: VisualizationCard, chart: ChartInstance, initialSpec: VizSpec, liveEntry: LiveChart | null) {
  let currentSpec = initialSpec;
  function update(rawNext: VizSpec) {
    const next = asVisualizationSpec(normalizeVisualizationSpec(rawNext).spec);
    if (!next || card._visualizationDisposed || chart.isDisposed() || next.template !== currentSpec.template) return false;
    const nextOptions = optionForChart(next, palette());
    if (!nextOptions) return false;
    chart.setOption(nextOptions, { replaceMerge: ['series'] });
    currentSpec = next;
    if (liveEntry) liveEntry.spec = next;
    updateChartCardMetadata(card, next);
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
  renderVisualizationFailure(spec, host, options, card, stage, error);
  return card;
}

export async function mountVisualization(rawSpec: unknown, host: HTMLElement | null | undefined, options: VisualizationMountOptions = {}) {
  /* Every entry point (tool result, OpenUI component, restored history,
     share view) draws the same canonical data the server validated. */
  const normalizedSpec = normalizeVisualizationSpec(rawSpec).spec;
  if (invalidVisualizationInput(normalizedSpec, host) || !host) return null;
  const spec = asVisualizationSpec(normalizedSpec);
  if (!spec) return null;
  options = options || {};
  _ensureThemeWatcher();
  const cardId = options.toolCallId || ('visual-' + (++visualCounter));
  const isCancelled = function () { return !!(options.signal && options.signal.aborted); };
  const mounted = findExistingCard(host, cardId);
  if (mounted.card) return mounted.card;
  const card = createVisualizationCard(spec, host, cardId, mounted.mounting!);
  card._visualizationMathCleanup = installVisualizationMath(card);
  const stage = card.querySelector<HTMLElement>('.visualization-stage')!;
  const renderState: VisualizationRenderState = { chart: null, liveEntry: null };
  /* The table and the chart fail independently: a table error used to throw
     before the chart was even tried, taking a drawable chart down with it. */
  try {
    card.querySelector('.visualization-data')!.innerHTML = renderVisualizationTable(spec, esc, vizT);
  } catch (error) {
    reportSwallow(error, 'visualization/' + spec.template + '/table_failure', 'recoverable');
    card.querySelector('.visualization-data')!.innerHTML = '';
  }
  try {
    const cancelled = await mountTemplateRenderer(spec, host, options, card, stage, cardId, renderState, isCancelled);
    if (stopCancelledMount(cancelled, card, isCancelled)) return null;
    clearStageProgress(stage);
    chartRuntimeForCard(spec, card, renderState);
  } catch (error) {
    clearStageProgress(stage);
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
