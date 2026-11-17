import { useBridge } from '../../store/useBridge.ts';
import { usageState } from '../../legacy/usageState.ts';
import { getLegacyActions } from '../legacy/gateway.ts';

export function useUsageSnapshot() {
  return useBridge(usageState);
}

export function useUsageDispatch(): { close: () => void } {
  return {
    close: () => getLegacyActions().navigation.closeUsageModal(),
  };
}
