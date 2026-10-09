/* Theme-aware ECharts options derived from normalized visualization specs. */
import { robustExtent, sampleFunction } from './visualizationMath.js';
import { categoryAxisLayout, formatCategoryLabel, truncateLabel } from './visualizationLabels.js';

function colorFor(role, index, colors) {
  if (role && colors[role]) return colors[role];
  return [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline][index % 5];
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
export var VIZ_FONT_FAMILY = "'Plus Jakarta Sans','Inter','Noto Sans SC','Helvetica Neue',Arial,system-ui,sans-serif";

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

export function optionForChart(spec, colors) {
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
