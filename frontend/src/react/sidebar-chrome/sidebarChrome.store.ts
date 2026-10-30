import { useBridgeSelector } from '../../lib/bridge/useBridge.ts';
import { sidebarUserState } from '../../ui/sidebarUserState.ts';

export function useUserInfo() {
  return useBridgeSelector(sidebarUserState, (snapshot) => snapshot.user);
}
