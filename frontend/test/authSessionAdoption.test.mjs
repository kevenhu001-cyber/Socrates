import assert from 'node:assert/strict';
import test from 'node:test';

import { adoptAuthenticatedUser } from '../src/auth/forms/sessionAdoption.js';

test('uses the canonical /me user when it is available', async () => {
  const users = [];
  const result = await adoptAuthenticatedUser({ id: 'login-user' }, {
    fetchMe: async () => ({ user: { id: 'canonical-user' } }),
    setUser: (user) => users.push(user),
  });

  assert.deepEqual(result, { id: 'canonical-user' });
  assert.deepEqual(users, [{ id: 'canonical-user' }]);
});

test('keeps the login response when /me fails and retry is disabled', async () => {
  const loginUser = { id: 'login-user' };
  const users = [];
  let requests = 0;
  const result = await adoptAuthenticatedUser(loginUser, {
    fetchMe: async () => { requests += 1; throw new Error('offline'); },
    setUser: (user) => users.push(user),
  });

  assert.equal(result, loginUser);
  assert.deepEqual(users, [loginUser]);
  assert.equal(requests, 1);
});

test('retries /me after the short auth cookie race and adopts the canonical user', async () => {
  const users = [];
  const waits = [];
  let requests = 0;
  const result = await adoptAuthenticatedUser({ id: 'login-user' }, {
    fetchMe: async () => {
      requests += 1;
      if (requests === 1) throw new Error('cookie not ready');
      return { user: { id: 'canonical-user' } };
    },
    setUser: (user) => users.push(user),
    retryAfterFailure: true,
    wait: async (milliseconds) => waits.push(milliseconds),
  });

  assert.deepEqual(result, { id: 'login-user' });
  assert.deepEqual(users, [{ id: 'login-user' }, { id: 'canonical-user' }]);
  assert.deepEqual(waits, [150]);
  assert.equal(requests, 2);
});

test('verification retries only when a current user already exists', async () => {
  const users = [];
  let requests = 0;
  await adoptAuthenticatedUser(null, {
    fetchMe: async () => { requests += 1; throw new Error('not authenticated yet'); },
    setUser: (user) => users.push(user),
    getCurrentUser: () => null,
    retryAfterFailure: true,
    retryOnlyWithCurrentUser: true,
    nullFallback: true,
    wait: async () => assert.fail('verification without a user must not retry'),
  });

  assert.deepEqual(users, [null]);
  assert.equal(requests, 1);
});

test('reports a failed retry and retains the immediate fallback user', async () => {
  const loginUser = { id: 'login-user' };
  const reports = [];
  const users = [];
  let requests = 0;
  const result = await adoptAuthenticatedUser(loginUser, {
    fetchMe: async () => { requests += 1; throw new Error(`offline-${requests}`); },
    setUser: (user) => users.push(user),
    retryAfterFailure: true,
    wait: async () => {},
    report: (...args) => reports.push(args),
    context: 'auth/forms.signin.recheckMe',
  });

  assert.equal(result, loginUser);
  assert.deepEqual(users, [loginUser]);
  assert.equal(requests, 2);
  assert.equal(reports.length, 1);
  assert.equal(reports[0][0].message, 'offline-2');
  assert.equal(reports[0][1], 'auth/forms.signin.recheckMe');
});

test('uses a null fallback for verification when the response omits a user', async () => {
  const users = [];
  const result = await adoptAuthenticatedUser(null, {
    fetchMe: async () => ({}),
    setUser: (user) => users.push(user),
    nullFallback: true,
  });

  assert.equal(result, null);
  assert.deepEqual(users, [null]);
});
