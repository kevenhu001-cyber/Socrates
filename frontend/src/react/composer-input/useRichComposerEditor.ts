import { useCallback, useMemo, useRef } from 'react';
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
  notifyComposerChange,
} from '../../composer/controller.ts';
import type { ComposerSurface } from '../../composer/types.ts';
import { addComposerFiles } from '../../attachments/render.js';
import { ExtensionToken } from './extensionToken';
import type { ComposerShapeHandlers } from './useComposerShape';

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
    const legacyWindow = window as Window & {
      _activeTemplate?: { extensionKey?: string } | null;
      clearActiveTemplate?: () => void;
    };
    /* Pasted prompt text should not exit image creation mode. An explicit
       remove-button click still clears that mode through its non-empty key. */
    if (!key && legacyWindow._activeTemplate?.extensionKey === 'createImage') return;
    legacyWindow.clearActiveTemplate?.();
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

  return useEditor({
    extensions,
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
        beforeinput: (view) => {
          /* Preserve the painted start height before ProseMirror mutates it. */
          shape.captureShapeHeight(view.dom as HTMLElement);
          return false;
        },
        focus: (view) => {
          shape.handleComposerFocus(view.dom as HTMLElement);
          /* Prevent mobile WebKit from scrolling the window on focus. */
          if (typeof window !== 'undefined' && (window.scrollY !== 0 || window.scrollX !== 0)) {
            window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          }
          /* Defer the wrap growth by one frame so it does not race the IME
             keyboard-lift animation. */
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
      if (!switchingSurface) notifyComposerChange(surface, editor.getMarkdown());
      /* Lock the current geometry in the mutation task so paste/delete cannot
         paint an unanimated intrinsic height before the next frame. */
      shape.syncComposerShape(editor.view.dom as HTMLElement, true);
    },
  });
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
