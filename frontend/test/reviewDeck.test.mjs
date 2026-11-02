import test from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
};

const deck = await import('../src/tutor/reviewDeck.ts');
const NOW = new Date(2026, 10, 2, 12, 0, 0).getTime();

test('RN-14 a rating schedules the card and persists the deck', () => {
  store.clear();
  deck.resetReviewDeckCache();
  const card = deck.recordReview('What is f′(x) for x²?', '2x', 'forgot', NOW);
  assert.equal(card?.lastRating, 'forgot');
  assert.equal(deck.dueCards(NOW + 11 * 60 * 1000).length, 1, 'a forgotten card is due again today');
  deck.recordReview('What is f′(x) for x²?', '2x', 'good', NOW);
  assert.equal(deck.dueCards(NOW).length, 0, 'remembered: not due until tomorrow');
  assert.equal(deck.daysUntilReview(deck.reviewCardFor('What is f′(x) for x²?'), NOW), 1);

  /* A reload reads it back from storage under the user-scoped key. */
  assert.ok(store.has('socrates-review-deck-v1:guest'));
  deck.resetReviewDeckCache();
  assert.equal(Object.keys(deck.getReviewDeck().cards).length, 1);
});

test('RN-14 a re-rendered card resumes its face and rating', () => {
  deck.resetReviewDeckCache();
  assert.equal(deck.flashcardUiState('Q'), null);
  deck.rememberFlashcardUiState('  Q ', { face: 'back', rating: 'fuzzy', flips: 1 });
  assert.deepEqual(deck.flashcardUiState('Q'), { face: 'back', rating: 'fuzzy', flips: 1 });
});
