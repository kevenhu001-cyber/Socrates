import { useLayoutEffect } from 'react';
import { t } from '../legacy/gateway.ts';
import { useUserInfo } from './sidebarChrome.store';
import { setSidebarSearchOpen, useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { useMobileViewport } from './useMobileViewport.ts';
import { toggleSidebar } from '../../sidebar/sidebar.service.ts';
import { startNewChat } from '../../app/lifecycle.ts';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { useDomTitle, webClass } from '../rn/webHost';
import { SidebarBrand, SidebarHeaderActions, SidebarIconAction } from '@socrates/ui/shell';

const LOGO = { uri: '/logo.png' };

/**
 * RN-7 — the sidebar header is the shared RN shell part
 * (packages/ui/src/shell/Sidebar.tsx). This host supplies ids, copy and
 * callbacks, and keeps the structural class hooks the drawer CSS keys on
 * (`.sidebar-logo`, `.sidebar-header-actions`, and `.btn-icon`, the phone
 * tap-target marker; desktop keeps the RN part's own 32px pill).
 *
 * Desktop draws the panel glyph on the collapse control (it toggles the
 * rail); the phone drawer draws the ×.
 */
export function SidebarHeader() {
  useLocaleRefresh();
  const sidebarOpen = useSidebarStore((snapshot) => snapshot.isOpen);
  const searchOpen = useSidebarStore((snapshot) => snapshot.searchOpen);
  /* The fold is store state; the `#sidebar` host (outside React) only
     mirrors it as a class for the drawer's grid transition. */
  useLayoutEffect(() => {
    document.getElementById('sidebar')?.classList.toggle('search-open', searchOpen);
    if (searchOpen) window.requestAnimationFrame(() => document.getElementById('sidebarSearch')?.focus());
  }, [searchOpen]);
  const isMobile = useMobileViewport();
  const closeButtonHidden = isMobile && !sidebarOpen;
  const closeSidebarKey = sidebarOpen ? 'chrome.closeSidebar' : 'chrome.openSidebar';
  const closeSidebarLabel = t(closeSidebarKey);
  const searchLabel = t('sidebar.searchPlaceholder');
  const newChatLabel = t('sidebar.startNewChat');
  useDomTitle('sidebarSearchBtn', searchLabel);
  useDomTitle('newChatBtn', newChatLabel);
  useDomTitle('sidebarCloseBtn', closeSidebarLabel);
  // Subscribe to the chrome bridge so the header re-renders on user change.
  useUserInfo();
  const iconSize = isMobile ? 24 : 20;

  return (
    <WebUiTheme>
      <SidebarBrand name="Socrates" logo={LOGO} compact={isMobile} hostStyle={webClass('sidebar-logo')} />
      <SidebarHeaderActions hostStyle={webClass('sidebar-header-actions')}>
        <SidebarIconAction
          id="sidebarSearchBtn"
          icon="search"
          label={searchLabel}
          i18nKey="sidebar.searchPlaceholder"
          controls="sidebarSearch"
          expanded={searchOpen}
          iconSize={iconSize}
          hostStyle={webClass(isMobile && 'btn-icon', 'sidebar-search-btn')}
          onPress={() => setSidebarSearchOpen(!searchOpen)}
        />
        <SidebarIconAction
          id="newChatBtn"
          icon="compose"
          label={newChatLabel}
          i18nKey="sidebar.startNewChat"
          iconSize={iconSize}
          hostStyle={webClass(isMobile && 'btn-icon', 'compose-btn')}
          onPress={() => { void startNewChat(); }}
        />
        <SidebarIconAction
          id="sidebarCloseBtn"
          icon={isMobile ? 'close' : 'panel'}
          label={closeSidebarLabel}
          i18nKey={closeSidebarKey}
          controls="sidebar"
          expanded={sidebarOpen}
          visible={!closeButtonHidden}
          iconSize={iconSize}
          hostStyle={webClass(isMobile && 'btn-icon')}
          onPress={() => { toggleSidebar(); }}
        />
      </SidebarHeaderActions>
    </WebUiTheme>
  );
}
