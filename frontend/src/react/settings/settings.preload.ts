import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';

let settingsPageImport: Promise<typeof import('./SettingsPage')> | null = null;

export function loadSettingsPage(): Promise<typeof import('./SettingsPage')> {
  if (!settingsPageImport) {
    settingsPageImport = import('./SettingsPage').catch((error: unknown) => {
      settingsPageImport = null;
      throw error;
    });
  }
  return settingsPageImport;
}

/** Start downloading the page and its first pane before the user opens it. */
export function preloadSettingsPage(): void {
  void loadSettingsPage().catch((error: unknown) => {
    reportEmptyCatch(error, 'empty catch: react/settings/settings.preload.ts:preload-page');
  });
  void import('./GeneralSettingsPane').catch((error: unknown) => {
    reportEmptyCatch(error, 'empty catch: react/settings/settings.preload.ts:preload-general-pane');
  });
}
