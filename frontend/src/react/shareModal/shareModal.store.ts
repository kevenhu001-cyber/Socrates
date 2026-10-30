import { useBridge } from '../../lib/bridge/useBridge.ts';
import { shareState, type ShareVisibility } from '../../ui/shareState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';

export function useShareSnapshot() {
  return useBridge(shareState);
}

export function useShareDispatch() {
  const share = getLegacyActions().share;
  return {
    selectVis: (visibility: ShareVisibility) => share.selectShareVis(visibility),
    createLink: () => share.createShareLink(),
    copyLink: () => share.copyShareLink(),
    revokeLink: () => share.revokeShareLink(),
    close: () => share.closeShareModal(),
  };
}
