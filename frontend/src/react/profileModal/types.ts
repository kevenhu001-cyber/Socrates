export interface ProfileUserSnapshot {
  initials: string;
  displayName: string;
  email: string;
  joinedAt: string;
  verifiedAt: string | null;
  userId: string;
  tier: string;
  subEnd: string | null;
}

export interface ProfileSnapshot {
  isOpen: boolean;
  user: ProfileUserSnapshot;
  webSearchOn: boolean;
  currentLang: string;
  instResponse: string;
  instAbout: string;
  instSaveState: { text: string; className: string } | null;
  revision: number;
}

export interface ProfileBridge {
  getSnapshot: () => ProfileSnapshot;
  publish: (snapshot: Omit<ProfileSnapshot, 'revision'>) => void;
  subscribe: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    __socratesProfileBridge?: ProfileBridge;
  }
}
