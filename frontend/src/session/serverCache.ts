/* session/serverCache.ts — centralized server session list cache.
 * Extracted from main.js module-level vars to enable safe loader/recents
 * extraction. Single mutable container shared by main.js and new modules.
 * Preserves the window.SERVER_SESSIONS getter/setter contract (capSessions
 * on set) and the read-only window.SERVER_SESSIONS_FETCH_FAILED getter.
 * Zero-behavior-change.
 */
import { capSessions, type SessionRow } from './store.ts';

export interface ServerCache {
  sessions: SessionRow[];
  fetchFailed: boolean;
  /* Session context-menu guard: while non-null, clicks on the matching
     recent-item are suppressed (mobile long-press synthetic click). */
  ctxMenuSessionId: string | null;
}

export const serverCache: ServerCache = {
  sessions: [],
  fetchFailed: false,
  ctxMenuSessionId: null,
};

try {
  Object.defineProperty(window, 'SERVER_SESSIONS', {
    configurable: true,
    get: function () { return serverCache.sessions; },
    set: function (v) { serverCache.sessions = capSessions(v); },
  });
  Object.defineProperty(window, 'SERVER_SESSIONS_FETCH_FAILED', {
    configurable: true,
    get: function () { return serverCache.fetchFailed; },
  });
} catch {
  /* empty-catch: intentional — property redefinition can fail in tests */
}
