import assert from 'node:assert/strict';
import test from 'node:test';

import { useAuthStore, persistUser } from '../src/index.ts';
import { createMemoryStore } from '../../platform/src/index.ts';

const user = { id: 'u1', email: 'a@b.c', displayName: 'A' };

test('restore validates a cached identity with the server', async () => {
  const storage = createMemoryStore();
  await persistUser(storage, user);
  let fetched = false;
  await useAuthStore.getState().restore(storage, async () => { fetched = true; return user; });
  assert.equal(fetched, true);
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
  await useAuthStore.getState().signOut(storage);
  assert.equal(useAuthStore.getState().status, 'signed-out');
  assert.equal(await storage.get('socrates.auth.tokens'), null);
});

test('stale cached user does not bypass rejected server credentials', async () => {
  const storage = createMemoryStore(); await persistUser(storage, user);
  await useAuthStore.getState().restore(storage, async () => { throw new Error('Unauthorized'); });
  assert.equal(useAuthStore.getState().user, null);
});
test('late restore cannot reopen a session after sign out', async () => {
  const storage = createMemoryStore(); let resolve;
  const restoring = useAuthStore.getState().restore(storage, () => new Promise((r) => { resolve = r; }));
  await useAuthStore.getState().signOut(storage); resolve(user); await restoring;
  assert.equal(useAuthStore.getState().user, null); assert.equal(await storage.get('socrates.auth.user'), null);
});

test('a delayed remote logout never clears credentials of the next login', async () => {
  const storage = createMemoryStore(); let finish;
  const logout = useAuthStore.getState().signOut(storage, () => new Promise((resolve) => { finish = resolve; }));
  useAuthStore.getState().setUser({ ...user, id: 'u2' });
  await storage.set('socrates.auth.tokens', 'account-b');
  finish(); await logout;
  assert.equal(useAuthStore.getState().user.id, 'u2'); assert.equal(await storage.get('socrates.auth.tokens'), 'account-b');
});
