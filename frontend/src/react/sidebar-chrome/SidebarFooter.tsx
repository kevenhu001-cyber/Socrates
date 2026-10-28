import { Separator as ShadcnSeparator } from '../ui/Separator';
import { Button } from '../ui/Button';
import { Icon } from '../../ui/Icon';
import { useCallback, useState } from 'react';
import { CircleUserRound, LifeBuoy, LogOut } from 'lucide-react';
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
      trigger={<Button type="button" className="sidebar-account-trigger"
        title={user.displayName} aria-label={[user.displayName, tier].filter(Boolean).join(' · ')}>{identity}</Button>}>
      {({ FoundationMenuItem }) => <>
      <FoundationMenuItem className="account-menu-identity" onClick={() => { close(); getLegacyActions().navigation.openProfile(); }}>{identity}<Icon name="chevronRight" /></FoundationMenuItem>
      <ShadcnSeparator />
      <FoundationMenuItem onClick={() => navigate('personalization')}><Icon name="sliders" />{label('个性化', 'Personalization')}</FoundationMenuItem>
      <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.openProfile(); }}><CircleUserRound strokeWidth={1.75} aria-hidden="true" />{label('个人资料', 'Profile')}</FoundationMenuItem>
      <FoundationMenuItem onClick={() => navigate('general')}><Icon name="gear" />{label('设置', 'Settings')}</FoundationMenuItem>
      <ShadcnSeparator />
      <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.openCheatsheet(); }}><LifeBuoy strokeWidth={1.75} aria-hidden="true" />{label('帮助', 'Help')}<Icon name="chevronRight" className="account-menu-trailing" /></FoundationMenuItem>
      {user.isSignedIn && <FoundationMenuItem onClick={() => { close(); getLegacyActions().navigation.signOut(); }}><LogOut strokeWidth={1.75} aria-hidden="true" />{label('退出登录', 'Sign out')}</FoundationMenuItem>}
      </>}
    </DeferredMenu>
  </div>;
}
