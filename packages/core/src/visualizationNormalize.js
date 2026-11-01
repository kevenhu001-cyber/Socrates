/* Shared, DOM-free normalizer for native visualization specs.
 *
 * Models write chart data in many equivalent shapes: string numbers, `null`
 * gaps, `{name,value}` points, a `series` object instead of an array,
 * ECharts-style `xAxis`/`yAxis`, Chinese or hyphenated node ids, `y = 2x`.
 * The server validates and the client renders, and both must see the SAME
 * data, so this module is the single place where those shapes become the
 * canonical v1 payload. It never throws on model input: anything it cannot
 * repair is left in place for the validator to name.
 *
 * Returns `{ spec, warnings }`; `warnings` are short English sentences that
 * describe every lossy repair (truncation, dropped values, downsampling).
 */
import { parseFunctionExpression } from './visualizationMath.js';

export const VISUALIZATION_TEMPLATES = [
  'function', 'line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap',
  'radar', 'boxplot', 'flowchart', 'sequence', 'state', 'tree', 'mindmap',
  'network', 'timeline', 'comparison', 'process', 'number_line', 'geometry',
  'concept_map', 'svg_illustration', 'interactive_simulation',
  'paper_chart', 'math_construction', 'geometry_3d', 'whiteboard',
];

/** One limit for every path (direct tool, OpenUI program, prompt text). */
export const MAX_VISUALIZATION_POINTS = 5000;

/** [min, max] item counts for list-shaped teaching templates. */
export const VISUALIZATION_ITEM_LIMITS = {
  timeline: [2, 12],
  process: [2, 12],
  number_line: [2, 12],
  comparison: [2, 8],
};

export const CATEGORY_TEMPLATES = ['line', 'area', 'bar', 'pie', 'histogram', 'radar', 'boxplot', 'paper_chart'];
export const GRAPH_TEMPLATES = ['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'];

const NODE_ID_RE = /^[A-Za-z0-9_]{1,80}$/;
const ENVELOPE_KEYS = new Set(['version', 'template', 'title', 'caption', 'accessibilitySummary', 'payload']);
const ENVELOPE_ALIASES = ['type', 'chartType', 'chart_type', 'accessibility_summary', 'summary', 'description'];
const TEMPLATE_ALIASES = { linechart: 'line', line_chart: 'line', barchart: 'bar', bar_chart: 'bar', column: 'bar', piechart: 'pie', pie_chart: 'pie', donut: 'pie', doughnut: 'pie', scatterplot: 'scatter', scatter_plot: 'scatter', 'number-line': 'number_line', numberline: 'number_line', 'concept-map': 'concept_map', conceptmap: 'concept_map', graph: 'function', function_graph: 'function' };
const MISSING_STRINGS = new Set(['', '-', '–', '—', 'nan', 'null', 'none', 'n/a', 'na', 'undefined', '缺失', '无']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function firstDefined(record, keys) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function dropUndefined(record) {
  for (const key of Object.keys(record)) if (record[key] === undefined) delete record[key];
  return record;
}

function plural(count, word) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function isAsciiDigit(ch) {
  return ch >= '0' && ch <= '9';
}

function isValidThousandsNumber(text) {
  let body = text;
  if (body.startsWith('+') || body.startsWith('-')) body = body.slice(1);
  const dot = body.indexOf('.');
  if (dot !== -1 && body.indexOf('.', dot + 1) !== -1) return false;
  const integerPart = dot === -1 ? body : body.slice(0, dot);
  const fractionPart = dot === -1 ? null : body.slice(dot + 1);
  const groups = integerPart.split(',');
  if (groups.length < 2 || groups[0].length < 1 || groups[0].length > 3) return false;
  if (![...groups[0]].every(isAsciiDigit)) return false;
  if (!groups.slice(1).every((group) => group.length === 3 && [...group].every(isAsciiDigit))) return false;
  return fractionPart === null || (fractionPart.length > 0 && [...fractionPart].every(isAsciiDigit));
}

/**
 * Read one numeric cell. Returns a finite number, `null` for an explicit
 * gap, or `undefined` when the value is not numeric at all.
 */
export function coerceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return undefined;
  let text = value.trim().replace(/[\u2212\uFF0D]/g, '-').replace(/\uFF05/g, '%');
  if (MISSING_STRINGS.has(text.toLowerCase())) return null;
  /* Full-width digits and separators that CJK keyboards produce. */
  text = text.replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48)).replace(/\uFF0E/g, '.');
  if (text.endsWith('%')) text = text.slice(0, -1).trim();
  if (!text) return undefined;
  if (text.includes(',')) {
    if (!isValidThousandsNumber(text)) return undefined;
    text = text.split(',').join('');
  }
  if ([...text].some((ch) => !isAsciiDigit(ch) && !['+', '-', '.', 'e', 'E'].includes(ch))) return undefined;
  const number = Number(text);
  return Number.isFinite(number) ? number : undefined;
}

/** Coerce an array of cells; non-numeric cells become gaps and are counted. */
function coerceNumbers(values, stats) {
  return values.map((value) => {
    const number = coerceNumber(isRecord(value) ? firstDefined(value, ['value', 'y', 'count', 'v']) : value);
    if (number === undefined) { stats.dropped += 1; return null; }
    if (typeof value === 'string' || isRecord(value)) stats.coerced += 1;
    return number;
  });
}

/** Evenly sample `length` indexes down to `limit`, keeping first and last. */
function sampleIndexes(length, limit) {
  if (length <= limit) return null;
  const indexes = [];
  const step = (length - 1) / (limit - 1);
  for (let index = 0; index < limit; index += 1) indexes.push(Math.round(index * step));
  return indexes;
}

function axisCategories(value) {
  if (Array.isArray(value)) return value;
  if (isRecord(value) && Array.isArray(value.data)) return value.data;
  return undefined;
}

function axisName(value) {
  return isRecord(value) && typeof value.name === 'string' && value.name.trim() ? value.name.trim() : undefined;
}

function categoryOf(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return '';
  return String(value).trim().slice(0, 120);
}

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

function normalizeEnvelope(input) {
  let source = input;
  const inputKeys = Object.keys(source);
  if (inputKeys.length === 1 && ['spec', 'input', 'arguments', 'visualization'].includes(inputKeys[0]) && isRecord(source[inputKeys[0]])) source = source[inputKeys[0]];
  const normalized = { ...source };
  if (normalized.version === '1' || normalized.version === undefined) normalized.version = 1;
  if (!normalized.template) normalized.template = firstDefined(normalized, ['type', 'chartType', 'chart_type']);
  if (typeof normalized.template === 'string') {
    const key = normalized.template.trim().toLowerCase();
    normalized.template = TEMPLATE_ALIASES[key] || (VISUALIZATION_TEMPLATES.includes(key) ? key : normalized.template.trim());
  }
  if (typeof normalized.title === 'string') normalized.title = normalized.title.trim();
  if (typeof normalized.title === 'string' && normalized.title.length > 120) normalized.title = `${normalized.title.slice(0, 119)}…`;
  if (!normalized.accessibilitySummary) normalized.accessibilitySummary = firstDefined(normalized, ['accessibility_summary', 'summary', 'description']);
  if (typeof normalized.accessibilitySummary !== 'string' || !normalized.accessibilitySummary.trim()) normalized.accessibilitySummary = typeof normalized.title === 'string' && normalized.title ? `Visualization of ${normalized.title}.` : normalized.accessibilitySummary;
  if (typeof normalized.accessibilitySummary === 'string' && normalized.accessibilitySummary.length > 800) normalized.accessibilitySummary = normalized.accessibilitySummary.slice(0, 800);
  const extra = {};
  for (const key of Object.keys(normalized)) {
    if (ENVELOPE_KEYS.has(key)) continue;
    if (!ENVELOPE_ALIASES.includes(key)) extra[key] = normalized[key];
    delete normalized[key];
  }
  normalized.payload = { ...extra, ...(isRecord(normalized.payload) ? normalized.payload : {}) };
  return normalized;
}

const SERIES_DATA_KEYS = ['data', 'values', 'points', 'yValues', 'y_values', 'y'];
const POINT_LABEL_KEYS = ['name', 'label', 'category', 'x', 'key'];

function seriesListOf(payload) {
  let series = payload.series;
  if (series === undefined || series === null) {
    const values = firstDefined(payload, ['values', 'yValues', 'y_values', 'data', 'y']);
    if (Array.isArray(values)) series = values.length && values.every((item) => isRecord(item) && SERIES_DATA_KEYS.some((key) => Array.isArray(item[key]))) ? values : [{ data: values }];
    else if (Array.isArray(axisCategories(payload.yAxis)) && !isRecord(payload.yAxis)) series = [{ data: payload.yAxis }];
    else if (isRecord(payload.yAxis) && Array.isArray(payload.yAxis.data)) series = [{ data: payload.yAxis.data }];
  }
  if (isRecord(series)) {
    if (SERIES_DATA_KEYS.some((key) => key in series)) series = [series];
    else {
      const entries = Object.entries(series);
      series = entries.length && entries.every(([, value]) => Array.isArray(value)) ? entries.map(([name, data]) => ({ name, data })) : [series];
    }
  }
  if (!Array.isArray(series)) return series;
  if (series.length && series.every((item) => !Array.isArray(item) && !isRecord(item))) return [{ data: series }];
  if (series.length && series.every((item) => isRecord(item) && !SERIES_DATA_KEYS.some((key) => Array.isArray(item[key])) && ['value', 'y', 'count', 'v'].some((key) => key in item))) return [{ data: series }];
  return series.map((item) => {
    if (Array.isArray(item)) return { data: item };
    if (!isRecord(item)) return item;
    const entry = { ...item };
    if (!entry.name) entry.name = firstDefined(entry, ['title', 'label', 'key']);
    if (entry.name !== undefined && typeof entry.name !== 'string') entry.name = String(entry.name);
    if (!Array.isArray(entry.data)) {
      const data = firstDefined(entry, ['values', 'points', 'yValues', 'y_values', 'y']);
      if (Array.isArray(data)) entry.data = data;
      else if (isRecord(entry.data)) entry.data = Object.values(entry.data);
    }
    if (entry.type && !entry.kind && ['line', 'bar', 'scatter'].includes(entry.type)) entry.kind = entry.type;
    for (const key of ['title', 'label', 'key', 'values', 'points', 'yValues', 'y_values', 'y', 'type']) delete entry[key];
    if (typeof entry.name === 'string' && !entry.name.trim()) delete entry.name;
    if (typeof entry.name === 'string') entry.name = entry.name.trim().slice(0, 80);
    return dropUndefined(entry);
  });
}

function boxSummaryOf(value, stats) {
  if (isRecord(value)) value = [value.min ?? value.low, value.q1 ?? value.lower, value.median ?? value.q2, value.q3 ?? value.upper, value.max ?? value.high];
  if (!Array.isArray(value)) return value;
  const numbers = value.map((cell) => coerceNumber(cell));
  if (numbers.length !== 5 || numbers.some((cell) => typeof cell !== 'number')) return value;
  if (value.some((cell) => typeof cell === 'string')) stats.coerced += 1;
  return numbers;
}

function normalizeCategoryPayload(template, payload, warnings) {
  if (payload.categories === undefined || payload.categories === null) {
    const categories = firstDefined(payload, ['labels', 'xValues', 'x_values', 'x']) ?? axisCategories(payload.xAxis);
    if (categories !== undefined) payload.categories = categories;
  }
  if (payload.xLabel === undefined && axisName(payload.xAxis)) payload.xLabel = axisName(payload.xAxis);
  if (payload.yLabel === undefined && axisName(payload.yAxis)) payload.yLabel = axisName(payload.yAxis);
  if (isRecord(payload.categories)) payload.categories = Object.values(payload.categories);
  const series = seriesListOf(payload);
  if (series !== undefined) payload.series = series;
  for (const key of ['labels', 'xValues', 'x_values', 'x', 'values', 'yValues', 'y_values', 'y', 'xAxis', 'yAxis']) delete payload[key];
  if (Array.isArray(payload.series) && payload.data !== undefined) delete payload.data;
  if (template === 'radar') {
    if (!Array.isArray(payload.indicators)) {
      const names = firstDefined(payload, ['indicator', 'axes', 'dimensions']) ?? payload.categories;
      if (Array.isArray(names)) payload.indicators = names;
    }
    if (Array.isArray(payload.indicators)) {
      payload.indicators = payload.indicators.map((item) => {
        if (typeof item === 'string' || typeof item === 'number') return { name: String(item) };
        if (!isRecord(item)) return item;
        const indicator = { ...item };
        if (!indicator.name) indicator.name = firstDefined(indicator, ['label', 'text', 'title']);
        if (indicator.max !== undefined) {
          const max = coerceNumber(indicator.max);
          if (typeof max === 'number' && max > 0) indicator.max = max; else delete indicator.max;
        }
        delete indicator.label; delete indicator.text; delete indicator.title;
        return dropUndefined(indicator);
      });
    }
    for (const key of ['indicator', 'axes', 'dimensions', 'categories']) delete payload[key];
  }
  if (!Array.isArray(payload.series)) return;
  const stats = { coerced: 0, dropped: 0 };
  payload.series = payload.series.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.data)) return entry;
    const next = { ...entry };
    if (template === 'boxplot') { next.data = entry.data.map((value) => boxSummaryOf(value, stats)); return next; }
    if (entry.data.length && entry.data.every((point) => isRecord(point))) {
      const labels = entry.data.map((point) => firstDefined(point, POINT_LABEL_KEYS));
      if (!Array.isArray(payload.categories) && labels.every((label) => label !== undefined)) payload.categories = labels.map(categoryOf);
    }
    next.data = coerceNumbers(entry.data, stats);
    return next;
  });
  if (stats.dropped) warnings.push(`Ignored ${plural(stats.dropped, 'non-numeric value')}; they are shown as gaps.`);
  if (Array.isArray(payload.categories)) payload.categories = payload.categories.map(categoryOf);
  if (template === 'radar') reconcileRadar(payload, warnings);
  else if (Array.isArray(payload.categories)) reconcileLengths(template, payload, warnings);
  const longest = Math.max(0, ...payload.series.map((entry) => (isRecord(entry) && Array.isArray(entry.data) ? entry.data.length : 0)));
  const indexes = sampleIndexes(longest, MAX_VISUALIZATION_POINTS);
  if (indexes) {
    payload.series = payload.series.map((entry) => (isRecord(entry) && Array.isArray(entry.data) ? { ...entry, data: indexes.filter((index) => index < entry.data.length).map((index) => entry.data[index]) } : entry));
    if (Array.isArray(payload.categories)) payload.categories = indexes.filter((index) => index < payload.categories.length).map((index) => payload.categories[index]);
    warnings.push(`Downsampled ${longest} points to ${MAX_VISUALIZATION_POINTS}.`);
  }
  if (Array.isArray(payload.categories) && payload.categories.length > MAX_VISUALIZATION_POINTS) payload.categories = payload.categories.slice(0, MAX_VISUALIZATION_POINTS);
}

function reconcileLengths(template, payload, warnings) {
  const categories = payload.categories;
  const series = payload.series.filter((entry) => isRecord(entry) && Array.isArray(entry.data));
  if (!series.length || !categories.length) return;
  const single = series.length === 1;
  let padded = 0;
  let trimmed = 0;
  if (single && series[0].data.length < categories.length && series[0].data.length > 0) {
    trimmed += categories.length - series[0].data.length;
    payload.categories = categories.slice(0, series[0].data.length);
    if (trimmed) warnings.push(`Dropped ${plural(trimmed, 'category')} without values.`);
    return;
  }
  payload.series = payload.series.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.data)) return entry;
    if (entry.data.length > categories.length) { trimmed += entry.data.length - categories.length; return { ...entry, data: entry.data.slice(0, categories.length) }; }
    if (entry.data.length < categories.length && template !== 'boxplot' && template !== 'pie') { padded += categories.length - entry.data.length; return { ...entry, data: [...entry.data, ...Array(categories.length - entry.data.length).fill(null)] }; }
    return entry;
  });
  if (trimmed) warnings.push(`Dropped ${plural(trimmed, 'value')} beyond the last category.`);
  if (padded) warnings.push(`Filled ${plural(padded, 'missing value')} with gaps.`);
}

function reconcileRadar(payload, warnings) {
  if (!Array.isArray(payload.indicators)) return;
  const count = payload.indicators.length;
  let trimmed = 0;
  payload.series = payload.series.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.data) || entry.data.length <= count) return entry;
    trimmed += entry.data.length - count;
    return { ...entry, data: entry.data.slice(0, count) };
  });
  if (trimmed) warnings.push(`Dropped ${plural(trimmed, 'value')} beyond the last indicator.`);
}

function zipPoints(xs, ys) {
  const length = Math.min(xs.length, ys.length);
  return Array.from({ length }, (_, index) => [xs[index], ys[index]]);
}

function normalizeScatterPayload(payload, warnings) {
  if (payload.series === undefined || payload.series === null) {
    if (Array.isArray(payload.x) && Array.isArray(payload.y)) payload.series = [{ data: zipPoints(payload.x, payload.y) }];
    else if (Array.isArray(payload.data) || Array.isArray(payload.points)) payload.series = [{ data: payload.data || payload.points }];
  }
  if (isRecord(payload.series)) payload.series = [payload.series];
  if (Array.isArray(payload.series) && payload.series.length && payload.series.every((item) => Array.isArray(item) && item.length === 2 && !Array.isArray(item[0]))) payload.series = [{ data: payload.series }];
  if (payload.xLabel === undefined && axisName(payload.xAxis)) payload.xLabel = axisName(payload.xAxis);
  if (payload.yLabel === undefined && axisName(payload.yAxis)) payload.yLabel = axisName(payload.yAxis);
  for (const key of ['x', 'y', 'data', 'points', 'xAxis', 'yAxis']) delete payload[key];
  if (payload.categories !== undefined) { delete payload.categories; warnings.push('Ignored categories: scatter plots use explicit [x,y] points.'); }
  if (!Array.isArray(payload.series)) return;
  let dropped = 0;
  payload.series = payload.series.map((item) => {
    if (Array.isArray(item)) item = { data: item };
    if (!isRecord(item)) return item;
    const entry = { ...item };
    if (!entry.name) entry.name = firstDefined(entry, ['title', 'label']);
    if (!Array.isArray(entry.data)) {
      if (Array.isArray(entry.x) && Array.isArray(entry.y)) entry.data = zipPoints(entry.x, entry.y);
      else if (Array.isArray(entry.points)) entry.data = entry.points;
      else if (Array.isArray(entry.values)) entry.data = entry.values;
    }
    for (const key of ['title', 'label', 'x', 'y', 'points', 'values']) delete entry[key];
    dropUndefined(entry);
    if (!Array.isArray(entry.data)) return entry;
    const points = [];
    for (const point of entry.data) {
      const pair = Array.isArray(point) ? point : isRecord(point) ? [point.x, point.y] : null;
      const x = pair ? coerceNumber(pair[0]) : undefined;
      const y = pair ? coerceNumber(pair[1]) : undefined;
      if (typeof x === 'number' && typeof y === 'number') points.push([x, y]); else dropped += 1;
    }
    entry.data = points.length > MAX_VISUALIZATION_POINTS ? sampleIndexes(points.length, MAX_VISUALIZATION_POINTS).map((index) => points[index]) : points;
    if (points.length > MAX_VISUALIZATION_POINTS) warnings.push(`Downsampled ${points.length} points to ${MAX_VISUALIZATION_POINTS}.`);
    return entry;
  });
  if (dropped) warnings.push(`Ignored ${plural(dropped, 'point')} without numeric x and y.`);
}

function normalizeHeatmapPayload(payload, warnings) {
  if (!Array.isArray(payload.xCategories)) {
    const xs = firstDefined(payload, ['xLabels', 'columns', 'x_categories']) ?? axisCategories(payload.xAxis) ?? (Array.isArray(payload.x) ? payload.x : undefined);
    if (xs !== undefined) payload.xCategories = xs;
  }
  if (!Array.isArray(payload.yCategories)) {
    const ys = firstDefined(payload, ['yLabels', 'rows', 'y_categories']) ?? axisCategories(payload.yAxis) ?? (Array.isArray(payload.y) ? payload.y : undefined);
    if (ys !== undefined) payload.yCategories = ys;
  }
  const raw = payload.values ?? firstDefined(payload, ['matrix', 'z', 'data']);
  const triples = Array.isArray(raw) && raw.length > 0 && raw.every((item) => (Array.isArray(item) && item.length === 3) || (isRecord(item) && 'x' in item && 'y' in item));
  if (triples) {
    const cells = raw.map((item) => (Array.isArray(item) ? item : [item.x, item.y, item.value ?? item.v ?? item.z]));
    const isDeclaredMatrix = Array.isArray(payload.xCategories) && Array.isArray(payload.yCategories) && payload.xCategories.length === 3 && raw.length === payload.yCategories.length && Array.isArray(payload.values);
    if (!isDeclaredMatrix) {
      const xCats = Array.isArray(payload.xCategories) ? payload.xCategories.map(categoryOf) : [];
      const yCats = Array.isArray(payload.yCategories) ? payload.yCategories.map(categoryOf) : [];
      const indexIn = (list, key, declared) => {
        if (typeof key === 'number' && Number.isInteger(key) && declared && key >= 0 && key < list.length) return key;
        const label = categoryOf(key);
        let position = list.findIndex((item) => String(item) === String(label));
        if (position < 0 && !declared) { list.push(label); position = list.length - 1; }
        return position;
      };
      const xDeclared = xCats.length > 0;
      const yDeclared = yCats.length > 0;
      const placed = cells.map(([x, y, v]) => [indexIn(xCats, x, xDeclared), indexIn(yCats, y, yDeclared), coerceNumber(v)]);
      const matrix = yCats.map(() => xCats.map(() => null));
      let dropped = 0;
      for (const [xi, yi, value] of placed) {
        if (xi < 0 || yi < 0 || value === undefined) { dropped += 1; continue; }
        matrix[yi].splice(xi, 1, value);
      }
      payload.xCategories = xCats;
      payload.yCategories = yCats;
      payload.values = matrix;
      if (dropped) warnings.push(`Ignored ${plural(dropped, 'heatmap cell')} outside the categories.`);
    }
  } else if (raw !== undefined) payload.values = raw;
  for (const key of ['xLabels', 'columns', 'x_categories', 'yLabels', 'rows', 'y_categories', 'xAxis', 'yAxis', 'x', 'y', 'matrix', 'z', 'data']) delete payload[key];
  if (Array.isArray(payload.xCategories)) payload.xCategories = payload.xCategories.map(categoryOf);
  if (Array.isArray(payload.yCategories)) payload.yCategories = payload.yCategories.map(categoryOf);
  if (Array.isArray(payload.values)) {
    const stats = { coerced: 0, dropped: 0 };
    payload.values = payload.values.map((row) => (Array.isArray(row) ? coerceNumbers(row, stats) : row));
    if (stats.dropped) warnings.push(`Ignored ${plural(stats.dropped, 'non-numeric heatmap cell')}.`);
    if (Array.isArray(payload.xCategories) && Array.isArray(payload.yCategories)) {
      const width = payload.xCategories.length;
      let changed = false;
      payload.values = payload.yCategories.map((_, rowIndex) => {
        const row = Array.isArray(payload.values[rowIndex]) ? payload.values[rowIndex] : [];
        if (row.length !== width) changed = true;
        return row.length >= width ? row.slice(0, width) : [...row, ...Array(width - row.length).fill(null)];
      });
      if (changed) warnings.push('Resized heatmap rows to match the categories.');
    }
  }
}

const FUNCTION_NAMES = ['asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'floor', 'round', 'ceil', 'sin', 'cos', 'tan', 'exp', 'abs', 'log', 'ln'];
const SYMBOLS = ['pi', 'x', 'e'];

function splitIdentifier(word) {
  const parts = [];
  let rest = word.toLowerCase();
  while (rest) {
    const name = FUNCTION_NAMES.find((candidate) => rest.startsWith(candidate)) || SYMBOLS.find((candidate) => rest.startsWith(candidate));
    if (!name) return null;
    parts.push({ type: FUNCTION_NAMES.includes(name) ? 'fn' : 'sym', text: name });
    rest = rest.slice(name.length);
  }
  return parts;
}

export function normalizeFunctionExpression(source) {
  let text = String(source ?? '').trim();
  while (text.startsWith('$')) text = text.slice(1);
  while (text.endsWith('$')) text = text.slice(0, -1);
  text = text.trim();
  text = text.replace(/^(?:y|[fgh]\s*\(\s*x\s*\))\s*=\s*/i, '');
  text = text
    .replace(/[\u2212\u2013\uFF0D]/g, '-')
    .replace(/[\u00D7\u00B7\u22C5\u2217]/g, '*')
    .replace(/\u00F7/g, '/')
    .replace(/\u03C0/g, 'pi')
    .replace(/\u221A\s*\(/g, 'sqrt(')
    .replace(/\u221A\s*([A-Za-z0-9.]+)/g, 'sqrt($1)')
    .replace(/\u00B2/g, '^2').replace(/\u00B3/g, '^3')
    .replace(/\*\*/g, '^')
    .replace(/\\cdot|\\times/g, '*')
    .replace(/\\pi/g, 'pi')
    .replace(/\\(sin|cos|tan|ln|log|sqrt|exp)/g, '$1')
    .replace(/[{}]/g, (ch) => (ch === '{' ? '(' : ')'));
  const tokens = [];
  const pattern = /\s*(?:(\d+\.?\d*|\.\d+)|([A-Za-z]+)|(.))/gy;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match[0] === '') break;
    if (match[1]) tokens.push({ type: 'num', text: match[1] });
    else if (match[2]) {
      const parts = splitIdentifier(match[2]);
      if (!parts) tokens.push({ type: 'word', text: match[2] }); else tokens.push(...parts);
    } else if (match[3] && match[3].trim()) tokens.push({ type: match[3] === '(' ? 'open' : match[3] === ')' ? 'close' : 'op', text: match[3] });
    if (pattern.lastIndex >= text.length) break;
  }
  const endsValue = (token) => token && (token.type === 'num' || token.type === 'sym' || token.type === 'close' || token.type === 'word');
  const startsValue = (token) => token && (token.type === 'num' || token.type === 'sym' || token.type === 'fn' || token.type === 'open' || token.type === 'word');
  let output = '';
  tokens.forEach((token, index) => {
    const previous = tokens[index - 1];
    if (endsValue(previous) && startsValue(token) && !(previous.type === 'num' && token.type === 'num')) output += '*';
    output += token.text;
  });
  return output;
}

function normalizeFunctionPayload(payload, warnings) {
  if (!Array.isArray(payload.functions)) {
    const expression = firstDefined(payload, ['expression', 'expr', 'formula', 'equation', 'eq', 'expressions']);
    if (typeof expression === 'string') payload.functions = [{ expression }];
    else if (Array.isArray(expression)) payload.functions = expression;
    else if (isRecord(payload.functions)) payload.functions = [payload.functions];
  }
  for (const key of ['expression', 'expr', 'formula', 'equation', 'eq', 'expressions']) delete payload[key];
  if (payload.xLabel === undefined && axisName(payload.xAxis)) payload.xLabel = axisName(payload.xAxis);
  if (payload.yLabel === undefined && axisName(payload.yAxis)) payload.yLabel = axisName(payload.yAxis);
  const sharedDomain = firstDefined(payload, ['domain', 'xRange', 'x_range', 'xDomain']);
  for (const key of ['domain', 'xRange', 'x_range', 'xDomain', 'xAxis', 'yAxis']) delete payload[key];
  if (!Array.isArray(payload.functions)) return;
  payload.functions = payload.functions.map((item) => {
    if (typeof item === 'string') item = { expression: item };
    if (!isRecord(item)) return item;
    const fn = { ...item };
    if (!fn.expression) fn.expression = firstDefined(fn, ['expr', 'formula', 'equation', 'eq', 'fn', 'f']);
    if (!fn.label) fn.label = firstDefined(fn, ['name', 'title']);
    if (!fn.domain) fn.domain = firstDefined(fn, ['xRange', 'range', 'x_range']) ?? sharedDomain;
    for (const key of ['expr', 'formula', 'equation', 'eq', 'fn', 'f', 'name', 'title', 'xRange', 'range', 'x_range']) delete fn[key];
    if (fn.label !== undefined && typeof fn.label !== 'string') fn.label = String(fn.label);
    if (typeof fn.label === 'string' && fn.label.length > 80) fn.label = fn.label.slice(0, 80);
    if (fn.domain === undefined || fn.domain === null) delete fn.domain;
    else if (isRecord(fn.domain)) fn.domain = [fn.domain.min ?? fn.domain.from, fn.domain.max ?? fn.domain.to];
    if (Array.isArray(fn.domain)) {
      const domain = fn.domain.slice(0, 2).map((value) => coerceNumber(typeof value === 'string' ? value.replace(/pi/i, String(Math.PI)) : value));
      if (domain.length === 2 && domain.every((value) => typeof value === 'number')) {
        if (domain[0] > domain[1]) { domain.reverse(); warnings.push('Swapped a reversed function domain.'); }
        fn.domain = domain;
        if (domain[0] === domain[1]) delete fn.domain;
      }
    }
    if (typeof fn.expression === 'string') {
      const original = fn.expression;
      let valid = true;
      try { parseFunctionExpression(original); } catch { valid = false; }
      if (!valid) {
        const rewritten = normalizeFunctionExpression(original);
        try { parseFunctionExpression(rewritten); fn.expression = rewritten; if (!fn.label) fn.label = original.trim().slice(0, 80); } catch { }
      }
    }
    return dropUndefined(fn);
  });
}

function normalizeGraphPayload(payload, warnings) {
  if (!Array.isArray(payload.nodes)) {
    const nodes = firstDefined(payload, ['vertices', 'participants', 'states', 'steps', 'items']);
    if (Array.isArray(nodes)) payload.nodes = nodes;
  }
  if (!Array.isArray(payload.edges)) {
    const edges = firstDefined(payload, ['links', 'connections', 'messages', 'transitions', 'relations']);
    if (Array.isArray(edges)) payload.edges = edges; else if (Array.isArray(payload.nodes)) payload.edges = [];
  }
  for (const key of ['vertices', 'participants', 'states', 'steps', 'links', 'connections', 'messages', 'transitions', 'relations']) delete payload[key];
  if (Array.isArray(payload.nodes) && payload.items !== undefined) delete payload.items;
  if (payload.direction !== undefined) {
    const direction = String(payload.direction).toLowerCase();
    if (['lr', 'rl', 'horizontal', 'left-right', 'row'].includes(direction)) payload.direction = 'horizontal';
    else if (['tb', 'td', 'bt', 'vertical', 'top-bottom', 'column'].includes(direction)) payload.direction = 'vertical';
    else delete payload.direction;
  }
  if (!Array.isArray(payload.nodes)) return;
  const idMap = new Map();
  const labelMap = new Map();
  const used = new Set();
  let renamed = 0;
  const nodes = payload.nodes.map((item, index) => {
    if (typeof item === 'string' || typeof item === 'number') item = { id: String(item), label: String(item) };
    if (!isRecord(item)) return item;
    const node = { ...item };
    if (!node.label) node.label = firstDefined(node, ['name', 'title', 'text']);
    delete node.name; delete node.title; delete node.text;
    const original = node.id === undefined || node.id === null ? undefined : String(node.id);
    if (node.label === undefined || node.label === null || node.label === '') node.label = original ?? `Node ${index + 1}`;
    if (typeof node.label !== 'string') node.label = String(node.label);
    if (node.label.length > 160) node.label = `${node.label.slice(0, 159)}…`;
    let id = original;
    if (!id || !NODE_ID_RE.test(id) || used.has(id)) {
      const raw = String(id || '');
      let ascii = '';
      let previousUnderscore = false;
      for (const ch of raw) {
        const isAlphaNum = (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || isAsciiDigit(ch);
        if (isAlphaNum || ch === '_') {
          ascii += ch;
          previousUnderscore = ch === '_';
        } else if (!previousUnderscore) {
          ascii += '_';
          previousUnderscore = true;
        }
        if (ascii.length >= 60) break;
      }
      while (ascii.startsWith('_')) ascii = ascii.slice(1);
      while (ascii.endsWith('_')) ascii = ascii.slice(0, -1);
      let candidate = ascii || `n${index + 1}`;
      while (used.has(candidate)) candidate = `${candidate}_${index + 1}`;
      if (original !== undefined) renamed += 1;
      id = candidate;
    }
    used.add(id);
    if (original !== undefined && !idMap.has(original)) idMap.set(original, id);
    if (!labelMap.has(node.label)) labelMap.set(node.label, id);
    node.id = id;
    if (node.detail !== undefined && typeof node.detail !== 'string') node.detail = String(node.detail);
    if (typeof node.detail === 'string' && node.detail.length > 500) node.detail = node.detail.slice(0, 500);
    return dropUndefined(node);
  });
  payload.nodes = nodes;
  if (renamed) warnings.push(`Rewrote ${plural(renamed, 'node id')} to ASCII identifiers.`);
  if (!Array.isArray(payload.edges)) return;
  const resolve = (value) => {
    if (value === undefined || value === null) return value;
    const key = String(value);
    if (idMap.has(key)) return idMap.get(key);
    if (used.has(key)) return key;
    if (labelMap.has(key)) return labelMap.get(key);
    return key;
  };
  payload.edges = payload.edges.map((item) => {
    if (Array.isArray(item) && item.length >= 2) item = { from: item[0], to: item[1], label: item[2] };
    if (!isRecord(item)) return item;
    const edge = { ...item };
    if (edge.from === undefined || edge.from === null) edge.from = firstDefined(edge, ['source', 'start', 'parent']);
    if (edge.to === undefined || edge.to === null) edge.to = firstDefined(edge, ['target', 'end', 'child']);
    delete edge.source; delete edge.target; delete edge.start; delete edge.end; delete edge.parent; delete edge.child;
    edge.from = resolve(edge.from);
    edge.to = resolve(edge.to);
    if (edge.label === undefined || edge.label === null || edge.label === '') delete edge.label;
    else if (typeof edge.label !== 'string') edge.label = String(edge.label);
    if (typeof edge.label === 'string' && edge.label.length > 120) edge.label = edge.label.slice(0, 120);
    return dropUndefined(edge);
  });
}

function normalizeItems(template, payload, warnings) {
  if (!Array.isArray(payload.items)) {
    const items = firstDefined(payload, ['events', 'steps', 'options', 'alternatives', 'points', 'entries']);
    if (Array.isArray(items)) payload.items = items;
  }
  for (const key of ['events', 'steps', 'options', 'alternatives', 'entries']) delete payload[key];
  if (template === 'number_line') delete payload.points;
  if (!Array.isArray(payload.items)) return;
  payload.items = payload.items.map((item) => {
    if (typeof item === 'string' || typeof item === 'number') return template === 'number_line' && typeof item === 'number' ? { label: String(item), value: item } : { label: String(item) };
    if (!isRecord(item)) return item;
    const entry = { ...item };
    if (!entry.label) entry.label = firstDefined(entry, ['name', 'title', 'text', 'event', 'step']);
    if (entry.value === undefined) entry.value = firstDefined(entry, ['date', 'time', 'year', 'when']);
    if (!entry.detail) entry.detail = firstDefined(entry, ['description', 'desc', 'note']);
    for (const key of ['name', 'title', 'text', 'event', 'step', 'date', 'time', 'year', 'when', 'description', 'desc', 'note']) delete entry[key];
    if (entry.detail === undefined || entry.detail === null) delete entry.detail;
    else if (typeof entry.detail !== 'string') entry.detail = String(entry.detail);
    if (typeof entry.detail === 'string' && entry.detail.length > 500) entry.detail = entry.detail.slice(0, 500);
    if (entry.label !== undefined && entry.label !== null && typeof entry.label !== 'string') entry.label = String(entry.label);
    if ((entry.label === undefined || entry.label === null || entry.label === '') && entry.value !== undefined) entry.label = String(entry.value);
    if (typeof entry.label === 'string' && entry.label.length > 160) entry.label = `${entry.label.slice(0, 159)}…`;
    if (entry.value === null) delete entry.value;
    if (template === 'number_line' && entry.value !== undefined) {
      const number = coerceNumber(entry.value);
      if (typeof number === 'number') entry.value = number;
    } else if (typeof entry.value === 'string' && entry.value.length > 120) entry.value = entry.value.slice(0, 120);
    return dropUndefined(entry);
  });
  const limit = VISUALIZATION_ITEM_LIMITS[template];
  if (limit && payload.items.length > limit[1]) {
    warnings.push(`Kept the first ${limit[1]} of ${payload.items.length} ${template.replace('_', ' ')} items.`);
    payload.items = payload.items.slice(0, limit[1]);
  }
}

export function normalizeVisualizationSpec(input) {
  const warnings = [];
  if (!isRecord(input)) return { spec: input, warnings };
  let normalized;
  try { normalized = normalizeEnvelope(JSON.parse(JSON.stringify(input))); } catch { return { spec: input, warnings }; }
  const template = normalized.template;
  const payload = normalized.payload;
  try {
    if (template === 'function') normalizeFunctionPayload(payload, warnings);
    else if (template === 'scatter') normalizeScatterPayload(payload, warnings);
    else if (template === 'heatmap') normalizeHeatmapPayload(payload, warnings);
    else if (CATEGORY_TEMPLATES.includes(template)) normalizeCategoryPayload(template, payload, warnings);
    else if (GRAPH_TEMPLATES.includes(template)) normalizeGraphPayload(payload, warnings);
    if (['timeline', 'comparison', 'process', 'number_line', 'whiteboard'].includes(template) || Array.isArray(payload.items)) normalizeItems(template, payload, warnings);
  } catch { }
  return { spec: normalized, warnings: [...new Set(warnings)].slice(0, 8) };
}

export function visualizationTableRows(input) {
  const { spec } = normalizeVisualizationSpec(input);
  if (!isRecord(spec) || !isRecord(spec.payload)) return [];
  const payload = spec.payload;
  const template = spec.template;
  const cell = (value) => (value === undefined ? null : typeof value === 'number' || value === null ? value : String(value));
  if (template === 'scatter' && Array.isArray(payload.series)) {
    const rows = [['series', 'x', 'y']];
    payload.series.forEach((entry, index) => { if (isRecord(entry) && Array.isArray(entry.data)) entry.data.forEach((point) => { if (Array.isArray(point)) rows.push([entry.name || `Series ${index + 1}`, cell(point[0]), cell(point[1])]); }); });
    return rows.length > 1 ? rows : [];
  }
  if (template === 'heatmap' && Array.isArray(payload.values) && Array.isArray(payload.xCategories)) {
    const rows = [['', ...payload.xCategories.map(cell)]];
    payload.values.forEach((row, index) => { if (Array.isArray(row)) rows.push([cell((payload.yCategories || [])[index] ?? index + 1), ...row.map(cell)]); });
    return rows.length > 1 ? rows : [];
  }
  if (template === 'radar' && Array.isArray(payload.indicators) && Array.isArray(payload.series)) {
    const series = payload.series.filter((entry) => isRecord(entry) && Array.isArray(entry.data));
    const rows = [['indicator', ...series.map((entry, index) => entry.name || `Series ${index + 1}`)]];
    payload.indicators.forEach((indicator, index) => rows.push([cell(isRecord(indicator) ? indicator.name : indicator), ...series.map((entry) => cell(entry.data[index]))]));
    return rows.length > 1 ? rows : [];
  }
  if (CATEGORY_TEMPLATES.includes(template) && Array.isArray(payload.series)) {
    const series = payload.series.filter((entry) => isRecord(entry) && Array.isArray(entry.data));
    if (!series.length) return [];
    const length = Math.max(...series.map((entry) => entry.data.length), Array.isArray(payload.categories) ? payload.categories.length : 0);
    const rows = [['category', ...series.map((entry, index) => entry.name || `Series ${index + 1}`)]];
    for (let index = 0; index < length; index += 1) rows.push([cell(Array.isArray(payload.categories) ? payload.categories[index] ?? index + 1 : index + 1), ...series.map((entry) => { const value = entry.data[index]; return Array.isArray(value) ? value.join(' / ') : cell(value); })]);
    return rows;
  }
  if (Array.isArray(payload.items) && payload.items.length) {
    const rows = [['label', 'value', 'detail']];
    payload.items.forEach((item) => { if (isRecord(item)) rows.push([cell(item.label), cell(item.value), cell(item.detail)]); });
    return rows.length > 1 ? rows : [];
  }
  if (Array.isArray(payload.nodes) && payload.nodes.length) {
    const rows = [['from', 'to', 'label']];
    const labels = new Map(payload.nodes.filter(isRecord).map((node) => [node.id, node.label]));
    (Array.isArray(payload.edges) ? payload.edges : []).forEach((edge) => { if (isRecord(edge)) rows.push([cell(labels.get(edge.from) ?? edge.from), cell(labels.get(edge.to) ?? edge.to), cell(edge.label)]); });
    return rows.length > 1 ? rows : [];
  }
  return [];
}
