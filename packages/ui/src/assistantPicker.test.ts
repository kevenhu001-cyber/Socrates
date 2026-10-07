import assert from 'node:assert/strict';
import test from 'node:test';
import { activeAssistantOf, assistantConfigOf, assistantRowLabel, filterAssistants } from './assistantPicker.ts';
import type { Assistant } from '@socrates/contracts';

const row = (id: string, title: string, config: Record<string, unknown>): Assistant => ({
  id, title, source: JSON.stringify(config),
});

test('assistant config parses JSON source and degrades on garbage', () => {
  const full = assistantConfigOf(row('a1', 'T', { description: 'D', instructions: 'I', starter: 'S' }));
  assert.deepEqual(full, { description: 'D', instructions: 'I', starter: 'S' });
  assert.deepEqual(assistantConfigOf({ source: 'not json' }), { description: '', instructions: '', starter: '' });
  assert.deepEqual(assistantConfigOf({ source: '{"instructions":42}' }), { description: '', instructions: '', starter: '' });
});

test('row label falls back to Assistant and hides empty descriptions', () => {
  assert.deepEqual(assistantRowLabel({ id: 'a1', title: '', source: '{}' }), { name: 'Assistant', sub: '' });
  assert.deepEqual(assistantRowLabel(row('a2', 'Coach', { description: 'Strict but kind' })), { name: 'Coach', sub: 'Strict but kind' });
});

test('filter matches title and description, active resolution by id', () => {
  const items = [row('a1', 'Coach', { description: 'Strict' }), row('a2', 'Tutor', { description: 'Gentle' })];
  assert.deepEqual(filterAssistants(items, 'gent').map((a) => a.id), ['a2']);
  assert.deepEqual(filterAssistants(items, 'coach').map((a) => a.id), ['a1']);
  assert.equal(filterAssistants(items, '').length, 2);
  assert.equal(activeAssistantOf(items, 'a2')?.title, 'Tutor');
  assert.equal(activeAssistantOf(items, null), null);
  assert.equal(activeAssistantOf(items, 'missing'), null);
});
