import { webSearchOn } from '../config/providers.js';
import { stateStore } from '../state/store.js';

const SEARCH_REFRESH_EVERY = 5;

/* Keep the refresh decision tiny and eager-loadable. The 16KB search
 * implementation should only be requested after this policy says a refresh
 * is actually due. */
export function shouldRefreshSearch() {
  if (!webSearchOn) return false;
  const store = typeof window !== 'undefined' && window.stateStore
    ? window.stateStore
    : stateStore;
  const last = store.read('searchContextAt') || 0;
  if (Date.now() - last < 30000) return false;
  if (!store.read('searchContextQuery')) return false;
  return (store.read('totalQ') % SEARCH_REFRESH_EVERY) === 0;
}
