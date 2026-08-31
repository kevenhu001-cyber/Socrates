/**
 * Profile modal bridge — M2 single-bridge migration.
 *
 * Legacy `ui/profile.js` publishes user info and instructions through
 * `window.__socratesProfileBridge.publish(...)`. The factory owns the
 * snapshot/reducer loop; this module adds the legacy alias and React
 * hooks.
 */

import { createImmutableBridge, useBridge } from '../../lib/bridge';
import { getLegacyActions } from '../legacy/gateway';
import type { ProfileBridge, ProfileSnapshot } from './types';

declare global {
  interface Window {
    __socratesProfileBridge?: ProfileBridge;
  }
}

const INITIAL_USER = Object.freeze({
  initials: '',
  displayName: '',
  email: '',
  joinedAt: '',
  verifiedAt: null,
  userId: '',
  tier: 'diophantus',
  subEnd: null,
});

const HIDDEN: ProfileSnapshot = Object.freeze({
  isOpen: false,
  user: INITIAL_USER,
  webSearchOn: false,
  currentLang: 'en',
  instResponse: '',
  instAbout: '',
  instSaveState: null,
  revision: 0,
});

type Action = Omit<ProfileSnapshot, 'revision'>;

const factoryBridge = createImmutableBridge<ProfileSnapshot, Action>({
  initial: HIDDEN,
  reducer: (state, action) => ({
    ...action,
    user: { ...action.user },
    revision: state.revision + 1,
  }),
});

const bridge: ProfileBridge = Object.assign(factoryBridge, {
  publish: factoryBridge.dispatch,
}) as ProfileBridge;

export function installProfileBridge(): ProfileBridge {
  if (typeof window !== 'undefined') {
    if (!window.__socratesProfileBridge) {
      window.__socratesProfileBridge = bridge;
    }
    return window.__socratesProfileBridge;
  }
  return bridge;
}

export function getProfileSnapshot(): ProfileSnapshot {
  return installProfileBridge().getSnapshot();
}

export function subscribeToProfile(listener: () => void): () => void {
  return installProfileBridge().subscribe(listener);
}

export function useProfileSnapshot(): ProfileSnapshot {
  return useBridge(factoryBridge);
}

export function useIsProfileOpen(): boolean {
  return useBridge(factoryBridge).isOpen;
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
