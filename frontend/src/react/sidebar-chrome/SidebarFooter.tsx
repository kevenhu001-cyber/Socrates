import { Separator as ShadcnSeparator } from '../ui/Separator';
import { Button } from '../ui/shadcn/button';
import { Icon } from '../../legacy/Icon';
import { useCallback, useRef, useState } from 'react';
import { useUserInfo } from './sidebarChrome.store';
import { getCurrentLang, getLegacyActions } from '../legacy/gateway.ts';
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
  user,
  tier,
  accountTrigger,
  close,
  navigate,
  label,
  FoundationMenuItem,
}: {
  user: ReturnType<typeof useUserInfo>;
  tier: string;
  accountTrigger: React.RefObject<HTMLButtonElement | null>;
  close: () => void;
  navigate: (section: 'general' | 'personalization') => void;
  label: (zh: string, en: string) => string;
  FoundationMenuItem: React.ComponentType<{
    className?: string;
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
        className="account-menu-identity"
        onClick={() => {
          close();
          getLegacyActions().navigation.openProfile(accountTrigger.current);
        }}
      >
        <UserIdentityPill user={user} tier={tier} />
        <Icon name="chevronRight" />
      </FoundationMenuItem>
      <ShadcnSeparator />
      <FoundationMenuItem onClick={() => navigate('personalization')}>
        <Icon name="sliders" />
        {label('个性化', 'Personalization')}
      </FoundationMenuItem>
      <FoundationMenuItem
        onClick={() => {
          close();
          getLegacyActions().navigation.openProfile(accountTrigger.current);
        }}
      >
        <Icon name="user" />
        {label('个人资料', 'Profile')}
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
      {user.isSignedIn && (
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
            </Button>
          }
        >
          {({ FoundationMenuItem }) => (
            <AccountMenuItems
              user={user}
              tier={tier}
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
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="sidebar-quick-settings"
            title={label('设置', 'Settings')}
            aria-label={label('设置', 'Settings')}
            onPointerEnter={preloadSettingsPage}
            onFocus={preloadSettingsPage}
            onClick={() => navigate('general')}
          >
            <Icon name="gear" />
          </Button>
        )}
      </div>
    </div>
  );
}
