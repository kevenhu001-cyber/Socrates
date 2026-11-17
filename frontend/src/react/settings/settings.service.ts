import { showToast } from '../../legacy/toast.js';
import { publishProfileSnapshot } from '../../legacy/profile.ts';
import { i18n } from '../legacy/gateway';
import { installSettingsBridge, getSettingsSnapshot } from './settings.bridge';
import { reportSwallow as reportEmptyCatch } from '../../util/reportSwallow.ts';
import { loadSettingsModal } from './settings.preload';
import type { SettingsSection } from './settings.types';

let settingsReturnFocus: HTMLElement | null = null;
let pendingOpen: symbol | undefined;

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

export async function openSettings({
  section,
  mobileIndex = false,
  returnFocus,
}: {
  section?: SettingsSection;
  mobileIndex?: boolean;
  returnFocus?: HTMLElement | null;
} = {}): Promise<void> {
  const active = document.activeElement;
  const trigger =
    returnFocus ?? (active instanceof HTMLElement && active !== document.body ? active : null);
  const request = Symbol();
  pendingOpen = request;
  try {
    const { mountSettingsModal } = await loadSettingsModal();
    if (pendingOpen !== request) return;
    mountSettingsModal();
  } catch {
    if (pendingOpen === request) {
      showToast(i18n('toast.settingsLoadFailed', 'Could not load settings. Please try again.'));
    }
    return;
  } finally {
    if (pendingOpen === request) pendingOpen = undefined;
  }
  const current = getSettingsSnapshot();
  if (!current.open) settingsReturnFocus = trigger;
  installSettingsBridge().publish(
    section
      ? { open: true, section, query: '', mobileDetail: !mobileIndex }
      : { open: true, mobileDetail: current.open && current.mobileDetail },
  );
  publishProfileSnapshot();
}

export function closeSettings(): void {
  pendingOpen = undefined;
  installSettingsBridge().publish({ open: false });
}

export function toggleExternalApi(): void {
  const externalApiOn = !getSettingsSnapshot().externalApiOn;
  try {
    localStorage.setItem('socrates-external-api', JSON.stringify(externalApiOn));
  } catch (error) {
    reportEmptyCatch(error, 'empty catch: react/settings/settings.service.ts');
    /* Preference is still updated for this page session. */
  }
  installSettingsBridge().publish({ externalApiOn });
}

initializeSettingsService();
