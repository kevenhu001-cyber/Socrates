import { useBridge } from '../../lib/bridge/useBridge.ts';
import { profileState } from '../../ui/profileState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';
import type { ProfileDispatch } from './types';

export function useProfileSnapshot() {
  return useBridge(profileState);
}

export function useProfileDispatch(): ProfileDispatch {
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
