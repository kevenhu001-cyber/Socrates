import { installFindInSessionBridge, getFindInSessionSnapshot } from './find.bridge';
import { runHighlightQuery, navigateNext, navigatePrev, closeHighlights } from './findHighlight';
import { FIND_BAR_ID, FIND_INPUT_ID } from './findInSession.constants';
import { getHistoryPagingSnapshot, requestAllOlderHistory } from '../../session/historyPagingState.ts';
import { reportSwallow } from '../../util/reportSwallow.ts';

function publishFind(state: { isOpen: boolean; query: string; matchCount: number; activeIndex: number }): void {
  installFindInSessionBridge().publish(state);
}

export function openFindInSession(): void {
  publishFind({ isOpen: true, query: '', matchCount: 0, activeIndex: -1 });
  /* Reveal and focus synchronously, inside the click gesture: mobile
     browsers only raise the soft keyboard for a focus() that happens
     during the user activation, not in a later effect tick. */
  document.getElementById(FIND_BAR_ID)?.classList.remove('hidden');
  const input = document.getElementById(FIND_INPUT_ID) as HTMLInputElement | null;
  input?.focus();
}

export function closeFindInSession(): void {
  closeHighlights();
  publishFind({ isOpen: false, query: '', matchCount: 0, activeIndex: -1 });
}

export function isFindOpen(): boolean {
  return getFindInSessionSnapshot().isOpen;
}

export function onFindInput(value: string): void {
  const query = (value || '').trim();
  const result = runHighlightQuery(query);
  publishFind({ isOpen: true, query, ...result });
  if (query) searchOlderHistory();
}

/* R7 phase 2 — a paginated transcript holds only the pages read so far.
   Search answers from them at once, then reads the remaining older pages and
   re-runs the current query over the whole conversation. */
let olderHistorySearch: Promise<number> | null = null;

function searchOlderHistory(): void {
  if (olderHistorySearch || !getHistoryPagingSnapshot().hasMore) return;
  olderHistorySearch = requestAllOlderHistory();
  void olderHistorySearch.then((added) => {
    olderHistorySearch = null;
    const state = getFindInSessionSnapshot();
    if (added <= 0 || !state.isOpen || !state.query) return;
    const result = runHighlightQuery(state.query);
    publishFind({ isOpen: true, query: state.query, ...result });
  }).catch((error: unknown) => {
    olderHistorySearch = null;
    reportSwallow(error, 'find-in-session.searchOlderHistory', 'expected');
  });
}

function publishNavigation(previous: boolean): void {
  const result = previous ? navigatePrev() : navigateNext();
  publishFind({ isOpen: true, query: getFindInSessionSnapshot().query, ...result });
}

export function onFindKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeFindInSession();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    publishNavigation(event.shiftKey);
  }
}

export function findNext(): void {
  publishNavigation(false);
}

export function findPrev(): void {
  publishNavigation(true);
}
