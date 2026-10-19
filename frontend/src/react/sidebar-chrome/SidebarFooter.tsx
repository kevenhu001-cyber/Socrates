import { useCallback, useState } from 'react';
import { ChevronRight, CircleUserRound, LifeBuoy, LogOut, Settings, Sparkles, SlidersHorizontal } from 'lucide-react';
import { useUserInfo } from './sidebarChrome.bridge';
import { getCurrentLang, getLegacyActions } from '../legacy/gateway.ts';
import { DeferredMenu } from '../menu/DeferredMenu';

export function SidebarFooter() {
  const user = useUserInfo();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const free = user.tier === 'diophantus' || user.tier === 'free';
  const tier = free ? (getCurrentLang() === 'zh' ? '免费版' : 'Free') : user.tierLabel;
  const label = (zh: string, en: string) => getCurrentLang() === 'zh' ? zh : en;
  const navigate = async (section: string) => {
    close();
    await getLegacyActions().navigation.openSettings();
    document.dispatchEvent(new CustomEvent('socrates:settings-section', { detail: section }));
  };
  const identity = <><span className="user-avatar" aria-hidden="true">{user.initials}</span>
    <span className="user-identity"><span className="user-name">{user.displayName}</span>
      <span className="user-plan"><span className={`tier-badge ${user.tier}`}>{tier}</span></span></span></>;
  return <div className="sidebar-footer-account-wrap">
    <DeferredMenu open={open} onOpenChange={setOpen} above className="sidebar-account-menu"
      label={label('账户', 'Account')}
      trigger={<button type="button" className="sidebar-account-trigger"
        title={user.displayName} aria-label={[user.displayName, tier].filter(Boolean).join(' · ')}>{identity}</button>}>
      {({ FoundationMenuItem, FoundationMenuLink }) => <>
      <FoundationMenuItem className="account-menu-identity" onClick={() => { close(); getLegacyActions().navigation.openProfile(); }}>{identity}<ChevronRight /></FoundationMenuItem>
      <hr />
      <FoundationMenuLink href="https://topodrive.top/pricing"><Sparkles />{label('升级套餐', 'Upgrade plan')}</FoundationMenuLink>
      <FoundationMenuItem onClick={() => navigate('personalization')}><SlidersHorizontal />{label('个性化', 'Personalization')}</FoundationMenuItem>
      <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.openProfile(); }}><CircleUserRound />{label('个人资料', 'Profile')}</FoundationMenuItem>
      <FoundationMenuItem onClick={() => navigate('general')}><Settings />{label('设置', 'Settings')}</FoundationMenuItem>
      <hr />
      <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.openCheatsheet(); }}><LifeBuoy />{label('帮助', 'Help')}<ChevronRight className="account-menu-trailing" /></FoundationMenuItem>
      {user.isSignedIn && <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.signOut(); }}><LogOut />{label('退出登录', 'Sign out')}</FoundationMenuItem>}
      </>}
    </DeferredMenu>
  </div>;
}
