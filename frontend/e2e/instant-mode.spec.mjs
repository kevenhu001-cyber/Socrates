import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

for (const [label, model, viewport, lang] of [
  ['desktop', 'MiniMax-M3', { width: 1440, height: 900 }, 'zh'],
  ['mobile', 'custom-model', { width: 390, height: 844 }, 'en'],
]) {
  test(`Instant is a persistent reasoning level for every model (${label})`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => localStorage.setItem('socrates-last-active-id', 'instant-provider'));
    await mockAuthedApp(page, { lang, apiKeys: { providers: [{ id: 'instant-provider', label: model, model, url: 'https://provider.example/v1', hasKey: true, isActive: true }] } });
    const requests = [];
    await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async route => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Direct answer."}}]}\n\ndata: [DONE]\n\n' });
    });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    const openEffort = async () => {
      if (label === 'desktop') await page.locator('#topModelSwitcher').click();
      else if (await page.locator('.effort-trigger:visible').count()) {
        await page.locator('.effort-trigger:visible').first().click();
      } else {
        await page.locator('#topModelSwitcher').click();
      }
      const pop = page.locator('.chat-config-pop');
      await pop.getByRole('button', { name: lang === 'zh' ? /思考强度/ : /Reasoning effort/ }).click();
      return pop;
    };
    let pop = await openEffort();
    const instant = pop.locator('button[aria-pressed]');
    await expect(instant).toBeEnabled();
    await expect(instant).toContainText(lang === 'zh' ? '立即' : 'Instant');
    await instant.click();
    await expect(instant).toHaveAttribute('aria-pressed', 'true');
    await expect(pop.getByRole('slider')).toHaveAttribute('max', '3');
    await expect(pop.getByRole('slider')).toHaveValue('0');
    await expect(pop.getByRole('slider')).toHaveAttribute('aria-valuetext', lang === 'zh' ? '立即' : 'Instant');
    await expect(pop.locator('.chat-config-slider-dots span')).toHaveCount(4);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort'))).toBe('instant');
    await page.screenshot({ path: `test-results/instant-${encodeURIComponent(label)}.png` });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForAppShell(page);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort'))).toBe('instant');
    await expect.poll(() => page.evaluate(() => typeof window.getReasoningEffort)).toBe('undefined');
    await expect.poll(() => page.evaluate(() => typeof window.getCustomInstructionsString)).toBe('undefined');
    await page.evaluate(() => {
      window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
      window.__testActivateMainView('chatView');
      window.submitChatMessage('Answer directly.');
    });
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0].reasoning_effort).toBe('none');
    await expect(page.locator('#msgList .msg.assistant').last()).toHaveAttribute('data-stream-settled', 'true');
    await expect(page.locator('#msgList .msg.assistant').last()).toContainText('Direct answer.');
    pop = await openEffort();
    await pop.getByRole('slider').focus();
    await page.keyboard.press('End');
    await expect.poll(() => page.evaluate(() => localStorage.getItem('socrates-reasoning-effort'))).toBe('high');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.submitChatMessage('Answer with thinking enabled again.'));
    await expect.poll(() => requests.length).toBe(2);
    expect(requests[1].reasoning_effort).not.toBe('none');
    expect(requests[1].extra_body?.thinking?.type).not.toBe('disabled');
  });
}

test('Instant is not offered for a model that cannot switch thinking off', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem('socrates-last-active-id', 'instant-provider');
    localStorage.setItem('socrates-reasoning-effort', 'instant');
  });
  /* The server publishes what the model supports. This model always
     reasons, so Instant is not something the request could carry. */
  await mockAuthedApp(page, { lang: 'en', apiKeys: { providers: [{ id: 'instant-provider', label: 'Kimi', model: 'kimi-k3', url: 'https://provider.example/v1', hasKey: true, isActive: true, capabilities: { isReasoning: true, supportsInstant: false, supportsEffort: true } }] } });
  const requests = [];
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Answer."}}]}\n\ndata: [DONE]\n\n' });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#topModelSwitcher').click();
  const pop = page.locator('.chat-config-pop');
  await pop.getByRole('button', { name: /Reasoning effort/ }).click();
  const instant = pop.locator('button[aria-pressed]');
  await expect(instant).toBeDisabled();
  await expect(instant).toContainText('always reasons');
  /* The Instant stop is gone from the slider as well. */
  await expect(pop.getByRole('slider')).toHaveAttribute('max', '2');
  await expect(pop.locator('.chat-config-slider-dots span')).toHaveCount(3);

  /* A stored Instant never reaches the wire for a model that cannot honour
     it — the closest level the app has is sent instead. */
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.__testActivateMainView('chatView');
    window.submitChatMessage('Answer directly.');
  });
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0].reasoning_effort).toBe('low');
});
