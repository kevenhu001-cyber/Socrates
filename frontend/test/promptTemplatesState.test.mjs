import assert from 'node:assert/strict';
import test from 'node:test';

const { promptTemplatesState, publishPromptTemplatesState } = await import('../src/ui/promptTemplatesState.ts');

test('prompt template publisher updates the shared snapshot and notifies subscribers', () => {
  promptTemplatesState.__resetForTests();
  let notifications = 0;
  const unsubscribe = promptTemplatesState.subscribe(() => { notifications += 1; });

  publishPromptTemplatesState({
    open: true,
    view: 'editor',
    builtins: [],
    customs: [],
    editor: {
      id: 'custom-1',
      title: 'Study plan',
      description: '',
      icon: 'pg',
      category: 'learning',
      shortcut: '/study-plan',
      body: 'Plan the next study session.',
      systemPrompt: '',
      isBuiltin: false,
    },
  });
  promptTemplatesState.flush();

  const snapshot = promptTemplatesState.getSnapshot();
  assert.equal(snapshot.open, true);
  assert.equal(snapshot.view, 'editor');
  assert.equal(snapshot.editor?.shortcut, '/study-plan');
  assert.equal(notifications, 1);

  unsubscribe();
  promptTemplatesState.__resetForTests();
});
