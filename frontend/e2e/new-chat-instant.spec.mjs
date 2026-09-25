import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* "New chat" must switch immediately: no confirm dialog for a saved chat
   and no wait on an in-flight session save. The conversation that was on
   screen must still be persisted once that earlier save settles. */
test('new chat switches instantly while a session save is in flight', async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem('socrates-appmode', 'chat'); });
  await mockAuthedApp(page, { lang: 'zh' });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  const posted = [];
  let releaseSave;
  const saveGate = new Promise((resolve) => { releaseSave = resolve; });
  await page.route('**/api/**/sessions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const body = route.request().postDataJSON();
    posted.push(body);
    if (posted.length === 1) await saveGate;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: body.id }) });
  });

  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: '导数入门' });
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [{ clientId: 'u1', role: 'user', rawText: '什么是导数', html: null }] });
    window.saveCurrentSession();
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [
      { clientId: 'u1', role: 'user', rawText: '什么是导数', html: null },
      { clientId: 'a1', role: 'assistant', rawText: '导数描述变化率。', html: '<p>导数描述变化率。</p>' },
    ] });
    document.getElementById('topicSetup').classList.add('hidden');
    document.getElementById('chatView').classList.remove('hidden');
  });
  await expect.poll(() => posted.length).toBe(1);

  const started = Date.now();
  await page.locator('#newChatBtn').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  expect(Date.now() - started).toBeLessThan(1500);
  await expect(page.locator('#confirmDialog')).toBeHidden();
  expect(await page.evaluate(() => window.stateStore.read('messages').length)).toBe(0);

  releaseSave();
  await expect.poll(() => posted.length).toBe(2);
  expect(posted[1].topic).toBe('导数入门');
  expect(posted[1].messages.map((m) => m.clientId)).toEqual(['u1', 'a1']);
});
