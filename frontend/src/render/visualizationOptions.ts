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
  return [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline][
    index % 5
  ];
}

function escapeTooltip(value: unknown): string {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
    return (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<
        string,
        string
      >
    )[char];
  });
}

function normalizeFunction(spec: VizSpec): {
  series: NormalizedFunctionSeries[];
  xExtent: [number, number];
  yExtent: [number, number];
} {
  const payload = spec.payload || {};
  let allValues: number[] = [];
  let minX = Infinity,
    maxX = -Infinity;
  const rawFunctions = Array.isArray(payload.functions) ? payload.functions : [];
  const series: NormalizedFunctionSeries[] = [];
  rawFunctions.forEach(function (fn) {
    if (!fn || typeof fn.expression !== 'string' || !fn.expression.trim()) return;
    const sample = sampleFunction(fn.expression, fn.domain, 760);
    if (!sample || !Array.isArray(sample.points)) return;
    const finitePoints = sample.points.filter(function (point) {
      return point && Number.isFinite(point[1]);
    });
    if (!finitePoints.length) return;
    allValues = allValues.concat(
      finitePoints.map(function (point) {
        return point[1] as number;
      }),
    );
    /* Fit the x axis to where the curve actually exists, not to the requested
       domain. ln(x) sampled over a domain that crosses zero has no values at
       x <= 0, and keeping that empty left half showed the curve starting in
       the middle of a blank plot. */
    minX = Math.min(
      minX,
      ...finitePoints.map(function (point) {
        return point[0] as number;
      }),
    );
    maxX = Math.max(
      maxX,
      ...finitePoints.map(function (point) {
        return point[0] as number;
      }),
    );
    series.push({
      name: fn.label || fn.expression,
      role: fn.role,
      data: sample.points,
      expression: fn.expression,
    });
  });
  const yExtent = robustExtent(allValues);
  return { series: series, xExtent: [minX, maxX], yExtent: yExtent };
}

/* A sampled curve produces arbitrary bounds (3.797, -1.7287). Rounding each
   axis end outward to a half-decade keeps the extreme ticks readable and the
   plot the same size; the data itself is untouched. */
function niceBound(value: number, direction: 1 | -1): number {
  if (!Number.isFinite(value) || value === 0) return direction > 0 ? 1 : -1;
  const step = 10 ** Math.floor(Math.log10(Math.abs(value))) / 2;
  const rounded = direction > 0 ? Math.ceil(value / step) * step : Math.floor(value / step) * step;
  return Number(rounded.toPrecision(6));
}

/* A sampled curve produces arbitrary floats. Axis ticks read as numbers a
   reader can compare, so keep at most four significant decimals and fall back
   to exponent form at the extremes instead of printing
   -1.7286640104019755 across the axis. */
function formatNumericTick(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (value === 0) return '0';
  const magnitude = Math.abs(value);
  if (magnitude >= 1e5 || magnitude < 1e-3) return value.toExponential(1).replace('e+', 'e');
  const rounded = Number(value.toFixed(4));
  return String(rounded);
}

/* Canvas/SVG renderers need a concrete family list. Keep it aligned with
   themes.css so chart labels use the same Geist and Noto faces as the UI. */
export const VIZ_FONT_FAMILY =
  "'Geist Sans','Noto Sans SC','PingFang SC','Microsoft YaHei',Arial,sans-serif";

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
    formatter: function (name: string) {
      return truncateLabel(name, 24);
    },
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
  if (!normalized.series.length)
    throw new Error('No finite function values were produced for the requested domain.');
  const hasLn = normalized.series.some((item) => /\b(?:ln|log)\s*\(/i.test(item.expression || ''));
  return {
    backgroundColor: 'transparent',
    textStyle,
    color: normalized.series.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign(
      { trigger: 'axis', valueFormatter: (value: number) => Number(value).toPrecision(5) },
      tooltipBase,
    ),
    legend: legendOptions(normalized.series, colors, fontFamily),
    grid: {
      left: 48,
      right: 14,
      top: normalized.series.length > 1 ? 38 : 14,
      bottom: 42,
      containLabel: true,
    },
    /* Same axis layout as the scatter card: names sit centred along their
       axis, because at the default end position the y name collided with the
       top tick and the x name ran past the right margin on a phone. */
    xAxis: {
      type: 'value',
      name: spec.payload.xLabel || 'x',
      nameLocation: 'middle',
      nameGap: 26,
      min: Math.min(0, normalized.xExtent[0]),
      max: niceBound(normalized.xExtent[1], 1),
      nameTextStyle: { color: colors.text, fontFamily },
      axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.text, fontFamily, formatter: formatNumericTick },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value',
      name: spec.payload.yLabel || 'y',
      nameLocation: 'middle',
      nameGap: 34,
      min: niceBound(normalized.yExtent[0], -1),
      max: niceBound(normalized.yExtent[1], 1),
      nameTextStyle: { color: colors.text, fontFamily },
      axisLine: { lineStyle: { color: colors.line } },
      axisLabel: { color: colors.text, fontFamily, formatter: formatNumericTick },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    dataZoom: [{ type: 'inside', zoomOnMouseWheel: true, moveOnMouseMove: true }],
    series: normalized.series.map((item, index) => {
      const series: ChartOption = {
        type: 'line',
        name: item.name,
        data: item.data,
        showSymbol: false,
        connectNulls: false,
        smooth: false,
        lineStyle: { width: 2.35, color: colorFor(item.role, index, colors) },
        emphasis: { focus: 'series' },
      };
      if (index === 0 && hasLn) {
        series.markPoint = {
          symbolSize: 8,
          data: [
            {
              coord: [1, 0],
              name: '(1, 0)',
              label: { formatter: '(1, 0)', color: colors.text, fontFamily },
            },
          ],
        };
        series.markLine = {
          silent: true,
          symbol: 'none',
          lineStyle: { type: 'dashed', color: colors.baseline },
          data: [{ xAxis: 0 }],
        };
      }
      return series;
    }),
  };
}

function shareChartOption(
  spec: VizSpec,
  colors: VizColors,
  fontFamily: string,
  textStyle: ChartOption,
  tooltipBase: ChartOption,
): ChartOption {
  const payload = spec.payload;
  const categories = payload.categories || [];
  const data = (payload.series?.[0]?.data || []).flatMap((value, index) =>
    typeof value === 'number' && Number.isFinite(value)
      ? [{ name: String(categories[index] ?? index + 1), value }]
      : [],
  );
  const funnel = spec.template === 'funnel';
  return {
    backgroundColor: 'transparent',
    textStyle,
    color: [colors.primary, colors.secondary, colors.comparison, colors.highlight, colors.baseline],
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item' }, tooltipBase),
    legend: {
      type: categories.length > 6 ? 'scroll' : 'plain',
      bottom: 0,
      width: '88%',
      textStyle: { color: colors.text, fontFamily },
      formatter: (name: string) => truncateLabel(name, 22),
    },
    series: [
      {
        ...(funnel
          ? {
              type: 'funnel',
              sort: 'none',
              min: 0,
              max: Math.max(1, ...data.map((item) => item.value)),
              gap: 4,
              left: '6%',
              width: '88%',
              top: 8,
              bottom: categories.length > 1 ? 42 : 8,
            }
          : {
              type: 'pie',
              radius: spec.template === 'donut' ? ['42%', '74%'] : '70%',
              center: ['50%', categories.length > 1 ? '44%' : '50%'],
              avoidLabelOverlap: true,
              emphasis: { scaleSize: 4 },
            }),
        data,
        label: {
          color: colors.text,
          fontFamily,
          position: funnel ? 'right' : undefined,
          formatter: (params: { name: string }) => truncateLabel(params.name, funnel ? 12 : 18),
        },
        labelLayout: { hideOverlap: true, moveOverlap: 'shiftY' },
      },
    ],
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
  const heatValues = matrix
    .flat()
    .filter((value) => typeof value === 'number' && Number.isFinite(value));
  if (!heatValues.length) throw new Error('Heatmap needs at least one finite measurement.');
  const heatMin = Math.min.apply(null, heatValues);
  let heatMax = Math.max.apply(null, heatValues);
  if (heatMin === heatMax) heatMax = heatMin + 1;
  return {
    backgroundColor: 'transparent',
    textStyle,
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign(
      {
        trigger: 'item',
        formatter: (params: { value: number[] }) =>
          escapeTooltip(truncateLabel(yCategories[params.value[1]], 24)) +
          ' · ' +
          escapeTooltip(truncateLabel(xCategories[params.value[0]], 24)) +
          ': ' +
          escapeTooltip(params.value[2]),
      },
      tooltipBase,
    ),
    grid: { left: 10, right: 64, top: 10, bottom: 10, containLabel: true },
    xAxis: {
      type: 'category',
      data: xCategories,
      splitArea: { show: true },
      axisLabel: {
        color: colors.text,
        fontFamily,
        interval: 0,
        hideOverlap: xCategories.length > 20,
        formatter: (value: unknown) => truncateLabel(value, 16),
      },
      axisLine: { lineStyle: { color: colors.line } },
    },
    yAxis: {
      type: 'category',
      data: yCategories,
      inverse: true,
      splitArea: { show: true },
      axisLabel: {
        color: colors.text,
        fontFamily,
        formatter: (value: unknown) => truncateLabel(value, 18),
      },
      axisLine: { lineStyle: { color: colors.line } },
    },
    visualMap: {
      min: heatMin,
      max: heatMax,
      calculable: true,
      orient: 'vertical',
      right: 4,
      top: 'center',
      textStyle: { color: colors.text, fontFamily },
      inRange: { color: ['#e8efff', colors.primary] },
    },
    series: [
      {
        type: 'heatmap',
        /* The ramp runs from a pale tint to the accent in both themes, so a
         cell's label follows its own fill, not the page: ink on pale cells,
         white on deep ones. Theme text made pale cells unreadable in dark. */
        data: matrix.flatMap((row, y) =>
          row.flatMap((value, x) =>
            typeof value === 'number' && Number.isFinite(value)
              ? [
                  {
                    value: [x, y, value],
                    label: {
                      color:
                        (Number(value) - heatMin) / (heatMax - heatMin) > 0.6
                          ? '#ffffff'
                          : '#1c2637',
                    },
                  },
                ]
              : [],
          ),
        ),
        label: { show: xCategories.length * yCategories.length <= 80, fontFamily },
        emphasis: { itemStyle: { borderColor: colors.text, borderWidth: 1 } },
      },
    ],
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
    backgroundColor: 'transparent',
    textStyle,
    color: radarSeries.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'item' }, tooltipBase),
    legend: legendOptions(radarSeries, colors, fontFamily, 'bottom'),
    radar: {
      indicator: radarIndicators,
      shape: 'polygon',
      radius: '74%',
      center: ['50%', radarSeries.length > 1 ? '45%' : '50%'],
      axisName: { color: colors.text, fontFamily },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.line } },
      splitArea: { areaStyle: { color: ['rgba(128,140,160,.025)', 'rgba(128,140,160,.07)'] } },
    },
    series: [
      {
        type: 'radar',
        data: radarSeries.map((series, index) => ({
          name: series.name || 'Series ' + (index + 1),
          value: series.data,
          itemStyle: { color: colorFor(series.role, index, colors) },
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.12 },
        })),
      },
    ],
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
    backgroundColor: 'transparent',
    textStyle,
    color: scatterSeries.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign(
      {
        trigger: 'item',
        formatter: (params: { seriesName?: string; value: number[] }) =>
          escapeTooltip(params.seriesName || '') +
          '<br>' +
          escapeTooltip(payload.xLabel || 'x') +
          ': ' +
          escapeTooltip(params.value[0]) +
          '<br>' +
          escapeTooltip(payload.yLabel || 'y') +
          ': ' +
          escapeTooltip(params.value[1]),
      },
      tooltipBase,
    ),
    legend: legendOptions(scatterSeries, colors, fontFamily),
    grid: {
      left: 48,
      right: 14,
      top: scatterSeries.length > 1 ? 38 : 14,
      bottom: 42,
      containLabel: true,
    },
    /* Axis names sit centred along their axis. At the default end position
       the x name ran past the 22px right margin and the y name above the
       18px top margin, so a phone-width card clipped both. */
    xAxis: {
      type: 'value',
      name: payload.xLabel || '',
      nameLocation: 'middle',
      nameGap: 26,
      nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: { color: colors.text, fontFamily },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value',
      name: payload.yLabel || '',
      nameLocation: 'middle',
      nameGap: 34,
      nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: { color: colors.text, fontFamily },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    dataZoom: [{ type: 'inside' }],
    series: scatterSeries.map((series, index) => ({
      name: series.name || 'Series ' + (index + 1),
      type: 'scatter',
      data: series.data.map((point) => {
        const value = point as { x?: unknown; y?: unknown };
        return Array.isArray(point) ? point : [value.x, value.y];
      }),
      symbolSize: 9,
      emphasis: { focus: 'series', scale: 1.25 },
    })),
  };
}

const SERIES_TYPE_BY_CHART: Record<string, string> = {
  line: 'line',
  area: 'line',
  bar: 'bar',
  stacked_bar: 'bar',
  scatter: 'scatter',
  histogram: 'bar',
  heatmap: 'heatmap',
  radar: 'radar',
  boxplot: 'boxplot',
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
  if (!categories.length && seriesInput.length) {
    const categoryCount = Math.max.apply(
      null,
      seriesInput.map((series) => (series.data || []).length),
    );
    categories = Array.from({ length: categoryCount }, (_, index) => String(index + 1));
    axisLayout = categoryAxisLayout(categories);
  }
  const isStacked = chartType === 'stacked_bar';
  return {
    backgroundColor: 'transparent',
    textStyle,
    color: seriesInput.map((item, index) => colorFor(item.role, index, colors)),
    aria: { enabled: true, description: { summary: spec.accessibilitySummary } },
    tooltip: Object.assign({ trigger: 'axis' }, tooltipBase),
    legend: legendOptions(seriesInput, colors, fontFamily),
    grid: {
      left: 10,
      right: 12,
      top: seriesInput.length > 1 ? 36 : 12,
      bottom: payload.xLabel ? 30 : 10,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: categories,
      name: payload.xLabel || '',
      nameGap: axisLayout.rotate ? 58 : 34,
      nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: {
        color: colors.text,
        fontFamily,
        interval: 0,
        rotate: axisLayout.rotate,
        hideOverlap: categories.length > 20,
        margin: 12,
        formatter: (value: unknown) =>
          formatCategoryLabel(value, {
            rotate: axisLayout.rotate,
            maxChars: axisLayout.maxChars,
            lineChars: axisLayout.lineChars,
          }),
      },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { show: false, lineStyle: { color: colors.grid } },
    },
    yAxis: {
      type: 'value',
      name: payload.yLabel || '',
      nameTextStyle: { color: colors.text, fontFamily },
      axisLabel: { color: colors.text, fontFamily },
      axisLine: { lineStyle: { color: colors.line } },
      splitLine: { lineStyle: { color: colors.grid } },
    },
    dataZoom: chartType !== 'boxplot' ? [{ type: 'inside' }] : undefined,
    series: seriesInput.map((series, index) => {
      const kind = chartType === 'combo' ? series.kind : spec.template;
      const type = (kind && SERIES_TYPE_BY_CHART[kind]) || 'line';
      return {
        name: series.name || 'Series ' + (index + 1),
        type,
        data: series.data,
        stack: isStacked ? 'total' : undefined,
        showSymbol: false,
        barMaxWidth: type === 'bar' ? 54 : undefined,
        barCategoryGap: chartType === 'histogram' ? '8%' : undefined,
        areaStyle: kind === 'area' ? { opacity: 0.16 } : undefined,
        emphasis: { focus: 'series' },
      };
    }),
  };
}

function chartAnimationOptions(): ChartOption {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (prefersReduced) {
    return {
      animation: false,
    };
  }
  return {
    animation: true,
    animationDuration: 450,
    animationDurationUpdate: 350,
    animationEasing: 'cubicOut',
    animationEasingUpdate: 'cubicOut',
    animationThreshold: 2000,
  };
}

export function optionForChart(spec: VizSpec, colors: VizColors): ChartOption {
  const chartType = spec.template === 'area' ? 'line' : spec.template;
  const fontFamily = VIZ_FONT_FAMILY;
  const textStyle = { fontFamily };
  const tooltipBase = chartTooltipBase(colors, fontFamily);
  let baseOption: ChartOption;
  if (spec.template === 'function')
    baseOption = functionChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  else if (['pie', 'donut', 'funnel'].includes(chartType))
    baseOption = shareChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  else if (chartType === 'heatmap')
    baseOption = heatmapChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  else if (chartType === 'radar')
    baseOption = radarChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  else if (chartType === 'scatter')
    baseOption = scatterChartOption(spec, colors, fontFamily, textStyle, tooltipBase);
  else
    baseOption = cartesianChartOption(spec, colors, fontFamily, textStyle, tooltipBase, chartType);

  return Object.assign({}, chartAnimationOptions(), baseOption);
}
