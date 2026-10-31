import { useSyncExternalStore } from 'react';
import { getAppMode, subscribeAppMode } from '../../config/providers.ts';

/** Subscribe React surfaces to the typed Chat/Tutor mode preference. */
export function useAppMode() {
  return useSyncExternalStore(subscribeAppMode, getAppMode, getAppMode);
}
