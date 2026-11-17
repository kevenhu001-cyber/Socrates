import { useBridgeSelector } from '../../store/useBridge.ts';
import { sidebarUserState } from '../../legacy/sidebarUserState.ts';

export function useUserInfo() {
  return useBridgeSelector(sidebarUserState, (snapshot) => snapshot.user);
}
