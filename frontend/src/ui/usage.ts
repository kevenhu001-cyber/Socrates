// Usage modal data and request lifecycle. The React usage modal owns all markup
// and interaction state; this module only controls the API and typed snapshot.

import { apiFetch } from '../util/api.ts';
import {
  publishUsageData,
  publishUsageError,
  publishUsageLoading,
  setUsageOpen,
} from './usageState.ts';
import type { UsageEntry, UsageLimits, UsagePeriod } from './usageModel.ts';

interface UsageDailyResponse {
  entries: UsageEntry[];
}

let requestRevision = 0;

export function openUsageModal(): void {
  setUsageOpen(true);
  void loadUsagePeriod('year');
}

export function closeUsageModal(): void {
  setUsageOpen(false);
}

export function loadUsageData(): Promise<void> {
  return loadUsagePeriod('year');
}

export function loadUsageMonth(): Promise<void> {
  return loadUsagePeriod('month');
}

export function loadUsagePeriod(period: UsagePeriod): Promise<void> {
  const revision = ++requestRevision;
  publishUsageLoading(period);
  const days = period === 'month' ? 31 : 365;
  return Promise.all([
    apiFetch<UsageDailyResponse>(`/api/usage/daily?days=${days}`),
    apiFetch<UsageLimits>('/api/usage/limits'),
  ]).then(([data, limits]) => {
    if (revision !== requestRevision) return;
    publishUsageData(Array.isArray(data.entries) ? data.entries : [], limits, period);
  }).catch(() => {
    if (revision !== requestRevision) return;
    publishUsageError(period, period === 'month' ? 'usage.failedGeneric' : 'usage.failed');
  });
}
