import assert from 'node:assert/strict';
import test from 'node:test';

const { attachmentsState, publishAttachmentsState } = await import('../src/ui/attachmentsState.ts');

test('attachment publisher shares immutable array snapshots with subscribers', () => {
  attachmentsState.__resetForTests();
  let notifications = 0;
  const unsubscribe = attachmentsState.subscribe(() => { notifications += 1; });
  const source = [
    { id: 'att-1', kind: 'image', name: 'photo.png', mime: 'image/png', size: 20 },
  ];

  publishAttachmentsState(source);
  source.push({ id: 'att-2', kind: 'text', name: 'notes.txt', mime: 'text/plain', size: 12 });
  attachmentsState.flush();

  const snapshot = attachmentsState.getSnapshot();
  assert.deepEqual(snapshot.attachments, [
    { id: 'att-1', kind: 'image', name: 'photo.png', mime: 'image/png', size: 20 },
  ]);
  assert.notEqual(snapshot.attachments, source);
  assert.equal(Object.isFrozen(snapshot.attachments), true);
  assert.equal(snapshot.revision, 1);
  assert.equal(notifications, 1);

  unsubscribe();
  attachmentsState.__resetForTests();
});
