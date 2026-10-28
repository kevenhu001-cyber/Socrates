import { flushSync } from 'react-dom';
import { Dialog, DialogContent } from '../ui/shadcn/dialog';
import { cn } from 'cn';
import { createRootSlot } from '../lib/boot/ownedRoot';
import { useSettingsSnapshot, installSettingsBridge } from './settings.bridge';
import { closeSettings, getSettingsReturnFocus } from './settings.service';
import { setModalOpen } from '../../ui/modalA11y.js';
import { SettingsHeader, SettingsNavigation } from './SettingsModalChrome';
import { SettingsPanes } from './SettingsPanes';
import { useSettingsDialogA11y } from './useSettingsDialogA11y';
import { useSettingsNavigation } from './useSettingsNavigation';
import { useSettingsPreferences } from './useSettingsPreferences';

function SettingsModal() {
  const snapshot = useSettingsSnapshot();
  const preferences = useSettingsPreferences();
  const navigation = useSettingsNavigation(preferences.label);
  useSettingsDialogA11y(snapshot.open);

  return (
    <Dialog open={snapshot.open} onOpenChange={(open) => { if (!open) closeSettings(); }}>
      <DialogContent layout="settings" keepMounted showCloseButton={false}
        className="settings-modal settings-modal--full"
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
