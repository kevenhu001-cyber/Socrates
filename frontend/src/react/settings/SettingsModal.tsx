import { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { hostIsMountedBy, markHostMountedBy } from '../lib/boot/ownership';
import { useSettingsSnapshot, installSettingsBridge } from './settings.bridge';
import { closeSettings } from './settings.service';
import { SettingsHeader, SettingsNavigation } from './SettingsModalChrome';
import { SettingsPanes } from './SettingsPanes';
import { useSettingsDialogA11y } from './useSettingsDialogA11y';
import { useSettingsNavigation } from './useSettingsNavigation';
import { useSettingsPreferences } from './useSettingsPreferences';

function SettingsModal() {
  const snapshot = useSettingsSnapshot();
  const overlayRef = useRef<HTMLDivElement>(null);
  const preferences = useSettingsPreferences();
  const navigation = useSettingsNavigation(preferences.label);
  useSettingsDialogA11y(snapshot.open, overlayRef);

  const handleOverlayClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget) closeSettings();
  };

  return (
    <div
      ref={overlayRef}
      className={'settings-overlay' + (snapshot.open ? '' : ' hidden')}
      id="settingsOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settingsTitle"
      onClick={handleOverlayClick}
    >
      <div className="settings-modal settings-modal--full" onClick={(event) => event.stopPropagation()}>
        <SettingsHeader label={preferences.label} onClose={closeSettings} />
        <div className="settings-shell">
          <SettingsNavigation
            categories={navigation.categories}
            label={preferences.label}
            query={navigation.query}
            section={navigation.section}
            onQueryChange={navigation.setQuery}
            onSectionChange={navigation.setSection}
          />
          <div className="settings-body">
            <SettingsPanes
              section={navigation.section}
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
      </div>
    </div>
  );
}

/**
 * Mount the React-owned settings surface. The legacy settings module only
 * publishes open state and provider configuration through the typed bridge.
 */
export function mountSettingsModal(): void {
  let container = document.getElementById('settingsModalReactRoot');
  if (!container) {
    container = document.createElement('div');
    container.id = 'settingsModalReactRoot';
    document.body.appendChild(container);
  }
  if (hostIsMountedBy(container, 'settings-modal')) return;
  markHostMountedBy(container, 'settings-modal');
  installSettingsBridge();
  const root = createRoot(container);
  flushSync(() => root.render(<SettingsModal />));
}
