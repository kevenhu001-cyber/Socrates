import { useBridge } from '../../lib/bridge/useBridge.ts';
import { usageState } from '../../ui/usageState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';

export function useUsageSnapshot() {
  return useBridge(usageState);
}

export function useUsageDispatch(): { close: () => void } {
  return {
    close: () => getLegacyActions().navigation.closeUsageModal(),
  };
}
