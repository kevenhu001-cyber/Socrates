import { useEffect, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { Badge } from '../ui/shadcn/badge';
import { Button } from '../ui/shadcn/button';
import { Input } from '../ui/shadcn/input';

export interface TagEditorLabels {
  title: string;
  empty: string;
  placeholder: string;
  add: string;
  suggested: string;
  done: string;
  remove: string;
}

export interface TagEditorPopoverProps {
  tags: string[];
  knownTags: string[];
  labels: TagEditorLabels;
  onAdd: (tag: string) => void;
  onRemove: (tag: string) => void;
  onClose: () => void;
}

const MAX_TAG_LENGTH = 30;
const MAX_TAGS = 12;

/**
 * Session tag editor. The popover shell (`#tagEditorPopover`, its position and
 * the `.visible` class) stays imperative because `organize.ts` re-anchors it to
 * whichever row was clicked; only the contents are React.
 */
export function TagEditorPopover({ tags, knownTags, labels, onAdd, onRemove, onClose }: TagEditorPopoverProps) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = () => {
    const raw = draft.trim();
    if (!raw) return;
    /* Comma separated multi-add, same contract as the legacy popover. */
    raw.split(/[,，]/).forEach((part) => {
      const tag = part.trim().slice(0, MAX_TAG_LENGTH);
      if (tag) onAdd(tag);
    });
    setDraft('');
  };

  const suggestions = knownTags
    .filter((tag) => tags.indexOf(tag) < 0)
    .slice(0, MAX_TAGS);

  return (
    <div className="flex flex-col gap-2.5" role="dialog" aria-label={labels.title}>
      <div className="text-sm font-medium text-foreground">{labels.title}</div>

      <div className="flex min-h-6 flex-wrap items-center gap-1">
        {tags.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">{labels.empty}</span>
        ) : (
          tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="max-w-[180px] gap-0.5 pr-0.5" title={tag}>
              <span className="truncate">{tag}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-destructive"
                aria-label={`${labels.remove}: ${tag}`}
                title={labels.remove}
                onClick={() => onRemove(tag)}
              >
                <XIcon />
              </Button>
            </Badge>
          ))
        )}
      </div>

      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          value={draft}
          maxLength={MAX_TAG_LENGTH}
          autoComplete="off"
          placeholder={labels.placeholder}
          className="h-(--ui-control-sm) text-sm"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <Button size="sm" disabled={!draft.trim()} onClick={commit}>
          {labels.add}
        </Button>
      </div>

      {suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="w-full text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {labels.suggested}
          </span>
          {suggestions.map((tag) => (
            <Button
              key={tag}
              variant="outline"
              size="xs"
              className="max-w-[160px]"
              title={tag}
              onClick={() => onAdd(tag)}
            >
              <span className="truncate">{tag}</span>
            </Button>
          ))}
        </div>
      )}

      <div className="flex justify-end border-t border-border pt-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          {labels.done}
        </Button>
      </div>
    </div>
  );
}
