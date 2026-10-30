import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createMistakeBook } from '../src/ui/mistakeBook.ts';
import { disposeActionButtonRoots } from '../src/react/legacy-controls/actionButtonHost.tsx';

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

async function withRedoDom(run) {
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalRaf = globalThis.requestAnimationFrame;
  const dom = new JSDOM('<!doctype html><html><body><div id="mistakesList"></div><div id="msgList"></div></body></html>');
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.requestAnimationFrame = (callback) => { callback(); return 1; };
  try {
    await run(dom.window.document);
  } finally {
    disposeActionButtonRoots();
    await new Promise((resolve) => dom.window.setTimeout(resolve, 0));
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = originalRaf;
    dom.window.close();
  }
}

async function waitForRedoButton(document, id) {
  const deadline = Date.now() + 1000;
  while (!document.querySelector(`[data-redo="${id}"]`) && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  assert.ok(document.querySelector(`[data-redo="${id}"]`), 'lazy redo action mounts');
}

test('MistakeBook redo mounts the free-form practice widget and increments its count', () => {
  return withRedoDom(async (document) => {
    const state = {
      mistakes: [{
        id: 'practice-1', type: 'practice', q: 'Explain your reasoning', correct: 'Because...',
        options: [], redoCount: 0,
      }],
      mistakeFilter: 'all',
    };
    const stateStore = {
      read(key) { return state[key]; },
      dispatch(action) {
        if (action?.type === 'state/set' && action.key === 'mistakes') state.mistakes = action.value;
      },
    };
    const mounted = [];
    const runtime = createMistakeBook({
      stateStore,
      apiFetch: async () => {},
      saveCurrentSession() {},
      mountQuizWidget() { assert.fail('practice redo should not mount a quiz'); },
      mountPracticeWidget(slot, payload) { mounted.push({ slot, payload }); },
      scrollContainer() { return { scrollTop: 0, scrollHeight: 10 }; },
      getTutorSocratic() { return null; },
    });

    runtime.renderMistakes();
    await waitForRedoButton(document, 'practice-1');
    document.querySelector('[data-redo="practice-1"]').click();

    assert.equal(state.mistakes[0].redoCount, 1);
    assert.equal(mounted.length, 1);
    assert.equal(mounted[0].slot.className, 'practice-slot');
    assert.deepEqual(mounted[0].payload, { problem: 'Explain your reasoning', correct: 'Because...' });
  });
});

test('MistakeBook redo creates and persists a quiz slot when no original slot remains', () => {
  return withRedoDom(async (document) => {
    const state = {
      mistakes: [{
        id: 'quiz-1', type: 'quiz', q: '2 + 2?', correct: 'A',
        options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }], redoCount: 0,
      }],
      mistakeFilter: 'all',
    };
    const stateStore = {
      read(key) { return state[key]; },
      dispatch(action) {
        if (action?.type === 'state/set' && action.key === 'mistakes') state.mistakes = action.value;
      },
    };
    const saved = [];
    const mounted = [];
    const runtime = createMistakeBook({
      stateStore,
      apiFetch: async () => {},
      saveCurrentSession() { saved.push(true); },
      mountQuizWidget(slot, payload) { mounted.push({ slot, payload }); },
      scrollContainer() { return { scrollTop: 0, scrollHeight: 10 }; },
      getTutorSocratic() { return null; },
    });

    runtime.renderMistakes();
    await waitForRedoButton(document, 'quiz-1');
    document.querySelector('[data-redo="quiz-1"]').click();

    assert.equal(state.mistakes[0].redoCount, 1);
    assert.match(state.mistakes[0].quizSlotId, /^redo-/);
    assert.equal(mounted.length, 1);
    assert.equal(mounted[0].slot.getAttribute('data-quiz-id'), state.mistakes[0].quizSlotId);
    assert.deepEqual(mounted[0].payload, {
      q: '2 + 2?',
      options: [{ letter: 'A', text: '4' }, { letter: 'B', text: '5' }],
      correct: 'A',
      slotId: state.mistakes[0].quizSlotId,
    });
    assert.equal(saved.length, 2);
  });
});
