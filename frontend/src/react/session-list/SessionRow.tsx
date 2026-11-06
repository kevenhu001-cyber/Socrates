import { Button as UiButton } from '../ui/Button';
import { memo, useCallback, useState, useEffect } from 'react';
import type React from 'react';
import { ConversationRow } from '@socrates/ui/shell';
import { t } from '../legacy/gateway.ts';
import { detailCache } from '../../session/detailCache.ts';
import type { SessionItem } from '../../ui/sessionListState.ts';
import { Icon } from '../../ui/Icon';
import { useDomRowHost, webClass } from '../rn/webHost';
import { buildMeta, modeLabel, safeId } from './sessionListModel';
import { SessionRenameField, SessionTagPills } from './SessionRowDetails';
import { SessionRowMenu } from './SessionRowMenu';
import { useSessionRowActions } from './useSessionRowActions';
import type { SessionRowMenuProps } from './types';

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
  /* Native events: the row is a react-native-web view, wired by useDomRowHost. */
  onDragStart: (event: DragEvent, id: string) => void;
  onDragEnd: (event: DragEvent) => void;
}

/* Structural hooks the shell CSS and e2e key off; the shared row names none itself. */
const PARTS = {
  badge: (cls: string) => webClass('recent-mode-badge', cls),
  main: webClass('recent-item-main'),
  titleRow: webClass('recent-item-title-row'),
  title: webClass('recent-item-text'),
  pin: webClass('recent-item-pin-icon'),
  label: webClass('recent-item-label'),
  meta: webClass('recent-item-meta'),
  tags: webClass('recent-item-tags'),
  actions: webClass('recent-item-actions'),
};

function SessionRowActionMenu(props: Omit<SessionRowMenuProps, 'trigger'>) {
  return (
    <SessionRowMenu
      {...props}
      trigger={<UiButton
        className="btn-icon recent-item-overflow"
        type="button"
        title={t('session.moreActions')}
        aria-label={t('session.moreActions')}
        aria-haspopup="menu"
        aria-expanded={props.open}
        data-i18n-title="session.moreActions"
        data-i18n-aria="session.moreActions"
        onClick={(event) => event.stopPropagation()}
      >
        {/* 「更多」：参考图的三个圆点 ⋯。 */}
        <Icon name="more" size={16} />
      </UiButton>}
    />
  );
}

type SessionRowControlsProps = Pick<SessionRowProps, 'session' | 'onTag' | 'onArchive' | 'onDelete'> & {
  actions: ReturnType<typeof useSessionRowActions>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function SessionRowControls({ session, actions, open, onOpenChange, onTag, onArchive, onDelete }: SessionRowControlsProps) {
  const { projects, loadingProjects, projectError, error, saving, closeMenu, resetProjects, update, setRenaming, loadProjects } = actions;
  const pinKey = session.pinned ? 'session.ctxUnpin' : 'session.ctxPin';
  return (
    <>
      <SessionRowActionMenu
        session={session}
        open={open}
        onOpenChange={onOpenChange}
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
      {/* Reference drawer rows carry a pin toggle beside ⋯ on touch screens;
          the shell CSS shows it in the phone drawer only. Same action as the
          menu's 置顶 / 取消置顶 item. */}
      <UiButton
        className="btn-icon recent-item-pin-toggle"
        type="button"
        title={t(pinKey)}
        aria-label={t(pinKey)}
        aria-pressed={Boolean(session.pinned)}
        data-i18n-title={pinKey}
        data-i18n-aria={pinKey}
        onClick={(event) => {
          event.stopPropagation();
          void update({ pinned: !session.pinned });
        }}
      >
        <Icon name="pin" size={16} />
      </UiButton>
    </>
  );
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
  const actions = useSessionRowActions(session.id, hideMenu);
  const { renaming, setRenaming, saving, error, closeMenu, update } = actions;
  const retained = actionsOpen || renaming || saving || dragging;
  useEffect(() => {
    onRetentionChange?.(session.id, retained);
    return () => onRetentionChange?.(session.id, false);
  }, [onRetentionChange, session.id, retained]);
  const setMenuOpen = useCallback((open: boolean) => {
    if (open) setActionsOpen(true);
    else closeMenu();
  }, [closeMenu]);

  /* The row opens a session, so it has to be reachable without a mouse. It
     cannot be a real button element: the overflow trigger inside it is one,
     and nesting them is invalid. `role="button"` plus the Enter/Space
     contract (in the shared row) gives the same behaviour. While renaming,
     the row drops the role so the inline input is not a focusable child of
     a button. Drag stays native: react-native-web forwards no drag events. */
  const rowRef = useDomRowHost({
    role: renaming ? undefined : 'button',
    draggable: true,
    onDragStart: (event) => { setDragging(true); onDragStart(event, session.id); },
    onDragEnd: (event) => { setDragging(false); onDragEnd(event); },
  });

  const mode = modeLabel(session);
  const prefetch = useCallback(() => { void detailCache.prefetch(session.id); }, [session.id]);

  return (
    <ConversationRow
      rowRef={rowRef}
      rowId={safeId(session.id)}
      conversationId={session.id}
      title={session.title || session.topic || '(untitled)'}
      active={isActive}
      pinned={Boolean(session.pinned)}
      pinnedLabel={t('session.pinned')}
      pinnedI18nKey="session.pinned"
      mode={{ label: t(mode.key), i18nKey: mode.key }}
      label={session.label || undefined}
      meta={buildMeta(session, timeLabel)}
      error={error || undefined}
      menuOpen={actionsOpen}
      dragging={dragging}
      renaming={renaming}
      activeShadow="var(--ui-elevation-raised)"
      parts={{
        ...PARTS,
        row: webClass('btn btn-ghost btn-touch recent-item', isActive && 'active', session.pinned && 'pinned', actionsOpen && 'actions-open', dragging && 'dragging'),
        badge: PARTS.badge(mode.cls),
      }}
      onPress={() => onPick(session.id)}
      onIntent={prefetch}
      renameSlot={<SessionRenameField
        session={session}
        saving={saving}
        onSaveTitle={(title) => void update({ title })}
        onCancelRename={() => setRenaming(false)}
      />}
      tags={session.tags && session.tags.length > 0 ? <SessionTagPills tags={session.tags} /> : undefined}
      actions={<SessionRowControls session={session} actions={actions} open={actionsOpen} onOpenChange={setMenuOpen}
        onTag={onTag} onArchive={onArchive} onDelete={onDelete} />}
    />
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
