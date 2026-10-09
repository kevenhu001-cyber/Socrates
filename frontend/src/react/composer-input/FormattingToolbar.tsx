import { useEffect, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';

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
  children: ReactNode;
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

export { FormattingToolbar };
