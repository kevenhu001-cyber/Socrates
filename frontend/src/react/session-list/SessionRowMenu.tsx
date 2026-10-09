import type { RefObject } from 'react';
import { Pin, Tag } from 'lucide-react';
import { getCurrentLang, getLegacyActionsOrNull, t } from '../legacy/gateway.ts';
import { AnchoredMenu } from '../menu/AnchoredMenu';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import type { SessionItem } from './types';

const SHARE_ICON = sidebarIcons.share;
const RENAME_ICON = sidebarIcons.rename;
const ARCHIVE_ICON = sidebarIcons.archive;
const DELETE_ICON = sidebarIcons.delete;
const PROJECT_ICON = sidebarIcons.projects;
const CHEVRON_RIGHT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="m9.5 6 6 6-6 6"/></svg>';

type ProjectOption = { id: string; name: string };

export interface SessionRowMenuProps {
  session: SessionItem;
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  projects: ProjectOption[] | null;
  saving: boolean;
  onClose: () => void;
  onBack: () => void;
  onChooseProject: (projectId: string) => void;
  onRename: (event: React.MouseEvent) => void;
  onTag: (event: React.MouseEvent) => void;
  onPin: () => void;
  onArchive: (event: React.MouseEvent) => void;
  onDelete: (event: React.MouseEvent) => void;
  onMoveToProject: () => void;
}

export function SessionRowMenu(props: SessionRowMenuProps) {
  if (!props.open) return null;
  return (
    <AnchoredMenu
      anchor={props.anchor}
      onClose={props.onClose}
      spill
      className="recent-item-menu is-open"
    >
      {props.projects
        ? <ProjectPicker projects={props.projects} saving={props.saving} onBack={props.onBack} onChoose={props.onChooseProject} />
        : <SessionActionItems {...props} />}
    </AnchoredMenu>
  );
}

function ProjectPicker({
  projects,
  saving,
  onBack,
  onChoose,
}: {
  projects: ProjectOption[];
  saving: boolean;
  onBack: () => void;
  onChoose: (projectId: string) => void;
}) {
  const copy = (zh: string, en: string) => getCurrentLang() === 'zh' ? zh : en;
  return (
    <>
      <button role="menuitem" onClick={onBack}>{copy('返回', 'Back')}</button>
      {projects.length
        ? projects.map((project) => (
          <button
            key={project.id}
            role="menuitem"
            disabled={saving}
            onClick={() => onChoose(project.id)}
          >{project.name}</button>
        ))
        : <span>{copy('暂无项目，请先创建项目', 'Create a project first')}</span>}
    </>
  );
}

type SessionActionItemsProps = Pick<
  SessionRowMenuProps,
  'session' | 'onClose' | 'onRename' | 'onTag' | 'onPin' | 'onArchive' | 'onDelete' | 'onMoveToProject'
>;

function SessionActionItems({
  session,
  onClose,
  onRename,
  onTag,
  onPin,
  onArchive,
  onDelete,
  onMoveToProject,
}: SessionActionItemsProps) {
  const share = () => {
    onClose();
    getLegacyActionsOrNull()?.messages.openShareModal(session.id);
  };
  const pinLabel = session.pinned ? 'session.ctxUnpin' : 'session.ctxPin';
  return (
    <>
      <button
        className="btn-icon recent-item-menu-row recent-item-share"
        type="button"
        role="menuitem"
        title={t('session.ctxShare')}
        onClick={share}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: SHARE_ICON }} />
        <span className="recent-item-action-text">{t('session.ctxShare')}</span>
      </button>
      <button
        className="btn-icon recent-item-menu-row recent-item-rename"
        type="button"
        role="menuitem"
        title={t('session.ctxRename')}
        onClick={onRename}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: RENAME_ICON }} />
        <span className="recent-item-action-text">{t('session.ctxRename')}</span>
      </button>
      <button
        className="btn-icon recent-item-menu-row recent-item-tag-btn"
        type="button"
        role="menuitem"
        title={t('session.editTags')}
        aria-label={t('session.editTags')}
        onClick={onTag}
      >
        <span className="recent-item-action-icon"><Tag strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="recent-item-action-text">{t('session.editTags')}</span>
      </button>
      <div className="recent-item-menu-divider" />
      <button
        className="btn-icon recent-item-menu-row recent-item-pin"
        type="button"
        role="menuitem"
        title={t(pinLabel)}
        onClick={onPin}
      >
        <span className="recent-item-action-icon">
          <Pin strokeWidth={1.8} aria-hidden="true" style={{ transform: 'rotate(45deg)' }} />
        </span>
        <span className="recent-item-action-text">{t(pinLabel)}</span>
      </button>
      <button
        className="btn-icon recent-item-menu-row recent-item-archive"
        type="button"
        role="menuitem"
        data-archive-session="1"
        title={t('session.ctxArchive')}
        aria-label={t('session.ctxArchive')}
        data-i18n-title="session.ctxArchive"
        data-i18n-aria="session.ctxArchive"
        onClick={onArchive}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: ARCHIVE_ICON }} />
        <span className="recent-item-action-text" data-i18n-key="session.ctxArchive">{t('session.ctxArchive')}</span>
      </button>
      <button
        className="btn-icon recent-item-menu-row recent-item-del"
        type="button"
        role="menuitem"
        title={t('session.ctxDelete')}
        aria-label={t('session.ctxDelete')}
        data-i18n-title="session.ctxDelete"
        data-i18n-aria="session.ctxDelete"
        onClick={onDelete}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: DELETE_ICON }} />
        <span className="recent-item-action-text" data-i18n-key="session.ctxDelete">{t('session.ctxDelete')}</span>
      </button>
      <div className="recent-item-menu-divider" />
      <button
        className="btn-icon recent-item-menu-row recent-item-project"
        type="button"
        role="menuitem"
        title={t('session.ctxMoveToProject')}
        onClick={onMoveToProject}
      >
        <span className="recent-item-action-icon" dangerouslySetInnerHTML={{ __html: PROJECT_ICON }} />
        <span className="recent-item-action-text">{t('session.ctxMoveToProject')}</span>
        <span className="recent-item-action-trailing" dangerouslySetInnerHTML={{ __html: CHEVRON_RIGHT }} />
      </button>
    </>
  );
}
