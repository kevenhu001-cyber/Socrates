import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupSessionsByProject } from '../src/react/session-list/projectGroups.ts';

const labels = { pinned: 'Pinned', other: 'Other chats', project: 'Project' };
const projects = [{ id: 'math', name: 'Mathematics' }, { id: 'writing', name: 'Writing' }];

test('project grouping preserves recency, shows pinned chats once and leaves other chats last', () => {
  const chats = [
    { id: 'a', projectId: 'writing' }, { id: 'b', projectId: 'math', pinned: true },
    { id: 'c', projectId: null }, { id: 'd', projectId: 'writing' }, { id: 'e', projectId: 'math' },
  ];
  const groups = groupSessionsByProject(chats, projects, labels);
  assert.deepEqual(groups.map(group => [group.name, group.sessions.map(chat => chat.id)]), [
    ['Pinned', ['b']], ['Writing', ['a', 'd']], ['Mathematics', ['e']], ['Other chats', ['c']],
  ]);
  assert.equal(chats[0].id, 'a');
});

test('unknown project data keeps chats visible and adopts real names when the cache arrives', () => {
  const chats = [{ id: 'a', projectId: 'math' }, { id: 'b', projectId: 'removed' }];
  assert.deepEqual(groupSessionsByProject(chats, [], labels).map(group => group.name), ['Project', 'Project']);
  assert.deepEqual(groupSessionsByProject(chats, projects, labels).map(group => group.name), ['Mathematics', 'Project']);
  assert.deepEqual(groupSessionsByProject([], projects, labels), []);
});
