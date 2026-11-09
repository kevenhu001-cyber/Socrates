import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

let settingsModalImport: Promise<typeof import('./SettingsModal')> | null = null;

export function loadSettingsModal(): Promise<typeof import('./SettingsModal')> {
  if (!settingsModalImport) {
    settingsModalImport = import('./SettingsModal').catch((error: unknown) => {
      settingsModalImport = null;
      throw error;
    });
  }
  return settingsModalImport;
}

/** Start downloading the modal and its first pane before the user opens it. */
export function preloadSettingsModal(): void {
  void loadSettingsModal().catch((error: unknown) => {
    reportEmptyCatch(error, 'empty catch: react/settings/settings.preload.ts:preload-modal');
  });
  void import('./GeneralSettingsPane').catch((error: unknown) => {
    reportEmptyCatch(error, 'empty catch: react/settings/settings.preload.ts:preload-general-pane');
  });
}
