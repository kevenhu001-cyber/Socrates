import assert from 'node:assert/strict';
import test from 'node:test';

const { useComposerToolsState, publishComposerToolsState } = await import('../src/react/composer/composerTools.state.ts');

test('React composer tools store shares trigger state with subscribers', () => {
  useComposerToolsState.setState({ isOpen: false, mode: null, triggerId: null, revision: 0 });
  let notifications = 0;
  const unsubscribe = useComposerToolsState.subscribe(() => { notifications += 1; });

  publishComposerToolsState({ isOpen: true, mode: 'topic', triggerId: 'composerToolsBtn' });
  assert.deepEqual(
    {
      isOpen: useComposerToolsState.getState().isOpen,
      mode: useComposerToolsState.getState().mode,
      triggerId: useComposerToolsState.getState().triggerId,
    },
    { isOpen: true, mode: 'topic', triggerId: 'composerToolsBtn' },
  );

  publishComposerToolsState({ isOpen: false, mode: null, triggerId: null });
  assert.equal(useComposerToolsState.getState().isOpen, false);
  assert.equal(notifications, 2);

  unsubscribe();
  useComposerToolsState.setState({ isOpen: false, mode: null, triggerId: null, revision: 0 });
});
