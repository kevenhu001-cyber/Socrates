import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export interface UserInfo {
  initials: string;
  displayName: string;
  email: string;
  tier: string;
  tierLabel: string;
  isSignedIn: boolean;
}

export interface SidebarUserSnapshot {
  user: UserInfo;
  revision: number;
}

type SidebarUserUpdate = Omit<SidebarUserSnapshot, 'revision'>;

export const sidebarUserState = createImmutableBridge<SidebarUserSnapshot, SidebarUserUpdate>({
  initial: {
    user: {
      initials: '?',
      displayName: 'Guest',
      email: '',
      tier: 'diophantus',
      tierLabel: 'Free',
      isSignedIn: false,
    },
    revision: 0,
  },
  reducer: (_state, update) => ({ ...update, user: { ...update.user } }),
});

export function publishSidebarUser(user: UserInfo): void {
  sidebarUserState.dispatch({ user });
}
