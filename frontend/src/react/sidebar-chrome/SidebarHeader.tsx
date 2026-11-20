import { useLayoutEffect } from 'react';
import { t } from '../legacy/gateway.ts';
import { useUserInfo } from './sidebarChrome.store';
import { setSidebarSearchOpen, useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { useMobileViewport } from './useMobileViewport.ts';
import { toggleSidebar } from '../../sidebar/sidebar.service.ts';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { useDomTitle, webClass } from '../rn/webHost';
import { SidebarBrand, SidebarHeaderActions, SidebarIconAction } from '@socrates/ui/shell';
import type { TextStyle } from 'react-native';

const LOGO = { uri: '/logo.png' };
const MOBILE_BRAND_NAME = {
  fontSize: 'var(--ui-font-size-xxl)',
  lineHeight: 32,
} as unknown as TextStyle;

/** Host bindings for the shared sidebar brand and controls. */
export function SidebarHeader() {
  useLocaleRefresh();
  const sidebarOpen = useSidebarStore((snapshot) => snapshot.isOpen);
  const searchOpen = useSidebarStore((snapshot) => snapshot.searchOpen);
  /* The fold is store state; the `#sidebar` host (outside React) only
     mirrors it as a class for the drawer's grid transition. */
  useLayoutEffect(() => {
    document.getElementById('sidebar')?.classList.toggle('search-open', searchOpen);
    if (searchOpen)
      window.requestAnimationFrame(() => document.getElementById('sidebarSearch')?.focus());
  }, [searchOpen]);
  const isMobile = useMobileViewport();
  const closeButtonHidden = isMobile && !sidebarOpen;
  const closeSidebarKey = sidebarOpen ? 'chrome.closeSidebar' : 'chrome.openSidebar';
  const closeSidebarLabel = t(closeSidebarKey);
  const searchLabel = t('sidebar.filterRecents');
  useDomTitle('sidebarSearchBtn', searchLabel);
  useDomTitle('sidebarCloseBtn', closeSidebarLabel);
  // Subscribe to the chrome bridge so the header re-renders on user change.
  useUserInfo();
  /* Reference header glyphs (search, collapse) are 20px on the phone too. */
  const iconSize = 20;

  return (
    <WebUiTheme>
      <SidebarBrand
        name="Socrates"
        logo={LOGO}
        compact={isMobile}
        hideLogo={isMobile}
        nameStyle={isMobile ? MOBILE_BRAND_NAME : undefined}
        hostStyle={webClass('sidebar-logo')}
      />
      <SidebarHeaderActions hostStyle={webClass('sidebar-header-actions')}>
        <SidebarIconAction
          id="sidebarSearchBtn"
          icon="search"
          label={searchLabel}
          i18nKey="sidebar.filterRecents"
          controls="sidebarSearch"
          expanded={searchOpen}
          iconSize={iconSize}
          hostStyle={webClass(isMobile && 'btn-icon', 'sidebar-search-btn')}
          onPress={() => setSidebarSearchOpen(!searchOpen)}
        />
        <SidebarIconAction
          id="sidebarCloseBtn"
          icon="panel"
          label={closeSidebarLabel}
          i18nKey={closeSidebarKey}
          controls="sidebar"
          expanded={sidebarOpen}
          visible={!closeButtonHidden}
          iconSize={iconSize}
          hostStyle={webClass(isMobile && 'btn-icon')}
          onPress={() => {
            toggleSidebar();
          }}
        />
      </SidebarHeaderActions>
    </WebUiTheme>
  );
}
