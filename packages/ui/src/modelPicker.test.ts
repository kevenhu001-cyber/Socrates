import assert from 'node:assert/strict';
import test from 'node:test';
import { activeProviderOf, filterProviders, providerRowLabel, sortProvidersBuiltInFirst } from './modelPicker.ts';
import type { ProviderKey } from '@socrates/contracts';

const row = (part: Partial<ProviderKey> & { id: string }): ProviderKey => ({
  label: '', url: '', model: '', ...part,
});

test('built-in rows sort first, otherwise stable', () => {
  const sorted = sortProvidersBuiltInFirst([
    row({ id: 'c1', label: 'Custom', model: 'm' }),
    row({ id: 'b', label: 'Built-in', isBuiltIn: true }),
    row({ id: 'c2', label: 'Other', model: 'n' }),
  ]);
  assert.deepEqual(sorted.map((p) => p.id), ['b', 'c1', 'c2']);
});

test('active provider resolves or stays null', () => {
  const list = [row({ id: 'a' }), row({ id: 'b', isActive: true })];
  assert.equal(activeProviderOf(list)?.id, 'b');
  assert.equal(activeProviderOf([row({ id: 'a' })]), null);
});

test('row labels prefer the model sub-line, then the url', () => {
  assert.deepEqual(providerRowLabel(row({ id: 'a', label: 'Beagle', model: 'beagle-1' })), { name: 'Beagle', sub: 'beagle-1' });
  assert.deepEqual(providerRowLabel(row({ id: 'b', label: 'Same', model: 'Same', url: 'https://x' })), { name: 'Same', sub: 'https://x' });
  assert.deepEqual(providerRowLabel(row({ id: 'c', label: 'Built-in', isBuiltIn: true })), { name: 'Built-in', sub: '' });
  assert.deepEqual(providerRowLabel(row({ id: 'd', model: 'm' })), { name: 'm', sub: '' });
});

test('filter matches label, model and url case-insensitively', () => {
  const list = [row({ id: 'a', label: 'Beagle', model: 'x' }), row({ id: 'b', label: 'Other', model: 'DeepSeek', url: 'https://deep.example' })];
  assert.deepEqual(filterProviders(list, '').map((p) => p.id), ['a', 'b']);
  assert.deepEqual(filterProviders(list, 'beag').map((p) => p.id), ['a']);
  assert.deepEqual(filterProviders(list, 'DEEP').map((p) => p.id), ['b']);
});
