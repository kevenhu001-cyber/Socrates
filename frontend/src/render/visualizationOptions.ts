/* Theme-aware ECharts options derived from normalized visualization specs. */
import { robustExtent, sampleFunction, type FunctionPoint } from '@socrates/core/visualizationMath';
import { categoryAxisLayout, formatCategoryLabel, truncateLabel } from './visualizationLabels.ts';
import type { VizSpec } from './visualizationSpec.ts';

/** Concrete colours resolved from CSS variables at mount time. */
export interface VizColors {
  text: string;
  muted: string;
  line: string;
  grid: string;
  surface: string;
  primary: string;
  secondary: string;
  comparison: string;
  highlight: string;
  baseline: string;
}

/** ECharts options are data, not a typed surface in this repo. */
type ChartOption = Record<string, unknown>;

interface NormalizedFunctionSeries {
  name: string;
  role?: string;
  data: FunctionPoint[];
  expression: string;
}

function colorFor(role: string | undefined, index: number, colors: VizColors): string {
  const byRole = role ? (colors as unknown as Record<string, string>)[role] : undefined;
  if (byRole) return byRole;
  return [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline][index % 5];
}

function escapeTooltip(value: unknown): string {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char];
  });
}

function normalizeFunction(spec: VizSpec): {
  series: NormalizedFunctionSeries[];
  xExtent: [number, number];
  yExtent: [number, number];
} {
  const payload = spec.payload || {};
  let allValues: number[] = [];
  let minX = Infinity, maxX = -Infinity;
  const rawFunctions = Array.isArray(payload.functions) ? payload.functions : [];
  const series: NormalizedFunctionSeries[] = [];
  rawFunctions.forEach(function (fn) {
    if (!fn || typeof fn.expression !== 'string' || !fn.expression.trim()) return;
    const sample = sampleFunction(fn.expression, fn.domain, 760);
    if (!sample || !Array.isArray(sample.points)) return;
    const finitePoints = sample.points.filter(function (point) { return point && Number.isFinite(point[1]); });
    if (!finitePoints.length) return;
    allValues = allValues.concat(finitePoints.map(function (point) { return point[1] as number; }));
    minX = Math.min(minX, sample.domain[0]); maxX = Math.max(maxX, sample.domain[1]);
    series.push({ name: fn.label || fn.expression, role: fn.role, data: sample.points, expression: fn.expression });
  });
  const yExtent = robustExtent(allValues);
  return { series: series, xExtent: [minX, maxX], yExtent: yExtent };
}

/* Canvas/SVG renderers need a concrete family list. Keep it aligned with
   themes.css so chart labels use the same Geist and Noto faces as the UI. */
export const VIZ_FONT_FAMILY = "'Geist Sans','Noto Sans SC','PingFang SC','Microsoft YaHei',Arial,sans-serif";

function legendOptions(
  series: readonly unknown[],
  colors: VizColors,
  fontFamily: string,
  placement?: string,
): ChartOption | undefined {
  if (!Array.isArray(series) || series.length <= 1) return undefined;
  return {
    type: series.length > 5 ? 'scroll' : 'plain',
    top: placement === 'bottom' ? undefined : 4,
    bottom: placement === 'bottom' ? 0 : undefined,
    left: 'center',
    width: '86%',
    pageTextStyle: { color: colors.muted, fontFamily: fontFamily },
    textStyle: { color: colors.text, fontFamily: fontFamily },
    formatter: function (name: string) { return truncateLabel(name, 24); },
  };
}

function chartTooltipBase(colors: VizColors, fontFamily: string): ChartOption {
  return {
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
}

function functionChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
): ChartOption {
  const normalized = normalizeFunction(spec);
  if (!normalized.series.length) throw new Error('No finite function values were produced for the requested domain.');
  const hasLn = normalized.series.some((item) => /\b(?:ln|log)\s*\(/i.test(item.expression || ''));
  return {
    backgroundColor: 'transparent', textStyle,
    color: normalized.series.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'axis', valueFormatter: (value: number) => Number(value).toPrecision(5) }, tooltipBase),
    legend: legendOptions(normalized.series, colors, fontFamily),
    grid: { left: 56, right: 20, top: normalized.series.length > 1 ? 38 : 18, bottom: 50, containLabel: false },
    xAxis: {
      type: 'value', name: spec.payload.xLabel || 'x', min: Math.min(0, normalized.xExtent[0]), max: normalized.xExtent[1],
      nameTextStyle: { color: colors.text, fontFamily }, axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.text, fontFamily }, splitLine: { lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value', name: spec.payload.yLabel || 'y', min: normalized.yExtent[0], max: normalized.yExtent[1],
      nameTextStyle: { color: colors.text, fontFamily }, axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.text, fontFamily }, splitLine: { lineStyle: { color: colors.grid } },
    },
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true }],
    series: normalized.series.map((item, index) => {
      const series: ChartOption = {
        type: 'line', name: item.name, data: item.data, showSymbol: false,
        connectNulls: false, smooth: false,
        lineStyle: { width: 2.35, color: colorFor(item.role, index, colors) }, emphasis: { focus: 'series' },
      };
      if (index === 0 && hasLn) {
        series.markPoint = { symbolSize: 8, data: [{ coord: [1, 0], name: '(1, 0)', label: { formatter: '(1, 0)', color: colors.text, fontFamily } }] };
        series.markLine = { silent: true, symbol: 'none', lineStyle: { type: 'dashed', color: colors.baseline }, data: [{ xAxis: 0 }] };
      }
      return series;
    }),
  };
}

function pieChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
): ChartOption {
  const payload = spec.payload;
  const categories = payload.categories || [];
  return {
    backgroundColor: 'transparent', textStyle,
    color: [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline],
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item' }, tooltipBase),
    legend: {
      type: categories.length > 6 ? 'scroll' : 'plain', bottom: 0, width: '88%',
      textStyle: { color: colors.text, fontFamily },
      formatter: (name: string) => truncateLabel(name, 22),
    },
    series: (payload.series || []).map((series) => ({
      type: 'pie',
      radius: spec.template === 'pie' ? '58%' : ['38%', '62%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      data: series.data.map((value, index) => typeof value === 'object'
        ? value
        : { name: String(categories[index] || index + 1), value }),
      label: {
        color: colors.text, fontFamily,
        formatter: (params: { name: string }) => truncateLabel(params.name, 18),
      },
      labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      emphasis: { scaleSize: 4 },
    })),
  };
}

function heatmapChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
): ChartOption {
  const payload = spec.payload;
  const xCategories = payload.xCategories || [];
  const yCategories = payload.yCategories || [];
  const matrix = payload.values || [];
  const heatValues = matrix.flat();
  const heatMin = Math.min.apply(null, heatValues);
  let heatMax = Math.max.apply(null, heatValues);
  if (heatMin === heatMax) heatMax = heatMin + 1;
  return {
    backgroundColor: 'transparent', textStyle,
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item', formatter: (params: { value: number[] }) =>
      escapeTooltip(truncateLabel(yCategories[params.value[1]], 24)) + ' · '
        + escapeTooltip(truncateLabel(xCategories[params.value[0]], 24)) + ': '
        + escapeTooltip(params.value[2]) }, tooltipBase),
    grid: { left: 82, right: 76, top: 18, bottom: 56, containLabel: true },
    xAxis: {
      type: 'category', data: xCategories, splitArea: { show: true },
      axisLabel: {
        color: colors.text, fontFamily, interval: 0, hideOverlap: xCategories.length > 20,
        formatter: (value: unknown) => truncateLabel(value, 16),
      },
      axisLine: { lineStyle: { color: colors.line } },
    },
    yAxis: {
      type: 'category', data: yCategories, inverse: true, splitArea: { show: true },
      axisLabel: { color: colors.text, fontFamily, formatter: (value: unknown) => truncateLabel(value, 18) },
      axisLine: { lineStyle: { color: colors.line } },
    },
    visualMap: {
      min: heatMin, max: heatMax, calculable: true, orient: 'vertical', right: 4, top: 'center',
      textStyle: { color: colors.text, fontFamily }, inRange: { color: ['#e8efff', colors.primary] },
    },
    series: [{
      type: 'heatmap',
      data: matrix.flatMap((row, y) => row.map((value, x) => [x, y, value])),
      label: { show: xCategories.length * yCategories.length <= 80, color: colors.text, fontFamily },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: 'rgba(0,0,0,.22)' } },
    }],
  };
}

function radarChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
): ChartOption {
  const payload = spec.payload;
  const indicators = payload.indicators || [];
  const radarSeries = payload.series || [];
  const radarIndicators = indicators.map((indicator, index) => {
    const values = radarSeries.map((series) => Number(series.data[index])).filter(Number.isFinite);
    const low = Math.min.apply(null, [0].concat(values));
    const observedMax = Math.max.apply(null, values.concat([0]));
    const upper = indicator.max === undefined ? Math.max(1, observedMax * 1.08) : indicator.max;
    return { name: indicator.name, min: Math.min(low, upper - 0.001), max: upper };
  });
  return {
    backgroundColor: 'transparent', textStyle,
    color: radarSeries.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item' }, tooltipBase),
    legend: legendOptions(radarSeries, colors, fontFamily, 'bottom'),
    radar: {
      indicator: radarIndicators, shape: 'polygon', radius: '66%', center: ['50%', radarSeries.length > 1 ? '45%' : '50%'],
      axisName: { color: colors.text, fontFamily }, axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.line } },
      splitArea: { areaStyle: { color: ['rgba(128,140,160,.025)', 'rgba(128,140,160,.07)'] } },
    },
    series: [{
      type: 'radar',
      data: radarSeries.map((series, index) => ({
        name: series.name || 'Series ' + (index + 1), value: series.data,
        itemStyle: { color: colorFor(series.role, index, colors) },
        lineStyle: { width: 2 }, areaStyle: { opacity: 0.12 },
      })),
    }],
  };
}

function scatterChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
): ChartOption {
  const payload = spec.payload;
  const scatterSeries = payload.series || [];
  return {
    backgroundColor: 'transparent', textStyle,
    color: scatterSeries.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item', formatter: (params: { seriesName?: string; value: number[] }) =>
      escapeTooltip(params.seriesName || '') + '<br>'
        + escapeTooltip(payload.xLabel || 'x') + ': ' + escapeTooltip(params.value[0]) + '<br>'
        + escapeTooltip(payload.yLabel || 'y') + ': ' + escapeTooltip(params.value[1]) }, tooltipBase),
    legend: legendOptions(scatterSeries, colors, fontFamily),
    grid: { left: 62, right: 22, top: scatterSeries.length > 1 ? 44 : 18, bottom: 52, containLabel: true },
    xAxis: {
      type: 'value', name: payload.xLabel || '', nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: { color: colors.text, fontFamily }, axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value', name: payload.yLabel || '', nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: { color: colors.text, fontFamily }, axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    dataZoom: [{ type: 'inside' }],
    series: scatterSeries.map((series, index) => ({
      name: series.name || 'Series ' + (index + 1), type: 'scatter',
      data: series.data.map((point) => {
        const value = point as { x?: unknown; y?: unknown };
        return Array.isArray(point) ? point : [value.x, value.y];
      }),
      symbolSize: 9, emphasis: { focus: 'series', scale: 1.25 },
    })),
  };
}

const SERIES_TYPE_BY_CHART: Record<string, string> = {
  line: 'line', area: 'line', bar: 'bar', scatter: 'scatter', histogram: 'bar',
  heatmap: 'heatmap', radar: 'radar', boxplot: 'boxplot',
};

function cartesianChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
  chartType: string,
): ChartOption {
  const payload = spec.payload;
  let categories: Array<string | number> = payload.categories || [];
  let axisLayout = categoryAxisLayout(categories);
  const seriesInput = payload.series || [];
  if (!categories.length && seriesInput.length && ['line', 'area', 'bar', 'histogram', 'boxplot'].includes(chartType)) {
    const categoryCount = Math.max.apply(null, seriesInput.map((series) => (series.data || []).length));
    categories = Array.from({ length: categoryCount }, (_, index) => String(index + 1));
    axisLayout = categoryAxisLayout(categories);
  }
  const seriesType = SERIES_TYPE_BY_CHART[chartType] || 'line';
  return {
    backgroundColor: 'transparent', textStyle,
    color: seriesInput.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'axis' }, tooltipBase),
    legend: legendOptions(seriesInput, colors, fontFamily),
    grid: { left: 56, right: 22, top: seriesInput.length > 1 ? 44 : 18, bottom: axisLayout.bottom, containLabel: false },
    xAxis: {
      type: 'category', data: categories, name: payload.xLabel || '',
      nameGap: axisLayout.rotate ? 58 : 34,
      nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: {
        color: colors.text, fontFamily, interval: 0, rotate: axisLayout.rotate,
        hideOverlap: categories.length > 20, margin: 12,
        formatter: (value: unknown) => formatCategoryLabel(value, {
          rotate: axisLayout.rotate,
          maxChars: axisLayout.maxChars,
          lineChars: axisLayout.lineChars,
        }),
      },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { show: false, lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value', name: payload.yLabel || '', nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: { color: colors.text, fontFamily }, axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    dataZoom: ['line', 'area', 'bar', 'histogram'].includes(chartType) ? [{ type: 'inside' }] : undefined,
    series: seriesInput.map((series, index) => ({
      name: series.name || 'Series ' + (index + 1), type: seriesType, data: series.data, showSymbol: false,
      barMaxWidth: chartType === 'bar' || chartType === 'histogram' ? 54 : undefined,
      barCategoryGap: chartType === 'histogram' ? '8%' : undefined,
      areaStyle: spec.template === 'area' ? { opacity: 0.16 } : undefined,
      smooth: chartType === 'area', emphasis: { focus: 'series' },
    })),
  };
}

export function optionForChart(spec: VizSpec, colors: VizColors): ChartOption {
  const chartType = spec.template === 'area' ? 'line' : spec.template;
  const fontFamily = VIZ_FONT_FAMILY;
  const textStyle = { fontFamily };
  const tooltipBase = chartTooltipBase(colors, fontFamily);
  if (spec.template === 'function') return functionChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  if (chartType === 'pie') return pieChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  if (chartType === 'heatmap') return heatmapChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  if (chartType === 'radar') return radarChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  if (chartType === 'scatter') return scatterChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  return cartesianChartOption(spec, colors, fontFamily, textStyle, tooltipBase, chartType);
}
