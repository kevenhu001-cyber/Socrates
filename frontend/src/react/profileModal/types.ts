export type { ProfileSnapshot, ProfileUserSnapshot } from '../../ui/profileState.ts';

export interface ProfileDispatch {
  close: () => void;
  saveName: (name: string) => void;
  onInstChange: () => void;
  toggleWebSearch: () => void;
  openUsage: () => void;
  openStorage: () => void;
  openPromptTemplates: () => void;
  clearCache: () => void;
  clearSettings: () => void;
  deleteAccount: () => void;
  signOut: () => void;
  setLang: (lang: string) => void;
}
