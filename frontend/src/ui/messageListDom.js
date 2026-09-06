import { disposeVisualizations } from '../render/visualization.js';

/**
 * Remove only legacy-rendered message nodes from the shared message list.
 * React-owned nodes must remain in place until React commits its next state.
 */
export function clearLegacyMsgListChildren() {
  const list = document.getElementById('msgList');
  if (!list) return;
  try { disposeVisualizations(list); } catch (_) { /* best effort cleanup */ }

  const children = Array.from(list.children);
  for (const node of children) {
    if (node.hasAttribute('data-react-owned')) continue;
    try { list.removeChild(node); } catch (_) { /* node was already removed */ }
  }
}
