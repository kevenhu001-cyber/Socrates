import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearComposer,
  focusComposer,
  getComposerMarkdown,
  getComposerSelection,
  insertComposerText,
  registerComposer,
  setComposerMarkdown,
} from '../src/react/composer-input/controller.ts';
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

test('composer controller has one authoritative handle per surface', () => {
  let value = '';
  let focused = false;
  const dispose = registerComposer('chat', {
    getMarkdown: () => value,
    setMarkdown: (next) => { value = next; },
    insertText: (next) => { value += next; },
    clear: () => { value = ''; },
    focus: () => { focused = true; },
    getSelection: () => ({ from: 2, to: 4 }),
    isVisible: () => true,
  });

  setComposerMarkdown('chat', 'hello');
  insertComposerText('chat', ' world');
  focusComposer('chat');
  assert.equal(getComposerMarkdown('chat'), 'hello world');
  assert.equal(focused, true);
  assert.deepEqual(getComposerSelection('chat'), { from: 2, to: 4 });

  clearComposer('chat');
  assert.equal(getComposerMarkdown('chat'), '');
  dispose();
});

