import { createImmutableBridge } from '../lib/bridge/createImmutableBridge.ts';
import type { UsageEntry, UsageLimits, UsagePeriod } from './usageModel.ts';

export type UsageStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface UsageSnapshot {
  open: boolean;
  status: UsageStatus;
  errorKey: 'usage.failed' | 'usage.failedGeneric' | null;
  entries: UsageEntry[];
  limits: UsageLimits | null;
  period: UsagePeriod;
  revision: number;
}

type UsageAction =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'loading'; period: UsagePeriod }
  | { type: 'loaded'; period: UsagePeriod; entries: UsageEntry[]; limits: UsageLimits }
  | { type: 'error'; period: UsagePeriod; errorKey: NonNullable<UsageSnapshot['errorKey']> };

export const usageState = createImmutableBridge<UsageSnapshot, UsageAction>({
  initial: {
    open: false,
    status: 'idle',
    errorKey: null,
    entries: [],
    limits: null,
    period: 'year',
    revision: 0,
  },
  reducer: (state, action) => {
    switch (action.type) {
      case 'open':
        return { ...state, open: true };
      case 'close':
        return { ...state, open: false };
      case 'loading':
        return { ...state, status: 'loading', errorKey: null, period: action.period };
      case 'loaded':
        return {
          ...state,
          status: 'loaded',
          errorKey: null,
          period: action.period,
          entries: action.entries,
          limits: action.limits,
        };
      case 'error':
        return { ...state, status: 'error', errorKey: action.errorKey, period: action.period };
    }
  },
});

export function setUsageOpen(open: boolean): void {
  usageState.dispatch({ type: open ? 'open' : 'close' });
}

export function publishUsageLoading(period: UsagePeriod): void {
  usageState.dispatch({ type: 'loading', period });
}

export function publishUsageData(entries: UsageEntry[], limits: UsageLimits, period: UsagePeriod): void {
  usageState.dispatch({
    type: 'loaded',
    period,
    entries: entries.map((entry) => ({ ...entry })),
    limits: { ...limits },
  });
}

export function publishUsageError(period: UsagePeriod, errorKey: NonNullable<UsageSnapshot['errorKey']>): void {
  usageState.dispatch({ type: 'error', period, errorKey });
}
