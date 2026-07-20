/* Native visual cards. The model provides semantic data only; this module
 * owns Socrates styling, responsive layout, interaction, and export. */

var echartsPromise = null;
var visualCounter = 0;
/* Track every live ECharts instance so we can re-apply the theme palette
 * when the user toggles day/night mode. The observer is installed lazily
 * on the first mount so this module stays side-effect-free when unused. */
var _liveCharts = [];
var _themeObserver = null;

async function loadEcharts() {
  if (!echartsPromise) {
    echartsPromise = Promise.all([
      import('echarts/core'), import('echarts/charts'), import('echarts/components'), import('echarts/renderers'),
    ]).then(function (modules) {
      var core = modules[0], charts = modules[1], components = modules[2], renderers = modules[3];
      core.use([
        charts.LineChart, charts.BarChart, charts.ScatterChart, charts.PieChart, charts.HeatmapChart,
        charts.RadarChart, charts.BoxplotChart,
        components.GridComponent, components.TooltipComponent, components.LegendComponent,
        components.TitleComponent, components.DatasetComponent, components.TransformComponent,
        components.AriaComponent, components.DataZoomComponent, components.VisualMapComponent,
        components.ToolboxComponent, renderers.SVGRenderer, renderers.CanvasRenderer,
      ].filter(Boolean));
      return core;
    });
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
  rawFunctions.forEach(function (fn, index) {
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
 * (see _watchTheme). Keep `Inter` (loaded from Google Fonts) as the
 * authoritative font family — system-ui is a fallback only if Inter is
 * unavailable, never the default. */
var VIZ_FONT_FAMILY = "'Inter', 'Helvetica Neue', Arial, system-ui, sans-serif";
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
      legend: normalized.series.length > 1 ? { top: 4, textStyle: { color: colors.text, fontFamily: fontFamily } } : undefined,
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
  if (chartType === 'pie') return {
    backgroundColor: 'transparent', textStyle: textStyle, color: [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline],
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item' }, tooltipBase),
    legend: { bottom: 0, textStyle: { color: colors.text, fontFamily: fontFamily } },
    series: payload.series.map(function (series) { return { type: 'pie', radius: spec.template === 'pie' ? '62%' : ['38%', '66%'], data: series.data.map(function (value, index) { return typeof value === 'object' ? value : { name: String(categories[index] || index + 1), value: value }; }), label: { color: colors.text, fontFamily: fontFamily } }; }),
  };
  var typeMap = { line: 'line', area: 'line', bar: 'bar', scatter: 'scatter', histogram: 'bar', heatmap: 'heatmap', radar: 'radar', boxplot: 'boxplot' };
  var seriesType = typeMap[chartType] || 'line';
  return {
    backgroundColor: 'transparent', textStyle: textStyle,
    color: payload.series.map(function (item, index) { return colorFor(item.role, index, colors); }),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: chartType === 'scatter' ? 'item' : 'axis' }, tooltipBase),
    legend: payload.series.length > 1 ? { top: 4, textStyle: { color: colors.text, fontFamily: fontFamily } } : undefined,
    grid: { left: 56, right: 22, top: payload.series.length > 1 ? 38 : 18, bottom: 46 },
    xAxis: { type: chartType === 'scatter' ? 'value' : 'category', data: categories, name: payload.xLabel || '', nameTextStyle: { color: colors.text, fontFamily: fontFamily }, axisLabel: { color: colors.text, fontFamily: fontFamily }, axisLine: { lineStyle: { color: colors.line } }, splitLine: { show: chartType === 'scatter', lineStyle: { color: colors.grid } } },
    yAxis: { type: 'value', name: payload.yLabel || '', nameTextStyle: { color: colors.text, fontFamily: fontFamily }, axisLabel: { color: colors.text, fontFamily: fontFamily }, axisLine: { lineStyle: { color: colors.line } }, splitLine: { lineStyle: { color: colors.grid } } },
    dataZoom: ['line', 'area', 'bar', 'scatter', 'histogram'].includes(chartType) ? [{ type: 'inside' }] : undefined,
    series: payload.series.map(function (series, index) { return { name: series.name || 'Series ' + (index + 1), type: seriesType, data: series.data, showSymbol: chartType === 'scatter', symbolSize: chartType === 'scatter' ? 8 : undefined, areaStyle: spec.template === 'area' ? { opacity: 0.16 } : undefined, smooth: chartType === 'line' || spec.template === 'area', emphasis: { focus: 'series' } }; }),
  };
}

function dataRows(spec) {
  var payload = spec.payload || {};
  if (spec.template === 'function') return (payload.functions || []).map(function (fn) { return [fn.label || fn.expression, fn.expression, fn.domain ? fn.domain.join(' to ') : 'Automatic domain']; });
  if (!payload.series) return (payload.items || []).map(function (item) { return [item.label, item.value || '', item.detail || '']; });
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
  var svg = '<svg class="visualization-diagram" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + esc(spec.accessibilitySummary) + '" style="font-family:' + VIZ_FONT_FAMILY + '"><defs><marker id="visual-arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs>';
  edges.forEach(function (edge) { var a = positions[edge.from], b = positions[edge.to]; if (!a || !b) return; svg += '<path class="visualization-edge" d="M' + (a.x + 75) + ' ' + a.y + ' C' + (a.x + 130) + ' ' + a.y + ', ' + (b.x - 130) + ' ' + b.y + ', ' + (b.x - 75) + ' ' + b.y + '" marker-end="url(#visual-arrow)"/><text class="visualization-edge-label" x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 8) + '">' + esc(edge.label || '') + '</text>'; });
  nodes.forEach(function (node, index) { var point = positions[node.id || String(index)]; svg += '<g class="visualization-node"><rect x="' + (point.x - 78) + '" y="' + (point.y - 28) + '" width="156" height="56" rx="10"/><text x="' + point.x + '" y="' + (point.y - 3) + '">' + esc(node.label) + '</text>' + (node.detail ? '<text class="visualization-node-detail" x="' + point.x + '" y="' + (point.y + 15) + '">' + esc(node.detail) + '</text>' : '') + '</g>'; });
  return svg + '</svg>';
}

function extensionIsSafe(source) {
  return !/<(?:script|iframe|object|embed|form)\b|\son\w+\s*=|\b(?:fetch|xmlhttprequest|websocket)\b|(?:src|href)\s*=\s*["']?https?:/i.test(source || '');
}

function renderExtension(spec, cardId) {
  var source = spec.payload.source;
  if (!extensionIsSafe(source)) return '<div class="visualization-fallback">此扩展内容未通过本地安全检查。标题和数据摘要仍可用。</div>';
  var nonce = 'viz-' + cardId + '-' + Math.random().toString(36).slice(2);
  var csp = "default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; font-src 'none'; form-action 'none'; base-uri 'none'";
  var documentSource = '<!doctype html><meta http-equiv="Content-Security-Policy" content="' + csp + '"><script>window.parent.postMessage({type:"socrates-viz-ready",cardId:' + JSON.stringify(cardId) + ',nonce:' + JSON.stringify(nonce) + '},"*")<\\/script>' + source;
  return '<iframe class="visualization-extension" sandbox="allow-scripts" title="' + esc(spec.title) + '" data-card-id="' + esc(cardId) + '" data-nonce="' + esc(nonce) + '" srcdoc="' + esc(documentSource) + '"></iframe>';
}

function downloadDataUrl(name, dataUrl) {
  var link = document.createElement('a'); link.href = dataUrl; link.download = name; document.body.appendChild(link); link.click(); link.remove();
}

function bindCard(card, spec, chart) {
  var table = card.querySelector('.visualization-data');
  card.querySelector('[data-viz-action="table"]').addEventListener('click', function () { table.hidden = !table.hidden; this.setAttribute('aria-expanded', String(!table.hidden)); });
  card.querySelector('[data-viz-action="fullscreen"]').addEventListener('click', function () { if (card.requestFullscreen) card.requestFullscreen().catch(function () {}); });
  var reset = card.querySelector('[data-viz-action="reset"]');
  if (reset) reset.addEventListener('click', function () { if (chart) chart.dispatchAction({ type: 'restore' }); });
  var download = card.querySelector('[data-viz-action="download"]');
  download.addEventListener('click', function () {
    if (chart) downloadDataUrl((spec.title || 'visualization').replace(/[^\w-]+/g, '-') + '.png', chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: token('--bg-100', '#fff') }));
  });
}

export async function mountVisualization(spec, host, options) {
  if (!spec || spec.version !== 1 || !host) return null;
  options = options || {};
  _ensureThemeWatcher();
  var cardId = options.toolCallId || ('visual-' + (++visualCounter));
  if (host.querySelector('[data-visualization-id="' + cardId + '"]')) return host.querySelector('[data-visualization-id="' + cardId + '"]');
  var card = document.createElement('section');
  card.className = 'visualization-card'; card.dataset.visualizationId = cardId;
  card.setAttribute('aria-label', spec.title + '. ' + spec.accessibilitySummary);
  var chartTemplates = ['function', 'line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot'];
  var extension = ['svg_illustration', 'interactive_simulation'].includes(spec.template);
  card.innerHTML = '<header class="visualization-header"><div><h3>' + esc(spec.title) + '</h3>' + (spec.caption ? '<p class="visualization-caption">' + esc(spec.caption) + '</p>' : '') + '</div><div class="visualization-actions"><button type="button" data-viz-action="table" aria-expanded="false" title="显示数据表">数据</button><button type="button" data-viz-action="reset" title="重置视图">重置</button><button type="button" data-viz-action="download" title="下载 PNG">下载</button><button type="button" data-viz-action="fullscreen" title="全屏">全屏</button></div></header><div class="visualization-summary sr-only">' + esc(spec.accessibilitySummary) + '</div><div class="visualization-stage"></div><div class="visualization-data" hidden>' + renderTable(spec) + '</div>';
  host.appendChild(card);
  try { if (typeof renderMathInElement === 'function') renderMathInElement(card, { delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }] }); } catch (_) {}
  var stage = card.querySelector('.visualization-stage'), chart = null, liveEntry = null;
  try {
    if (chartTemplates.includes(spec.template)) {
      var echarts = await loadEcharts();
      var useCanvas = spec.template === 'heatmap' || (spec.payload.series || []).some(function (series) { return series.data && series.data.length > 1200; });
      chart = echarts.init(stage, null, { renderer: useCanvas ? 'canvas' : 'svg' });
      var chartOpts = optionForChart(spec, palette());
      if (!chartOpts) {
        chart.dispose();
        stage.innerHTML = '<div class="visualization-fallback"><strong>视觉内容暂未渲染</strong><p>' + esc(spec.accessibilitySummary) + '</p><button type="button">本地重试</button></div>';
        stage.querySelector('button').addEventListener('click', function () { card.remove(); mountVisualization(spec, host, options); });
        chart = null;
      } else {
        chart.setOption(chartOpts, { notMerge: true });
        liveEntry = { chart: chart, spec: spec };
        _liveCharts.push(liveEntry);
        var resize = new ResizeObserver(function () { chart.resize(); }); resize.observe(stage);
        card._visualizationCleanup = function () {
          resize.disconnect();
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
      var receiveExtensionReady = function (event) {
        var data = event.data || {};
        if (event.source !== frame.contentWindow || data.type !== 'socrates-viz-ready' || data.cardId !== cardId || data.nonce !== frame.dataset.nonce) return;
        frame.dataset.ready = 'true';
      };
      window.addEventListener('message', receiveExtensionReady);
      card._visualizationCleanup = function () { window.removeEventListener('message', receiveExtensionReady); };
    } else {
      stage.innerHTML = renderStructure(spec);
    }
    bindCard(card, spec, chart);
  } catch (error) {
    stage.innerHTML = '<div class="visualization-fallback"><strong>视觉内容暂未渲染</strong><p>' + esc(spec.accessibilitySummary) + '</p><button type="button">本地重试</button></div>';
    stage.querySelector('button').addEventListener('click', function () { card.remove(); mountVisualization(spec, host, options); });
    console.warn('[visualization] render failed', error);
  }
  return card;
}

export function disposeVisualizations(host) {
  if (!host) return;
  host.querySelectorAll('.visualization-card').forEach(function (card) { if (card._visualizationCleanup) card._visualizationCleanup(); });
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
      entry.chart.setOption(optionForChart(entry.spec, colors), { notMerge: true });
      entry.chart.resize();
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
