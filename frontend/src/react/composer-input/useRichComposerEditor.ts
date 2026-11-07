import { useCallback, useEffect, useMemo, useRef } from 'react';
import { cancelComposerNotification, getCachedComposerMarkdown, scheduleComposerNotification } from './composerMarkdown';
import { useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from '@tiptap/markdown';
import DOMPurify from 'dompurify';
import {
  isComposerSurfaceTransitioning,
  readComposerSurface,
  notifyComposerChange,
} from '../../composer/controller.ts';
import type { ComposerSurface } from '../../composer/types.ts';
import { addComposerFiles } from '../../attachments/render.ts';
import { ExtensionToken } from './extensionToken';
import type { ComposerShapeHandlers } from './useComposerShape';
import { getActiveTemplateExtensionKey, getLegacyActionsOrNull } from '../legacy/gateway.ts';

interface RichComposerEditorOptions {
  activePlaceholder: string;
  surface: ComposerSurface;
  onSubmit: () => void;
  onEscape?: () => void;
  shape: ComposerShapeHandlers;
}

export function useRichComposerEditor({
  activePlaceholder,
  surface,
  onSubmit,
  onEscape,
  shape,
}: RichComposerEditorOptions) {
  const onRemoveExtension = useCallback((key: string) => {
    /* Pasted prompt text should not exit image creation mode. An explicit
       remove-button click still clears that mode through its non-empty key. */
    if (!key && getActiveTemplateExtensionKey() === 'createImage') return;
    getLegacyActionsOrNull()?.composer.clearActiveTemplate?.();
  }, []);

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false, underline: false }),
    /* React owns the visible localized hint; Tiptap supplies empty-state
       classes used by the CSS placeholder. */
    Placeholder.configure({ placeholder: '', showOnlyWhenEditable: false }),
    Underline,
    Link.configure({
      openOnClick: false,
      autolink: true,
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ExtensionToken.configure({ onRemove: onRemoveExtension }),
    Markdown,
  ], [onRemoveExtension]);
  const tokenWasPresent = useRef(false);

  const editor = useEditor({
    extensions,
    shouldRerenderOnTransaction: false,
    content: '',
    editorProps: {
      attributes: {
        class: 'rich-composer-editor',
        'aria-label': activePlaceholder,
      },
      transformPastedHTML: (html) => DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ['img', 'style', 'script', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['style', 'onerror', 'onclick'],
      }),
      handlePaste: (_view, event) => {
        /* Clipboard screenshots often arrive as items while files is empty. */
        const files = Array.from(event.clipboardData?.files ?? []);
        const items = event.clipboardData?.items ? Array.from(event.clipboardData.items) : [];
        for (const item of items) {
          if (item.kind !== 'file' || typeof item.getAsFile !== 'function') continue;
          const file = item.getAsFile();
          if (file && !files.includes(file)) files.push(file);
        }
        if (!files.length) return false;
        event.preventDefault();
        void addComposerFiles(files, 'paste');
        return true;
      },
      handleKeyDown: (_view, event) => {
        if (event.isComposing || event.keyCode === 229) return false;
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          onSubmit();
          return true;
        }
        if (event.key === 'Escape') {
          onEscape?.();
          return true;
        }
        return false;
      },
      handleDOMEvents: {
        focus: (view) => {
          shape.handleComposerFocus(view.dom as HTMLElement);
          return false;
        },
        blur: (_view, event) => {
          shape.handleComposerBlur(event);
          return false;
        },
      },
    },
    onUpdate: ({ editor }) => {
      const activeToken = syncExtensionMetadata(editor);
      const switchingSurface = isComposerSurfaceTransitioning();
      if (!switchingSurface && tokenWasPresent.current && !activeToken) {
        tokenWasPresent.current = false;
        onRemoveExtension('');
      } else {
        tokenWasPresent.current = activeToken;
      }
      cancelComposerNotification(editor);
      if (!switchingSurface) scheduleComposerNotification(editor, () => {
        if (readComposerSurface() === surface) notifyComposerChange(surface, getCachedComposerMarkdown(editor));
      });
      /* Coalesce geometry reads after the editor commits its document. */
      shape.syncComposerShape(editor.view.dom as HTMLElement);
    },
  });
  useEffect(() => () => { if (editor) cancelComposerNotification(editor); }, [editor]);
  return editor;
}

function syncExtensionMetadata(editor: import('@tiptap/react').Editor): boolean {
  let foundToken = false;
  editor.state.doc.descendants((node) => {
    if (!foundToken && node.type.name === 'extensionToken') {
      foundToken = true;
      return false;
    }
    return true;
  });
  return foundToken;
}
