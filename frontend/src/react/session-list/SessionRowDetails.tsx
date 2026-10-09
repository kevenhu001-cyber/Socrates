import React from 'react';
import { t } from '../legacy/gateway.ts';
import { setRecentsFilter } from '../../sidebar/sidebar.service';
import type { SessionItem } from './types';
import { buildMeta, modeLabel } from './sessionListModel';

const PIN_ICON =
  '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="10" height="10"><path d="M12 2v10l4 4v2H8v-2l4-4V2"/></svg>';

interface SessionRowDetailsProps {
  session: SessionItem;
  renaming: boolean;
  saving: boolean;
  error: string;
  onSaveTitle: (title: string) => void;
  onCancelRename: () => void;
}

export function SessionRowDetails({
  session,
  renaming,
  saving,
  error,
  onSaveTitle,
  onCancelRename,
}: SessionRowDetailsProps) {
  const mode = modeLabel(session);
  const meta = buildMeta(session);
  const title = session.title || session.topic || '(untitled)';
  const label = session.label || '';

  const handleRenameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextTitle = new FormData(event.currentTarget).get('title')?.toString().trim();
    if (nextTitle) onSaveTitle(nextTitle);
  };

  return (
    <>
      <span
        className={'recent-mode-badge ' + mode.cls}
        title={t(mode.key)}
        data-i18n-key={mode.key}
        data-i18n-title={mode.key}
      >{t(mode.key)}</span>
      <div className="recent-item-main">
        <div className="recent-item-title-row">
          {session.pinned && (
            <span
              className="recent-item-pin-icon"
              title={t('session.pinned')}
              data-i18n-title="session.pinned"
              dangerouslySetInnerHTML={{ __html: PIN_ICON }}
            />
          )}
          {renaming ? (
            <form onClick={(event) => event.stopPropagation()} onSubmit={handleRenameSubmit}>
              <input
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
          ) : (
            <div className="recent-item-text">{title}</div>
          )}
          {error && <span role="alert">{error}</span>}
          {label && <span className="recent-item-label">{label}</span>}
        </div>
        <div className="recent-item-meta">
          {meta.map((item, index) => (
            <span key={index}>
              {index > 0 && <span className="dot" />}
              {item}
            </span>
          ))}
        </div>
        {session.tags && session.tags.length > 0 && (
          <div className="recent-item-tags">
            {session.tags.map((tag) => (
              <button
                key={tag}
                className="recent-tag-pill"
                onClick={(event) => {
                  event.stopPropagation();
                  setRecentsFilter(tag);
                }}
                title={t('session.filterByTag').replace('{tag}', tag)}
              >#{tag}</button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
