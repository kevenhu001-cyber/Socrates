import { validateIntelligentUi } from './intelligentUiValidation.js';

/** A transaction either validates in full or leaves the original document intact. */
export function applyIntelligentUiPatch(nodes, operations) {
  const fail = (error) => ({ ok: false, error });
  if (!Array.isArray(operations) || !operations.length || operations.length > 40 || JSON.stringify(operations).length > 60000) return fail('Expected 1–40 bounded operations');
  let next = [...nodes];
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') return fail('Invalid operation');
    if (operation.op === 'add') {
      if (!operation.node || next.some((node) => node.id === operation.node.id)) return fail('New node must have a unique id');
      next = [...next, operation.node];
    } else {
      if (typeof operation.nodeId !== 'string' || !next.some((node) => node.id === operation.nodeId)) return fail('Unknown node');
      if (operation.op === 'patch') {
        if (!operation.props || typeof operation.props !== 'object' || Array.isArray(operation.props)
          || ['id', 'type', 'parent', '__proto__', 'prototype', 'constructor'].some((key) => Object.hasOwn(operation.props, key))) return fail('Cannot change node identity or parent');
        next = next.map((node) => node.id === operation.nodeId ? { ...node, ...operation.props } : node);
      } else if (operation.op === 'remove') {
        const removed = new Set([operation.nodeId]);
        for (let i = 0; i < next.length; i++) for (const node of next) if (removed.has(node.parent)) removed.add(node.id);
        next = next.filter((node) => !removed.has(node.id));
      } else return fail('Unknown operation');
    }
  }
  const validation = validateIntelligentUi({ version: 1, nodes: next });
  return validation.ok ? { ok: true, nodes: next } : fail(validation.error);
}
