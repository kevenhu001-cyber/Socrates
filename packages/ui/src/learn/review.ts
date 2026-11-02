/**
 * RN-14 — spaced review for flashcards, DOM-free and React-free.
 *
 * A small SM-2 variant keyed to the card's three self-ratings:
 *   - good   (remembered) the gap grows: 1 day, then 3 days, then × ease,
 *            and the card gets a little easier (ease + 0.1, at most 2.8);
 *   - fuzzy  still counts as recalled, but the gap only grows by × 1.2
 *            (at least 1 day) and the card gets harder (ease − 0.15);
 *   - forgot the card starts over: back in ten minutes, the same day,
 *            and harder (ease − 0.2). Ease never drops below 1.3.
 *
 * A deck is plain JSON so any host can persist it (the web shell keeps it
 * in localStorage). Cards are keyed by their normalised front, so the same
 * card asked again in another reply is the same card.
 */
import type { RecallRating } from './model';

export const REVIEW_DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_RELEARN_MS = 10 * 60 * 1000;
export const REVIEW_EASE_START = 2.5;
export const REVIEW_EASE_MIN = 1.3;
export const REVIEW_EASE_MAX = 2.8;
/** Most cards a deck keeps; the ones rated longest ago go first. */
export const REVIEW_DECK_LIMIT = 500;
const KEY_LIMIT = 160;
const FIELD_LIMIT = 4000;

export interface ReviewCard {
  /** Normalised front: the card's identity. */
  id: string;
  front: string;
  back: string;
  /** Successful recalls in a row (reset by "forgot"). */
  reps: number;
  /** Current gap in days (0 while relearning). */
  interval: number;
  ease: number;
  /** When the card is next due (epoch ms). */
  due: number;
  lastRating: RecallRating;
  ratedAt: number;
}

export interface ReviewDeck {
  version: 1;
  cards: Record<string, ReviewCard>;
}

export const EMPTY_REVIEW_DECK: ReviewDeck = Object.freeze({ version: 1, cards: Object.freeze({}) as Record<string, ReviewCard> }) as ReviewDeck;

/** The identity of a card: its front with markup and runs of space flattened. */
export function reviewCardKey(front: string): string {
  const text = String(front ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const chars = Array.from(text);
  return chars.length > KEY_LIMIT ? `${chars.slice(0, KEY_LIMIT - 1).join('')}…` : text;
}

function clampEase(value: number): number {
  return Math.min(REVIEW_EASE_MAX, Math.max(REVIEW_EASE_MIN, Math.round(value * 100) / 100));
}

/** Schedule one rating. `previous` is the card as it stood, if it was seen before. */
export function scheduleReview(previous: Pick<ReviewCard, 'reps' | 'interval' | 'ease'> | null | undefined, rating: RecallRating, now: number): Pick<ReviewCard, 'reps' | 'interval' | 'ease' | 'due'> {
  const reps = previous?.reps ?? 0;
  const interval = previous?.interval ?? 0;
  const ease = previous?.ease ?? REVIEW_EASE_START;
  if (rating === 'forgot') {
    return { reps: 0, interval: 0, ease: clampEase(ease - 0.2), due: now + REVIEW_RELEARN_MS };
  }
  const nextReps = reps + 1;
  if (rating === 'fuzzy') {
    const days = nextReps === 1 ? 1 : Math.max(1, Math.round(interval * 1.2));
    return { reps: nextReps, interval: days, ease: clampEase(ease - 0.15), due: now + days * REVIEW_DAY_MS };
  }
  const days = nextReps === 1 ? 1 : nextReps === 2 ? 3 : Math.max(1, Math.round(interval * ease));
  return { reps: nextReps, interval: days, ease: clampEase(ease + 0.1), due: now + days * REVIEW_DAY_MS };
}

function trimField(value: string): string {
  const text = String(value ?? '');
  return text.length > FIELD_LIMIT ? text.slice(0, FIELD_LIMIT) : text;
}

/** Record a rating for the card with this front/back. Returns a new deck; a blank front changes nothing. */
export function rateReviewCard(deck: ReviewDeck, card: { front: string; back: string }, rating: RecallRating, now: number): ReviewDeck {
  const id = reviewCardKey(card.front);
  if (!id) return deck;
  const previous = deck.cards[id];
  const next: ReviewCard = {
    id,
    front: trimField(card.front),
    back: trimField(card.back || previous?.back || ''),
    ...scheduleReview(previous, rating, now),
    lastRating: rating,
    ratedAt: now,
  };
  const cards = { ...deck.cards, [id]: next };
  const ids = Object.keys(cards);
  if (ids.length > REVIEW_DECK_LIMIT) {
    ids.sort((a, b) => cards[a].ratedAt - cards[b].ratedAt);
    for (const stale of ids.slice(0, ids.length - REVIEW_DECK_LIMIT)) delete cards[stale];
  }
  return { version: 1, cards };
}

/** End of the local calendar day `now` falls in (epoch ms). */
export function endOfLocalDay(now: number): number {
  const date = new Date(now);
  date.setHours(23, 59, 59, 999);
  return date.getTime();
}

/** Cards due by the end of today, the most overdue first. */
export function dueReviewCards(deck: ReviewDeck, now: number): ReviewCard[] {
  const cutoff = endOfLocalDay(now);
  return Object.values(deck.cards)
    .filter((card) => card.due <= cutoff)
    .sort((a, b) => a.due - b.due || a.ratedAt - b.ratedAt);
}

export function dueReviewCount(deck: ReviewDeck, now: number): number {
  return dueReviewCards(deck, now).length;
}

/** Whole days from today until `due` (0 = later today or overdue). */
export function reviewDaysUntil(due: number, now: number): number {
  const today = endOfLocalDay(now);
  if (due <= today) return 0;
  return Math.ceil((due - today) / REVIEW_DAY_MS);
}

function isRating(value: unknown): value is RecallRating {
  return value === 'good' || value === 'fuzzy' || value === 'forgot';
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Read a stored deck. Anything malformed is dropped card by card; never throws. */
export function parseReviewDeck(raw: unknown): ReviewDeck {
  let value = raw;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { return { version: 1, cards: {} }; }
  }
  const source = value && typeof value === 'object' ? (value as { cards?: unknown }).cards : null;
  if (!source || typeof source !== 'object') return { version: 1, cards: {} };
  const cards: Record<string, ReviewCard> = {};
  for (const entry of Object.values(source as Record<string, unknown>)) {
    if (!entry || typeof entry !== 'object') continue;
    const card = entry as Partial<ReviewCard>;
    const id = reviewCardKey(typeof card.front === 'string' ? card.front : '');
    if (!id || !isRating(card.lastRating)) continue;
    cards[id] = {
      id,
      front: trimField(card.front as string),
      back: typeof card.back === 'string' ? trimField(card.back) : '',
      reps: Math.max(0, Math.floor(finite(card.reps, 0))),
      interval: Math.max(0, finite(card.interval, 0)),
      ease: clampEase(finite(card.ease, REVIEW_EASE_START)),
      due: finite(card.due, 0),
      lastRating: card.lastRating,
      ratedAt: finite(card.ratedAt, 0),
    };
  }
  return { version: 1, cards };
}
