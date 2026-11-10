/**
 * Shared DOM-free normalization for Intelligent UI arguments and nodes.
 *
 * Coerces numbers in known positions, unwraps `{ item: [...] }` wrappers,
 * maps aliases (e.g. `kind` -> `template`, `data` -> `payload`),
 * defaults unambiguous fields, and normalizes learning and control structures.
 */

import { normalizeIntelligentUiControl } from './intelligentUiControls.js';
import { normalizeLearningUiNode } from './learningUi.js';
import { normalizeDemonstrationProgram } from './demonstration.js';

const ITEM_KEYS = new Set(['item', 'items']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** `{item: X}` / `{items: [...]}` -> an array; arrays are normalized item-wise. */
export function asArray(value) {
  if (Array.isArray(value)) return value.map(asArray);
  if (!isRecord(value)) return value;
  const keys = Object.keys(value);
  if (keys.length !== 1 || !ITEM_KEYS.has(keys[0])) return value;
  const inner = value[keys[0]];
  return Array.isArray(inner) ? inner.map(asArray) : [asArray(inner)];
}

/** A numeric position accepts `12`, `"12"` and `"12.5"`; expressions stay text. */
export function numberLike(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed && Number.isFinite(Number(trimmed))) return Number(trimmed);
  }
  return value;
}

function numberEntries(value) {
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, numberLike(item)]));
}

/** Normalize one node; unknown fields pass through untouched. */
export function normalizeIntelligentUiNode(raw) {
  if (!isRecord(raw)) return raw;
  const node = { ...raw };
  if (typeof node.id === 'string') node.id = node.id.trim();
  if (typeof node.parent === 'string') node.parent = node.parent.trim();
  if (typeof node.type === 'string') node.type = node.type.trim().toLowerCase();

  if (node.type === 'demonstration' && node.program !== undefined) {
    node.program = normalizeDemonstrationProgram(node.program);
  }

  if (node.type === 'openui' && node.source !== undefined) {
    const lines = asArray(node.source);
    if (Array.isArray(lines) && lines.every((line) => typeof line === 'string')) {
      node.source = lines.join('\n');
    }
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

  if (node.type === 'table') {
    if (node.rows === undefined) {
      node.rows = [];
    }
    if (Array.isArray(node.columns)) {
      node.columns = node.columns.map((col, index) => {
        if (typeof col === 'string') return col;
        if (isRecord(col)) {
          const colKey = col.key ?? col.id ?? col.name ?? col.title ?? `col-${index}`;
          const colLabel = col.label ?? col.title ?? col.name ?? colKey;
          return { ...col, key: String(colKey), label: String(colLabel) };
        }
        return col;
      });
    }
  }

  if (node.type === 'chart') {
    if (!node.kind) node.kind = 'bar';
  }

  if (node.type === 'physics') {
    node.parameters = numberEntries(node.parameters);
    for (const key of ['separation', 'wavelength', 'aperture']) {
      if (node[key] !== undefined) node[key] = numberLike(node[key]);
    }
  }

  return normalizeLearningUiNode(normalizeIntelligentUiControl(node));
}

/** Normalize a whole `render_intelligent_ui` document. */
export function normalizeIntelligentUiArgs(value) {
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
export function normalizeIntelligentUiPatchArgs(value) {
  if (!isRecord(value) || !Array.isArray(value.operations)) return value;
  return {
    ...value,
    operations: value.operations.map((operation) => {
      if (!isRecord(operation)) return operation;
      const next = { ...operation };
      if (next.node !== undefined) next.node = normalizeIntelligentUiNode(next.node);
      if (isRecord(next.props) && 'program' in next.props) {
        next.props = { ...next.props, program: normalizeDemonstrationProgram(next.props.program) };
      }
      return next;
    }),
  };
}
