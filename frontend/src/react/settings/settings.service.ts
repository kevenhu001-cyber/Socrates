import { showToast } from '../../ui/toast.js';
import { publishProfileSnapshot } from '../../ui/profile.ts';
import { i18n } from '../legacy/gateway';
import { installSettingsBridge, getSettingsSnapshot } from './settings.bridge';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';
import { loadSettingsModal } from './settings.preload';

let settingsReturnFocus: HTMLElement | null = null;

export function getSettingsReturnFocus(): HTMLElement | null {
  return settingsReturnFocus?.isConnected ? settingsReturnFocus : null;
}

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
  /* No boot-time warm-up: an unconditional idle import downloaded the modal
     and its first pane on every home page visit, even for readers who never
     open Settings. The sidebar footer, More menu and Library toolbar already
     preload it on pointer/focus intent, which is the moment that matters. */
}

export async function openSettings(): Promise<void> {
  if (!getSettingsSnapshot().open) {
    const active = document.activeElement;
    settingsReturnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  try {
    const { mountSettingsModal } = await loadSettingsModal();
    mountSettingsModal();
  } catch {
    showToast(i18n('toast.settingsLoadFailed', 'Could not load settings. Please try again.'));
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
  catch (error) {
    reportEmptyCatch(error, 'empty catch: react/settings/settings.service.ts:51');
    /* Preference is still updated for this page session. */
  }
  installSettingsBridge().publish({ externalApiOn });
}

initializeSettingsService();
