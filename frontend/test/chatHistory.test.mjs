import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHistory } from '../src/chat/history.ts';
import { dispatchSession } from '../src/store/index.ts';

test.afterEach(() => dispatchSession({ type: 'session/reset' }));

test('history uses in-memory messages, removes transient thinking, and preserves reasoning', () => {
  const messages = [
    { role: 'user', rawText: '  What changed?  ' },
    {
      role: 'assistant',
      rawText: 'Thinking... visible <think>private reasoning</think> answer',
      reasoningContent: 'private reasoning',
    },
  ];
  dispatchSession({ type: 'session/replace-messages', payload: messages });

  assert.deepEqual(extractHistory(), [
    { role: 'user', content: 'What changed?' },
    { role: 'assistant', content: 'visible  answer', reasoning_content: 'private reasoning' },
  ]);
});

test('history prefers the currently edited Canvas version over its original answer', async () => {
  const { JSDOM } = await import('jsdom');
  const createDOMPurify = (await import('dompurify')).default;
  const previousDocument = globalThis.document;
  const previousPurify = globalThis.DOMPurify;
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://socrates.test/',
  });
  globalThis.document = dom.window.document;
  globalThis.DOMPurify = createDOMPurify(dom.window);
  const messages = [
    { role: 'user', rawText: 'Revise this note.' },
    {
      role: 'assistant',
      rawText: 'Original content that should no longer stand in for the edited artifact.',
      editedText:
        '<h1>Edited title</h1><p>New copy &amp; revised.</p><script>alert(1)</script><style>.secret{display:none}</style><p>Second paragraph.</p>',
    },
  ];
  dispatchSession({ type: 'session/replace-messages', payload: messages });
  try {
    assert.deepEqual(extractHistory(), [
      { role: 'user', content: 'Revise this note.' },
      {
        role: 'assistant',
        content:
          '[User-edited artifact content]\nEdited title\nNew copy & revised.\nSecond paragraph.',
      },
    ]);
    assert.doesNotMatch(String(extractHistory()[1].content), /Original content/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousPurify === undefined) delete globalThis.DOMPurify;
    else globalThis.DOMPurify = previousPurify;
    dom.window.close();
  }
});

test('long in-memory history summarizes overflow and keeps the newest 60 messages', () => {
  const messages = Array.from({ length: 62 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    rawText: `Message ${index}`,
  }));
  dispatchSession({ type: 'session/replace-messages', payload: messages });

  const history = extractHistory();
  assert.equal(history.length, 61);
  assert.equal(history[0].role, 'system');
  assert.match(history[0].content, /Message 0 \| Message 1/);
  assert.equal(history[1].content, 'Message 2');
  assert.equal(history.at(-1).content, 'Message 61');
});

test('history falls back to the per-session local memory mirror', () => {
  const previousLocalStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  const record = {
    topic: 'History test',
    ts: 0,
    messages: [
      { role: 'user', content: 'Thinking... cached question' },
      { role: 'assistant', content: 'cached answer' },
    ],
  };
  dispatchSession({ type: 'session/set', key: 'currentSessionId', value: 'session-1' });
  globalThis.localStorage = {
    getItem: (key) => (key === 'socrates-memory-session-1' ? JSON.stringify(record) : null),
  };
  globalThis.document = { getElementById: () => null };

  try {
    assert.deepEqual(extractHistory(), [
      { role: 'user', content: 'cached question' },
      { role: 'assistant', content: 'cached answer' },
    ]);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('history falls back to the rendered message list when memory is unavailable', async () => {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM(
    '<div id="msgList"><div class="user"><div class="msg-body">Thinking... DOM question</div></div><div class="assistant"><div class="msg-body">DOM answer</div></div></div>',
    { url: 'https://socrates.test/' },
  );
  const previousLocalStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  dispatchSession({ type: 'session/set', key: 'currentSessionId', value: 'session-2' });
  globalThis.localStorage = dom.window.localStorage;
  globalThis.document = dom.window.document;

  try {
    assert.deepEqual(extractHistory(), [
      { role: 'user', content: 'DOM question' },
      { role: 'assistant', content: 'DOM answer' },
    ]);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});
