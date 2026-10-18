import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { Archive, Check, Folder, List, MoreHorizontal, SquarePen } from 'lucide-react';
import { getLegacyActions, i18n } from '../legacy/gateway';
import { AnchoredMenu } from '../menu/AnchoredMenu';
import { useSessionOrganization, type SessionOrganization } from '../../sidebar/organization.store';

export function RecentsHeader() {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const { organization, setOrganization } = useSessionOrganization();
  const [, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  const select = (value: SessionOrganization) => {
    setOrganization(value);
    close();
    anchor.current?.focus();
  };
  return <>
    <span className="recents-title" data-i18n-key="sidebar.recentSessions">{i18n('sidebar.recentSessions', 'Recents')}</span>
    <span className="recents-header-actions">
      <button type="button" className="recents-head-btn" id="recentsNewBtn" aria-label={i18n('sidebar.newChat', 'New chat')}
        title={i18n('sidebar.newChat', 'New chat')} onClick={() => { void getLegacyActions().navigation.startNewChat(); }}><SquarePen /></button>
      <button type="button" ref={anchor} className="recents-head-btn" id="recentsMoreBtn" aria-haspopup="menu" aria-expanded={open}
        aria-label={i18n('sidebar.organize', 'Organize chats')} title={i18n('sidebar.organize', 'Organize chats')} onClick={() => setOpen(!open)}><MoreHorizontal /></button>
    </span>
    {open ? <AnchoredMenu anchor={anchor} onClose={close} className="recents-organize-menu" label={i18n('sidebar.organize', 'Organize chats')} spill>
      <div className="organize-menu-heading">{i18n('sidebar.organize', 'Organize chats')}</div>
      <button type="button" role="menuitemradio" aria-checked={organization === 'list'} onClick={() => select('list')}>
        <List /><span>{i18n('sidebar.organize.list', 'As a list')}</span>{organization === 'list' ? <Check className="organize-menu-check" /> : null}
      </button>
      <button type="button" role="menuitemradio" aria-checked={organization === 'projects'} onClick={() => select('projects')}>
        <Folder /><span>{i18n('sidebar.organize.projects', 'Group by project')}</span>{organization === 'projects' ? <Check className="organize-menu-check" /> : null}
      </button>
      <hr />
      <button type="button" role="menuitem" onClick={() => { close(); getLegacyActions().navigation.openStorageModal(); }}>
        <Archive /><span>{i18n('profile.archivedSessions', 'Archived chats')}</span>
      </button>
    </AnchoredMenu> : null}
  </>;
}
