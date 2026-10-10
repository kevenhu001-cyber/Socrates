import { useCallback, useRef, useState } from 'react';
import { ChevronRight, CircleUserRound, LifeBuoy, LogOut, Settings, Sparkles, SlidersHorizontal } from 'lucide-react';
import { useUserInfo } from './sidebarChrome.bridge';
import { getCurrentLang, getLegacyActions } from '../legacy/gateway.ts';
import { AnchoredMenu } from '../menu/AnchoredMenu';

export function SidebarFooter() {
  const user = useUserInfo();
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
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
    <button type="button" ref={anchor} className="sidebar-account-trigger" aria-haspopup="menu"
      aria-expanded={open} title={user.displayName} aria-label={[user.displayName, tier].filter(Boolean).join(' · ')} onClick={() => setOpen(!open)}>
      {identity}
    </button>
    {open && <AnchoredMenu anchor={anchor} onClose={close} above className="sidebar-account-menu">
      <button type="button" role="menuitem" className="account-menu-identity" onClick={() => { close(); getLegacyActions().navigation.openProfile(); }}>{identity}<ChevronRight /></button>
      <hr />
      <a role="menuitem" href="https://topodrive.top/pricing"><Sparkles />{label('升级套餐', 'Upgrade plan')}</a>
      <button type="button" role="menuitem" onClick={() => navigate('personalization')}><SlidersHorizontal />{label('个性化', 'Personalization')}</button>
      <button type="button" role="menuitem" onClick={() => { close(); getLegacyActions().navigation.openProfile(); }}><CircleUserRound />{label('个人资料', 'Profile')}</button>
      <button type="button" role="menuitem" onClick={() => navigate('general')}><Settings />{label('设置', 'Settings')}</button>
      <hr />
      <button type="button" role="menuitem" onClick={() => { close(); getLegacyActions().navigation.openCheatsheet(); }}><LifeBuoy />{label('帮助', 'Help')}<ChevronRight className="account-menu-trailing" /></button>
      {user.isSignedIn && <button type="button" role="menuitem" onClick={() => { close(); getLegacyActions().navigation.signOut(); }}><LogOut />{label('退出登录', 'Sign out')}</button>}
    </AnchoredMenu>}
  </div>;
}
