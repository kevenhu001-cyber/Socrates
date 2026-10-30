import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';

export interface UsageSnapshot {
  bodyHtml: string;
  period: UsagePeriod;
  revision: number;
}

export type UsagePeriod = 'year' | 'month';

type UsageUpdate = Omit<UsageSnapshot, 'revision'>;

export const usageState = createImmutableBridge<UsageSnapshot, UsageUpdate>({
  initial: { bodyHtml: '', period: 'year', revision: 0 },
  reducer: (_state, update) => update,
});

export function publishUsageState(bodyHtml: string, period: UsagePeriod): void {
  usageState.dispatch({ bodyHtml, period });
}
