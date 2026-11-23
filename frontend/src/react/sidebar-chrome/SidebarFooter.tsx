import { Separator as ShadcnSeparator } from '../ui/Separator';
import { Button } from '../ui/shadcn/button';
import { Icon } from '../../legacy/Icon';
import { useCallback, useRef, useState } from 'react';
import { useUserInfo } from './sidebarChrome.store';
import { getLegacyActions } from '../legacy/gateway.ts';
import { getCurrentLang } from '../../ui/legacyI18n.ts';
import { DeferredMenu } from '../menu/DeferredMenu';
import { preloadSettingsPage } from '../settings/settings.preload.ts';
import { openSettings } from '../settings/settings.service.ts';
import { useMobileViewport } from './useMobileViewport.ts';
import { closeSidebarOnMobile } from '../../sidebar/sidebar.service.ts';
import { useLocaleRefresh } from '../rn/WebUiTheme';

function UserIdentityPill({ user, tier }: { user: ReturnType<typeof useUserInfo>; tier: string }) {
  return (
    <>
      <span className="user-avatar" aria-hidden="true">
        {user.initials}
      </span>
      <span className="user-identity">
        <span className="user-name">{user.displayName}</span>
        <span className="user-plan">
          <span className={`tier-badge ${user.tier}`}>{tier}</span>
        </span>
      </span>
    </>
  );
}

function AccountMenuItems({
  signedIn,
  accountTrigger,
  close,
  navigate,
  label,
  FoundationMenuItem,
}: {
  signedIn: boolean;
  accountTrigger: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  navigate: (section: 'general' | 'personalization') => void;
  label: (zh: string, en: string) => string;
  FoundationMenuItem: React.ComponentType<{
    onClick?: () => void;
    onPointerEnter?: () => void;
    onPointerDown?: () => void;
    onFocus?: () => void;
    children: React.ReactNode;
  }>;
}) {
  return (
    <>
      <FoundationMenuItem
        onClick={() => {
          close();
          getLegacyActions().navigation.openProfile(accountTrigger.current);
        }}
      >
        <Icon name="user" />
        {label('个人资料', 'Profile')}
      </FoundationMenuItem>
      <FoundationMenuItem onClick={() => navigate('personalization')}>
        <Icon name="sliders" />
        {label('个性化', 'Personalization')}
      </FoundationMenuItem>
      <FoundationMenuItem
        onPointerEnter={preloadSettingsPage}
        onPointerDown={preloadSettingsPage}
        onFocus={preloadSettingsPage}
        onClick={() => navigate('general')}
      >
        <Icon name="gear" />
        {label('设置', 'Settings')}
      </FoundationMenuItem>
      <ShadcnSeparator />
      <FoundationMenuItem
        onClick={() => {
          close();
          getLegacyActions().navigation.openCheatsheet();
        }}
      >
        <Icon name="lifeBuoy" />
        {label('帮助', 'Help')}
        <Icon name="chevronRight" className="account-menu-trailing" />
      </FoundationMenuItem>
      {signedIn && (
        <FoundationMenuItem
          onClick={() => {
            close();
            getLegacyActions().navigation.signOut();
          }}
        >
          <Icon name="logOut" />
          {label('退出登录', 'Sign out')}
        </FoundationMenuItem>
      )}
    </>
  );
}

export function SidebarFooter() {
  useLocaleRefresh();
  const user = useUserInfo();
  const isMobile = useMobileViewport();
  const [open, setOpen] = useState(false);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const free = user.tier === 'diophantus' || user.tier === 'free';
  const tier = free ? (getCurrentLang() === 'zh' ? '免费版' : 'Free') : user.tierLabel;
  const label = (zh: string, en: string) => (getCurrentLang() === 'zh' ? zh : en);
  const navigate = (section: 'general' | 'personalization') => {
    close();
    void openSettings({
      section,
      mobileIndex: section === 'general',
      returnFocus: accountTrigger.current,
    });
  };
  return (
    <div className="sidebar-footer-account-wrap">
      <div className="sidebar-footer-identity-row">
        <DeferredMenu
          open={open}
          onOpenChange={setOpen}
          above
          className="sidebar-account-menu"
          label={label('账户', 'Account')}
          trigger={
            <Button
              ref={accountTrigger}
              variant="ghost"
              type="button"
              className="sidebar-account-trigger active:not-aria-[haspopup]:translate-y-0"
              title={user.displayName}
              aria-label={[user.displayName, tier].filter(Boolean).join(' · ')}
            >
              <UserIdentityPill user={user} tier={tier} />
              <Icon name="chevronDown" className="sidebar-account-chevron" />
            </Button>
          }
        >
          {({ FoundationMenuItem }) => (
            <AccountMenuItems
              signedIn={user.isSignedIn}
              accountTrigger={accountTrigger}
              close={close}
              navigate={navigate}
              label={label}
              FoundationMenuItem={FoundationMenuItem}
            />
          )}
        </DeferredMenu>
        {isMobile ? (
          <Button
            type="button"
            className="sidebar-mobile-new-chat"
            title={label('新建会话', 'New chat')}
            aria-label={label('新建会话', 'New chat')}
            onClick={() => {
              getLegacyActions().navigation.startNewChat();
              closeSidebarOnMobile();
            }}
          >
            <Icon name="plus" />
            <span>{label('新建会话', 'New chat')}</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
