import test from 'node:test';
import assert from 'node:assert/strict';
import { createMistakeBook } from '../src/ui/mistakeBook.js';

function createHarness() {
  const calls = [];
  const saved = [];
  const badge = { textContent: '' };
  const list = {
    innerHTML: '',
    querySelectorAll() { return []; },
  };
  const state = {
    currentSessionId: '3b241101-e2bb-4255-8caf-4136c566a962',
    topic: 'Algebra',
    currentNode: 0,
    kbNodes: [{ name: 'Linear equations' }],
    mistakes: [],
    mistakeFilter: 'all',
  };
  const stateStore = {
    read(key) { return state[key]; },
    dispatch(action) {
      // Minimal shim for the M3 flat-namespace facade. The MistakeBook
      // only ever writes `mistakes`, so we can mirror that onto `state`.
      if (!action || typeof action !== 'object') return null;
      if (action.type === 'state/set' && action.key === 'mistakes') {
        state.mistakes = action.value;
        return action.value;
      }
      return null;
    },
  };
  const runtime = createMistakeBook({
    stateStore,
    apiFetch(path, request) {
      calls.push({ path, request });
      return Promise.resolve();
    },
    saveCurrentSession() { saved.push(true); },
    mountQuizWidget() {},
    scrollContainer() { return { scrollTop: 0, scrollHeight: 0 }; },
    getTutorSocratic() { return null; },
  });
  return { runtime, state, calls, saved, badge, list };
}

test('MistakeBook records a quiz error, persists it, and clears it by slot', () => {
  const originalDocument = globalThis.document;
  const { runtime, state, calls, saved, badge, list } = createHarness();
  globalThis.document = {
    getElementById(id) {
      if (id === 'mistakesTabBadge') return badge;
      if (id === 'mistakesList') return list;
      return null;
    },
  };

  try {
    runtime.recordMistake({
      type: 'quiz',
      q: 'Solve x + 2 = 5',
      options: [{ letter: 'A', text: '2' }, { letter: 'B', text: '3' }],
      correct: 'B',
      userAnswer: 'A',
      quizSlotId: 'quiz-1',
    });

    assert.equal(state.mistakes.length, 1);
    assert.equal(state.mistakes[0].node, 'Linear equations');
    assert.equal(badge.textContent, '1');
    assert.equal(saved.length, 1);
    assert.deepEqual(calls[0], {
      path: '/api/mistakes',
      request: {
        method: 'POST',
        body: {
          sessionId: state.currentSessionId,
          nodeName: 'Linear equations',
          questionContent: 'Solve x + 2 = 5',
          userAnswer: 'A',
          correctAnswer: 'B',
          source: 'quiz',
        },
      },
    });

    runtime.removeMistakeForQuizSlot('quiz-1');
    assert.equal(state.mistakes.length, 0);
    assert.equal(badge.textContent, '');
    assert.equal(saved.length, 2);
  } finally {
    globalThis.document = originalDocument;
  }
});
