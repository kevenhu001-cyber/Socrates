import { useSyncExternalStore } from 'react';
import { isIncognitoOn, subscribeIncognito } from '../../app/lifecycle/incognitoState.ts';

/** Subscribe React chrome to incognito session state. */
export function useIncognito() {
  return useSyncExternalStore(subscribeIncognito, isIncognitoOn, isIncognitoOn);
}
