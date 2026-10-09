import { useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  registerComposer,
} from '../../composer/controller.ts';
import type { ComposerExtensionToken, ComposerSurface } from '../../composer/types.ts';

export function useComposerController(
  editor: Editor | null,
  surface: ComposerSurface,
  captureShapeHeight: (editorDom: HTMLElement) => void,
): void {
  const getMarkdown = useCallback(() => (editor ? editor.getMarkdown() : ''), [editor]);

  const setExtensionToken = useCallback((token: ComposerExtensionToken | null) => {
    if (!editor) return;
    const existing: Array<{ pos: number; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'extensionToken') existing.push({ pos, nodeSize: node.nodeSize });
    });

    if (!token) {
      if (!existing.length) return;
      const transaction = editor.state.tr;
      existing.slice().reverse().forEach(({ pos, nodeSize }) => {
        transaction.delete(pos, pos + nodeSize);
      });
      editor.view.dispatch(transaction);
      editor.commands.focus();
      return;
    }

    const attrs = {
      key: token.key,
      title: token.title,
      icon: token.icon,
      hint: token.hint ?? '',
    };
    if (existing.length) {
      const transaction = editor.state.tr;
      transaction.setNodeMarkup(existing[0].pos, editor.schema.nodes.extensionToken, attrs);
      existing.slice(1).reverse().forEach(({ pos, nodeSize }) => {
        transaction.delete(pos, pos + nodeSize);
      });
      editor.view.dispatch(transaction);
      editor.commands.focus(existing[0].pos + 1);
      return;
    }

    const tokenNode = editor.schema.nodes.extensionToken.create(attrs);
    const position = editor.state.selection.from;
    editor.view.dispatch(editor.state.tr.insert(position, tokenNode));
    editor.commands.focus(position + tokenNode.nodeSize);
  }, [editor]);

  /* Preserve the live token when the composer switches surfaces. Replacing
     Markdown content alone would remove this editor-document node. */
  const getExtensionToken = useCallback((): ComposerExtensionToken | null => {
    if (!editor) return null;
    let found: ComposerExtensionToken | null = null;
    editor.state.doc.descendants((node) => {
      if (!found && node.type.name === 'extensionToken') {
        found = (node.attrs ?? {}) as ComposerExtensionToken;
        return false;
      }
      return true;
    });
    return found;
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    return registerComposer(surface, {
      getMarkdown,
      setMarkdown(value) {
        captureShapeHeight(editor.view.dom as HTMLElement);
        editor.commands.setContent(value || '', { emitUpdate: true, contentType: 'markdown' });
      },
      insertText(value) {
        captureShapeHeight(editor.view.dom as HTMLElement);
        editor.chain().focus().insertContent(value, { contentType: 'markdown' }).run();
      },
      clear() {
        captureShapeHeight(editor.view.dom as HTMLElement);
        editor.commands.clearContent(true);
      },
      setExtensionToken,
      getExtensionToken,
      focus(position = 'end') {
        editor.commands.focus(position, { scrollIntoView: false });
      },
      getSelection() {
        return { from: editor.state.selection.from, to: editor.state.selection.to };
      },
      isVisible() {
        return editor.view.dom.closest('.hidden') === null && editor.view.dom.getClientRects().length > 0;
      },
    });
  }, [captureShapeHeight, editor, getExtensionToken, getMarkdown, setExtensionToken, surface]);
}
