/**
 * RN-14 — the learner's flashcard review deck. Every self-rating on a
 * flashcard (remembered / fuzzy / forgot) schedules that card with the
 * shared SM-2 rules (packages/ui/src/learn/review.ts); the deck lives in
 * localStorage so it outlasts the session it came from. The home learning
 * modes read the due count from here and open the review on press.
 *
 * Also keeps each flashcard's on-screen state (face, rating) for the page's
 * lifetime, so a reply that re-renders (KaTeX arriving, the final renderer,
 * a language switch) does not turn a card back or drop its rating.
 */
import {
  EMPTY_REVIEW_DECK,
  dueReviewCards,
  parseReviewDeck,
  rateReviewCard,
  reviewCardKey,
  reviewDaysUntil,
  type FlashcardState,
  type RecallRating,
  type ReviewCard,
  type ReviewDeck,
} from '@socrates/ui/learn-model';
import { reportSwallow } from '../util/reportSwallow.ts';
import { REVIEW_DECK_BASE, learnerStorageKey } from './learnerStorage.ts';

let deck: ReviewDeck | null = null;
/** The storage key `deck` was read from; a different signed-in user re-reads. */
let deckKey = '';
const listeners = new Set<() => void>();
let storageBound = false;

function readStored(key: string): ReviewDeck {
  try {
    return parseReviewDeck(localStorage.getItem(key));
  } catch (_) {
    return EMPTY_REVIEW_DECK;
  }
}

function bindStorage(): void {
  if (storageBound || typeof window === 'undefined') return;
  storageBound = true;
  /* Another tab rated a card: pick up its deck. */
  window.addEventListener('storage', (event) => {
    if (event.key !== deckKey && event.key !== null) return;
    deck = readStored(deckKey);
    listeners.forEach((listener) => listener());
  });
}

export function getReviewDeck(): ReviewDeck {
  const key = learnerStorageKey(REVIEW_DECK_BASE);
  if (!deck || key !== deckKey) {
    deckKey = key;
    deck = readStored(key);
  }
  bindStorage();
  return deck;
}

export function subscribeReviewDeck(listener: () => void): () => void {
  bindStorage();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function publish(next: ReviewDeck): void {
  if (next === deck) return;
  deck = next;
  try { localStorage.setItem(deckKey, JSON.stringify(next)); }
  catch (error) { reportSwallow(error, 'tutor/reviewDeck.persist', 'expected'); }
  listeners.forEach((listener) => listener());
}

/** Schedule a card from its rating. Returns the card as now scheduled, or null for a blank front. */
export function recordReview(front: string, back: string, rating: RecallRating, now = Date.now()): ReviewCard | null {
  const next = rateReviewCard(getReviewDeck(), { front, back }, rating, now);
  /* getReviewDeck() above settled deckKey for the signed-in user. */
  publish(next);
  return next.cards[reviewCardKey(front)] ?? null;
}

export function reviewCardFor(front: string): ReviewCard | null {
  return getReviewDeck().cards[reviewCardKey(front)] ?? null;
}

/** Cards due by the end of today, most overdue first. */
export function dueCards(now = Date.now()): ReviewCard[] {
  return dueReviewCards(getReviewDeck(), now);
}

/** Whole days until the card is due again (0 = later today). */
export function daysUntilReview(card: ReviewCard, now = Date.now()): number {
  return reviewDaysUntil(card.due, now);
}

/* ── On-screen flashcard state ─────────────────────────────────────── */

const UI_LIMIT = 200;
const uiStates = new Map<string, FlashcardState>();

export function flashcardUiState(front: string): FlashcardState | null {
  return uiStates.get(reviewCardKey(front)) ?? null;
}

export function rememberFlashcardUiState(front: string, state: FlashcardState): void {
  const key = reviewCardKey(front);
  if (!key) return;
  uiStates.delete(key);
  uiStates.set(key, state);
  while (uiStates.size > UI_LIMIT) uiStates.delete(uiStates.keys().next().value as string);
}

/** Account boundary / test seam: forget the in-memory copies. */
export function resetReviewDeckCache(): void {
  deck = null;
  deckKey = '';
  uiStates.clear();
  listeners.forEach((listener) => listener());
}
