import { useSyncExternalStore } from 'react';

import {
  getProfileSnapshot,
  subscribeToProfile,
} from './profileModalStore';
import type { ProfileSnapshot } from './types';

declare global {
  interface Window {
    closeProfile?: () => void;
    saveProfileName?: (name: string) => void;
    onCustomInstructionsChange?: () => void;
    toggleProfileWebSearch?: () => void;
    openUsageModal?: () => void;
    openStorageModal?: () => void;
    openPromptTemplatesModal?: () => void;
    confirmClearCache?: () => void;
    confirmClearSettings?: () => void;
    confirmDeleteAccount?: () => void;
    signOut?: () => void;
    setLang?: (lang: string) => void;
    openProfile?: () => void;
    t?: (key: string) => string;
    _currentLang?: string;
  }
}

export function useProfileSnapshot(): ProfileSnapshot {
  return useSyncExternalStore(
    subscribeToProfile,
    getProfileSnapshot,
    getProfileSnapshot,
  );
}

export function useIsProfileOpen(): boolean {
  return useSyncExternalStore(
    subscribeToProfile,
    () => getProfileSnapshot().isOpen,
    () => false,
  );
}

export function useProfileDispatch() {
  return {
    close: () => { if (typeof window.closeProfile === 'function') window.closeProfile(); },
    saveName: (name: string) => { if (typeof window.saveProfileName === 'function') window.saveProfileName(name); },
    onInstChange: () => { if (typeof window.onCustomInstructionsChange === 'function') window.onCustomInstructionsChange(); },
    toggleWebSearch: () => { if (typeof window.toggleProfileWebSearch === 'function') window.toggleProfileWebSearch(); },
    openUsage: () => { if (typeof window.openUsageModal === 'function') window.openUsageModal(); },
    openStorage: () => { if (typeof window.openStorageModal === 'function') window.openStorageModal(); },
    openPromptTemplates: () => { if (typeof window.openPromptTemplatesModal === 'function') window.openPromptTemplatesModal(); },
    clearCache: () => { if (typeof window.confirmClearCache === 'function') window.confirmClearCache(); },
    clearSettings: () => { if (typeof window.confirmClearSettings === 'function') window.confirmClearSettings(); },
    deleteAccount: () => { if (typeof window.confirmDeleteAccount === 'function') window.confirmDeleteAccount(); },
    signOut: () => { if (typeof window.signOut === 'function') window.signOut(); },
    setLang: (lang: string) => { if (typeof window.setLang === 'function') window.setLang(lang); },
  };
}
