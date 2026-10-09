import { installFindInSessionBridge, getFindInSessionSnapshot } from './find.bridge';
import { runHighlightQuery, navigateNext, navigatePrev, closeHighlights } from './findHighlight';
import { FIND_BAR_ID, FIND_INPUT_ID } from './findInSession.constants';

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
