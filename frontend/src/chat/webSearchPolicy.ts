import { webSearchOn } from '../config/providers.ts';
import { searchBridge, sessionBridge } from '../store/index.ts';

const SEARCH_REFRESH_EVERY = 5;

/* Keep the refresh decision tiny and eager-loadable. The 16KB search
 * implementation should only be requested after this policy says a refresh
 * is actually due. */
export function shouldRefreshSearch(): boolean {
  if (!webSearchOn) return false;
  const last = (searchBridge.getSnapshot().searchContextAt as number) || 0;
  if (Date.now() - last < 30000) return false;
  if (!searchBridge.getSnapshot().searchContextQuery) return false;
  return (sessionBridge.getSnapshot().totalQ as number) % SEARCH_REFRESH_EVERY === 0;
}
