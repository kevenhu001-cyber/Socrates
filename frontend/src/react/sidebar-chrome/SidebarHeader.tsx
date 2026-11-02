import { Button } from '../ui/shadcn/button';
import { Icon } from '../../ui/Icon';
import { t } from '../legacy/gateway.ts';
import { sidebarIcons } from '../../sidebar/sidebarIcons';
import { useUserInfo } from './sidebarChrome.store';
import { useLayoutEffect } from 'react';
import { setSidebarSearchOpen, useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { useMobileViewport } from './useMobileViewport.ts';
import { toggleSidebar } from '../../sidebar/sidebar.service.ts';
import { startNewChat } from '../../app/lifecycle.ts';

const NEW_CHAT_ICON = sidebarIcons.newChat;

/* Desktop shows chatgpt.com's panel glyph (the button toggles the rail);
   the phone drawer keeps the ×. styles/parity/sidebar.css picks one. */
const CLOSE_ICON =
  sidebarIcons.panel.replace('<svg ', '<svg class="sidebar-toggle-panel" ')
  + sidebarIcons.close.replace('<svg ', '<svg class="sidebar-toggle-close" ');

const SEARCH_ICON = sidebarIcons.search;

/*
 * `btn-icon` is the phone-specific tap-target marker. Desktop size and radius
 * come from shadcn's icon-sm size and the shell radius token; the phone owner
 * may still expand the target to its reference-pinned 40px.
 */
const ICON_BUTTON = 'btn-icon rounded-[var(--ui-radius-sm)] border-0 active:not-aria-[haspopup]:translate-y-0';

export function SidebarHeader() {
  const sidebarOpen = useSidebarStore((snapshot) => snapshot.isOpen);
  const searchOpen = useSidebarStore((snapshot) => snapshot.searchOpen);
  /* RN-7 — the fold is store state; the `#sidebar` host (outside React)
     only mirrors it as a class for the drawer's grid transition. */
  useLayoutEffect(() => {
    document.getElementById('sidebar')?.classList.toggle('search-open', searchOpen);
    if (searchOpen) window.requestAnimationFrame(() => document.getElementById('sidebarSearch')?.focus());
  }, [searchOpen]);
  const isMobile = useMobileViewport();
  const closeButtonHidden = isMobile && !sidebarOpen;
  const closeSidebarKey = sidebarOpen ? 'chrome.closeSidebar' : 'chrome.openSidebar';
  const closeSidebarLabel = t(closeSidebarKey);
  // Subscribe to the chrome bridge so the header re-renders on user change
  // (even though the header itself doesn't display user info, the bridge
  //  is the single React-side subscription for the chrome).
  useUserInfo();

  return (
    <>
      <div className="sidebar-logo">
        <img
          className="sidebar-logo-img"
          src="/logo.png"
          alt=""
          aria-hidden="true"
          width={20}
          height={20}
        />
        <span>Socrates</span>
        <Icon name="chevronDown" className="cg-sidebar-caret" />
      </div>
      <div className="sidebar-header-actions">
        <Button
          variant="ghost"
          size="icon-sm"
          className={`${ICON_BUTTON} sidebar-search-btn`}
          id="sidebarSearchBtn"
          type="button"
          title={t('sidebar.searchPlaceholder')}
          aria-label={t('sidebar.searchPlaceholder')}
          data-i18n-title="sidebar.searchPlaceholder"
          data-i18n-aria="sidebar.searchPlaceholder"
          aria-controls="sidebarSearch"
          aria-expanded={searchOpen}
          onClick={() => setSidebarSearchOpen(!searchOpen)}
          dangerouslySetInnerHTML={{ __html: SEARCH_ICON }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className={`${ICON_BUTTON} compose-btn`}
          id="newChatBtn"
          title={t('sidebar.startNewChat')}
          aria-label={t('sidebar.startNewChat')}
          data-i18n-title="sidebar.startNewChat"
          data-i18n-aria="sidebar.startNewChat"
          onClick={(e) => {
            e.preventDefault();
            void startNewChat();
          }}
          dangerouslySetInnerHTML={{ __html: NEW_CHAT_ICON }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className={ICON_BUTTON}
          id="sidebarCloseBtn"
          title={closeSidebarLabel}
          aria-label={closeSidebarLabel}
          data-i18n-title={closeSidebarKey}
          data-i18n-aria={closeSidebarKey}
          aria-controls="sidebar"
          aria-expanded={sidebarOpen}
          aria-hidden={closeButtonHidden}
          style={{ display: closeButtonHidden ? 'none' : undefined }}
          onClick={() => {
            toggleSidebar();
          }}
          dangerouslySetInnerHTML={{ __html: CLOSE_ICON }}
        />
      </div>
    </>
  );
}
