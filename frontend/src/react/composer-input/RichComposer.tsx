import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Markdown } from '@tiptap/markdown';
import DOMPurify from 'dompurify';

import {
  notifyComposerChange,
  registerComposer,
  type ComposerSurface,
} from './controller';
import { ExtensionToken } from './extensionToken';
import { useAutoHeight } from './useAutoHeight';
import type { ComposerExtensionToken } from './types';
import { addComposerFiles } from '../../attachments/render.js';
import { i18n } from '../legacy/gateway';

interface RichComposerProps {
  surface: ComposerSurface;
  placeholder: string;
  onSubmit: () => void;
  showToolbar?: boolean;
  onEscape?: () => void;
}

function ToolbarButton({
  active = false,
  disabled = false,
  label,
  children,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`rich-composer-tool${active ? ' active' : ''}`}
      disabled={disabled}
      aria-label={label}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function FormattingToolbar({ editor }: { editor: Editor }) {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  const run = (command: () => boolean) => () => {
    command();
    editor.commands.focus();
  };
  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt('Link URL', previous ?? 'https://');
    if (href === null) return;
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  };

  return (
    <div className="rich-composer-toolbar" role="toolbar" aria-label="Formatting">
      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive('heading', { level })}
          onClick={run(() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run())}
        >
          H{level}
        </ToolbarButton>
      ))}
      <span className="rich-composer-divider" />
      <ToolbarButton label="Bold" active={editor.isActive('bold')} onClick={run(() => editor.chain().focus().toggleBold().run())}><strong>B</strong></ToolbarButton>
      <ToolbarButton label="Italic" active={editor.isActive('italic')} onClick={run(() => editor.chain().focus().toggleItalic().run())}><em>I</em></ToolbarButton>
      <ToolbarButton label="Underline" active={editor.isActive('underline')} onClick={run(() => editor.chain().focus().toggleUnderline().run())}><u>U</u></ToolbarButton>
      <ToolbarButton label="Strikethrough" active={editor.isActive('strike')} onClick={run(() => editor.chain().focus().toggleStrike().run())}><s>S</s></ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>↗</ToolbarButton>
      <span className="rich-composer-divider" />
      <ToolbarButton label="Bullet list" active={editor.isActive('bulletList')} onClick={run(() => editor.chain().focus().toggleBulletList().run())}>•≡</ToolbarButton>
      <ToolbarButton label="Numbered list" active={editor.isActive('orderedList')} onClick={run(() => editor.chain().focus().toggleOrderedList().run())}>1≡</ToolbarButton>
      <ToolbarButton label="Task list" active={editor.isActive('taskList')} onClick={run(() => editor.chain().focus().toggleTaskList().run())}>☑</ToolbarButton>
      <ToolbarButton label="Quote" active={editor.isActive('blockquote')} onClick={run(() => editor.chain().focus().toggleBlockquote().run())}>❝</ToolbarButton>
      <ToolbarButton label="Code block" active={editor.isActive('codeBlock')} onClick={run(() => editor.chain().focus().toggleCodeBlock().run())}>{'</>'}</ToolbarButton>
      <span className="rich-composer-divider" />
      <ToolbarButton label="Undo" disabled={!editor.can().undo()} onClick={run(() => editor.chain().focus().undo().run())}>↶</ToolbarButton>
      <ToolbarButton label="Redo" disabled={!editor.can().redo()} onClick={run(() => editor.chain().focus().redo().run())}>↷</ToolbarButton>
    </div>
  );
}

export function RichComposer({ surface, placeholder, onSubmit, onEscape, showToolbar = false }: RichComposerProps) {
  const onRemoveExtension = useCallback((_key: string) => {
    const legacyWindow = window as Window & { clearActiveTemplate?: () => void };
    legacyWindow.clearActiveTemplate?.();
  }, []);

  /* P_placeholder-lang — the placeholder prop is captured at mount, but the
     user can switch the app language at runtime. Re-derive the text from the
     live i18n dictionary and re-render on the language-change event, so the
     Tiptap placeholder (driven by --composer-placeholder) localizes without
     recreating the editor and losing the draft. */
  const [langRevision, setLangRevision] = useState(0);
  useEffect(() => {
    const onLangChange = () => setLangRevision((value) => value + 1);
    document.addEventListener('socrates:langchange', onLangChange);
    return () => document.removeEventListener('socrates:langchange', onLangChange);
  }, []);
  const activePlaceholder = useMemo(
    () => i18n(
      surface === 'chat' ? 'chat.inputPlaceholder' : 'topic.inputPlaceholder',
      placeholder,
    ),
    [surface, placeholder, langRevision],
  );

  const extensions = useMemo(() => [
    StarterKit.configure({ link: false, underline: false }),
    /* The visible hint text is rendered from --composer-placeholder (set on
       the root below) so React owns the current language's copy. The Tiptap
       extension still supplies the is-editor-empty / is-empty classes that
       hide the hint while the user types. */
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
  /* Class toggling instead of CSS `:has()`: avoids per-focus style recalc so
     the expand/collapse animation keeps full frame density. Inert on desktop. */
  const composerWrapRef = useRef<HTMLElement | null>(null);

  const editor = useEditor({
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
        const files = Array.from(event.clipboardData?.files ?? []);
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
          composerWrapRef.current = view.dom.closest('.chat-input-wrap');
          composerWrapRef.current?.classList.add('composer-focused');
          return false;
        },
        blur: (_view, event) => {
          const wrap = composerWrapRef.current;
          const nextTarget = (event as FocusEvent).relatedTarget as Node | null;
          /* Toolbar, effort and attachment controls all live inside the
             composer. Moving between them must keep the expanded geometry;
             only a real focus exit should collapse it. Defer the final check
             one frame so browsers that update activeElement after blur do not
             flash the collapsed state. */
          if (wrap && nextTarget && wrap.contains(nextTarget)) return false;
          requestAnimationFrame(() => {
            if (wrap && !wrap.contains(document.activeElement)) {
              wrap.classList.remove('composer-focused');
            }
          });
          return false;
        },
      },
    },
    onUpdate: ({ editor: current }) => {
      const activeToken = syncExtensionMetadata(current);
      if (tokenWasPresent.current && !activeToken) {
        tokenWasPresent.current = false;
        onRemoveExtension('');
      } else {
        tokenWasPresent.current = activeToken;
      }
      notifyComposerChange(surface, current.getMarkdown());
    },
  });

  const getMarkdown = useCallback(
    () => (editor ? editor.getMarkdown() : ''),
    [editor],
  );

  const setExtensionToken = useCallback((token: ComposerExtensionToken | null) => {
    if (!editor) return;

    const existing: Array<{ pos: number; nodeSize: number }> = [];
    editor.state.doc.descendants((node, pos) => {
      if (node.type.name === 'extensionToken') {
        existing.push({ pos, nodeSize: node.nodeSize });
      }
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

  useEffect(() => {
    if (!editor) return;
    return registerComposer(surface, {
      getMarkdown,
      setMarkdown(value) {
        editor.commands.setContent(value || '', { emitUpdate: true, contentType: 'markdown' });
      },
      insertText(value) {
        editor.chain().focus().insertContent(value, { contentType: 'markdown' }).run();
      },
      clear() {
        editor.commands.clearContent(true);
      },
      setExtensionToken,
      focus(position = 'end') {
        editor.commands.focus(position);
      },
      getSelection() {
        return { from: editor.state.selection.from, to: editor.state.selection.to };
      },
      isVisible() {
        return editor.view.dom.closest('.hidden') === null && editor.view.dom.getClientRects().length > 0;
      },
    });
  }, [editor, getMarkdown, setExtensionToken, surface]);

  useEffect(() => {
    return () => {
      composerWrapRef.current?.classList.remove('composer-focused');
      composerWrapRef.current = null;
    };
  }, []);

  /* P_composer-auto-height — animate the desktop composer's height as
     the user types past one line, matching the mobile focus-in
     expansion. Without this, the Tiptap contenteditable snaps to
     each new content height on every input event (a one-line
     "thunk" per newline). The hook observes the contenteditable's
     intrinsic `scrollHeight` and animates its `style.height` via
     the project's velocity planner. Once the content hits
     max-height (132px on desktop, 150px on mobile, 180px on the
     mobile focused state) the editor scrolls internally and the
     height change ceases — the hook's scrollHeight read clamps
     naturally because the element's `scrollHeight` exceeds its
     rendered height and we only animate towards the rendered
     natural size.

     On mobile, the focus-in state already drives a shape change
     (min-height 54→116, grid-template-rows 0fr→1fr), and running
     this hook in parallel would race the CSS transition. We
     restrict the hook to desktop (min-width:769px matches the
     existing media query for the PC composer rules) so the two
     animation systems don't compete. */
  const editorElement = editor ? (editor.view.dom as HTMLElement) : null;
  const isDesktop = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width:769px)').matches
    : true;
  useAutoHeight(isDesktop ? editorElement : null, {
    motion: {
      /* Slightly slower than the chat scroll/inset velocity so a
         multi-line expansion feels deliberate rather than snappy.
         Still well under the user-perceived "drag" threshold. */
      velocity: 1100,
      maxDuration: 360,
    },
  });

  /* Keep the contenteditable's accessible name in sync when the language
     changes after mount (the editorProps attributes are initial-only). */
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('aria-label', activePlaceholder);
  }, [editor, activePlaceholder]);

  if (!editor) return null;
  return (
    <div
      className="rich-composer"
      data-surface={surface}
      style={{ '--composer-placeholder': JSON.stringify(activePlaceholder) } as React.CSSProperties}
    >
      {showToolbar ? <FormattingToolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  );
}

function syncExtensionMetadata(editor: Editor): boolean {
  const tokens: ComposerExtensionToken[] = [];
  editor.state.doc.descendants((node) => {
    if (!tokens.length && node.type.name === 'extensionToken') {
      tokens.push(node.attrs as ComposerExtensionToken);
      return false;
    }
    return true;
  });
  return tokens.length > 0;
}
