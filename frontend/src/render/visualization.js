/* Native visual cards. The model provides semantic data only; this module
 * owns Socrates styling, responsive layout, interaction, and export. */
import {
  mountSpecializedVisualization,
  usesSpecializedRenderer,
} from './visualizationAdapters.js';
import { whenFontsReady } from './helpers.js';
import { ensureEcharts } from '../vendor/lazy.js';

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

function colorFor(role, index, colors) {
  if (role && colors[role]) return colors[role];
  return [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline][index % 5];
}

// A small expression language avoids eval while covering the expected
// elementary functions. The parser returns a pure evaluator f(x).
export function parseFunctionExpression(source) {
  var input = String(source || '').replace(/\s+/g, '');
  var index = 0;
  var functions = {
    sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos,
    atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, exp: Math.exp,
    ln: Math.log, log: Math.log10 || function (x) { return Math.log(x) / Math.LN10; },
    sqrt: Math.sqrt, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  };
  function peek() { return input[index] || ''; }
  function consume(ch) { if (peek() === ch) { index += 1; return true; } return false; }
  function fail(message) { throw new Error(message + ' at character ' + (index + 1)); }
  function binary(left, right, operator) {
    if (operator === '+') return function (x) { return left(x) + right(x); };
    if (operator === '-') return function (x) { return left(x) - right(x); };
    if (operator === '*') return function (x) { return left(x) * right(x); };
    if (operator === '/') return function (x) { return left(x) / right(x); };
    return function (x) { return Math.pow(left(x), right(x)); };
  }
  function expression() {
    var left = term();
    while (peek() === '+' || peek() === '-') {
      var operator = input[index++], right = term();
      left = binary(left, right, operator);
    }
    return left;
  }
  function term() {
    var left = power();
    while (peek() === '*' || peek() === '/') {
      var operator = input[index++], right = power();
      left = binary(left, right, operator);
    }
    return left;
  }
  function power() {
    var left = unary();
    if (consume('^')) {
      var right = power();
      return binary(left, right, '^');
    }
    return left;
  }
  function unary() {
    if (consume('+')) return unary();
    if (consume('-')) { var value = unary(); return function (x) { return -value(x); }; }
    return atom();
  }
  function atom() {
    if (consume('(')) { var nested = expression(); if (!consume(')')) fail('Expected )'); return nested; }
    var number = input.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (number) { index += number[0].length; var numeric = Number(number[0]); return function () { return numeric; }; }
    var identifier = input.slice(index).match(/^[A-Za-z][A-Za-z0-9_]*/);
    if (!identifier) fail('Expected a number, x, constant, or function');
    var name = identifier[0].toLowerCase(); index += identifier[0].length;
    if (name === 'x') return function (x) { return x; };
    if (name === 'pi') return function () { return Math.PI; };
    if (name === 'e') return function () { return Math.E; };
    if (!functions[name]) fail('Unsupported function ' + name);
    if (!consume('(')) fail('Expected ( after ' + name);
    var argument = expression(); if (!consume(')')) fail('Expected ) after ' + name);
    return function (x) { return functions[name](argument(x)); };
  }
  var evaluator = expression();
  if (index !== input.length) fail('Unexpected token ' + peek());
  return evaluator;
}

function defaultDomain(expression) {
  var source = String(expression).toLowerCase();
  if (/\b(?:ln|log|sqrt)\s*\(/.test(source)) return [0, 10];
  if (/\btan\s*\(/.test(source)) return [-Math.PI, Math.PI];
  return [-10, 10];
}

function robustExtent(values) {
  var finite = values.filter(Number.isFinite).sort(function (a, b) { return a - b; });
  if (!finite.length) return [-1, 1];
  var low = finite[Math.floor((finite.length - 1) * 0.02)];
  var high = finite[Math.ceil((finite.length - 1) * 0.98)];
  if (!Number.isFinite(low) || !Number.isFinite(high)) return [-1, 1];
  if (low === high) { var unit = Math.abs(low) || 1; return [low - unit, high + unit]; }
  var pad = (high - low) * 0.12;
  return [low - pad, high + pad];
}

export function sampleFunction(expression, domain, count) {
  var evaluator = parseFunctionExpression(expression);
  var selectedDomain = Array.isArray(domain) ? domain : defaultDomain(expression);
  var start = selectedDomain[0], end = selectedDomain[1], samples = Math.max(120, Math.min(1600, count || 720));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) throw new Error('Function domain must have two increasing finite values');
  var points = [], values = [], previous = null;
  for (var i = 0; i < samples; i++) {
    var x = start + (end - start) * i / (samples - 1), y;
    try { y = evaluator(x); } catch (_) { y = NaN; }
    // Split on a non-finite evaluation or an implausible jump. The latter
    // prevents asymptotes (1/x, tan) from being connected by a fake stroke.
    if (!Number.isFinite(y) || (previous != null && Math.abs(y - previous) > 1800)) {
      points.push([x, null]); previous = null;
    } else {
      points.push([x, y]); values.push(y); previous = y;
    }
  }
  return { points: points, extent: robustExtent(values), domain: selectedDomain, evaluator: evaluator };
}

function normalizeFunction(spec) {
  var payload = spec.payload || {}, allValues = [], minX = Infinity, maxX = -Infinity;
  var rawFunctions = Array.isArray(payload.functions) ? payload.functions : [];
  var series = [];
  rawFunctions.forEach(function (fn) {
    if (!fn || typeof fn.expression !== 'string' || !fn.expression.trim()) return;
    var sample;
    try { sample = sampleFunction(fn.expression, fn.domain, 760); }
    catch (_) { return; }
    if (!sample || !Array.isArray(sample.points)) return;
    var finitePoints = sample.points.filter(function (point) { return point && Number.isFinite(point[1]); });
    if (!finitePoints.length) return;
    allValues = allValues.concat(finitePoints.map(function (point) { return point[1]; }));
    minX = Math.min(minX, sample.domain[0]); maxX = Math.max(maxX, sample.domain[1]);
    series.push({ name: fn.label || fn.expression, role: fn.role, data: sample.points, expression: fn.expression });
  });
  var yExtent = robustExtent(allValues);
  return { series: series, xExtent: [minX, maxX], yExtent: yExtent };
}

/* ECharts ignores CSS variables read at runtime, so we pass concrete HSL
 * strings. The chart is re-rendered when the user toggles the theme
 * (see _watchTheme). Keep the bundled Plus Jakarta Sans (with Inter
 * fallback) as the authoritative font family — system-ui is a fallback
 * only if the bundled faces are unavailable, never the default. */
/* P_viz-google-fonts — Chinese glyphs resolve to the bundled Noto Sans SC
   rather than an OS-dependent fallback. Keep Plus Jakarta Sans first
   for Latin/numerals, Inter as local fallback. */
var VIZ_FONT_FAMILY = "'Plus Jakarta Sans','Inter','Noto Sans SC','Helvetica Neue',Arial,system-ui,sans-serif";

function labelLength(value) {
  return Array.from(String(value == null ? '' : value)).length;
}

function truncateLabel(value, maxChars) {
  var chars = Array.from(String(value == null ? '' : value));
  if (chars.length <= maxChars) return chars.join('');
  return chars.slice(0, Math.max(1, maxChars - 1)).join('') + '…';
}

/* Axis labels need a deterministic text fallback in addition to ECharts'
 * hideOverlap flag—hideOverlap alone can erase most categories when a model
 * submits verbose prose as labels. Short sets wrap to two lines; dense sets
 * rotate and truncate so every remaining tick stays legible. */
export function formatCategoryLabel(value, options) {
  options = options || {};
  var maxChars = options.maxChars || 20;
  var lineChars = options.lineChars || 10;
  var maxLines = options.maxLines || 2;
  var compact = truncateLabel(value, maxChars);
  if (options.rotate || labelLength(compact) <= lineChars) return compact;
  var chars = Array.from(compact);
  var lines = [];
  for (var index = 0; index < chars.length && lines.length < maxLines; index += lineChars) {
    lines.push(chars.slice(index, index + lineChars).join(''));
  }
  return lines.join('\n');
}

export function categoryAxisLayout(categories) {
  categories = Array.isArray(categories) ? categories : [];
  var longest = categories.reduce(function (max, item) { return Math.max(max, labelLength(item)); }, 0);
  var dense = categories.length > 10;
  var rotate = dense ? 35 : (categories.length > 6 && longest > 18 ? 25 : 0);
  return {
    rotate: rotate,
    bottom: rotate ? 84 : (longest > 10 ? 68 : 46),
    maxChars: dense ? 16 : 24,
    lineChars: dense ? 16 : 12,
  };
}

function legendOptions(series, colors, fontFamily, placement) {
  if (!Array.isArray(series) || series.length <= 1) return undefined;
  return {
    type: series.length > 5 ? 'scroll' : 'plain',
    top: placement === 'bottom' ? undefined : 4,
    bottom: placement === 'bottom' ? 0 : undefined,
    left: 'center',
    width: '86%',
    pageTextStyle: { color: colors.muted, fontFamily: fontFamily },
    textStyle: { color: colors.text, fontFamily: fontFamily },
    formatter: function (name) { return truncateLabel(name, 24); },
  };
}

function optionForChart(spec, colors) {
  var payload = spec.payload, chartType = spec.template === 'area' ? 'line' : spec.template;
  var fontFamily = VIZ_FONT_FAMILY;
  var textStyle = { fontFamily: fontFamily };
  /* The ECharts tooltip has had two failure modes here:
   *  - In dark mode the default white background made the tooltip appear
   *     as a "white patch" hiding the default gray text.
   *  - The tooltip sometimes anchors outside the visible stage and
   *    `confine` is required to keep it on-screen.
   * Passing concrete themed `backgroundColor` / `borderColor` /
   * `textStyle.color` fixes both. `extraCssText` adds rounded corners
   * and shadow that the inline `style.cssText` setter wipes on update.
   * `_refreshCharts()` re-applies these options when the user toggles
   * day/night mode so the colours track the active theme. */
  var tooltipBase = {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    padding: [6, 9],
    confine: true,
    showDelay: 0,
    hideDelay: 80,
    textStyle: { color: colors.text, fontFamily: fontFamily },
    extraCssText: 'border-radius:7px!important;box-shadow:0 2px 8px rgba(0,0,0,.18)!important',
  };
  if (spec.template === 'function') {
    var normalized = normalizeFunction(spec);
    if (!normalized.series.length) return null;
    var hasLn = normalized.series.some(function (item) { return /\b(?:ln|log)\s*\(/i.test(item.expression || ''); });
    return {
      backgroundColor: 'transparent', textStyle: textStyle,
      color: normalized.series.map(function (item, index) { return colorFor(item.role, index, colors); }),
      aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
      tooltip: Object.assign({ trigger: 'axis', valueFormatter: function (value) { return Number(value).toPrecision(5); } }, tooltipBase),
      legend: legendOptions(normalized.series, colors, fontFamily),
      grid: { left: 56, right: 20, top: normalized.series.length > 1 ? 38 : 18, bottom: 50, containLabel: false },
      xAxis: { type: 'value', name: payload.xLabel || 'x', min: Math.min(0, normalized.xExtent[0]), max: normalized.xExtent[1], nameTextStyle: { color: colors.text, fontFamily: fontFamily }, axisLine: { lineStyle: { color: colors.line } }, axisLabel: { color: colors.text, fontFamily: fontFamily }, splitLine: { lineStyle: { color: colors.grid } } },
      yAxis: { type: 'value', name: payload.yLabel || 'y', min: normalized.yExtent[0], max: normalized.yExtent[1], nameTextStyle: { color: colors.text, fontFamily: fontFamily }, axisLine: { lineStyle: { color: colors.line } }, axisLabel: { color: colors.text, fontFamily: fontFamily }, splitLine: { lineStyle: { color: colors.grid } } },
      dataZoom: [{ type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true }],
      series: normalized.series.map(function (item, index) {
        var series = { type: 'line', name: item.name, data: item.data, showSymbol: false, connectNulls: false, smooth: false, lineStyle: { width: 2.35, color: colorFor(item.role, index, colors) }, emphasis: { focus: 'series' } };
        if (index === 0 && hasLn) {
          series.markPoint = { symbolSize: 8, data: [{ coord: [1, 0], name: '(1, 0)', label: { formatter: '(1, 0)', color: colors.text, fontFamily: fontFamily } }] };
          series.markLine = { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: colors.baseline }, data: [{ xAxis: 0 }] };
        }
        return series;
      }),
    };
  }
  var categories = payload.categories || [];
  var axisLayout = categoryAxisLayout(categories);
  if (chartType === 'pie') return {
    backgroundColor: 'transparent', textStyle: textStyle, color: [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline],
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item' }, tooltipBase),
    legend: {
      type: categories.length > 6 ? 'scroll' : 'plain', bottom: 0, width: '88%',
      textStyle: { color: colors.text, fontFamily: fontFamily },
      formatter: function (name) { return truncateLabel(name, 22); },
    },
    series: payload.series.map(function (series) { return {
      type: 'pie',
      radius: spec.template === 'pie' ? '58%' : ['38%', '62%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      data: series.data.map(function (value, index) { return typeof value === 'object' ? value : { name: String(categories[index] || index + 1), value: value }; }),
      label: {
        color: colors.text, fontFamily: fontFamily,
        formatter: function (params) { return truncateLabel(params.name, 18); },
      },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      emphasis: { scaleSize: 4 },
    }; }),
  };
  var typeMap = { line: 'line', area: 'line', bar: 'bar', scatter: 'scatter', histogram: 'bar', heatmap: 'heatmap', radar: 'radar', boxplot: 'boxplot' };
  var seriesType = typeMap[chartType] || 'line';
  return {
    backgroundColor: 'transparent', textStyle: textStyle,
    color: payload.series.map(function (item, index) { return colorFor(item.role, index, colors); }),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: chartType === 'scatter' ? 'item' : 'axis' }, tooltipBase),
    legend: legendOptions(payload.series, colors, fontFamily),
    grid: { left: 56, right: 22, top: payload.series.length > 1 ? 44 : 18, bottom: chartType === 'scatter' ? 50 : axisLayout.bottom, containLabel: false },
    xAxis: {
      type: chartType === 'scatter' ? 'value' : 'category',
      data: categories,
      name: payload.xLabel || '',
      nameGap: axisLayout.rotate ? 58 : 34,
      nameTextStyle: { color: colors.text, fontFamily: fontFamily },
      axisLabel: chartType === 'scatter' ? { color: colors.text, fontFamily: fontFamily } : {
        color: colors.text,
        fontFamily: fontFamily,
        interval: 0,
        rotate: axisLayout.rotate,
        hideOverlap: categories.length > 20,
        margin: 12,
        formatter: function (value) {
          return formatCategoryLabel(value, {
            rotate: axisLayout.rotate,
            maxChars: axisLayout.maxChars,
            lineChars: axisLayout.lineChars,
          });
        },
      },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { show: chartType === 'scatter', lineStyle: { color: colors.grid } },
    },
    yAxis: { type: 'value', name: payload.yLabel || '', nameTextStyle: { color: colors.text, fontFamily: fontFamily }, axisLabel: { color: colors.text, fontFamily: fontFamily }, axisLine: { lineStyle: { color: colors.line } }, splitLine: { lineStyle: { color: colors.grid } } },
    dataZoom: ['line', 'area', 'bar', 'scatter', 'histogram'].includes(chartType) ? [{ type: 'inside' }] : undefined,
    series: payload.series.map(function (series, index) { return { name: series.name || 'Series ' + (index + 1), type: seriesType, data: series.data, showSymbol: chartType === 'scatter', symbolSize: chartType === 'scatter' ? 8 : undefined, areaStyle: spec.template === 'area' ? { opacity: 0.16 } : undefined, smooth: chartType === 'line' || spec.template === 'area', emphasis: { focus: 'series' } }; }),
  };
}

function dataRows(spec) {
  var payload = spec.payload || {};
  if (spec.template === 'function') {
    var fns = payload.functions || [];
    if (!fns.length) return [];
    return [[vizT('viz.table.function', 'Function'), vizT('viz.table.expression', 'Expression'), vizT('viz.table.domain', 'Domain')]]
      .concat(fns.map(function (fn) { return [fn.label || fn.expression, fn.expression, fn.domain ? fn.domain.join(' to ') : vizT('viz.table.autoDomain', 'Automatic domain')]; }));
  }
  if (!payload.series) {
    var items = payload.items || payload.nodes || [];
    if (!items.length) return [];
    return [[vizT('viz.table.item', 'Item'), vizT('viz.table.value', 'Value'), vizT('viz.table.detail', 'Detail')]]
      .concat(items.map(function (item) { return [item.label, item.value != null ? item.value : '', item.detail || '']; }));
  }
  var rows = [['Category'].concat(payload.series.map(function (series) { return series.name || 'Series'; }))];
  var max = Math.max.apply(null, payload.series.map(function (series) { return series.data.length; }));
  for (var index = 0; index < max; index++) rows.push([payload.categories && payload.categories[index] != null ? payload.categories[index] : index + 1].concat(payload.series.map(function (series) { var value = series.data[index]; return Array.isArray(value) ? value.join(', ') : (value && typeof value === 'object' ? JSON.stringify(value) : value); })));
  return rows;
}

function renderTable(spec) {
  var rows = dataRows(spec);
  if (!rows.length) return '';
  var header = rows[0], body = rows.slice(1, 121);
  return '<div class="visualization-table-wrap" tabindex="0"><table class="visualization-table"><thead><tr>' + header.map(function (cell) { return '<th>' + esc(cell) + '</th>'; }).join('') + '</tr></thead><tbody>' + body.map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + esc(cell) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}

function renderStructure(spec) {
  var payload = spec.payload || {}, nodes = payload.nodes || payload.items || [], edges = payload.edges || [];
  var width = 760, height = Math.max(260, 130 + Math.ceil(nodes.length / 3) * 95);
  var positions = {};
  nodes.forEach(function (node, index) { positions[node.id || String(index)] = { x: 110 + (index % 3) * 270, y: 70 + Math.floor(index / 3) * 100 }; });
  /* P_viz-per-instance-marker — every rendered structure diagram
     used to define `<marker id="visual-arrow">` at the SVG root.
     When two diagrams render in the same DOM, the second's
     `marker-end="url(#visual-arrow)"` resolves to the FIRST
     diagram's marker (collision on the global id). Give each
     diagram a per-instance marker id, derived from a monotonically
     increasing counter so re-renders don't collide either. */
  var markerId = 'visual-arrow-' + (++visualCounter);
  var svg = '<svg class="visualization-diagram" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(spec.accessibilitySummary) + '" style="font-family:' + VIZ_FONT_FAMILY + '"><defs><marker id="' + markerId + '" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs>';
  edges.forEach(function (edge) { var a = positions[edge.from], b = positions[edge.to]; if (!a || !b) return; svg += '<path class="visualization-edge" d="M' + (a.x + 75) + ' ' + a.y + ' C' + (a.x + 130) + ' ' + a.y + ', ' + (b.x - 130) + ' ' + b.y + ', ' + (b.x - 75) + ' ' + b.y + '" marker-end="url(#' + markerId + ')"/><text class="visualization-edge-label" x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 8) + '">' + esc(edge.label || '') + '</text>'; });
  nodes.forEach(function (node, index) { var point = positions[node.id || String(index)]; svg += '<g class="visualization-node"><title>' + esc([node.label, node.detail].filter(Boolean).join(' — ')) + '</title><rect x="' + (point.x - 78) + '" y="' + (point.y - 28) + '" width="156" height="56" rx="10"/><text x="' + point.x + '" y="' + (point.y - 3) + '">' + esc(truncateLabel(node.label, 22)) + '</text>' + (node.detail ? '<text class="visualization-node-detail" x="' + point.x + '" y="' + (point.y + 15) + '">' + esc(truncateLabel(node.detail, 28)) + '</text>' : '') + '</g>'; });
  return svg + '</svg>';
}

/* P_extension-safety — block only the actually-dangerous patterns:
   - <script>, <iframe>, <object>, <embed>, <form> tags;
   - inline event handlers (onclick, onerror, …);
   - outbound scripts/fetch/websocket;
   - dangerous URL schemes on attributes (javascript:, vbscript:,
     data:text/html). We previously also rejected any href/src
     starting with `https:`, which broke legitimate CDN images and
     external CSS imports inside svg_illustration templates. */
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

/* P_interactive-sim-scripts — `interactive_simulation` would be a
   contradiction if it rejected <script>: an "interactive" template
   that can never run code fails validation on every genuinely
   interactive submission, then burns the retry budget. Inline
   scripts + event handlers are therefore allowed for that template
   — the iframe runs opaque-origin (sandbox="allow-scripts" only),
   CSP connect-src 'none', no popups, so a script cannot reach the
   parent, the network, or cookies. Same containment the fenced
   ```viz blocks already rely on. `svg_illustration` stays
   script-free: it is static art and gains nothing from executing. */
function extensionIsSafe(source, allowScripts) {
  var src = String(source || '');
  var tagBan = allowScripts
    ? /<(?:iframe|object|embed|form)\b/i
    : /<(?:script|iframe|object|embed|form)\b/i;
  if (tagBan.test(src)) return false;
  if (!allowScripts && /\son\w+\s*=/i.test(src)) return false;
  if (/\b(?:fetch|xmlhttprequest|websocket|sendbeacon|eventsource)\b/i.test(src)) return false;
  var attrRe = /\b(?:src|href|action|formaction|xlink:href)\s*=\s*["']?\s*([^\s"'>]+)/gi;
  var match;
  while ((match = attrRe.exec(src)) !== null) {
    var value = String(match[1] || '').trim();
    if (/^(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\/html)/i.test(value)) return false;
  }
  return true;
}

function renderExtension(spec, cardId) {
  var source = spec.payload.source;
  var allowScripts = spec.template === 'interactive_simulation';
  if (!extensionIsSafe(source, allowScripts)) return '<div class="visualization-fallback">此扩展内容未通过本地安全检查。标题和数据摘要仍可用。</div>';
  var nonce = 'viz-' + cardId + '-' + Math.random().toString(36).slice(2);
  var csp = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src https: data:; form-action 'none'; base-uri 'none'";
  /* P_perf-self-host — sandboxed extension iframes use the platform font
     stack instead of blocking on fonts.googleapis.com. */
  var fontPreload =
    '<style>body{font-family:"Noto Sans SC","PingFang SC","Hiragino Sans GB",system-ui,sans-serif;margin:0;padding:0}</style>';
  /* P_ext-viz-error — an interactive_simulation script throwing inside
     the sandbox used to be invisible: the iframe stayed silent and the
     card looked permanently empty. Report error/unhandledrejection to
     the parent (nonce-tagged, same handshake as socrates-viz-ready) so
     the card can surface a diagnostic and a repair affordance. */
  var headScript = '<script>(function(){' +
    'function post(m){try{window.parent.postMessage(m,"*")}catch(e){}}' +
    'window.addEventListener("error",function(e){post({type:"socrates-viz-error",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + ',message:String((e&&e.message)||"runtime error").slice(0,300)})});' +
    'window.addEventListener("unhandledrejection",function(e){post({type:"socrates-viz-error",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + ',message:String((e&&e.reason&&(e.reason.message||e.reason))||"unhandled rejection").slice(0,300)})});' +
    'post({type:"socrates-viz-ready",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + '})' +
    '})()<\/script>';
  var documentSource = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + csp + '">' + fontPreload + headScript + source;
  return '<iframe class="visualization-extension" sandbox="allow-scripts" title="' + esc(spec.title) + '" data-card-id="' + esc(cardId) + '" data-nonce="' + esc(nonce) + '" srcdoc="' + esc(documentSource) + '"></iframe>';
}

/* P_viz-fix-loop — model-facing repair request for a client-side
   render failure. Rides the existing `tool-retry` CustomEvent
   (detail.prompt → verbatim next-turn message). The model already has
   the full spec in context from its own tool call, so the prompt only
   carries template/title + the error. */
function extensionRepairPrompt(spec, errMsg) {
  var msg = 'The render_visualization card "' + String((spec && spec.title) || '').slice(0, 80)
    + '" (template: ' + (spec && spec.template) + ') failed to render in the client: '
    + String(errMsg || 'render error').slice(0, 300)
    + '. Call render_visualization once more with a corrected spec — fix the payload, or switch to a simpler built-in template (chart/graph templates are more reliable than extension templates).';
  /* GeoGebra is the only renderer loaded from a third-party CDN. When
     the CDN itself is unreachable, retrying the same template cannot
     help — tell the model to express the construction with a
     self-hosted template instead. */
  if (/geogebra|deployggb/i.test(String(errMsg || ''))) {
    msg += ' GeoGebra\'s CDN is unreachable from this client, so math_construction cannot work right now — rebuild the figure with the `geometry` or `function` template instead.';
  }
  return msg;
}

function dispatchExtensionRepair(card, spec, errMsg) {
  if (!card || typeof card.dispatchEvent !== 'function') return;
  card.dispatchEvent(new CustomEvent('tool-retry', {
    bubbles: true,
    detail: { tool: 'render_visualization', prompt: extensionRepairPrompt(spec, errMsg) },
  }));
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
  var existing = host.querySelector('[data-visualization-id="' + cardId + '"]');
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
  card.innerHTML = '<header class="visualization-header"><div><h3>' + esc(spec.title) + '</h3>' + (spec.caption ? '<p class="visualization-caption">' + esc(spec.caption) + '</p>' : '') + '</div><div class="visualization-actions"><button type="button" data-viz-action="table" aria-expanded="false" aria-label="' + esc(actionTable) + '" title="' + esc(actionTable) + '">' + esc(actionTable) + '</button><button type="button" data-viz-action="reset" aria-label="' + esc(actionReset) + '" title="' + esc(actionReset) + '">' + esc(actionReset) + '</button><button type="button" data-viz-action="download" aria-label="' + esc(actionDownload) + '" title="' + esc(actionDownload) + '">' + esc(actionDownload) + '</button><button type="button" data-viz-action="fullscreen" aria-label="' + esc(actionFullscreen) + '" title="' + esc(actionFullscreen) + '">' + esc(actionFullscreen) + '</button></div></header><div class="visualization-summary sr-only">' + esc(spec.accessibilitySummary) + '</div><div class="visualization-stage"></div><div class="visualization-data" hidden>' + renderTable(spec) + '</div>';
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
      stage.innerHTML = renderExtension(spec, cardId);
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
      stage.innerHTML = renderStructure(spec);
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
