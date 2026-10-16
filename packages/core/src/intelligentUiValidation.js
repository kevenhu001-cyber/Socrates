const TYPES = ['panel', 'stack', 'grid', 'text', 'metric', 'progress', 'divider', 'callout', 'slider', 'choice', 'button', 'table', 'chart', 'tabs', 'entity', 'image-gallery'];

/** Bound complexity and reject unsafe data before it is stored or rendered. */
export function validateIntelligentUi(value) {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Expected version and nodes' };
  const spec = value;
  if (spec.version !== 1 || !Array.isArray(spec.nodes) || !spec.nodes.length || spec.nodes.length > 80) return { ok: false, error: 'Expected version 1 and 1–80 nodes' };
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
  if (unsafe(spec.nodes)) return { ok: false, error: 'Unsafe or overly complex UI data' };
  if (JSON.stringify(spec.nodes).length > 60000) return { ok: false, error: 'UI document too large' };
  const nodes = spec.nodes;
  const ids = new Set();
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.id !== 'string' || !safeId(node.id)
        || typeof node.type !== 'string' || !TYPES.includes(node.type) || ids.has(node.id)
        || (node.parent !== undefined && (typeof node.parent !== 'string' || !safeId(node.parent)))) {
      return { ok: false, error: 'Invalid or duplicate node id/type' };
    }
    ids.add(node.id);
  }
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const seen = new Set([node.id]);
    let parent = node.parent;
    while (parent) {
      if (typeof parent !== 'string' || !byId.has(parent) || seen.has(parent)) return { ok: false, error: 'Invalid or cyclic parent' };
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
