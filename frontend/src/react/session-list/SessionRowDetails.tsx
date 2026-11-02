import { Input as ShadcnInput } from '../ui/shadcn/input';
import { Button as UiButton } from '../ui/Button';
import React from 'react';
import { t } from '../legacy/gateway.ts';
import { setRecentsFilter } from '../../sidebar/sidebar.service';
import type { SessionItem } from '../../ui/sessionListState.ts';

/*
 * RN-10 — the row itself is the shared RN `ConversationRow`
 * (packages/ui/src/shell). These are the web pieces it hosts: the inline
 * rename field (a real form, so Enter submits and Escape cancels as before)
 * and the tag pills that filter the list.
 */

export function SessionRenameField({ session, saving, onSaveTitle, onCancelRename }: {
  session: SessionItem;
  saving: boolean;
  onSaveTitle: (title: string) => void;
  onCancelRename: () => void;
}) {
  const handleRenameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = new FormData(event.currentTarget).get('title')?.toString().trim();
    if (nextTitle) onSaveTitle(nextTitle);
  };
  return (
    <form onClick={(event) => event.stopPropagation()} onSubmit={handleRenameSubmit}>
      <ShadcnInput
        name="title"
        aria-label={t('session.ctxRename')}
        defaultValue={session.title || session.topic || ''}
        maxLength={255}
        autoFocus
        disabled={saving}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancelRename();
        }}
      />
    </form>
  );
}

export function SessionTagPills({ tags }: { tags: readonly string[] }) {
  return (
    <>
      {tags.map((tag) => (
        <UiButton type="submit"
          key={tag}
          className="recent-tag-pill"
          onClick={(event) => {
            event.stopPropagation();
            setRecentsFilter(tag);
          }}
          title={t('session.filterByTag').replace('{tag}', tag)}
        >#{tag}</UiButton>
      ))}
    </>
  );
}
