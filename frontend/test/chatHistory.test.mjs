import test from 'node:test';
import assert from 'node:assert/strict';
import { extractHistory } from '../src/chat/history.ts';

test('history uses in-memory messages, removes transient thinking, and preserves reasoning', () => {
  const previousWindow = globalThis.window;
  const messages = [
    { role: 'user', rawText: '  What changed?  ' },
    {
      role: 'assistant',
      rawText: 'Thinking... visible <think>private reasoning</think> answer',
      reasoningContent: 'private reasoning',
    },
  ];
  globalThis.window = { stateStore: { read: (key) => key === 'messages' ? messages : null } };

  try {
    assert.deepEqual(extractHistory(), [
      { role: 'user', content: 'What changed?' },
      { role: 'assistant', content: 'visible  answer', reasoning_content: 'private reasoning' },
    ]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('long in-memory history summarizes overflow and keeps the newest 60 messages', () => {
  const previousWindow = globalThis.window;
  const messages = Array.from({ length: 62 }, (_, index) => ({
    role: index % 2 ? 'assistant' : 'user',
    rawText: `Message ${index}`,
  }));
  globalThis.window = { stateStore: { read: (key) => key === 'messages' ? messages : null } };

  try {
    const history = extractHistory();
    assert.equal(history.length, 61);
    assert.equal(history[0].role, 'system');
    assert.match(history[0].content, /Message 0 \| Message 1/);
    assert.equal(history[1].content, 'Message 2');
    assert.equal(history.at(-1).content, 'Message 61');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test('history falls back to the per-session local memory mirror', () => {
  const previousWindow = globalThis.window;
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
  globalThis.window = {
    stateStore: { read: (key) => key === 'currentSessionId' ? 'session-1' : [] },
  };
  globalThis.localStorage = {
    getItem: (key) => key === 'socrates-memory-session-1' ? JSON.stringify(record) : null,
  };
  globalThis.document = { getElementById: () => null };

  try {
    assert.deepEqual(extractHistory(), [
      { role: 'user', content: 'cached question' },
      { role: 'assistant', content: 'cached answer' },
    ]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
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
  const previousWindow = globalThis.window;
  const previousLocalStorage = globalThis.localStorage;
  const previousDocument = globalThis.document;
  globalThis.window = {
    stateStore: { read: (key) => key === 'currentSessionId' ? 'session-2' : [] },
  };
  globalThis.localStorage = dom.window.localStorage;
  globalThis.document = dom.window.document;

  try {
    assert.deepEqual(extractHistory(), [
      { role: 'user', content: 'DOM question' },
      { role: 'assistant', content: 'DOM answer' },
    ]);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    dom.window.close();
  }
});
