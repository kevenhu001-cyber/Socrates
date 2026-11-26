import { record, finite, range, located, at } from '../foundation.js';
import { name } from '../expression/functions.js';
import { normalizeDemonstrationExpression, normalizeDemonstrationIdentifier } from '../expression/parser.js';

/* ---------- Program normalization ---------- */
const ITEM_KEYS = new Set(['item', 'items']);
/** `{item: X}` / `{items: [...]}` (XML-encoded tool arguments) → an array. */
function asArray(value) {
  if (Array.isArray(value)) return value;
  if (!record(value)) return value;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !ITEM_KEYS.has(keys[0])) return value;
  const inner = value[keys[0]];
  return Array.isArray(inner) ? inner : [inner];
}
/** Numeric positions accept 12 and "12"; anything else is left for the validator. */
function numberLike(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return value;
}
const booleanLike = (value) => (value === 'true' ? true : value === 'false' ? false : value);
/** Expressions accept numbers, numeric strings and mathematical strings. */
function expressionLike(value) {
  if (typeof value === 'string') {
    const number = numberLike(value);
    return typeof number === 'number' ? number : normalizeDemonstrationExpression(value);
  }
  return value;
}
const textLike = (value) =>
  typeof value === 'number'
    ? String(value)
    : typeof value === 'string'
      ? value.slice(0, 200)
      : value;
const first = (object, keys) => {
  for (const key of keys) if (object[key] !== undefined) return object[key];
  return undefined;
};
/** `{a: 1}` stays a map; `[{name:"a", expression:1}]` becomes one. */
function namedMap(value, valueKeys) {
  const list = asArray(value);
  if (!Array.isArray(list))
    return record(list)
      ? Object.fromEntries(
          Object.entries(list).map(([key, item]) => [normalizeDemonstrationIdentifier(key), item]),
        )
      : list;
  const out = {};
  for (const item of list) {
    if (!record(item)) return list;
    const key = first(item, ['name', 'id', 'key', 'state']);
    if (typeof key !== 'string') return list;
    out[normalizeDemonstrationIdentifier(key)] = first(item, valueKeys);
  }
  return out;
}
const mapValues = (value, fn) =>
  record(value)
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, fn(item)]))
    : value;
/** Two-element numeric/expression range; {min,max} objects are accepted too. */
function rangeLike(value) {
  let list = asArray(value);
  if (record(list) && (list.min !== undefined || list.max !== undefined))
    list = [list.min, list.max];
  if (!Array.isArray(list)) return value;
  list = list.map(expressionLike);
  if (list.length === 2 && list.every(finite)) {
    let [a, b] = list;
    if (a > b) [a, b] = [b, a];
    if (a === b) {
      const pad = a === 0 ? 1 : Math.abs(a) * 0.1;
      a -= pad;
      b += pad;
    }
    list = [a, b];
  }
  return list;
}
const VIEW_KINDS = {
  scene: 'scene',
  plot: 'plot',
  graph: 'plot',
  chart: 'plot',
  line: 'plot',
  curve: 'plot',
  curves: 'plot',
  function: 'plot',
  field: 'field',
  heatmap: 'field',
  image: 'field',
  raster: 'field',
  map: 'field',
  trajectory: 'trajectory',
  phase: 'trajectory',
  orbit: 'trajectory',
  path: 'trajectory',
  metrics: 'metrics',
  metric: 'metrics',
  readout: 'metrics',
  readouts: 'metrics',
  values: 'metrics',
  controls: 'controls',
  control: 'controls',
  sliders: 'controls',
  parameters: 'controls',
};
function normalizeParameter(raw) {
  if (!record(raw)) return raw;
  const p = { ...raw };
  const id = first(p, ['id', 'name', 'key']);
  if (typeof id === 'string') p.id = normalizeDemonstrationIdentifier(id);
  delete p.name;
  delete p.key;
  for (const key of ['label', 'unit']) if (p[key] !== undefined) p[key] = textLike(p[key]);
  if (
    (p.label === undefined || p.label === null || p.label === '') &&
    typeof p.id === 'string' &&
    p.id
  )
    p.label = p.id;
  let min = numberLike(p.min),
    max = numberLike(p.max),
    value = numberLike(first(p, ['value', 'default', 'initial']));
  delete p.default;
  delete p.initial;
  if (finite(value) && !finite(min) && !finite(max)) {
    min = value > 0 ? 0 : value < 0 ? 2 * value : -1;
    max = value > 0 ? 2 * value : value < 0 ? 0 : 1;
  }
  if (finite(min) && finite(max)) {
    if (min > max) [min, max] = [max, min];
    if (min === max) {
      const pad = min === 0 ? 1 : Math.abs(min) * 0.5;
      min -= pad;
      max += pad;
    }
    if (!finite(value)) value = (min + max) / 2;
    value = Math.max(min, Math.min(max, value));
  }
  p.min = min;
  p.max = max;
  p.value = value;
  const step = numberLike(p.step);
  if (step === undefined || step === null || !finite(step) || step <= 0) delete p.step;
  else p.step = step;
  if (p.advanced !== undefined) p.advanced = booleanLike(p.advanced) === true;
  return p;
}
function normalizeView(raw) {
  if (typeof raw === 'string' && VIEW_KINDS[raw.trim().toLowerCase()])
    return { kind: VIEW_KINDS[raw.trim().toLowerCase()] };
  if (!record(raw)) return raw;
  const view = { ...raw };
  const kind = first(view, ['kind', 'type']);
  if (typeof kind === 'string') {
    const canonical = VIEW_KINDS[kind.trim().toLowerCase()];
    view.kind = canonical ?? kind;
    if (view.type === kind) delete view.type;
  }
  for (const key of ['label', 'xLabel', 'yLabel'])
    if (view[key] !== undefined) view[key] = textLike(view[key]);
  if (view.x === undefined && view.xRange !== undefined) {
    view.x = view.xRange;
    delete view.xRange;
  }
  if (view.y === undefined && view.yRange !== undefined) {
    view.y = view.yRange;
    delete view.yRange;
  }
  if (view.x === undefined && view.domain !== undefined && view.kind === 'plot') {
    view.x = view.domain;
    delete view.domain;
  }
  if (view.kind !== 'metrics' && view.kind !== 'controls') {
    if (view.x !== undefined) view.x = rangeLike(view.x);
    if (view.y !== undefined) view.y = rangeLike(view.y);
  }
  if (view.kind === 'plot') {
    if (view.sliceY !== undefined) view.sliceY = expressionLike(view.sliceY);
    let curves = asArray(view.curves);
    if (curves === undefined && view.expression !== undefined) {
      curves = [{ expression: view.expression }];
      delete view.expression;
    }
    if (typeof curves === 'string' || typeof curves === 'number' || record(curves))
      curves = [curves];
    if (Array.isArray(curves))
      view.curves = curves.map((curve) => {
        if (typeof curve === 'string' || typeof curve === 'number')
          return { expression: expressionLike(curve) };
        if (!record(curve)) return curve;
        const out = {
          ...curve,
          expression: expressionLike(
            first(curve, ['expression', 'expr', 'y', 'f', 'value', 'formula']),
          ),
        };
        for (const key of ['expr', 'y', 'f', 'value', 'formula']) delete out[key];
        if (out.label !== undefined) out.label = textLike(out.label);
        if (out.dashed !== undefined) out.dashed = booleanLike(out.dashed) === true;
        if (typeof out.color === 'string') out.color = out.color.trim().toLowerCase();
        return out;
      });
    const markers = asArray(view.markers);
    if (Array.isArray(markers))
      view.markers = markers.map((marker) =>
        record(marker)
          ? {
              ...marker,
              x: expressionLike(marker.x),
              y: expressionLike(marker.y),
              ...(marker.label !== undefined ? { label: textLike(marker.label) } : {}),
            }
          : marker,
      );
  }
  if (view.kind === 'scene') {
    const objects = asArray(view.objects);
    if (Array.isArray(objects))
      view.objects = objects.map((object) => {
        if (!record(object)) return object;
        const out = { ...object };
        for (const key of ['center', 'from', 'to']) {
          const point = asArray(out[key]);
          if (Array.isArray(point)) out[key] = point.map(expressionLike);
        }
        const points = asArray(out.points);
        if (Array.isArray(points))
          out.points = points.map((point) => {
            const pair = asArray(point);
            return Array.isArray(pair) ? pair.map(expressionLike) : pair;
          });
        for (const key of ['radius', 'width', 'height', 'angle'])
          if (out[key] !== undefined) out[key] = expressionLike(out[key]);
        if (out.label !== undefined) out.label = textLike(out.label);
        return out;
      });
  }
  if (view.kind === 'field') {
    if (view.expression !== undefined) view.expression = expressionLike(view.expression);
    for (const key of ['gamma', 'exposure', 'vectorScale'])
      if (view[key] !== undefined) view[key] = expressionLike(view[key]);
    if (view.colorRange !== undefined) view.colorRange = rangeLike(view.colorRange);
    if (view.zRange !== undefined) view.zRange = rangeLike(view.zRange);
    if(view.isoLevel!==undefined)view.isoLevel=expressionLike(view.isoLevel);
    if(record(view.slicePlane))view.slicePlane={...view.slicePlane,at:expressionLike(view.slicePlane.at)};
    if (view.parameterRange !== undefined) view.parameterRange = rangeLike(view.parameterRange);
    for(const key of ['uRange','vRange'])if(view[key]!==undefined)view[key]=rangeLike(view[key]);
    for(const key of ['curve3d','vector3d','surface3d']) if(Array.isArray(view[key])) view[key]=view[key].map(expressionLike);
    if (['curve3d','vectors3d','parametricSurface'].includes(view.presentation) && view.expression === undefined) view.expression=0;
    if (Array.isArray(view.contours)) view.contours = view.contours.map(expressionLike);
    const vector = asArray(view.vector);
    if (Array.isArray(vector)) view.vector = vector.map(expressionLike);
    const tint = asArray(view.tint);
    if (Array.isArray(tint))
      view.tint = tint
        .map(numberLike)
        .map((v) => (finite(v) ? Math.max(0, Math.min(1, v > 1 && v <= 255 ? v / 255 : v)) : v));
    if (view.height !== undefined) {
      const height = numberLike(view.height);
      view.height = finite(height) ? Math.max(64, Math.min(320, Math.round(height))) : height;
    }
    if (typeof view.palette === 'string') view.palette = view.palette.trim().toLowerCase();
  }
  if (view.kind === 'trajectory') {
    for (const key of ['horizontal', 'vertical'])
      if (view[key] !== undefined) view[key] = expressionLike(view[key]);
  }
  if (view.kind === 'metrics') {
    let values = asArray(view.values);
    if (values === undefined && view.metrics !== undefined) {
      values = asArray(view.metrics);
      delete view.metrics;
    }
    if (record(values)) values = [values];
    if (Array.isArray(values))
      view.values = values.map((metric) => {
        if (typeof metric === 'string' || typeof metric === 'number')
          return { label: '', expression: expressionLike(metric) };
        if (!record(metric)) return metric;
        const out = {
          ...metric,
          expression: expressionLike(first(metric, ['expression', 'expr', 'value', 'formula'])),
        };
        delete out.expr;
        delete out.value;
        delete out.formula;
        if (out.label !== undefined) out.label = textLike(out.label);
        else out.label = '';
        if (out.unit !== undefined) out.unit = textLike(out.unit);
        if (out.digits !== undefined) {
          const digits = numberLike(out.digits);
          out.digits = finite(digits) ? Math.max(0, Math.min(5, Math.round(digits))) : digits;
        }
        return out;
      });
  }
  return view;
}
/**
 * Repair a model-authored program before the strict validator runs: XML
 * `{item: [...]}` collections, quoted numbers, reversed or empty ranges,
 * parameter defaults outside their range, common field aliases and unicode
 * notation in expressions. It only changes encodings; anything it cannot
 * repair still fails validation with a located message. Idempotent.
 */
function normalizeDemonstrationProgram(input) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch {
      return input;
    }
  }
  if (!record(source)) return input;
  // A whole node {type:"demonstration", program:{...}} passed as the program.
  if (source.views === undefined && record(source.program)) source = source.program;
  const out = { ...source };
  out.version = out.version === undefined ? 1 : numberLike(out.version);
  if (typeof out.resetKey === 'number') out.resetKey = String(out.resetKey);
  let parameters = asArray(out.parameters);
  if (record(parameters))
    parameters = Object.entries(parameters).map(([id, spec]) =>
      record(spec) ? { id, ...spec } : { id, value: spec },
    );
  if (Array.isArray(parameters)) out.parameters = parameters.map(normalizeParameter);
  if (out.definitions !== undefined)
    out.definitions = mapValues(
      namedMap(out.definitions, ['expression', 'expr', 'value', 'formula']),
      expressionLike,
    );
  if (record(out.dynamics)) {
    const dynamics = { ...out.dynamics };
    dynamics.initial = mapValues(
      namedMap(dynamics.initial, ['value', 'initial', 'expression']),
      expressionLike,
    );
    dynamics.derivatives = mapValues(
      namedMap(dynamics.derivatives, ['expression', 'derivative', 'value', 'expr']),
      expressionLike,
    );
    let duration = numberLike(dynamics.duration),
      step = numberLike(dynamics.step);
    if (!['rk45', 'sdirk2', 'grid-implicit', 'ssa', 'grid-heun','verlet'].includes(dynamics.method)) {
      if (finite(duration) && duration > 30) duration = 30;
      if (finite(step)) step = Math.max(0.002, Math.min(0.05, step));
      if (finite(duration) && finite(step) && duration > 0 && Math.ceil(duration / step) > 10000)
        step = Math.min(0.05, duration / 10000);
    }
    for (const key of ['rtol', 'atol']) {
      if (dynamics[key] !== undefined) dynamics[key] = numberLike(dynamics[key]);
    }
    if (record(dynamics.algebraic)) {
      dynamics.algebraic = { ...dynamics.algebraic, guess: mapValues(dynamics.algebraic.guess, expressionLike), residuals: mapValues(dynamics.algebraic.residuals, expressionLike) };
      if (dynamics.algebraic.tolerance !== undefined) dynamics.algebraic.tolerance = numberLike(dynamics.algebraic.tolerance);
    }
    if (Array.isArray(dynamics.massMatrix))
      dynamics.massMatrix = dynamics.massMatrix.map((row) => Array.isArray(row) ? row.map(expressionLike) : row);
    if (Array.isArray(dynamics.events))
      dynamics.events = dynamics.events.map((event) =>
        record(event)
          ? { ...event, expression: expressionLike(event.expression),
              ...(event.rearmTolerance !== undefined ? {rearmTolerance:numberLike(event.rearmTolerance)} : {}),
              ...(record(event.reset) ? { reset: mapValues(event.reset, expressionLike) } : {}) }
          : event,
      );
    dynamics.duration = duration;
    dynamics.step = step;
    out.dynamics = dynamics;
  }
  let views = asArray(out.views);
  if (record(views) && (views.kind !== undefined || views.type !== undefined)) views = [views];
  if (Array.isArray(views)) out.views = views.map(normalizeView);
  if (out.duration !== undefined) {
    const duration = numberLike(out.duration);
    out.duration = finite(duration) && duration > 30 ? 30 : duration;
  }
  const presets = asArray(out.presets);
  if (Array.isArray(presets))
    out.presets = presets.map((preset) => {
      if (!record(preset)) return preset;
      const values = mapValues(namedMap(preset.values, ['value']), expressionLike);
      if (record(values) && Array.isArray(out.parameters))
        for (const [key, value] of Object.entries(values)) {
          const p = out.parameters.find((p) => record(p) && p.id === key);
          if (p && finite(value) && finite(p.min) && finite(p.max))
            values[key] = Math.max(p.min, Math.min(p.max, value));
        }
      return {
        ...preset,
        ...(preset.label !== undefined ? { label: textLike(preset.label) } : {}),
        values,
      };
    });
  return out;
}

export { normalizeDemonstrationProgram, numberLike, expressionLike, booleanLike, textLike, asArray };
