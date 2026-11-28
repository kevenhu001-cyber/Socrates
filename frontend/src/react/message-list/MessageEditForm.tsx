import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { Textarea } from '../ui/v3';
import { i18n } from '../../ui/legacyI18n.ts';
import { useMobileViewport } from '../sidebar-chrome/useMobileViewport';

/* The editor is the user bubble in its edit state (chat-demo reference):
 * one brand hairline around the full-width field, then the two text actions
 * inside the same rounded surface. The textarea grows with the draft up to
 * the reference's 202px ceiling and scrolls beyond it. */
const MAX_EDITOR_HEIGHT = 202;

function fitTextarea(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_EDITOR_HEIGHT)}px`;
}

export function MessageEditForm({
  initialText,
  cancelLabel,
  submitLabel,
  onCancel,
  onCommit,
}: {
  initialText: string;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onCommit: (text: string) => void;
}) {
  const [value, setValue] = useState(initialText);
  const input = useRef<HTMLTextAreaElement>(null);
  const isMobile = useMobileViewport();
  const canSend = value.trim() !== '';

  useLayoutEffect(() => {
    const textarea = input.current;
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    fitTextarea(textarea);
  }, []);

  const commit = () => {
    if (!canSend) return;
    onCommit(value);
  };

  return (
    <div className="msg-edit-wrap">
      <Textarea
        ref={input}
        className="msg-edit-area"
        aria-label={i18n('message.edit', 'Edit message')}
        rows={1}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          fitTextarea(event.currentTarget);
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          } else if (
            event.key === 'Enter' &&
            (event.metaKey || event.ctrlKey || (!event.shiftKey && !isMobile))
          ) {
            event.preventDefault();
            commit();
          }
        }}
      />
      <div className="msg-edit-actions">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="msg-edit-btn msg-edit-cancel"
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant="default"
          size="sm"
          className="msg-edit-btn msg-edit-submit"
          onClick={commit}
          disabled={!canSend}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
