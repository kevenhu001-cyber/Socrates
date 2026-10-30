import { Button as UiButton } from '../ui/Button';
import React, { memo, useCallback, useState, useEffect } from 'react';
import { t } from '../legacy/gateway.ts';
import { detailCache } from '../../session/detailCache.ts';
import type { SessionItem } from './types';
import { safeId } from './sessionListModel';
import { SessionRowDetails } from './SessionRowDetails';
import { SessionRowMenu } from './SessionRowMenu';
import { useSessionRowActions } from './useSessionRowActions';

export interface SessionRowProps {
  session: SessionItem;
  isActive: boolean;
  /* Keeps relative-time labels fresh in memoized rows. */
  timeLabel: string;
  onRetentionChange?: (id: string, active: boolean) => void;
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
  timeLabel,
  onPick,
  onTag,
  onArchive,
  onDelete,
  onDragStart,
  onDragEnd,
  onRetentionChange,
}: SessionRowProps) {
  const [dragging, setDragging] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const hideMenu = useCallback(() => setActionsOpen(false), []);
  const {
    renaming,
    setRenaming,
    saving,
    error,
    projects,
    loadingProjects,
    projectError,
    resetProjects,
    closeMenu,
    update,
    loadProjects,
  } = useSessionRowActions(session.id, hideMenu);
  const retained = actionsOpen || renaming || saving || dragging;
  useEffect(() => {
    onRetentionChange?.(session.id, retained);
    return () => onRetentionChange?.(session.id, false);
  }, [onRetentionChange, session.id, retained]);
  const setMenuOpen = useCallback((open: boolean) => {
    if (open) setActionsOpen(true);
    else closeMenu();
  }, [closeMenu]);

  return (
    <div
      className={'btn btn-ghost btn-touch recent-item'
        + (isActive ? ' active' : '')
        + (session.pinned ? ' pinned' : '')
        + (actionsOpen ? ' actions-open' : '')}
      data-recent-id={safeId(session.id)}
      data-recent-actual={session.id}
      /* The row opens a session, so it has to be reachable without a mouse.
         It cannot be a real button element: the overflow trigger inside it
         is one, and nesting them is invalid. `role="button"` plus the
         Enter/Space contract gives the same behaviour; the guard on
         `event.target` keeps the inner trigger's own keys from opening the
         session too. While renaming, the row drops the role so the inline
         input is not a focusable child of a button. */
      role={renaming ? undefined : 'button'}
      tabIndex={renaming ? -1 : 0}
      aria-current={isActive ? 'true' : undefined}
      onKeyDown={(event) => {
        if (renaming) return;
        if (event.target !== event.currentTarget) return;
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onPick(session.id);
      }}
      draggable
      onDragStart={(event) => { setDragging(true); onDragStart(event, session.id); }}
      onDragEnd={(event) => { setDragging(false); onDragEnd(event); }}
      onPointerEnter={() => { void detailCache.prefetch(session.id); }}
      onTouchStart={() => { void detailCache.prefetch(session.id); }}
      onClick={() => onPick(session.id)}
    >
      <SessionRowDetails
        session={session}
        timeLabel={timeLabel}
        renaming={renaming}
        saving={saving}
        error={error}
        onSaveTitle={(title) => void update({ title })}
        onCancelRename={() => setRenaming(false)}
      />
      <div className="recent-item-actions">
        <SessionRowMenu
          trigger={<UiButton
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
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="2.1" />
            <circle cx="12" cy="12" r="2.1" />
            <circle cx="19" cy="12" r="2.1" />
          </svg>
        </UiButton>}
          session={session}
          open={actionsOpen}
          onOpenChange={setMenuOpen}
          projects={projects}
          loadingProjects={loadingProjects}
          projectError={projectError}
          saveError={error}
          saving={saving}
          onClose={closeMenu}
          onBack={resetProjects}
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
  && previous.timeLabel === next.timeLabel
  && previous.onPick === next.onPick
  && previous.onTag === next.onTag
  && previous.onArchive === next.onArchive
  && previous.onDelete === next.onDelete
  && previous.onDragStart === next.onDragStart
  && previous.onRetentionChange === next.onRetentionChange
  && previous.onDragEnd === next.onDragEnd
));
