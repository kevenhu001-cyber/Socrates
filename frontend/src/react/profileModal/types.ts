export type { ProfileSnapshot, ProfileUserSnapshot } from '../../ui/profileState.ts';

export interface ProfileDispatch {
  close: () => void;
  /** Resolves false when the rename was rejected, so the caller can restore
   *  its draft. */
  saveName: (name: string) => Promise<boolean>;
  onInstChange: (response: string, about: string) => void;
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
