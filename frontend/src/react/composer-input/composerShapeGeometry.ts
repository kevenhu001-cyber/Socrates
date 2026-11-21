export function hasMultilineDraft(editor: HTMLElement, wrap: HTMLElement): boolean {
  const hasText = Boolean((editor.textContent || '').replace(/\u200b/g, '').trim());
  if (!hasText && wrap.querySelector('.composer-plugin-chips')) return false;
  if (editor.querySelector('br:not(.ProseMirror-trailingBreak), p + p, li + li')) return true;
  if (!hasText) return false;

  // The shared frame uses the same editor width in both states. Measure the live
  // editor once without duplicating the draft in a hidden layout.
  const style = getComputedStyle(editor);
  const lineHeight = Number.parseFloat(style.lineHeight) || 26;
  const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
  return editor.scrollHeight >= padding + lineHeight * 1.5;
}
