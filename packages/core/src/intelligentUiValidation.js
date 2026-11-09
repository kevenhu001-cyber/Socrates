import { normalizeLearningUiNode, learningUiIssues } from './learningUi.js';
import { validateDemonstration } from './demonstration.js';
import { physicsParametersError } from './physicsModelRegistry.js';

const TYPES = ['panel', 'stack', 'grid', 'text', 'metric', 'progress', 'divider', 'callout', 'slider', 'choice', 'toggle', 'button', 'table', 'chart', 'tabs', 'entity', 'image-gallery', 'physics', 'demonstration', 'learning', 'visualization', 'openui'];

/** Bound complexity and reject unsafe data before it is stored or rendered. */
export function validateIntelligentUi(value) {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Expected version and nodes', kind: 'document' };
  const spec = value;
  if (spec.version !== 1 || !Array.isArray(spec.nodes) || !spec.nodes.length || spec.nodes.length > 80) return { ok: false, error: 'Expected version 1 and 1–80 nodes', kind: 'document' };
  let budget = 10000;
  const unsafe = (data, depth = 0) => {
    if (--budget < 0 || depth > 16) return true;
    if (typeof data === 'number' && !Number.isFinite(data)) return true;
    if (!data || typeof data !== 'object') return false;
    return Object.entries(data).some(([key, item]) => {
      if (['__proto__', 'prototype', 'constructor', 'html', 'css', 'javascript', 'onClick'].includes(key)) return true;
      if (['src', 'url', 'image', 'href'].includes(key) && typeof item === 'string' && !safeUiUrl(item)) return true;
      return unsafe(item, depth + 1);
    });
  };
  if (unsafe(spec.nodes)) return { ok: false, error: 'Unsafe or overly complex UI data', kind: 'document' };
  if (JSON.stringify(spec.nodes).length > 60000) return { ok: false, error: 'UI document too large', kind: 'document' };
  const nodes = spec.nodes.map(normalizeLearningUiNode);
  const ids = new Set();
  for (const node of nodes) {
    const id = node && typeof node === 'object' && typeof node.id === 'string' ? node.id.slice(0, 80) : '(missing)';
    if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || !safeId(node.id)
        || typeof node.type !== 'string' || !TYPES.includes(node.type) || ids.has(node.id)
        || (node.parent !== undefined && (typeof node.parent !== 'string' || !safeId(node.parent)))) {
      const reason = !node || typeof node !== 'object' || Array.isArray(node) ? 'Node must be an object'
        : typeof node.id !== 'string' || !safeId(node.id) ? 'Invalid node id'
          : typeof node.type !== 'string' || !TYPES.includes(node.type) ? `Unsupported node type "${String(node.type).slice(0, 40)}"`
            : ids.has(node.id) ? 'Duplicate node id'
              : 'Invalid parent id';
      return { ok: false, error: `${reason}: "${id}"`, nodeId: id === '(missing)' ? null : id, kind: 'node' };
    }
    if (node.type === 'visualization') {
      if (typeof node.template !== 'string' || !node.template.trim() || node.template.length > 80) {
        return { ok: false, error: `Visualization node "${id}" needs a string template`, nodeId: id, kind: 'visualization' };
      }
      if (!node.payload || typeof node.payload !== 'object' || Array.isArray(node.payload)) {
        return { ok: false, error: `Visualization node "${id}" needs an object payload`, nodeId: id, kind: 'visualization' };
      }
    }
    if (node.type === 'openui' && (typeof node.source !== 'string' || !node.source.trim() || node.source.length > 50000)) {
      return { ok: false, error: `OpenUI node "${id}" needs 1–50000 characters of source`, nodeId: id, kind: 'openui' };
    }
    if (node.type === 'learning') {
      const issues=learningUiIssues(node).map(issue=>({path:`nodes.${id}.${issue.path}`,message:issue.message}));
      if(issues.length)return {ok:false,error:issues.map(issue=>`${issue.path}: ${issue.message}`).join('; '),nodeId:id,kind:'learning',issues};
    }
    if (node.type === 'demonstration') {
      const result = validateDemonstration(node.program);
      if (!result.ok) return {
        ok: false,
        error: `Demonstration node "${id}": ${result.error}`,
        nodeId: id,
        kind: 'demonstration',
        ...(Array.isArray(result.issues) && result.issues.length ? { issues: result.issues } : {}),
      };
    }
    if (node.type === 'physics') {
      const error = physicsParametersError(node.scene, node.parameters);
      if (error) return { ok: false, error: `Physics node "${id}": ${error}`, nodeId: id, kind: 'physics' };
      for (const [key, min, max] of [['separation', .2, 3], ['wavelength', 380, 750], ['aperture', 10, 300]]) {
        if (node[key] !== undefined && (typeof node[key] !== 'number' || !Number.isFinite(node[key]) || node[key] < min || node[key] > max)) {
          return { ok: false, error: `Physics node "${id}": ${key} must be between ${min} and ${max}`, nodeId: id, kind: 'physics' };
        }
      }
    }
    ids.add(node.id);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parent = node.parent;
    while (parent) {
      if (typeof parent !== 'string' || !byId.has(parent) || seen.has(parent)) {
        return { ok: false, error: `Invalid or cyclic parent "${String(parent).slice(0, 80)}" on node "${node.id}"`, nodeId: node.id, kind: 'node' };
      }
      seen.add(parent);
      parent = byId.get(parent)?.parent;
    }
  }
  return { ok: true };
}

function safeId(value) {
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value)
    && !['__proto__', 'prototype', 'constructor'].includes(value);
}

function safeUiUrl(value) {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
