import { Separator as ShadcnSeparator } from '../ui/Separator';
import { Button } from '../ui/shadcn/button';
import { Icon } from '../../ui/Icon';
import { useCallback, useEffect, useReducer, useState } from 'react';
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
      <Button variant="ghost" className="recents-head-btn active:not-aria-[haspopup]:translate-y-0" id="recentsNewBtn" aria-label={i18n('sidebar.newChat', 'New chat')}
        title={i18n('sidebar.newChat', 'New chat')} onClick={() => { void getLegacyActions().navigation.startNewChat(); }}><Icon name="newChat" /></Button>
      <DeferredMenu open={open} onOpenChange={setOpen} className="recents-organize-menu" label={i18n('sidebar.organize', 'Organize chats')} spill
        trigger={<Button variant="ghost" className="recents-head-btn active:not-aria-[haspopup]:translate-y-0" id="recentsMoreBtn"
          aria-label={i18n('sidebar.organize', 'Organize chats')} title={i18n('sidebar.organize', 'Organize chats')}><Icon name="more" /></Button>}>
      {({ FoundationMenuItem, FoundationMenuRadioGroup, FoundationMenuRadioItem }) => <>
      <div className="organize-menu-heading">{i18n('sidebar.organize', 'Organize chats')}</div>
      <FoundationMenuRadioGroup value={organization} onValueChange={select}>
      <FoundationMenuRadioItem value="list">
        <Icon name="list" /><span>{i18n('sidebar.organize.list', 'As a list')}</span>{organization === 'list' ? <Icon name="check" className="organize-menu-check" /> : null}
      </FoundationMenuRadioItem>
      <FoundationMenuRadioItem value="projects">
        <Icon name="folder" /><span>{i18n('sidebar.organize.projects', 'Group by project')}</span>{organization === 'projects' ? <Icon name="check" className="organize-menu-check" /> : null}
      </FoundationMenuRadioItem>
      </FoundationMenuRadioGroup>
      <ShadcnSeparator />
      <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.openStorageModal(); }}>
        <Icon name="archive" /><span>{i18n('profile.archivedSessions', 'Archived chats')}</span>
      </FoundationMenuItem>
      </>}
      </DeferredMenu>
    </span>
  </>;
}
