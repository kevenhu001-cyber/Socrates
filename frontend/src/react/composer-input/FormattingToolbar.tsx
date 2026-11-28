import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/v3';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { i18n } from '../../ui/legacyI18n.ts';

function ToolbarButton({
  active,
  disabled = false,
  label,
  children,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="surface"
      size="surface"
      className={`rich-composer-tool${active ? ' active' : ''}`}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function HeadingButtons({
  editor,
  run,
}: {
  editor: Editor;
  run: (command: () => boolean) => () => void;
}) {
  return (
    <>
      {[1, 2, 3].map((level) => (
        <ToolbarButton
          key={level}
          label={`Heading ${level}`}
          active={editor.isActive('heading', { level })}
          onClick={run(() =>
            editor
              .chain()
              .focus()
              .toggleHeading({ level: level as 1 | 2 | 3 })
              .run(),
          )}
        >
          H{level}
        </ToolbarButton>
      ))}
    </>
  );
}

function InlineStyleButtons({
  editor,
  run,
  setLink,
}: {
  editor: Editor;
  run: (command: () => boolean) => () => void;
  setLink: () => void;
}) {
  return (
    <>
      <ToolbarButton
        label="Bold"
        active={editor.isActive('bold')}
        onClick={run(() => editor.chain().focus().toggleBold().run())}
      >
        <strong>B</strong>
      </ToolbarButton>
      <ToolbarButton
        label="Italic"
        active={editor.isActive('italic')}
        onClick={run(() => editor.chain().focus().toggleItalic().run())}
      >
        <em>I</em>
      </ToolbarButton>
      <ToolbarButton
        label="Underline"
        active={editor.isActive('underline')}
        onClick={run(() => editor.chain().focus().toggleUnderline().run())}
      >
        <u>U</u>
      </ToolbarButton>
      <ToolbarButton
        label="Strikethrough"
        active={editor.isActive('strike')}
        onClick={run(() => editor.chain().focus().toggleStrike().run())}
      >
        <s>S</s>
      </ToolbarButton>
      <ToolbarButton label="Link" active={editor.isActive('link')} onClick={setLink}>
        ↗
      </ToolbarButton>
    </>
  );
}

function BlockStyleButtons({
  editor,
  run,
}: {
  editor: Editor;
  run: (command: () => boolean) => () => void;
}) {
  return (
    <>
      <ToolbarButton
        label="Bullet list"
        active={editor.isActive('bulletList')}
        onClick={run(() => editor.chain().focus().toggleBulletList().run())}
      >
        •≡
      </ToolbarButton>
      <ToolbarButton
        label="Numbered list"
        active={editor.isActive('orderedList')}
        onClick={run(() => editor.chain().focus().toggleOrderedList().run())}
      >
        1≡
      </ToolbarButton>
      <ToolbarButton
        label="Task list"
        active={editor.isActive('taskList')}
        onClick={run(() => editor.chain().focus().toggleTaskList().run())}
      >
        ☑
      </ToolbarButton>
      <ToolbarButton
        label="Quote"
        active={editor.isActive('blockquote')}
        onClick={run(() => editor.chain().focus().toggleBlockquote().run())}
      >
        ❝
      </ToolbarButton>
      <ToolbarButton
        label="Code block"
        active={editor.isActive('codeBlock')}
        onClick={run(() => editor.chain().focus().toggleCodeBlock().run())}
      >
        {'</>'}
      </ToolbarButton>
    </>
  );
}

function sanitizeLinkHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^(https?:|mailto:|\/)/i.test(trimmed)) return trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function FormattingToolbar({ editor }: { editor: Editor }) {
  const [, setRevision] = useState(0);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    editor.on('selectionUpdate', refresh);
    editor.on('transaction', refresh);
    return () => {
      editor.off('selectionUpdate', refresh);
      editor.off('transaction', refresh);
    };
  }, [editor]);

  useEffect(() => {
    if (!linkOpen) return;
    const id = window.requestAnimationFrame(() => {
      linkInputRef.current?.focus();
      linkInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [linkOpen]);

  const run = (command: () => boolean) => () => {
    command();
    editor.commands.focus();
  };
  const openLinkEditor = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    setLinkValue(previous ?? 'https://');
    setLinkOpen(true);
  };
  const closeLinkEditor = () => {
    setLinkOpen(false);
    editor.commands.focus();
  };
  const applyLink = () => {
    const safeHref = sanitizeLinkHref(linkValue);
    if (safeHref === null) return;
    setLinkOpen(false);
    if (!safeHref) editor.chain().focus().extendMarkRange('link').unsetLink().run();
    else editor.chain().focus().extendMarkRange('link').setLink({ href: safeHref }).run();
  };

  if (linkOpen) {
    return (
      <div
        className="rich-composer-toolbar flex items-center gap-1.5"
        role="toolbar"
        aria-label={i18n('composer.link.label', 'Link URL')}
      >
        <Input
          ref={linkInputRef}
          type="url"
          value={linkValue}
          onChange={(event) => setLinkValue(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              applyLink();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              closeLinkEditor();
            }
          }}
          placeholder="https://"
          aria-label={i18n('composer.link.label', 'Link URL')}
          className="h-7 min-w-0 flex-1 rounded-full px-2.5 text-xs"
        />
        <Button
          type="button"
          variant="default"
          size="sm"
          className="h-7 rounded-full px-2.5 text-xs"
          onClick={applyLink}
        >
          {i18n('common.apply', 'Apply')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 rounded-full px-2 text-xs"
          onClick={closeLinkEditor}
        >
          {i18n('common.cancel', 'Cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="rich-composer-toolbar" role="toolbar" aria-label="Formatting">
      <HeadingButtons editor={editor} run={run} />
      <span className="rich-composer-divider" />
      <InlineStyleButtons editor={editor} run={run} setLink={openLinkEditor} />
      <span className="rich-composer-divider" />
      <BlockStyleButtons editor={editor} run={run} />
      <span className="rich-composer-divider" />
      <ToolbarButton
        label="Undo"
        disabled={!editor.can().undo()}
        onClick={run(() => editor.chain().focus().undo().run())}
      >
        ↶
      </ToolbarButton>
      <ToolbarButton
        label="Redo"
        disabled={!editor.can().redo()}
        onClick={run(() => editor.chain().focus().redo().run())}
      >
        ↷
      </ToolbarButton>
    </div>
  );
}

export { FormattingToolbar };
