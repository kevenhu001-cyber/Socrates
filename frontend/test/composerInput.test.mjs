import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearComposer,
  focusComposer,
  getComposerHandle,
  getComposerMarkdown,
  getComposerSelection,
  insertComposerText,
  registerComposer,
  setComposerMarkdown,
  swapComposerSurface,
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

/* P_composer-single — one live editor for the whole app (in node, with
   no DOM, the active surface is always 'topic'). Reads/writes naming the
   active surface hit the live handle; ones naming the inactive surface
   read/write its stash. swapComposerSurface parks the live draft under
   the surface being left and installs the arriving one — the two-box
   behaviour, without two boxes. */
test('composer controller serves one live handle with per-surface stash', () => {
  let value = '';
  let focused = false;
  const dispose = registerComposer('topic', {
    getMarkdown: () => value,
    setMarkdown: (next) => { value = next; },
    insertText: (next) => { value += next; },
    clear: () => { value = ''; },
    setExtensionToken: () => {},
    getExtensionToken: () => null,
    focus: () => { focused = true; },
    getSelection: () => ({ from: 2, to: 4 }),
    isVisible: () => true,
  });
  assert.equal(getComposerHandle('topic'), getComposerHandle('chat'));

  setComposerMarkdown('topic', 'hello');
  insertComposerText('topic', ' world');
  focusComposer('topic');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  assert.equal(focused, true);
  assert.deepEqual(getComposerSelection('topic'), { from: 2, to: 4 });

  /* Inactive-surface writes park in the stash; the live draft is untouched. */
  setComposerMarkdown('chat', 'cached reply');
  assert.equal(getComposerMarkdown('chat'), 'cached reply');
  assert.equal(getComposerMarkdown('topic'), 'hello world');

  /* Flipping installs the arriving draft and parks the live one. In
     node there is no view DOM so the active surface stays 'topic': the
     installed draft is therefore readable through 'topic' (live) while
     the parked one waits in the 'chat' stash. */
  swapComposerSurface('topic', 'chat');
  assert.equal(getComposerMarkdown('topic'), 'cached reply');
  assert.equal(getComposerMarkdown('chat'), '');
  /* ...and flipping back restores the parked draft identically. */
  swapComposerSurface('chat', 'topic');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  assert.equal(getComposerMarkdown('chat'), 'cached reply');

  clearComposer('chat');
  assert.equal(getComposerMarkdown('chat'), '');
  assert.equal(getComposerMarkdown('topic'), 'hello world');
  dispose();
  assert.equal(getComposerHandle('topic'), null);
});

