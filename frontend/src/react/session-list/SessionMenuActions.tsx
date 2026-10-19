import { Pin, Tag } from 'lucide-react';
import type { RefObject } from 'react';
import type { FoundationMenuItem } from '../menu/FoundationMenu';
import { getLegacyActionsOrNull, t } from '../legacy/gateway.ts';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import type { SessionRowMenuProps } from './types';

const SHARE_ICON = sidebarIcons.share;
const RENAME_ICON = sidebarIcons.rename;
const ARCHIVE_ICON = sidebarIcons.archive;
const DELETE_ICON = sidebarIcons.delete;
const PROJECT_ICON = sidebarIcons.projects;
const CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m9.5 6 6 6-6 6"/></svg>';

type SessionMenuActionsProps = Pick<
  SessionRowMenuProps,
  'session' | 'onClose' | 'onRename' | 'onTag' | 'onPin' | 'onArchive' | 'onDelete' | 'onMoveToProject'
> & { Item: typeof FoundationMenuItem; focusRef: RefObject<HTMLElement | null> };

export function SessionMenuActions({
  session,
  onClose,
  onRename,
  onTag,
  onPin,
  onArchive,
  onDelete,
  onMoveToProject,
  Item,
  focusRef,
}: SessionMenuActionsProps) {
  const share = () => {
    onClose();
    getLegacyActionsOrNull()?.messages.openShareModal(session.id);
  };
  const pinLabel = session.pinned ? 'session.ctxUnpin' : 'session.ctxPin';

  return (
    <>
      <Item className="btn-icon recent-item-menu-row recent-item-share" title={t('session.ctxShare')} onClick={share}>
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: SHARE_ICON }} />
        <span className="recent-item-action-text">{t('session.ctxShare')}</span>
      </Item>
      <Item className="btn-icon recent-item-menu-row recent-item-rename" title={t('session.ctxRename')} onClick={onRename}>
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: RENAME_ICON }} />
        <span className="recent-item-action-text">{t('session.ctxRename')}</span>
      </Item>
      <Item
        className="btn-icon recent-item-menu-row recent-item-tag-btn"
        title={t('session.editTags')}
        aria-label={t('session.editTags')}
        onClick={onTag}
      >
        <span className="recent-item-action-icon"><Tag strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="recent-item-action-text">{t('session.editTags')}</span>
      </Item>
      <div className="recent-item-menu-divider" />
      <Item className="btn-icon recent-item-menu-row recent-item-pin" title={t(pinLabel)} onClick={onPin}>
        <span className="recent-item-action-icon">
          <Pin strokeWidth={1.8} aria-hidden="true" style={{ transform: 'rotate(45deg)' }} />
        </span>
        <span className="recent-item-action-text">{t(pinLabel)}</span>
      </Item>
      <Item
        className="btn-icon recent-item-menu-row recent-item-archive"
        data-archive-session="1"
        title={t('session.ctxArchive')}
        aria-label={t('session.ctxArchive')}
        data-i18n-title="session.ctxArchive"
        data-i18n-aria="session.ctxArchive"
        onClick={onArchive}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: ARCHIVE_ICON }} />
        <span className="recent-item-action-text" data-i18n-key="session.ctxArchive">{t('session.ctxArchive')}</span>
      </Item>
      <Item
        className="btn-icon recent-item-menu-row recent-item-del"
        title={t('session.ctxDelete')}
        aria-label={t('session.ctxDelete')}
        data-i18n-title="session.ctxDelete"
        data-i18n-aria="session.ctxDelete"
        onClick={onDelete}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: DELETE_ICON }} />
        <span className="recent-item-action-text" data-i18n-key="session.ctxDelete">{t('session.ctxDelete')}</span>
      </Item>
      <div className="recent-item-menu-divider" />
      <Item ref={focusRef} closeOnClick={false} className="btn-icon recent-item-menu-row recent-item-project" title={t('session.ctxMoveToProject')} onClick={onMoveToProject}>
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: PROJECT_ICON }} />
        <span className="recent-item-action-text">{t('session.ctxMoveToProject')}</span>
        <span className="recent-item-action-trailing" dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
      </Item>
    </>
  );
}
