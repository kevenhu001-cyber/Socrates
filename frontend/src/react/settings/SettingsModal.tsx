import { flushSync } from 'react-dom';
import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '../ui/shadcn/dialog';
import { cn } from 'cn';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { useSettingsSnapshot, installSettingsBridge } from './settings.bridge';
import { closeSettings, getSettingsReturnFocus } from './settings.service';
import { setModalOpen } from '../../ui/modalA11y.ts';
import { SettingsHeader, SettingsMobileBack, SettingsNavigation } from './SettingsModalChrome';
import { SettingsPanes } from './SettingsPanes';
import { useSettingsDialogA11y } from './useSettingsDialogA11y';
import { useSettingsNavigation } from './useSettingsNavigation';
import { useSettingsPreferences } from './useSettingsPreferences';

const MOBILE_SETTINGS_QUERY = '(max-width: 720px)';

function matchesMobileSettings(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_SETTINGS_QUERY).matches;
}

function SettingsModal() {
  const snapshot = useSettingsSnapshot();
  const preferences = useSettingsPreferences();
  const navigation = useSettingsNavigation(preferences.label);
  const [isMobile, setIsMobile] = useState(matchesMobileSettings);
  const [mobileIndexOpen, setMobileIndexOpen] = useState(matchesMobileSettings);
  const previousSection = useRef(navigation.section);
  useSettingsDialogA11y(snapshot.open);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SETTINGS_QUERY);
    const update = () => {
      setIsMobile(media.matches);
      if (snapshot.open) setMobileIndexOpen(media.matches);
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [snapshot.open]);

  useEffect(() => {
    if (snapshot.open && isMobile && previousSection.current !== navigation.section) {
      setMobileIndexOpen(false);
      window.requestAnimationFrame(() => document.getElementById('settingsMobileBack')?.focus());
    }
    previousSection.current = navigation.section;
  }, [isMobile, navigation.section, snapshot.open]);

  const selectSection = (section: typeof navigation.section) => {
    navigation.setSection(section);
    if (isMobile) {
      setMobileIndexOpen(false);
      window.requestAnimationFrame(() => document.getElementById('settingsMobileBack')?.focus());
    }
  };

  const backToIndex = () => {
    setMobileIndexOpen(true);
    window.requestAnimationFrame(() => document.getElementById('settingsSearchInput')?.focus());
  };

  const changeQuery = isMobile && mobileIndexOpen ? navigation.setQueryOnly : navigation.setQuery;

  return (
    <Dialog open={snapshot.open} onOpenChange={(open) => { if (!open) closeSettings(); }}>
      <DialogContent layout="settings" keepMounted showCloseButton={false}
        className="settings-modal settings-modal--full"
        data-mobile-index={isMobile ? String(mobileIndexOpen) : undefined}
        backdropProps={{ id: 'settingsOverlay', className: cn('settings-overlay', !snapshot.open && 'hidden') }}
        initialFocus={() => document.getElementById('settingsCloseBtn')}
        finalFocus={() => { setModalOpen('settingsOverlay', false); return getSettingsReturnFocus() || false; }}>
        <SettingsHeader label={preferences.label} />
        <div className="settings-shell">
          <SettingsNavigation
            categories={navigation.categories}
            label={preferences.label}
            query={navigation.query}
            section={navigation.section}
            onQueryChange={changeQuery}
            onSectionChange={selectSection}
          />
          <div className="settings-body">
            <SettingsMobileBack label={preferences.label} onBack={backToIndex} />
            {navigation.hasNoSearchResults
              ? <p className="settings-search-empty" role="status">
                {preferences.label('没有匹配的设置，请尝试其他关键词。', 'No matching settings. Try another keyword.')}
              </p>
              : null}
            <SettingsPanes
              section={navigation.section}
              hideAll={navigation.hasNoSearchResults}
              language={preferences.language}
              externalApiOn={snapshot.externalApiOn}
              label={preferences.label}
              savePreference={preferences.savePreference}
              reportSaveError={preferences.reportSaveError}
              onLanguageChange={preferences.changeLanguage}
            />
          </div>
          {preferences.saveError
            ? <p className="settings-save-error" role="status">{preferences.saveError}</p>
            : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Mount the React-owned settings surface. The legacy settings module only
 * publishes open state and provider configuration through the typed bridge.
 */
const rootSlot = createRootSlot('settings-modal');

export function mountSettingsModal(): void {
  let container = document.getElementById('settingsModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'settingsModalReactRoot';
    document.body.appendChild(container);
  }
  flushSync(() => rootSlot.mount(container, <SettingsModal />, installSettingsBridge));
}
