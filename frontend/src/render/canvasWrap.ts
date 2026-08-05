/**
 * P_canvas-mode — pure helper used by renderAssistantHTML (main.js) and
 * unit-tested in test/canvasWrap.test.mjs. When outputMode === 'canvas',
 * wraps the assistant's formatted HTML in a <div class="canvas-block">
 * carrying data-* hooks that the React <CanvasBlock> mounts against.
 */

function escAttr(value: string): string {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  );
}

/**
 * @param html       Assistant HTML body, already through formatMsg + DOMPurify.
 * @param mode       Active template outputMode. Anything other than 'canvas'
 *                   passes through unchanged.
 * @param extensionKey Extension key for the active template (e.g. 'write').
 * @param canvasId   Stable id (random short) tying the wrapper to the
 *                   state.messages[idx].canvasId React hydrates against.
 */
export function wrapForCanvas(
  html: string,
  mode: string,
  extensionKey: string,
  canvasId: string,
): string {
  if (mode !== 'canvas') return html;
  return (
    '<div class="canvas-block" data-output-mode="canvas" ' +
    'data-canvas-extension="' + escAttr(extensionKey) + '" ' +
    'data-canvas-id="' + escAttr(canvasId) + '">' +
    html +
    '</div>'
  );
}