import { useLayoutEffect, useRef, useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { Textarea } from '../ui/shadcn/textarea';

export function MessageEditForm({ initialText, cancelLabel, submitLabel, onCancel, onCommit }: {
  initialText: string;
  cancelLabel: string;
  submitLabel: string;
  onCancel: () => void;
  onCommit: (text: string) => void;
}) {
  const [value, setValue] = useState(initialText);
  const input = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const textarea = input.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }, []);

  const commit = () => onCommit(value);
  return (
    <div className="msg-edit-wrap">
      <Textarea
        ref={input}
        className="msg-edit-area min-h-[60px] bg-background px-3 py-2 text-sm"
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className="msg-edit-actions">
        <Button type="button" variant="outline" size="sm" className="msg-edit-btn msg-edit-cancel" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button type="button" variant="default" size="sm" className="msg-edit-btn msg-edit-submit" onClick={commit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
