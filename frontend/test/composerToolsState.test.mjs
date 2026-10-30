import assert from 'node:assert/strict';
import test from 'node:test';

const { composerToolsState, publishComposerToolsState } = await import('../src/ui/composerToolsState.ts');

test('composer tools publisher shares trigger state with React subscribers', () => {
  composerToolsState.__resetForTests();
  let notifications = 0;
  const unsubscribe = composerToolsState.subscribe(() => { notifications += 1; });

  publishComposerToolsState({ isOpen: true, mode: 'topic', triggerId: 'composerToolsBtn' });
  composerToolsState.flush();
  assert.deepEqual(
    {
      isOpen: composerToolsState.getSnapshot().isOpen,
      mode: composerToolsState.getSnapshot().mode,
      triggerId: composerToolsState.getSnapshot().triggerId,
    },
    { isOpen: true, mode: 'topic', triggerId: 'composerToolsBtn' },
  );

  publishComposerToolsState({ isOpen: false, mode: null, triggerId: null });
  composerToolsState.flush();
  assert.equal(composerToolsState.getSnapshot().isOpen, false);
  assert.equal(notifications, 2);

  unsubscribe();
  composerToolsState.__resetForTests();
});
