import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* P_incremental-save — a save body is now a DELTA: only the message rows
 * the server is not already known to hold. The invariant that matters is
 * end-to-end, not per-request: after any sequence of saves, the union of
 * what was sent has to reconstruct the full transcript, and a reload has
 * to render all of it.
 *
 * The fake store deliberately lives in the Playwright process rather than
 * in the page: it has to survive a real navigation, and a page-side
 * store would be wiped by the reload this test is built around.
 *
 * It also reproduces the endpoint's actual contract — POST upserts by
 * clientId, GET returns everything — which is what makes the delta
 * observable at all.
 */

const S1 = '11111111-1111-4111-8111-111111111111';
const S2 = '22222222-2222-4222-8222-222222222222';

function installSessionBackend(page, sessionId, store) {
  store.messages = new Map();
  store.posts = [];
  /* The pattern must cover BOTH the collection (sessions?limit=...) and
     the detail (sessions/<id>) requests. A glob that only matches the
     collection silently misses the detail fetch — which is the request
     loadSession actually makes — and the test then fails with an empty
     transcript rather than an obvious routing error. */
  return page.route('**/api/**/sessions**', async (route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();

    if (method === 'GET' && /\/sessions(\?|$)/.test(url) && !url.includes(sessionId)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: sessionId, topic: '导数入门', title: '导数入门', updatedAt: new Date().toISOString() },
        ]),
      });
    }
    if (method === 'GET' && url.includes(sessionId)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: sessionId,
          topic: '导数入门',
          messages: [...store.messages.values()],
        }),
      });
    }
    if (method === 'POST') {
      const body = req.postDataJSON();
      store.posts.push((body.messages || []).map((m) => m.clientId));
      for (const m of body.messages || []) store.messages.set(m.clientId, m);
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: body.id || sessionId }),
      });
    }
    return route.fallback();
  });
}

async function bootChat(page) {
  await page.addInitScript(() => { localStorage.setItem('socrates-appmode', 'chat'); });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
}

test('an incremental save still reconstructs the whole transcript after reload', async ({ page }) => {
  const store = {};
  await bootChat(page);
  await installSessionBackend(page, S1, store);

  /* Save after each append — the same cadence the real client uses
     (save on addMessage, again when the stream finishes). */
  await page.evaluate(async (sid) => {
    const acc = [];
    const transcript = [
      { clientId: 'u1', role: 'user', rawText: '什么是导数', html: null },
      { clientId: 'a1', role: 'assistant', rawText: '导数描述变化率。', html: '<p>导数描述变化率。</p>' },
      { clientId: 'u2', role: 'user', rawText: '能举个例子吗', html: null },
      { clientId: 'a2', role: 'assistant', rawText: '例如 f(x)=x^2, f\'(x)=2x。', html: '<p>例如 f(x)=x^2</p>' },
    ];
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: '导数入门' });
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sid });
    for (const m of transcript) {
      acc.push(m);
      window.stateStore.dispatch({ type: 'session/replace-messages', payload: acc.slice() });
      window.saveCurrentSession();
      await new Promise((r) => setTimeout(r, 250));
    }
  }, S1);

  await expect.poll(() => store.messages.size).toBe(4);

  /* The deltas must add up to the whole transcript. */
  expect([...new Set(store.posts.flat())].sort()).toEqual(['a1', 'a2', 'u1', 'u2']);
  /* And each save after the first must be incremental, not a re-upload —
     that is the point of the change, not just a side effect. */
  expect(store.posts.length).toBeGreaterThan(1);
  for (let i = 1; i < store.posts.length; i++) {
    expect(store.posts[i].length).toBe(1);
  }

  /* Re-open the session from the server copy. loadSession is exposed on
     window (app/legacyBridge.js) and is the same entry point auth
     bootstrap and the sidebar use; driving it directly keeps the test
     independent of the ?chat= auto-restore ordering. */
  await page.evaluate((sid) => window.loadSession(sid), S1);
  await expect
    .poll(() => page.evaluate(() => window.stateStore.read('messages').length), { timeout: 10_000 })
    .toBe(4);
  const restored = await page.evaluate(() => window.stateStore.read('messages').map((m) => m.clientId));
  expect(restored.sort()).toEqual(['a1', 'a2', 'u1', 'u2']);
});

test('an edited message is re-sent even when its length is unchanged', async ({ page }) => {
  const store = {};
  await bootChat(page);
  await installSessionBackend(page, S2, store);

  await page.evaluate(async (sid) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: 't' });
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sid });
    window.stateStore.dispatch({
      type: 'session/replace-messages',
      payload: [{ clientId: 'u1', role: 'user', rawText: 'hello', html: null }],
    });
    window.saveCurrentSession();
    await new Promise((r) => setTimeout(r, 300));
    /* Same length, different text. The old length-only whole-payload
       signature could not see this, so the edit was dropped. */
    window.stateStore.dispatch({
      type: 'session/replace-messages',
      payload: [{ clientId: 'u1', role: 'user', rawText: 'HELLO', html: null }],
    });
    window.saveCurrentSession();
    await new Promise((r) => setTimeout(r, 300));
  }, S2);

  expect(store.posts.length).toBeGreaterThanOrEqual(2);
  expect(store.posts[0]).toEqual(['u1']);
  expect(store.posts[store.posts.length - 1]).toEqual(['u1']);
  expect(store.messages.get('u1').rawText).toBe('HELLO');
});

test('reloading seeds the watermark so the first save after a switch is still a delta', async ({ page }) => {
  const store = {};
  await bootChat(page);
  await installSessionBackend(page, S1, store);

  /* Populate the server copy the way a previous visit would have. */
  await page.evaluate(async (sid) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: '导数入门' });
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: sid });
    window.stateStore.dispatch({
      type: 'session/replace-messages',
      payload: [
        { clientId: 'u1', role: 'user', rawText: '什么是导数', html: null },
        { clientId: 'a1', role: 'assistant', rawText: '导数描述变化率。', html: '<p>导数描述变化率。</p>' },
      ],
    });
    window.saveCurrentSession();
    await new Promise((r) => setTimeout(r, 300));
  }, S1);
  expect(store.messages.size).toBe(2);
  store.posts.length = 0;

  /* Open the session again — this is the loadSession path that must seed
     the watermark — then append one message and save. */
  await page.evaluate((sid) => window.loadSession(sid), S1);
  await expect
    .poll(() => page.evaluate(() => window.stateStore.read('messages').length), { timeout: 10_000 })
    .toBe(2);

  await page.evaluate(async () => {
    const acc = window.stateStore.read('messages').slice();
    acc.push({ clientId: 'u2', role: 'user', rawText: '再详细一点', html: null });
    window.stateStore.dispatch({ type: 'session/replace-messages', payload: acc });
    window.saveCurrentSession();
    await new Promise((r) => setTimeout(r, 300));
  });

  expect(store.posts.length).toBe(1);
  /* The invariant is that the UNCHANGED message is not re-uploaded, not
     that the body is exactly one row. `u1` came back byte-identical from
     the server, so it must be absent — that is what proves the watermark
     was seeded on load rather than the first save after a switch being a
     full re-upload. `a1` legitimately re-sends: historyUpgrade re-renders
     stored assistant messages through the current markdown/KaTeX
     pipeline, so its html genuinely differs from what was seeded and the
     upgrade is supposed to persist that. */
  expect(store.posts[0]).toContain('u2');
  expect(store.posts[0]).not.toContain('u1');
});
