import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearComposer,
  focusComposer,
  getComposerHandle,
  getComposerExtensionToken,
  getComposerMarkdown,
  getComposerSelection,
  activateComposerSurface,
  insertComposerText,
  registerComposer,
  resetComposerControllerState,
  readComposerSurface,
  setComposerMarkdown,
  setComposerExtensionToken,
} from '../src/composer/controller.ts';
import { tiptapJSONToMarkdown } from '../src/react/composer-input/markdown.ts';

test('rich composer serializes supported formatting to markdown', () => {
  const markdown = tiptapJSONToMarkdown({
    type: 'doc',
    content: [
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Plan' }],
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Read ', marks: [] },
          { type: 'text', text: 'carefully', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' and continue.' },
        ],
      },
      {
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: true },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Verified' }] }],
        }],
      },
      {
        type: 'codeBlock',
        attrs: { language: 'js' },
        content: [{ type: 'text', text: 'console.log("ok")' }],
      },
    ],
  });

  assert.match(markdown, /^## Plan/);
  assert.match(markdown, /Read \*\*carefully\*\*/);
  assert.match(markdown, /- \[x\] Verified/);
  assert.match(markdown, /```js\nconsole\.log\("ok"\)\n```/);
});

test('selected workflow tokens stay visual and never enter the markdown payload', () => {
  const markdown = tiptapJSONToMarkdown({
    type: 'doc',
    content: [{
      type: 'paragraph',
      content: [
        { type: 'extensionToken', attrs: { key: 'research', title: 'Find sources', icon: '<svg />' } },
        { type: 'text', text: 'Compare the evidence.' },
      ],
    }],
  });

  assert.equal(markdown, 'Compare the evidence\\.');
});

/* One mounted editor serves both UI surfaces while typed lifecycle state
   keeps their draft and token values independent. */
test('composer controller serves one live handle with per-surface drafts and tokens', () => {
  resetComposerControllerState();
  let value = '';
  let token = null;
  let focused = false;
  const dispose = registerComposer('topic', {
    getMarkdown: () => value,
    setMarkdown: (next) => { value = next; },
    insertText: (next) => { value += next; },
    clear: () => { value = ''; },
    setExtensionToken: (next) => { token = next; },
    getExtensionToken: () => token,
    focus: () => { focused = true; },
    getSelection: () => ({ from: 2, to: 4 }),
    isVisible: () => true,
  });
  assert.equal(getComposerHandle('topic'), getComposerHandle('chat'));

  setComposerMarkdown('topic', 'hello');
  insertComposerText('topic', ' world');
  const topicToken = { key: 'topic', title: 'Topic', icon: 'topic-icon' };
  setComposerExtensionToken('topic', topicToken);
  focusComposer('topic');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  assert.equal(focused, true);
  assert.deepEqual(getComposerSelection('topic'), { from: 2, to: 4 });

  /* Inactive-surface writes park in the stash; the live draft is untouched. */
  setComposerMarkdown('chat', 'cached reply');
  assert.equal(getComposerMarkdown('chat'), 'cached reply');
  assert.equal(getComposerMarkdown('topic'), 'hello world');

  activateComposerSurface('chat');
  assert.equal(readComposerSurface(), 'chat');
  assert.equal(getComposerMarkdown('chat'), 'cached reply');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  assert.equal(token, null);
  const chatToken = { key: 'chat', title: 'Chat', icon: 'chat-icon' };
  setComposerExtensionToken('chat', chatToken);

  activateComposerSurface('topic');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  assert.deepEqual(token, topicToken);
  assert.deepEqual(getComposerExtensionToken('chat'), chatToken);
  activateComposerSurface('chat');
  assert.equal(getComposerMarkdown('chat'), 'cached reply');
  assert.deepEqual(token, chatToken);

  clearComposer('chat');
  assert.equal(getComposerMarkdown('chat'), '');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  dispose();
  assert.equal(getComposerHandle('topic'), null);
  resetComposerControllerState();
});
