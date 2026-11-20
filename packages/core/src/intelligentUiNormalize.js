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

  // If node type is missing, infer from properties
  if (!node.type) {
    if (
      node.template ||
      node.chart ||
      node.chartType ||
      node.payload ||
      isRecord(node.data) ||
      isRecord(node.series) ||
      Array.isArray(node.series)
    ) {
      node.type = 'visualization';
    } else if (node.program) {
      node.type = 'demonstration';
    } else if (node.scene) {
      node.type = 'physics';
    } else if (node.source) {
      node.type = 'openui';
    } else if (
      typeof node.kind === 'string' &&
      ['quiz', 'practice', 'definition', 'flashcard', 'example', 'theorem'].includes(node.kind)
    ) {
      node.type = 'learning';
    }
  }

  if (node.type === 'demonstration' && node.program !== undefined) {
    node.program = normalizeDemonstrationProgram(node.program);
  }

  if (node.type === 'openui' && node.source !== undefined) {
    const lines = asArray(node.source);
    if (Array.isArray(lines) && lines.every((line) => typeof line === 'string')) {
      node.source = lines.join('\n');
    }
  }

  // Structured chart payloads use the same validation and renderer as
  // visualization nodes. Keep the separate chart type for bound point lists.
  if (node.type === 'chart' && (node.payload !== undefined || isRecord(node.data))) {
    node.type = 'visualization';
  }

  if (node.type === 'visualization') {
    if (!Object.hasOwn(node, 'id')) node.id = 'vis_' + Math.random().toString(36).slice(2, 8);
    if (typeof node.template === 'string') {
      node.template = node.template.trim();
    } else {
      if (typeof node.kind === 'string') node.template = node.kind.trim();
      else if (typeof node.chartType === 'string') node.template = node.chartType.trim();
      else if (typeof node.chart === 'string') node.template = node.chart.trim();
      else node.template = 'bar';
    }
    if (node.payload === undefined) {
      if (isRecord(node.data)) node.payload = node.data;
      else if (isRecord(node.series) || Array.isArray(node.series))
        node.payload = { series: node.series, categories: node.categories };
      else if (Array.isArray(node.categories))
        node.payload = { categories: node.categories, series: node.series || [] };
      else if (Array.isArray(node.functions)) node.payload = { functions: node.functions };
      else if (Array.isArray(node.nodes) && Array.isArray(node.edges))
        node.payload = { nodes: node.nodes, edges: node.edges };
    }
    if (typeof node.title !== 'string') {
      node.title = typeof node.template === 'string' ? node.template : 'Visualization';
    }
    if (typeof node.accessibilitySummary !== 'string') {
      if (typeof node.accessibility_summary === 'string')
        node.accessibilitySummary = node.accessibility_summary;
      else if (typeof node.summary === 'string') node.accessibilitySummary = node.summary;
      else node.accessibilitySummary = `${node.title || node.template || 'Data'} visualization`;
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

  if (node.type === 'image') {
    if (!Object.hasOwn(node, 'id')) node.id = 'img_' + Math.random().toString(36).slice(2, 8);
    if (!node.src && typeof node.url === 'string') node.src = node.url;
  }

  if (node.type === 'accordion') {
    if (!Object.hasOwn(node, 'id')) node.id = 'acc_' + Math.random().toString(36).slice(2, 8);
    if (!Array.isArray(node.items) && Array.isArray(node.sections)) node.items = node.sections;
  }

  if (node.type === 'steps') {
    if (!Object.hasOwn(node, 'id')) node.id = 'step_' + Math.random().toString(36).slice(2, 8);
    if (!Array.isArray(node.items) && Array.isArray(node.steps)) node.items = node.steps;
  }

  if (node.type === 'badge') {
    if (!Object.hasOwn(node, 'id')) node.id = 'badge_' + Math.random().toString(36).slice(2, 8);
    if (!node.label && node.text) node.label = node.text;
  }

  return normalizeLearningUiNode(normalizeIntelligentUiControl(node));
}

/** Normalize a whole `render_intelligent_ui` document. */
export function normalizeIntelligentUiArgs(value) {
  if (!isRecord(value)) return value;

  // Handle direct visualization call: e.g. { template: "bar", title: "Sales", payload: { ... } }
  // or { type: "visualization", ... } or { chart: "line", ... }
  if (
    !value.nodes &&
    (value.template !== undefined ||
      value.chart !== undefined ||
      value.chartType !== undefined ||
      value.type === 'visualization' ||
      (value.payload !== undefined && (value.title !== undefined || value.data !== undefined)))
  ) {
    const singleNode = normalizeIntelligentUiNode({
      id: value.id || 'vis_1',
      type: 'visualization',
      ...value,
    });
    return {
      version: value.version === undefined ? 1 : numberLike(value.version),
      nodes: [singleNode],
    };
  }

  // Handle { node: { ... } }
  if (!value.nodes && isRecord(value.node)) {
    return normalizeIntelligentUiArgs({
      version: value.version === undefined ? 1 : numberLike(value.version),
      nodes: [value.node],
    });
  }

  // Unwrap {item: [...]}/{items: [...]} before treating an object as one node.
  const unwrapped = asArray(value.nodes);
  const nodes = isRecord(unwrapped) ? [unwrapped] : unwrapped;
  if (!Array.isArray(nodes)) return value;
  // docs/plans/2026-11-20-compact-ui-contract.md.
  // Reserve every explicit ID first; generate only for absent IDs.
  // Invalid explicitly supplied IDs must still fail ordinary validation.
  const reserved = new Set(
    nodes
      .filter(isRecord)
      .map((node) => (typeof node.id === 'string' ? node.id.trim() : ''))
      .filter(Boolean),
  );
  const normalizedNodes = nodes.map((node, index) => {
    if (!isRecord(node) || Object.hasOwn(node, 'id')) return normalizeIntelligentUiNode(node);
    let id = `n${index + 1}`;
    let suffix = 2;
    while (reserved.has(id)) id = `n${index + 1}_${suffix++}`;
    reserved.add(id);
    return normalizeIntelligentUiNode({ ...node, id });
  });
  return {
    ...value,
    version: value.version === undefined ? 1 : numberLike(value.version),
    nodes: normalizedNodes,
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
