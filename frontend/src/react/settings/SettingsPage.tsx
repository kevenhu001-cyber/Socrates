import { useEffect, useRef } from 'react';
import { mountOwnedRoot } from '../lib/boot/ownedRoot';
import { useNavigationStore } from '../../sidebar/navigation.store';
import { WebUiTheme } from '../rn/WebUiTheme';
import { useSettingsSnapshot, installSettingsBridge } from './settings.bridge';
import { closeSettings } from './settings.service';
import { SettingsMobileBack, SettingsNavigation } from './SettingsPageChrome';
import { AccountPageHeader } from './AccountPageHeader';
import { SettingsPanes } from './SettingsPanes';
import { getSettingsNavigation } from './settingsNavigation';
import type { SettingsSection } from './settings.types';
import { useSettingsPreferences } from './useSettingsPreferences';

const MOBILE_SETTINGS_QUERY = '(max-width: 720px)';
const settings = installSettingsBridge();

function SettingsPage() {
  const active = useNavigationStore((state) => state.activeDestination === 'settings');
  const { section, query, mobileDetail, externalApiOn } = useSettingsSnapshot();
  const preferences = useSettingsPreferences();
  const navigation = getSettingsNavigation(preferences.label, section, query);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) return;
    const mobileBack = window.matchMedia(MOBILE_SETTINGS_QUERY).matches
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
    settings.publish({ section: next, mobileDetail: true });
    if (body.current) body.current.scrollTop = 0;
    if (window.matchMedia(MOBILE_SETTINGS_QUERY).matches) {
      window.requestAnimationFrame(() => document.getElementById('settingsMobileBack')?.focus());
    }
  };

  const backToIndex = () => {
    settings.publish({ mobileDetail: false });
    window.requestAnimationFrame(() => document.getElementById('settingsSearchInput')?.focus());
  };

  const changeQuery = (next: string) => {
    settings.publish({
      query: next,
      section:
        window.matchMedia(MOBILE_SETTINGS_QUERY).matches && !mobileDetail
          ? section
          : navigation.sectionForQuery(next),
    });
  };

  return (
    <WebUiTheme>
      <div className="settings-page account-page-content" data-mobile-index={String(!mobileDetail)}>
        <AccountPageHeader
          titleId="settingsTitle"
          title={preferences.label('设置', 'Settings')}
          backLabel={preferences.label('返回', 'Back')}
          backId="settingsCloseBtn"
          onBack={closeSettings}
        />
        <div className="settings-shell">
          <SettingsNavigation
            categories={navigation.categories}
            label={preferences.label}
            query={query}
            section={section}
            onQueryChange={changeQuery}
            onSectionChange={selectSection}
          />
          <div className="settings-body" ref={body}>
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
            {preferences.saveError ? (
              <p className="settings-save-error" role="status">
                {preferences.saveError}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </WebUiTheme>
  );
}

export function mountSettingsPage(): void {
  const host = document.getElementById('settingsPage');
  if (host) mountOwnedRoot(host, 'settings-page', <SettingsPage />);
}
