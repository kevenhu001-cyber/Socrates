import type { KeyValueStore } from '@socrates/platform';
import { create } from 'zustand';

export type ThemeMode = 'light' | 'dark';
export interface SettingsState {
  theme: ThemeMode;
  language: 'en' | 'zh';
  haptics: boolean;
  hydrate(storage: KeyValueStore): Promise<void>;
  update(patch: Partial<Pick<SettingsState, 'theme' | 'language' | 'haptics'>>, storage?: KeyValueStore): Promise<void>;
}
const key = 'socrates.settings';
export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark', language: 'en', haptics: true,
  hydrate: async (storage) => {
    try {
      const raw = await storage.get(key);
      const value = raw ? JSON.parse(raw) : {};
      if (!value || typeof value !== 'object') return;
      set({
        theme: value.theme === 'light' ? 'light' : 'dark',
        language: value.language === 'zh' ? 'zh' : 'en',
        haptics: typeof value.haptics === 'boolean' ? value.haptics : true,
      });
    } catch { /* unavailable storage or corrupt cache retains safe defaults */ }
  },
  update: async (patch, storage) => { set(patch); if (storage) await storage.set(key, JSON.stringify(useSettingsStore.getState(), ['theme', 'language', 'haptics'])); },
}));
