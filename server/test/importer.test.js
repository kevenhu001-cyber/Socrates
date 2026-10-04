// @ts-check
/**
 * Unit tests for src/services/importer.ts — the payload normalizer behind
 * POST /api/import. Pure functions only: no DB, no fetch.
 *
 * Covers the two documented shapes (ChatGPT conversations.json, Socrates
 * export / nested sessions), branch resolution, role filtering, bounds,
 * and the 'not_implemented' contract for unknown sources.
 *
 * Run with: npm test
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeImportPayload,
  isImportableSource,
  UnsupportedImportSource,
  MAX_IMPORT_SESSIONS,
  MAX_MESSAGES_PER_SESSION,
  MAX_MESSAGE_CHARS,
} from '../src/services/importer.js';

function chatGptNode(id, parent, role, text, children = [], createTime = null) {
  return {
    id,
    parent,
    children,
    message: role
      ? { author: { role }, content: { content_type: 'text', parts: [text] }, create_time: createTime }
      : null,
  };
}

describe('isImportableSource', () => {
  test('accepts the documented sources case-insensitively', () => {
    for (const s of ['chatgpt', 'ChatGPT', 'socrates', 'json']) {
      assert.equal(isImportableSource(s), true, s);
    }
  });
  test('rejects unknown sources', () => {
    for (const s of ['claude', 'jsonl', '', 'xml']) {
      assert.equal(isImportableSource(s), false, s);
    }
  });
});

describe('normalizeImportPayload — chatgpt conversations.json', () => {
  const convo = {
    title: 'Physics chat',
    create_time: 1700000000,
    update_time: 1700003600,
    mapping: {
      root: chatGptNode('root', null, null, '', ['m1']),
      m1: chatGptNode('m1', 'root', 'user', 'What is entropy?', ['m2'], 1700000100),
      m2: chatGptNode('m2', 'm1', 'assistant', 'A measure of disorder.', [], 1700000200),
      /* regenerated fork — leaf but older than m2, must be dropped */
      m2_old: chatGptNode('m2_old', 'm1', 'assistant', 'Old answer.', [], 1700000150),
    },
  };

  test('linearizes the visible branch into ordered messages', () => {
    const { sessions } = normalizeImportPayload('chatgpt', [convo]);
    assert.equal(sessions.length, 1);
    const s = sessions[0];
    assert.equal(s.title, 'Physics chat');
    assert.deepEqual(s.messages.map((m) => m.role), ['user', 'assistant']);
    assert.deepEqual(s.messages.map((m) => m.content), ['What is entropy?', 'A measure of disorder.']);
    assert.equal(s.messages[0].createdAt?.getTime(), 1700000100 * 1000);
  });

  test('skips system and empty turns', () => {
    const conv = {
      title: 'x',
      mapping: {
        a: chatGptNode('a', null, 'system', 'be nice', ['b']),
        b: chatGptNode('b', 'a', 'user', 'hi', ['c']),
        c: chatGptNode('c', 'b', 'assistant', '   ', ['d']),
        d: chatGptNode('d', 'c', 'assistant', 'hello!', []),
      },
    };
    const { sessions } = normalizeImportPayload('chatgpt', [conv]);
    assert.equal(sessions.length, 1);
    assert.deepEqual(sessions[0].messages.map((m) => m.role), ['user', 'assistant']);
  });

  test('drops conversations with no importable text', () => {
    const { sessions } = normalizeImportPayload('chatgpt', [{ title: 'empty', mapping: {} }]);
    assert.equal(sessions.length, 0);
  });

  test('truncates at MAX_IMPORT_SESSIONS instead of rejecting', () => {
    const many = Array.from({ length: MAX_IMPORT_SESSIONS + 5 }, (_, i) => ({
      title: `c${i}`,
      mapping: {
        a: chatGptNode('a', null, 'user', `q${i}`, ['b']),
        b: chatGptNode('b', 'a', 'assistant', 'ans', []),
      },
    }));
    const { sessions, truncated } = normalizeImportPayload('chatgpt', many);
    assert.equal(sessions.length, MAX_IMPORT_SESSIONS);
    assert.equal(truncated, true);
  });
});

describe('normalizeImportPayload — socrates export / nested sessions', () => {
  test('nested {sessions:[{messages:[…]}]}', () => {
    const { sessions } = normalizeImportPayload('socrates', {
      sessions: [
        { title: 'T1', mode: 'tutor', messages: [
          { role: 'user', content: 'q' },
          { role: 'assistant', content: 'a' },
        ] },
      ],
    });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].mode, 'tutor');
    assert.equal(sessions[0].messages.length, 2);
  });

  test('flat export links messages by sessionId', () => {
    const { sessions } = normalizeImportPayload('socrates', {
      sessions: [{ id: 'old-1', title: 'Linked' }],
      messages: [
        { sessionId: 'old-1', role: 'user', content: 'hi there' },
        { sessionId: 'old-1', role: 'assistant', content: 'hello' },
        { sessionId: 'other', role: 'user', content: 'stray' },
      ],
    });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].messages.length, 2);
  });

  test('accepts a bare sessions array', () => {
    const { sessions } = normalizeImportPayload('json', [
      { title: 'x', messages: [{ role: 'user', content: 'hi' }] },
    ]);
    assert.equal(sessions.length, 1);
  });

  test('drops sessions without messages and non-text roles', () => {
    const { sessions } = normalizeImportPayload('socrates', {
      sessions: [
        { title: 'empty', messages: [] },
        { title: 'bad roles', messages: [{ role: 'tool', content: 'x' }] },
        { title: 'good', messages: [{ role: 'user', content: 'q' }] },
      ],
    });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].title, 'good');
  });

  test('caps messages per session and chars per message', () => {
    const big = Array.from({ length: MAX_MESSAGES_PER_SESSION + 10 }, (_, i) => ({ role: 'user', content: `m${i}` }));
    const { sessions } = normalizeImportPayload('socrates', {
      sessions: [{ title: 'fat', messages: big }],
    });
    assert.equal(sessions[0].messages.length, MAX_MESSAGES_PER_SESSION);

    const { sessions: s2 } = normalizeImportPayload('socrates', {
      sessions: [{ title: 'long', messages: [{ role: 'user', content: 'x'.repeat(MAX_MESSAGE_CHARS + 100) }] }],
    });
    assert.equal(s2[0].messages[0].content.length, MAX_MESSAGE_CHARS);
  });
});

describe('normalizeImportPayload — unsupported sources', () => {
  test('throws UnsupportedImportSource so the route can record not_implemented', () => {
    assert.throws(() => normalizeImportPayload('claude', { sessions: [] }), UnsupportedImportSource);
  });
});
