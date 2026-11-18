import { closeAccountPage, openAccountPage } from '../../sidebar/navigation.service';
import { getActiveDestination } from '../../sidebar/navigation.store';
import { reportSwallow } from '../../util/reportSwallow';
import { installSettingsBridge, getSettingsSnapshot } from './settings.bridge';
import type { SettingsSection } from './settings.types';

function readExternalApiPreference(): boolean {
  try {
    const saved = localStorage.getItem('socrates-external-api');
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function initializeSettingsService(): void {
  if (getSettingsSnapshot().revision === 0) {
    installSettingsBridge().publish({ externalApiOn: readExternalApiPreference() });
  }
}

export function openSettings({
  section,
  mobileIndex = false,
  returnFocus,
}: {
  section?: SettingsSection;
  mobileIndex?: boolean;
  returnFocus?: HTMLElement | null;
} = {}): void {
  const current = getSettingsSnapshot();
  installSettingsBridge().publish(
    section
      ? { section, query: '', mobileDetail: !mobileIndex }
      : { mobileDetail: getActiveDestination() === 'settings' && current.mobileDetail },
  );
  openAccountPage('settings', returnFocus);
}

export function closeSettings(): void {
  if (getActiveDestination() === 'settings') closeAccountPage();
}

export function toggleExternalApi(): void {
  const externalApiOn = !getSettingsSnapshot().externalApiOn;
  try {
    localStorage.setItem('socrates-external-api', JSON.stringify(externalApiOn));
  } catch (error) {
    reportSwallow(error, 'settings.toggleExternalApi');
  }
  installSettingsBridge().publish({ externalApiOn });
}

initializeSettingsService();
