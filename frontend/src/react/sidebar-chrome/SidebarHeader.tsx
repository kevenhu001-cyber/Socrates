import { useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { t } from '../../ui/legacyI18n.ts';
import { useUserInfo } from './sidebarChrome.store';
import { setSidebarSearchOpen, useSidebarStore } from '../../sidebar/sidebar.store.ts';
import { useMobileViewport } from './useMobileViewport.ts';
import { dismissSidebarOnMobile, toggleSidebar } from '../../sidebar/sidebar.service.ts';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { useDomTitle, webClass } from '../rn/webHost';
import { SidebarBrand, SidebarHeaderActions, SidebarIconAction } from '@socrates/ui/shell';
import type { TextStyle } from '@socrates/ui/primitives';

const LOGO = { uri: '/logo.png' };
const MOBILE_BRAND_NAME = {
  fontSize: 'var(--ui-font-size-xxl)',
  lineHeight: '32px',
} as unknown as TextStyle;

/** Host bindings for the shared sidebar brand and controls. */
export function SidebarHeader() {
  useLocaleRefresh();
  const sidebarOpen = useSidebarStore((snapshot) => snapshot.isOpen);
  const searchOpen = useSidebarStore((snapshot) => snapshot.searchOpen);
  /* The fold is store state; the `#sidebar` host (outside React) only
     mirrors it as a class to reveal the search row. */
  useLayoutEffect(() => {
    document.getElementById('sidebar')?.classList.toggle('search-open', searchOpen);
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
        /* The desktop rail folds to 52px: the wordmark has nowhere to go and
           would be clipped mid-word inside the rail. Phones keep it — the
           drawer is 260px even when `isOpen` is false (it is off-canvas). */
        hidden={!isMobile && !sidebarOpen}
        nameStyle={isMobile ? MOBILE_BRAND_NAME : undefined}
        hostStyle={webClass('sidebar-logo')}
      />
      <SidebarHeaderActions hostStyle={webClass('sidebar-header-actions')}>
        <SidebarIconAction
          id="sidebarSearchBtn"
          visible={isMobile}
          icon="search"
          label={searchLabel}
          i18nKey="sidebar.filterRecents"
          controls="sidebarSearch"
          expanded={searchOpen}
          iconSize={24}
          controlSize={44}
          backgroundVar="--sidebar-search-button-bg"
          hostStyle={webClass(isMobile && 'btn-icon', 'sidebar-search-btn')}
          onPress={() => {
            // Reveal and focus in the same tap so mobile browsers can open the keyboard.
            flushSync(() => setSidebarSearchOpen(!searchOpen));
            if (!searchOpen)
              document.getElementById('sidebarSearch')?.focus({ preventScroll: true });
          }}
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
            if (isMobile) dismissSidebarOnMobile();
            else toggleSidebar();
          }}
        />
      </SidebarHeaderActions>
    </WebUiTheme>
  );
}
