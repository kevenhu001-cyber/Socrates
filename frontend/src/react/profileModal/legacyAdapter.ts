import { useSyncExternalStore } from 'react';

import {
  getProfileSnapshot,
  subscribeToProfile,
} from './profileModalStore';
import type { ProfileSnapshot } from './types';
import { getLegacyActions } from '../legacy/gateway';

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
  const nav = getLegacyActions().navigation;
  const profile = getLegacyActions().profile;
  return {
    close: () => nav.closeProfile(),
    saveName: (name: string) => profile.saveProfileName(name),
    onInstChange: () => profile.onCustomInstructionsChange(),
    toggleWebSearch: () => profile.toggleProfileWebSearch(),
    openUsage: () => nav.openUsageModal(),
    openStorage: () => nav.openStorageModal(),
    openPromptTemplates: () => nav.openPromptTemplatesModal(),
    clearCache: () => profile.confirmClearCache(),
    clearSettings: () => profile.confirmClearSettings(),
    deleteAccount: () => profile.confirmDeleteAccount(),
    signOut: () => nav.signOut(),
    setLang: (lang: string) => profile.setLang(lang),
  };
}
