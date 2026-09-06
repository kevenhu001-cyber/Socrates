/* session/serverCache.js — centralized server session list cache.
 * Extracted from main.js module-level vars to enable safe loader/recents
 * extraction. Single mutable container shared by main.js and new modules.
 * Preserves the window.SERVER_SESSIONS getter/setter contract (capSessions
 * on set) and the read-only window.SERVER_SESSIONS_FETCH_FAILED getter.
 * Zero-behavior-change.
 */
import { capSessions } from './store.js';

export var serverCache = {
  sessions: [],
  fetchFailed: false,
  /* Session context-menu guard: while non-null, clicks on the matching
     recent-item are suppressed (mobile long-press synthetic click). */
  ctxMenuSessionId: null,
};

try {
  Object.defineProperty(window, 'SERVER_SESSIONS', {
    configurable: true,
    get: function () { return serverCache.sessions; },
    set: function (v) { serverCache.sessions = capSessions(v); }
  });
  Object.defineProperty(window, 'SERVER_SESSIONS_FETCH_FAILED', {
    configurable: true,
    get: function () { return serverCache.fetchFailed; }
  });
} catch (_) {}
