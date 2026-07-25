/* Re-export shim — the React/TS source lives in
 * ../react/find-in-session/FindInSession.tsx, which also exports the
 * window.* bridge functions consumed by legacy code. */
export {
  openFindInSession,
  closeFindInSession,
  onFindInput,
  onFindKey,
  findNext,
  findPrev,
  isFindOpen,
} from '../react/find-in-session/FindInSession.tsx';
