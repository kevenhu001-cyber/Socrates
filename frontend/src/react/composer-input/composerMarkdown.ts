import type { Editor } from '@tiptap/react';

// ProseMirror documents are immutable. A transaction/selection notification
// can ask for the same Markdown several times; only serialize once per doc.
const cache = new WeakMap<Editor, { doc: Editor['state']['doc']; markdown: string }>();
const pending = new WeakMap<Editor, number>();
export function getCachedComposerMarkdown(editor: Editor): string {
  const doc = editor.state.doc;
  const previous = cache.get(editor);
  if (previous?.doc === doc) return previous.markdown;
  const markdown = editor.getMarkdown();
  cache.set(editor, { doc, markdown });
  return markdown;
}

export function cancelComposerNotification(editor: Editor): void {
  const frame = pending.get(editor);
  if (frame !== undefined) cancelAnimationFrame(frame);
  pending.delete(editor);
}

export function scheduleComposerNotification(editor: Editor, notify: () => void): void {
  cancelComposerNotification(editor);
  pending.set(editor, requestAnimationFrame(() => {
    pending.delete(editor);
    if (!editor.isDestroyed) notify();
  }));
}
