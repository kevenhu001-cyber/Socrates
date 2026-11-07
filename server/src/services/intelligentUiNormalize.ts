/**
 * Shape normalization for `render_intelligent_ui` arguments.
 *
 * Some providers serialize tool arguments as XML-ish markup and the transport
 * turns repeated elements into `{item: [...]}` objects while every scalar
 * arrives as a string. The declared schema only covers the top level, so a
 * demonstration program (a free-form object) reached validation with
 * `parameters: {item: [...]}`, `x: {item: ["-0.003", "0.003"]}` and
 * `version: "1"` and was rejected even though the model's intent was correct.
 *
 * This module repairs those encodings without weakening the contract: it only
 * unwraps item collections, coerces numbers in known numeric positions, and
 * defaults the demonstration version. Anything else still fails validation and
 * gets a targeted correction.
 */

type JsonRecord = Record<string, unknown>;

const ITEM_KEYS = new Set(['item', 'items']);

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** `{item: X}` / `{items: [...]}` → an array; arrays are normalized item-wise. */
function asArray(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(asArray);
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !ITEM_KEYS.has(keys[0])) return value;
  const inner = value[keys[0]];
  return Array.isArray(inner) ? inner.map(asArray) : [asArray(inner)];
}

/** A numeric position accepts `12`, `"12"` and `"12.5"`; expressions stay text. */
function numberLike(value: unknown): unknown {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return value;
}

function numberEntries(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numberLike(item)]));
}

function normalizeView(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const view: JsonRecord = { ...raw };
  for (const key of ['x', 'y', 'tint', 'vector']) {
    const list = asArray(view[key]);
    if (Array.isArray(list)) view[key] = list.map(numberLike);
  }
  if (view.height !== undefined) view.height = numberLike(view.height);
  for (const key of ['curves', 'markers', 'values']) {
    const list = asArray(view[key]);
    if (!Array.isArray(list)) continue;
    view[key] = key === 'markers'
      ? list.map((marker) => isRecord(marker) ? { ...marker, x: numberLike(marker.x), y: numberLike(marker.y) } : marker)
      : key === 'values'
        ? list.map((metric) => isRecord(metric) ? { ...metric, digits: numberLike(metric.digits) } : metric)
        : list;
  }
  return view;
}

/** Repair the free-form demonstration program before the strict validator runs. */
export function normalizeDemonstrationProgram(program: unknown): unknown {
  let source = program;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch { return program; }
  }
  if (!isRecord(source)) return program;
  const out: JsonRecord = { ...source };
  /* Version 1 is the only program version; an omitted or quoted version is
     a serialization artifact, not a different contract. */
  if (out.version === undefined) out.version = 1;
  else out.version = numberLike(out.version);

  const parameters = asArray(out.parameters);
  if (Array.isArray(parameters)) {
    out.parameters = parameters.map((parameter) => isRecord(parameter) ? {
      ...parameter,
      min: numberLike(parameter.min),
      max: numberLike(parameter.max),
      value: numberLike(parameter.value),
      step: numberLike(parameter.step),
    } : parameter);
  }
  const views = asArray(out.views);
  if (Array.isArray(views)) out.views = views.map(normalizeView);
  if (out.duration !== undefined) out.duration = numberLike(out.duration);
  const presets = asArray(out.presets);
  if (Array.isArray(presets)) {
    out.presets = presets.map((preset) => isRecord(preset) ? { ...preset, values: numberEntries(preset.values) } : preset);
  }
  if (isRecord(out.dynamics)) {
    out.dynamics = {
      ...out.dynamics,
      duration: numberLike(out.dynamics.duration),
      step: numberLike(out.dynamics.step),
      initial: numberEntries(out.dynamics.initial),
    };
  }
  return out;
}

/** Normalize one node; unknown fields pass through untouched. */
export function normalizeIntelligentUiNode(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const node: JsonRecord = { ...raw };
  if (typeof node.id === 'string') node.id = node.id.trim();
  if (typeof node.parent === 'string') node.parent = node.parent.trim();
  if (typeof node.type === 'string') node.type = node.type.trim().toLowerCase();
  if (node.type === 'demonstration') node.program = normalizeDemonstrationProgram(node.program);
  if (node.type === 'openui' && node.source !== undefined) {
    /* A multiline source can arrive split into one <item> per line. */
    const lines = asArray(node.source);
    if (Array.isArray(lines) && lines.every((line) => typeof line === 'string')) node.source = lines.join('\n');
  }
  if (node.type === 'physics') {
    node.parameters = numberEntries(node.parameters);
    for (const key of ['separation', 'wavelength', 'aperture']) {
      if (node[key] !== undefined) node[key] = numberLike(node[key]);
    }
  }
  return node;
}

/** Normalize a whole `render_intelligent_ui` document. */
export function normalizeIntelligentUiArgs(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const nodes = asArray(value.nodes);
  if (!Array.isArray(nodes)) return value;
  return {
    ...value,
    version: value.version === undefined ? 1 : numberLike(value.version),
    nodes: nodes.map(normalizeIntelligentUiNode),
  };
}

/** Normalize `patch_intelligent_ui` operations; `props` replace whole fields. */
export function normalizeIntelligentUiPatchArgs(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.operations)) return value;
  return {
    ...value,
    operations: value.operations.map((operation) => {
      if (!isRecord(operation)) return operation;
      const next: JsonRecord = { ...operation };
      if (next.node !== undefined) next.node = normalizeIntelligentUiNode(next.node);
      if (isRecord(next.props) && 'program' in next.props) {
        next.props = { ...next.props, program: normalizeDemonstrationProgram(next.props.program) };
      }
      return next;
    }),
  };
}
