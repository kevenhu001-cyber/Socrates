import { useEffect, useRef, useState } from 'react';

import { getLegacyActions, t as translate } from '../legacy/gateway';
import { useUserInfo } from './sidebarChrome.bridge';

function label(key: string, fallback: string): string {
  const value = translate(key);
  return value === key ? fallback : value;
}

export function SidebarFooter() {
  const user = useUserInfo();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!menuRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    const closeEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeEscape);
    };
  }, [open]);

  const pick = (action: 'profile' | 'display' | 'settings' | 'signout') => {
    setOpen(false);
    const navigation = getLegacyActions().navigation;
    if (action === 'profile') navigation.openProfile();
    if (action === 'display') navigation.toggleDisplayPrefs();
    if (action === 'settings') navigation.openSettings();
    if (action === 'signout') navigation.signOut();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="sidebar-account-trigger"
        aria-label={label('sidebar.account.menu', 'Account menu')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="user-avatar">{user.initials}</span>
        <span className="user-identity">
          <span className="user-name">{user.displayName}</span>
          <span className="user-plan"><span className={`tier-badge ${user.tier}`}>{user.tierLabel}</span></span>
        </span>
        <svg className="sidebar-account-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
      </button>
      {open && (
        <div ref={menuRef} className="sidebar-account-menu" role="menu" aria-label={label('sidebar.account.menu', 'Account menu')}>
          <div className="sidebar-account-menu-heading">
            <span className="user-avatar">{user.initials}</span>
            <span><strong>{user.displayName}</strong><small>{user.tierLabel}</small></span>
          </div>
          <div className="sidebar-account-menu-group">
            <button type="button" role="menuitem" onClick={() => pick('profile')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="9" r="3" /><path d="M5 19c1.5-3 4-4.5 7-4.5s5.5 1.5 7 4.5" /></svg><span>{label('sidebar.account.profile', 'Profile')}</span></button>
            <button type="button" role="menuitem" onClick={() => pick('display')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 5v7l4 2" /><path d="m9 17 2 2 4-4" /></svg><span>{label('sidebar.more.display', 'Display & theme')}</span></button>
            <button type="button" role="menuitem" onClick={() => pick('settings')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 3.5h5l.7 2.1 2 .9 2-.9 2.5 4.3-1.6 1.6v1.9l1.6 1.6-2.5 4.3-2-.9-2 .9-.7 2.1h-5l-.7-2.1-2-.9-2 .9-2.5-4.3 1.6-1.6v-1.9L2.3 9.9l2.5-4.3 2 .9 2-.9z" /><circle cx="12" cy="12" r="3" /></svg><span>{label('sidebar.account.settings', 'Settings')}</span></button>
          </div>
          <div className="sidebar-account-menu-group">
            <button type="button" role="menuitem" onClick={() => pick('signout')}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="M14 8l4 4-4 4" /><path d="M9 12h9" /></svg><span>{label('sidebar.more.signOut', 'Sign out')}</span></button>
          </div>
        </div>
      )}
    </>
  );
}
