import assert from 'node:assert/strict';
import test from 'node:test';

import { useAuthStore, persistUser } from '../src/index.ts';
import { createMemoryStore } from '../../platform/src/index.ts';

const user = { id: 'u1', email: 'a@b.c', displayName: 'A' };

test('restore hydrates cached user without network', async () => {
  const storage = createMemoryStore();
  await persistUser(storage, user);
  let fetched = false;
  await useAuthStore.getState().restore(storage, async () => { fetched = true; return user; });
  assert.equal(fetched, false);
  assert.equal(useAuthStore.getState().status, 'signed-in');
  assert.equal(useAuthStore.getState().user.id, 'u1');
});

test('restore falls back to fetchMe when cache is empty', async () => {
  const storage = createMemoryStore();
  useAuthStore.getState().setUser(null);
  await useAuthStore.getState().restore(storage, async () => user);
  assert.equal(useAuthStore.getState().status, 'signed-in');
});

test('signOut clears user + tokens', async () => {
  const storage = createMemoryStore({ 'socrates.auth.tokens': '{}' });
  useAuthStore.getState().setUser(user);
  await useAuthStore.getState().signOut(storage, async () => {});
  assert.equal(useAuthStore.getState().status, 'signed-out');
  assert.equal(await storage.get('socrates.auth.tokens'), null);
});
