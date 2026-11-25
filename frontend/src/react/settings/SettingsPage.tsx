import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { useNavigationStore } from '../../sidebar/navigation.store';
import { WebUiTheme } from '../rn/WebUiTheme';
import { useSettingsSnapshot, installSettingsBridge } from './settings.bridge';
import { closeSettings } from './settings.service';
import { SettingsMobileBack, SettingsMobileSearch, SettingsNavigation } from './SettingsPageChrome';
import { AccountPageHeader } from './AccountPageHeader';
import { SettingsPanes } from './SettingsPanes';
import { getSettingsNavigation } from './settingsNavigation';
import type { SettingsSection } from './settings.types';
import { useSettingsPreferences } from './useSettingsPreferences';

const MOBILE_SETTINGS_QUERY = '(max-width: 768px)';
const settings = installSettingsBridge();

function subscribeMobileLayout(onChange: () => void) {
  const media = window.matchMedia(MOBILE_SETTINGS_QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

function isMobileLayout() {
  return window.matchMedia(MOBILE_SETTINGS_QUERY).matches;
}

function SettingsPage() {
  const active = useNavigationStore((state) => state.activeDestination === 'settings');
  const { section, query, mobileDetail, externalApiOn } = useSettingsSnapshot();
  const mobile = useSyncExternalStore(subscribeMobileLayout, isMobileLayout);
  const [searchOpen, setSearchOpen] = useState(false);
  const preferences = useSettingsPreferences();
  const navigation = getSettingsNavigation(preferences.label, section, query);
  const body = useRef<HTMLDivElement>(null);
  const indexScroll = useRef(0);

  /* The search field belongs to the phone index: a detail view or a closed
     page must not carry the open state into the next visit, or the toggle
     would close a field the user never opened. */
  useEffect(() => {
    if (!active || mobileDetail) setSearchOpen(false);
  }, [active, mobileDetail]);

  useEffect(() => {
    if (!active) return;
    const mobileBack = isMobileLayout()
      ? body.current?.querySelector<HTMLElement>('#settingsMobileBack')
      : null;
    (mobileBack?.getClientRects().length
      ? mobileBack
      : document.getElementById('settingsTitle')
    )?.focus({
      preventScroll: true,
    });
  }, [active]);

  const selectSection = (next: SettingsSection) => {
    if (mobile) {
      indexScroll.current = document.querySelector('#settingsPage .settings-nav')?.scrollTop ?? 0;
    }
    settings.publish({ section: next, mobileDetail: true });
    if (body.current) body.current.scrollTop = 0;
    if (mobile) {
      window.requestAnimationFrame(() =>
        document.getElementById('settingsMobileBack')?.focus({ preventScroll: true }),
      );
    }
  };

  const backToIndex = () => {
    settings.publish({ mobileDetail: false });
    window.requestAnimationFrame(() => {
      const nav = document.querySelector<HTMLElement>('#settingsPage .settings-nav');
      if (nav) nav.scrollTop = indexScroll.current;
      document.querySelector<HTMLElement>(`#settingsPage [data-section="${section}"]`)?.focus({ preventScroll: true });
    });
  };

  const changeQuery = (next: string) => {
    settings.publish({
      query: next,
      section: mobile && !mobileDetail ? section : navigation.sectionForQuery(next),
    });
  };

  const toggleSearch = () => {
    const willOpen = !searchOpen && !query;
    setSearchOpen(willOpen);
    if (willOpen) {
      window.requestAnimationFrame(() => document.getElementById('settingsSearchInput')?.focus());
    } else {
      changeQuery('');
    }
  };

  const mobileIndex = mobile && !mobileDetail;
  const saveError = preferences.saveError ? (
    <p className="settings-save-error" role="status">
      {preferences.saveError}
    </p>
  ) : null;

  return (
    <WebUiTheme>
      <div className="settings-page account-page-content" data-mobile-index={String(!mobileDetail)}>
        <AccountPageHeader
          titleId="settingsTitle"
          title={preferences.label('设置', 'Settings')}
          backLabel={
            mobile
              ? preferences.label('返回', 'Back')
              : preferences.label('关闭设置', 'Close settings')
          }
          backId="settingsCloseBtn"
          backIcon={mobile ? 'chevronLeft' : 'close'}
          onBack={closeSettings}
        >
          {mobileIndex ? (
            <SettingsMobileSearch
              label={preferences.label}
              open={searchOpen || Boolean(query)}
              onToggle={toggleSearch}
            />
          ) : null}
        </AccountPageHeader>
        <div className="settings-shell">
          <SettingsNavigation
            categories={navigation.categories}
            label={preferences.label}
            query={query}
            section={section}
            mobile={mobile}
            searchOpen={searchOpen || Boolean(query)}
            savePreference={preferences.savePreference}
            onQueryChange={changeQuery}
            onSectionChange={selectSection}
          />
          <div className="settings-body" ref={body} role="region" aria-label={preferences.label('设置内容', 'Settings content')}>
            <SettingsMobileBack label={preferences.label} onBack={backToIndex} />
            <SettingsPanes
              open={active}
              section={section}
              hideAll={navigation.hasNoSearchResults}
              language={preferences.language}
              externalApiOn={externalApiOn}
              label={preferences.label}
              savePreference={preferences.savePreference}
              reportSaveError={preferences.reportSaveError}
              onLanguageChange={preferences.changeLanguage}
            />
            {!mobileIndex ? saveError : null}
          </div>
        </div>
        {mobileIndex ? saveError : null}
      </div>
    </WebUiTheme>
  );
}

export function mountSettingsPage(): void {
  const host = document.getElementById('settingsPage');
  if (host) mountOwnedRoot(host, 'settings-page', <SettingsPage />);
}
