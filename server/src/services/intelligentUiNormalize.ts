import { normalizeLearningUiNode } from '../../../packages/core/src/learningUi.js';
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

import { normalizeDemonstrationProgram as normalizeCoreDemonstrationProgram } from '../../../packages/core/src/demonstration.js';

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

/** Repair the free-form demonstration program before the strict validator
 * runs. The core normalizer is shared with the browser, so a program recovered
 * from prose or history gets exactly the same repairs as a tool call. */
export function normalizeDemonstrationProgram(program: unknown): unknown {
  return normalizeCoreDemonstrationProgram(program);
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
  if (node.type === 'visualization') {
    if (typeof node.template !== 'string') {
      if (typeof node.kind === 'string') node.template = node.kind.trim();
      else if (typeof node.chartType === 'string') node.template = node.chartType.trim();
    }
    if (node.payload === undefined && isRecord(node.data)) {
      node.payload = node.data;
    }
    if (typeof node.accessibilitySummary !== 'string') {
      if (typeof node.accessibility_summary === 'string') node.accessibilitySummary = node.accessibility_summary;
      else if (typeof node.summary === 'string') node.accessibilitySummary = node.summary;
    }
  }
  if (node.type === 'physics') {
    node.parameters = numberEntries(node.parameters);
    for (const key of ['separation', 'wavelength', 'aperture']) {
      if (node[key] !== undefined) node[key] = numberLike(node[key]);
    }
  }
  return normalizeLearningUiNode(node);
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
