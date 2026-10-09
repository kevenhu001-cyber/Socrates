import React, { memo, useCallback, useRef, useState } from 'react';
import { t } from '../legacy/gateway.ts';
import { detailCache } from '../../session/detailCache.js';
import type { SessionItem } from './types';
import { safeId } from './sessionListModel';
import { SessionRowDetails } from './SessionRowDetails';
import { SessionRowMenu } from './SessionRowMenu';
import { useSessionRowActions } from './useSessionRowActions';

export interface SessionRowProps {
  session: SessionItem;
  isActive: boolean;
  /* Keeps relative-time labels fresh in memoized rows. */
  nowTick: number;
  onPick: (id: string) => void;
  onTag: (id: string, event: React.MouseEvent) => void;
  onArchive: (id: string, event: React.MouseEvent) => void;
  onDelete: (id: string, event: React.MouseEvent) => void;
  onDragStart: (event: React.DragEvent, id: string) => void;
  onDragEnd: (event: React.DragEvent) => void;
}

function SessionRowBase({
  session,
  isActive,
  onPick,
  onTag,
  onArchive,
  onDelete,
  onDragStart,
  onDragEnd,
}: SessionRowProps) {
  const [actionsOpen, setActionsOpen] = useState(false);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => setActionsOpen(false), []);
  const {
    renaming,
    setRenaming,
    saving,
    error,
    projects,
    setProjects,
    update,
    loadProjects,
  } = useSessionRowActions(session.id, closeMenu);

  return (
    <div
      className={'btn btn-ghost btn-touch recent-item'
        + (isActive ? ' active' : '')
        + (session.pinned ? ' pinned' : '')
        + (actionsOpen ? ' actions-open' : '')}
      data-recent-id={safeId(session.id)}
      data-recent-actual={session.id}
      draggable
      onDragStart={(event) => onDragStart(event, session.id)}
      onDragEnd={onDragEnd}
      onPointerEnter={() => { void detailCache.prefetch(session.id); }}
      onTouchStart={() => { void detailCache.prefetch(session.id); }}
      onClick={() => onPick(session.id)}
    >
      <SessionRowDetails
        session={session}
        renaming={renaming}
        saving={saving}
        error={error}
        onSaveTitle={(title) => void update({ title })}
        onCancelRename={() => setRenaming(false)}
      />
      <div className="recent-item-actions">
        <button
          ref={menuAnchor}
          className="btn-icon recent-item-overflow"
          type="button"
          title={t('session.moreActions')}
          aria-label={t('session.moreActions')}
          aria-haspopup="menu"
          aria-expanded={actionsOpen}
          data-i18n-title="session.moreActions"
          data-i18n-aria="session.moreActions"
          onClick={(event) => {
            event.stopPropagation();
            setActionsOpen((open) => !open);
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2.1" />
            <circle cx="12" cy="12" r="2.1" />
            <circle cx="19" cy="12" r="2.1" />
          </svg>
        </button>
        <SessionRowMenu
          session={session}
          anchor={menuAnchor}
          open={actionsOpen}
          projects={projects}
          saving={saving}
          onClose={closeMenu}
          onBack={() => setProjects(null)}
          onChooseProject={(projectId) => void update({ projectId })}
          onRename={(event) => {
            closeMenu();
            event.stopPropagation();
            setRenaming(true);
          }}
          onTag={(event) => {
            closeMenu();
            onTag(session.id, event);
          }}
          onPin={() => {
            closeMenu();
            void update({ pinned: !session.pinned });
          }}
          onArchive={(event) => {
            closeMenu();
            onArchive(session.id, event);
          }}
          onDelete={(event) => {
            closeMenu();
            onDelete(session.id, event);
          }}
          onMoveToProject={loadProjects}
        />
      </div>
    </div>
  );
}

export const SessionRow = memo(SessionRowBase, (previous, next) => (
  previous.session === next.session
  && previous.isActive === next.isActive
  && previous.nowTick === next.nowTick
  && previous.onPick === next.onPick
  && previous.onTag === next.onTag
  && previous.onArchive === next.onArchive
  && previous.onDelete === next.onDelete
  && previous.onDragStart === next.onDragStart
  && previous.onDragEnd === next.onDragEnd
));
