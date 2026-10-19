import { useCallback, useEffect, useReducer, useState } from 'react';
import { Archive, Check, Folder, List, MoreHorizontal, SquarePen } from 'lucide-react';
import { getLegacyActions, i18n } from '../legacy/gateway';
import { DeferredMenu } from '../menu/DeferredMenu';
import { useSessionOrganization, type SessionOrganization } from '../../sidebar/organization.store';

export function RecentsHeader() {
  const [open, setOpen] = useState(false);
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
  };
  return <>
    <span className="recents-title" data-i18n-key="sidebar.recentSessions">{i18n('sidebar.recentSessions', 'Recents')}</span>
    <span className="recents-header-actions">
      <button type="button" className="recents-head-btn" id="recentsNewBtn" aria-label={i18n('sidebar.newChat', 'New chat')}
        title={i18n('sidebar.newChat', 'New chat')} onClick={() => { void getLegacyActions().navigation.startNewChat(); }}><SquarePen /></button>
      <DeferredMenu open={open} onOpenChange={setOpen} className="recents-organize-menu" label={i18n('sidebar.organize', 'Organize chats')} spill
        trigger={<button type="button" className="recents-head-btn" id="recentsMoreBtn"
          aria-label={i18n('sidebar.organize', 'Organize chats')} title={i18n('sidebar.organize', 'Organize chats')}><MoreHorizontal /></button>}>
      {({ FoundationMenuItem, FoundationMenuRadioGroup, FoundationMenuRadioItem }) => <>
      <div className="organize-menu-heading">{i18n('sidebar.organize', 'Organize chats')}</div>
      <FoundationMenuRadioGroup value={organization} onValueChange={select}>
      <FoundationMenuRadioItem value="list">
        <List /><span>{i18n('sidebar.organize.list', 'As a list')}</span>{organization === 'list' ? <Check className="organize-menu-check" /> : null}
      </FoundationMenuRadioItem>
      <FoundationMenuRadioItem value="projects">
        <Folder /><span>{i18n('sidebar.organize.projects', 'Group by project')}</span>{organization === 'projects' ? <Check className="organize-menu-check" /> : null}
      </FoundationMenuRadioItem>
      </FoundationMenuRadioGroup>
      <hr />
      <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.openStorageModal(); }}>
        <Archive /><span>{i18n('profile.archivedSessions', 'Archived chats')}</span>
      </FoundationMenuItem>
      </>}
      </DeferredMenu>
    </span>
  </>;
}
