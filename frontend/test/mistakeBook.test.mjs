import test from 'node:test';
import assert from 'node:assert/strict';
import { createMistakeBook } from '../src/ui/mistakeBook.ts';

function createHarness() {
  const calls = [];
  const saved = [];
  const appended = [];
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
    appendAssistantMessage(rawText) { appended.push(rawText); },
  });
  return { runtime, state, calls, saved, appended };
}

test('MistakeBook records a quiz error, persists it, and clears it by slot', () => {
  const { runtime, state, calls, saved } = createHarness();

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
  assert.equal(saved.length, 2);
});

test('MistakeBook practice redo appends a widget message and increments its count', () => {
  const { runtime, appended, saved, state } = createHarness();
  state.mistakes = [{
    id: 'practice-1', type: 'practice', q: 'Explain your reasoning <carefully>', correct: 'Because & therefore',
    options: [], redoCount: 0,
  }];

  runtime.redoMistake('practice-1');

  assert.equal(state.mistakes[0].redoCount, 1);
  assert.equal(appended.length, 1);
  assert.match(appended[0], /^_.*_\n\n<practice data-practice-id="redo-practice-[\w-]+" correct="Because &amp; therefore"><problem>Explain your reasoning &lt;carefully&gt;<\/problem><\/practice>$/);
  assert.equal(saved.length, 1);
});

test('MistakeBook quiz redo appends a stable slot and persists it once', () => {
  const { runtime, appended, saved, state } = createHarness();
  state.mistakes = [{
    id: 'quiz-1', type: 'quiz', q: '2 + 2? <tip>', correct: 'A',
    options: [{ letter: 'A', text: '4 & 1' }, { letter: 'B', text: '5' }], redoCount: 0,
    quizSlotId: 'original-slot',
  }];

  runtime.redoMistake('quiz-1');

  assert.equal(state.mistakes[0].redoCount, 1);
  assert.match(state.mistakes[0].quizSlotId, /^redo-quiz-[\w-]+$/);
  assert.equal(appended.length, 1);
  assert.match(appended[0], new RegExp(`<quiz data-quiz-id="${state.mistakes[0].quizSlotId}"><q>2 \\+ 2\\? &lt;tip&gt;<\\/q><o letter="A">4 &amp; 1<\\/o><o letter="B">5<\\/o><correct>A<\\/correct><\\/quiz>`));
  assert.equal(saved.length, 1);
});
