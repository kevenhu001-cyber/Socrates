import { showToast } from '../../ui/toast.js';
import { publishProfileSnapshot } from '../../ui/profile.js';
import { installSettingsBridge, getSettingsSnapshot } from './settings.bridge';

function readExternalApiPreference(): boolean {
  try {
    const saved = localStorage.getItem('socrates-external-api');
    return saved === null ? true : saved === 'true';
  } catch {
    return true;
  }
}

export function initializeSettingsService(): void {
  installSettingsBridge();
  if (getSettingsSnapshot().revision === 0) {
    installSettingsBridge().publish({ open: false, externalApiOn: readExternalApiPreference() });
  }
}

export async function openSettings(): Promise<void> {
  try {
    const { mountSettingsModal } = await import('./SettingsModal');
    mountSettingsModal();
  } catch {
    showToast('Could not load settings. Please try again.');
    return;
  }
  installSettingsBridge().publish({ open: true });
  publishProfileSnapshot();
}

export function closeSettings(): void {
  installSettingsBridge().publish({ open: false });
}

export function toggleExternalApi(): void {
  const externalApiOn = !getSettingsSnapshot().externalApiOn;
  try { localStorage.setItem('socrates-external-api', JSON.stringify(externalApiOn)); }
  catch { /* Preference is still updated for this page session. */ }
  installSettingsBridge().publish({ externalApiOn });
}

initializeSettingsService();
