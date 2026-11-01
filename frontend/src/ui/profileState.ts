import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

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
  /** Whether the profile modal is on screen. React owns the overlay's
   *  visibility; the legacy module only publishes this flag. */
  open: boolean;
  user: ProfileUserSnapshot;
  webSearchOn: boolean;
  currentLang: string;
  instResponse: string;
  instAbout: string;
  instSaveState: { text: string; className: string } | null;
  revision: number;
}

type ProfileUpdate = Omit<ProfileSnapshot, 'revision'>;

export const profileState = createImmutableBridge<ProfileSnapshot, ProfileUpdate>({
  initial: {
    open: false,
    user: {
      initials: '',
      displayName: '',
      email: '',
      joinedAt: '',
      verifiedAt: null,
      userId: '',
      tier: 'diophantus',
      subEnd: null,
    },
    webSearchOn: false,
    currentLang: 'en',
    instResponse: '',
    instAbout: '',
    instSaveState: null,
    revision: 0,
  },
  reducer: (_state, update) => ({ ...update, user: { ...update.user } }),
});

export function publishProfileState(update: ProfileUpdate): void {
  profileState.dispatch(update);
}
