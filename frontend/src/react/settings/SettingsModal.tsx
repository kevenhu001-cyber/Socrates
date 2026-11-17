import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '../ui/shadcn/dialog';
import { cn } from 'cn';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { useSettingsSnapshot, installSettingsBridge } from './settings.bridge';
import { closeSettings, getSettingsReturnFocus } from './settings.service';
import { setModalOpen } from '../../ui/modalA11y.ts';
import { SettingsHeader, SettingsMobileBack, SettingsNavigation } from './SettingsModalChrome';
import { SettingsPanes } from './SettingsPanes';
import { useSettingsDialogA11y } from './useSettingsDialogA11y';
import { getSettingsNavigation } from './settingsNavigation';
import type { SettingsSection } from './settings.types';
import { useSettingsPreferences } from './useSettingsPreferences';

const MOBILE_SETTINGS_QUERY = '(max-width: 720px)';
const settings = installSettingsBridge();

function matchesMobileSettings(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_SETTINGS_QUERY).matches;
}

function SettingsModal() {
  const snapshot = useSettingsSnapshot();
  const preferences = useSettingsPreferences();
  const { section, query, mobileDetail } = snapshot;
  const navigation = getSettingsNavigation(preferences.label, section, query);
  const [isMobile, setIsMobile] = useState(matchesMobileSettings);
  useSettingsDialogA11y(snapshot.open);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SETTINGS_QUERY);
    const update = (event: MediaQueryListEvent) => {
      setIsMobile(event.matches);
      if (settings.getSnapshot().mobileDetail) settings.publish({ mobileDetail: false });
    };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  const selectSection = (next: SettingsSection) => {
    settings.publish({ section: next, mobileDetail: isMobile });
    if (isMobile) {
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
      section: isMobile && !mobileDetail ? section : navigation.sectionForQuery(next),
    });
  };

  return (
    <Dialog
      open={snapshot.open}
      onOpenChange={(open) => {
        if (!open) closeSettings();
      }}
    >
      <DialogContent
        layout="settings"
        keepMounted
        showCloseButton={false}
        className="settings-modal settings-modal--full"
        data-mobile-index={isMobile ? String(!mobileDetail) : undefined}
        backdropProps={{
          id: 'settingsOverlay',
          className: cn('settings-overlay', !snapshot.open && 'hidden'),
        }}
        initialFocus={() =>
          document.getElementById(
            isMobile && mobileDetail ? 'settingsMobileBack' : 'settingsCloseBtn',
          )
        }
        finalFocus={() => {
          setModalOpen('settingsOverlay', false);
          return getSettingsReturnFocus() || false;
        }}
      >
        <SettingsHeader label={preferences.label} />
        <div className="settings-shell">
          <SettingsNavigation
            categories={navigation.categories}
            label={preferences.label}
            query={query}
            section={section}
            onQueryChange={changeQuery}
            onSectionChange={selectSection}
          />
          <div className="settings-body">
            <SettingsMobileBack label={preferences.label} onBack={backToIndex} />
            {navigation.hasNoSearchResults ? (
              <p className="settings-search-empty" role="status">
                {preferences.label(
                  '没有匹配的设置，请尝试其他关键词。',
                  'No matching settings. Try another keyword.',
                )}
              </p>
            ) : null}
            <SettingsPanes
              open={snapshot.open}
              section={section}
              hideAll={navigation.hasNoSearchResults}
              language={preferences.language}
              externalApiOn={snapshot.externalApiOn}
              label={preferences.label}
              savePreference={preferences.savePreference}
              reportSaveError={preferences.reportSaveError}
              onLanguageChange={preferences.changeLanguage}
            />
          </div>
          {preferences.saveError ? (
            <p className="settings-save-error" role="status">
              {preferences.saveError}
            </p>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const rootSlot = createRootSlot('settings-modal');

export function mountSettingsModal(): void {
  let container = document.getElementById('settingsModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'settingsModalReactRoot';
    document.body.appendChild(container);
  }
  rootSlot.mount(container, <SettingsModal />);
}
