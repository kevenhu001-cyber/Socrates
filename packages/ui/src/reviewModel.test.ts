import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EMPTY_REVIEW_DECK,
  REVIEW_DAY_MS,
  REVIEW_DECK_LIMIT,
  REVIEW_EASE_MIN,
  REVIEW_RELEARN_MS,
  dueReviewCards,
  dueReviewCount,
  endOfLocalDay,
  initialFlashcardState,
  parseReviewDeck,
  rateReviewCard,
  resumeFlashcardState,
  reviewCardKey,
  reviewDaysUntil,
  scheduleReview,
} from './learn/model.ts';

/* A fixed local noon so "end of today" is half a day away whatever the zone. */
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime();

test('scheduleReview: remembered grows 1 → 3 → × ease days and eases the card', () => {
  const first = scheduleReview(null, 'good', NOW);
  assert.deepEqual(first, { reps: 1, interval: 1, ease: 2.6, due: NOW + REVIEW_DAY_MS });
  const second = scheduleReview(first, 'good', NOW);
  assert.equal(second.interval, 3);
  assert.equal(second.reps, 2);
  const third = scheduleReview(second, 'good', NOW);
  assert.equal(third.interval, Math.round(3 * second.ease));
  assert.equal(third.ease, 2.8, 'ease is capped');
});

test('scheduleReview: fuzzy keeps the card close and makes it harder', () => {
  const fresh = scheduleReview(null, 'fuzzy', NOW);
  assert.deepEqual(fresh, { reps: 1, interval: 1, ease: 2.35, due: NOW + REVIEW_DAY_MS });
  const later = scheduleReview({ reps: 3, interval: 10, ease: 2.5 }, 'fuzzy', NOW);
  assert.equal(later.interval, 12, '× 1.2, not × ease');
  assert.equal(later.ease, 2.35);
});

test('scheduleReview: forgot starts over in ten minutes and never drops ease under the floor', () => {
  const forgot = scheduleReview({ reps: 4, interval: 20, ease: 1.4 }, 'forgot', NOW);
  assert.deepEqual(forgot, { reps: 0, interval: 0, ease: REVIEW_EASE_MIN, due: NOW + REVIEW_RELEARN_MS });
  const next = scheduleReview(forgot, 'good', NOW);
  assert.equal(next.interval, 1, 'relearning restarts the ladder');
});

test('rateReviewCard keys cards by their normalised front and keeps the last back', () => {
  let deck = rateReviewCard(EMPTY_REVIEW_DECK, { front: '  What is  <b>f′(x)</b>? ', back: '2x' }, 'good', NOW);
  assert.deepEqual(Object.keys(deck.cards), ['What is f′(x) ?']);
  deck = rateReviewCard(deck, { front: 'What is <i>f′(x)</i>?', back: '' }, 'forgot', NOW + 1000);
  const card = deck.cards[reviewCardKey('What is f′(x) ?')];
  assert.equal(Object.keys(deck.cards).length, 1, 'the same card asked again is one card');
  assert.equal(card.back, '2x', 'an empty back keeps the stored answer');
  assert.equal(card.lastRating, 'forgot');
  assert.equal(card.reps, 0);
  assert.equal(rateReviewCard(deck, { front: '   ', back: 'x' }, 'good', NOW), deck, 'a blank front changes nothing');
  assert.equal(EMPTY_REVIEW_DECK.cards['What is f′(x) ?'], undefined, 'the input deck is not mutated');
});

test('rateReviewCard drops the cards rated longest ago past the limit', () => {
  let deck = EMPTY_REVIEW_DECK;
  for (let index = 0; index <= REVIEW_DECK_LIMIT; index++) deck = rateReviewCard(deck, { front: `card ${index}`, back: '' }, 'good', NOW + index);
  assert.equal(Object.keys(deck.cards).length, REVIEW_DECK_LIMIT);
  assert.equal(deck.cards['card 0'], undefined);
  assert.ok(deck.cards[`card ${REVIEW_DECK_LIMIT}`]);
});

test('dueReviewCards: due by the end of today, most overdue first', () => {
  let deck = rateReviewCard(EMPTY_REVIEW_DECK, { front: 'tomorrow', back: '' }, 'good', NOW);
  deck = rateReviewCard(deck, { front: 'relearn', back: '' }, 'forgot', NOW);
  deck = rateReviewCard(deck, { front: 'old', back: '' }, 'good', NOW - 3 * REVIEW_DAY_MS);
  assert.deepEqual(dueReviewCards(deck, NOW).map((card) => card.front), ['old', 'relearn']);
  assert.equal(dueReviewCount(deck, NOW), 2);
  assert.equal(dueReviewCount(deck, NOW + REVIEW_DAY_MS), 3, 'tomorrow the 1-day card is due too');
  assert.equal(endOfLocalDay(NOW) - NOW, 12 * 60 * 60 * 1000 - 1);
});

test('reviewDaysUntil counts calendar days from today', () => {
  assert.equal(reviewDaysUntil(NOW + REVIEW_RELEARN_MS, NOW), 0);
  assert.equal(reviewDaysUntil(NOW - REVIEW_DAY_MS, NOW), 0);
  assert.equal(reviewDaysUntil(NOW + REVIEW_DAY_MS, NOW), 1);
  assert.equal(reviewDaysUntil(NOW + 3 * REVIEW_DAY_MS, NOW), 3);
});

test('parseReviewDeck round-trips a deck and drops malformed cards', () => {
  const deck = rateReviewCard(EMPTY_REVIEW_DECK, { front: 'Q', back: 'A' }, 'fuzzy', NOW);
  assert.deepEqual(parseReviewDeck(JSON.stringify(deck)), deck);
  const messy = parseReviewDeck({ cards: {
    a: { front: 'ok', back: 'x', reps: 2, interval: 3, ease: 9, due: NOW, lastRating: 'good', ratedAt: NOW },
    b: { front: '', lastRating: 'good' },
    c: { front: 'bad rating', lastRating: 'meh' },
    d: null,
  } });
  assert.deepEqual(Object.keys(messy.cards), ['ok']);
  assert.equal(messy.cards.ok.ease, 2.8, 'ease is clamped on read');
  assert.deepEqual(parseReviewDeck('not json'), { version: 1, cards: {} });
  assert.deepEqual(parseReviewDeck(null), { version: 1, cards: {} });
});

test('resumeFlashcardState restores face and rating after a remount', () => {
  assert.equal(resumeFlashcardState(null), initialFlashcardState);
  assert.deepEqual(resumeFlashcardState({ face: 'back', rating: 'fuzzy', flips: 1 }), { face: 'back', rating: 'fuzzy', flips: 1 });
  assert.deepEqual(resumeFlashcardState({ face: 'front', rating: 'good', flips: 2 }), { face: 'front', rating: 'good', flips: 2 }, 'turned back after rating keeps it');
  assert.deepEqual(resumeFlashcardState({ face: 'front', rating: 'good', flips: 0 }), { face: 'front', rating: null, flips: 0 }, 'never turned: no rating');
  assert.deepEqual(resumeFlashcardState({ face: 'back' }), { face: 'back', rating: null, flips: 1 });
});
