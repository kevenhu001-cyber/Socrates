// @ts-check
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { appRouteFixture } from './_appRouteFixture.js';
import { users, authSessions, pendingRegistrations } from '../src/db/schema/index.js';
import { hashPassword, comparePassword } from '../src/lib/crypto.js';

const f = appRouteFixture();
const createdUserIds = [];
const createdTokens = [];
const password = 'route-test-password-123';
let testAccount;

async function makeUser(email = `auth-http-${randomUUID()}@invalid.test`) {
  const [row] = await f.db.insert(users).values({
    email,
    passwordHash: await hashPassword(password),
    verifiedAt: new Date(),
  }).returning();
  createdUserIds.push(row.id);
  return row;
}

function cookieValue(response, name) {
  // Login deliberately clears stale cookie variants before setting the new sid.
  const line = response.setCookies.filter((item) => item.startsWith(`${name}=`)).at(-1);
  assert.ok(line, `response should set ${name} cookie`);
  return line.slice(name.length + 1).split(';', 1)[0];
}

test('registration validates inputs and invalid email verification stays a non-mutating failure', async () => {
  const invalidPasswordEmail = `bad-${randomUUID()}@invalid.test`;
  for (const body of [
    {}, { email: 'not-an-email', password }, { email: invalidPasswordEmail, password: 'short' },
    { email: invalidPasswordEmail, password: 'x'.repeat(65) },
  ]) {
    const response = await f.request('/api/auth/register', { as: null, method: 'POST', body });
    assert.equal(response.status, 400);
  }
  const badVerify = await f.request('/api/auth/verify?token=not-a-real-verification-token', { as: null });
  assert.equal(badVerify.status, 400);
  const pending = await f.db.select().from(pendingRegistrations).where(eq(pendingRegistrations.email, invalidPasswordEmail));
  assert.deepEqual(pending, []);
});

test('login rejects wrong credentials without creating a session, and valid HTTP login sets safe cookies', async () => {
  testAccount = await makeUser();
  const before = await f.db.select().from(authSessions).where(eq(authSessions.userId, testAccount.id));
  const wrong = await f.request('/api/auth/login', { as: null, method: 'POST', body: { email: testAccount.email, password: 'incorrect-password' } });
  assert.equal(wrong.status, 401);
  assert.equal((await f.db.select().from(authSessions).where(eq(authSessions.userId, testAccount.id))).length, before.length);

  // Failed logins persist across test processes; a fixed absent address would
  // eventually hit the real lockout and make later runs depend on DB history.
  const invalidEmail = await f.request('/api/auth/login', { as: null, method: 'POST', body: { email: `absent-${randomUUID()}@invalid.test`, password } });
  assert.equal(invalidEmail.status, 401);
  const login = await f.request('/api/auth/login', { as: null, method: 'POST', body: { email: testAccount.email.toUpperCase(), password } });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.id, testAccount.id);
  assert.equal('passwordHash' in login.body.user, false);
  const sid = cookieValue(login, 'sid');
  const csrf = cookieValue(login, 'csrf');
  assert.ok(login.setCookies.find((item) => item.startsWith('sid=') && /HttpOnly/i.test(item)));
  createdTokens.push(sid);
  assert.ok((await f.db.select().from(authSessions).where(eq(authSessions.token, sid))).length === 1);
  testAccount = { ...testAccount, sid, csrf };
});

test('me requires authentication, returns only current account data, and ignores invalid timezone hints', async () => {
  assert.equal((await f.request('/api/auth/me', { as: null })).status, 401);
  const response = await f.request('/api/auth/me', { as: testAccount, headers: { 'x-vercel-ip-timezone': 'not/a-zone' } });
  assert.equal(response.status, 200);
  assert.equal(response.body.user.id, testAccount.id);
  assert.equal(response.body.user.email, testAccount.email);
  assert.equal(response.body.user.timeZone, null);
  assert.equal('passwordHash' in response.body.user, false);
});

test('password change verifies old password, preserves current session, revokes other sessions, and changes login credential', async () => {
  const otherSid = `auth-http-other-${randomUUID()}`;
  createdTokens.push(otherSid);
  await f.db.insert(authSessions).values({ userId: testAccount.id, token: otherSid, expiresAt: new Date(Date.now() + 3600_000) });
  const badOld = await f.request('/api/auth/password', { as: testAccount, method: 'POST', body: { oldPassword: 'wrong-password', newPassword: 'changed-password-456' } });
  assert.equal(badOld.status, 401);
  assert.equal((await f.db.select().from(authSessions).where(eq(authSessions.token, otherSid))).length, 1);
  const tooShort = await f.request('/api/auth/password', { as: testAccount, method: 'POST', body: { oldPassword: password, newPassword: 'short' } });
  assert.equal(tooShort.status, 400);
  const changed = await f.request('/api/auth/password', { as: testAccount, method: 'POST', body: { oldPassword: password, newPassword: 'changed-password-456' } });
  assert.equal(changed.status, 200);
  assert.equal((await f.db.select().from(authSessions).where(eq(authSessions.token, testAccount.sid))).length, 1);
  assert.equal((await f.db.select().from(authSessions).where(eq(authSessions.token, otherSid))).length, 0);
  const [updated] = await f.db.select().from(users).where(eq(users.id, testAccount.id));
  assert.equal(await comparePassword('changed-password-456', updated.passwordHash), true);
  assert.equal((await f.request('/api/auth/login', { as: null, method: 'POST', body: { email: testAccount.email, password } })).status, 401);
  assert.equal((await f.request('/api/auth/login', { as: null, method: 'POST', body: { email: testAccount.email, password: 'changed-password-456' } })).status, 200);
});

test('logout revokes only the presented session and clears session and CSRF cookies', async () => {
  const another = `auth-http-other-${randomUUID()}`;
  createdTokens.push(another);
  await f.db.insert(authSessions).values({ userId: testAccount.id, token: another, expiresAt: new Date(Date.now() + 3600_000) });
  const response = await f.request('/api/auth/logout', { as: testAccount, method: 'POST' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.ok(response.setCookies.some((item) => item.startsWith('sid=') && /Expires=Thu, 01 Jan 1970/i.test(item)));
  assert.ok(response.setCookies.some((item) => item.startsWith('csrf=') && /Expires=Thu, 01 Jan 1970/i.test(item)));
  assert.equal((await f.db.select().from(authSessions).where(eq(authSessions.token, testAccount.sid))).length, 0);
  assert.equal((await f.db.select().from(authSessions).where(eq(authSessions.token, another))).length, 1);
  assert.equal((await f.request('/api/auth/me', { as: testAccount })).status, 401);
});

test('account deletion requires authentication; authenticated deletion removes only the caller account', async () => {
  const deletionAccount = await makeUser();
  assert.equal((await f.request('/api/auth/account', { as: null, method: 'DELETE' })).status, 401);
  const login = await f.request('/api/auth/login', { as: null, method: 'POST', body: { email: deletionAccount.email, password } });
  assert.equal(login.status, 200);
  const deletionSid = cookieValue(login, 'sid');
  const deletionCsrf = cookieValue(login, 'csrf');
  const accountCredential = { ...deletionAccount, sid: deletionSid, csrf: deletionCsrf };
  const response = await f.request('/api/auth/account', { as: accountCredential, method: 'DELETE' });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { ok: true });
  assert.equal((await f.db.select().from(users).where(eq(users.id, deletionAccount.id))).length, 0);
  assert.equal((await f.db.select().from(users).where(eq(users.id, f.other.id))).length, 1);
  assert.equal((await f.request('/api/auth/me', { as: accountCredential })).status, 401);
  // Clean the additional test account while the fixture's DB pool is open.
  if (createdUserIds.length) await f.db.delete(users).where(inArray(users.id, createdUserIds));
  createdUserIds.length = 0;
});

test('admin-auth HTTP status is public, invalid tokens fail verification, and logout clears its cookie', async () => {
  const status = await f.request('/api/admin-auth/status', { as: null });
  assert.equal(status.status, 200);
  assert.equal(typeof status.body.configured, 'boolean');
  assert.equal(typeof status.body.ipAllowed, 'boolean');
  const verify = await f.request('/api/admin-auth/verify', { as: null, headers: { 'X-Admin-Token': 'not-a-valid-token' } });
  assert.equal(verify.status, 200);
  assert.deepEqual(verify.body, { valid: false });
  const logout = await f.request('/api/admin-auth/logout', { as: null, method: 'POST' });
  assert.equal(logout.status, 200);
  assert.deepEqual(logout.body, { ok: true });
  assert.ok(logout.setCookies.some((item) => item.startsWith('socrates_admin_session=') && /Expires=Thu, 01 Jan 1970/i.test(item)));
});
