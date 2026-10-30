import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

for (const variant of [
  { name: 'desktop-light', width: 1440, height: 960, mode: 'light', minimum: 32 },
  { name: 'mobile-dark', width: 390, height: 844, mode: 'dark', minimum: 44 },
]) {
  test(`one usable Retry control replaces the error without losing the transcript (${variant.name})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: variant.width, height: variant.height });
    await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), variant.mode);
    await mockAuthedApp(page);
    let calls = 0;
    await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, (route) => {
      calls += 1;
      return route.fulfill(calls === 1
        ? { status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary generation failure' }) }
        : { status: 200, contentType: 'text/event-stream', body: 'data: {"choices":[{"delta":{"content":"Recovered response"}}]}\n\ndata: [DONE]\n\n' });
    });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/Socrates/);
    await expect(page.locator('html')).toHaveAttribute('data-mode', variant.mode);
    const namespaceBridgeAliases = await page.evaluate(() => [
      '__socratesSessionBridge', '__socratesKbBridge', '__socratesSearchBridge',
      '__socratesCallBridge', '__socratesUiBridge', '__socratesExamBridge',
    ].filter((key) => key in window));
    expect(namespaceBridgeAliases).toEqual([]);
    await page.evaluate(() => {
      window.stateStore.dispatch({ type: 'state/batch', patch: {
        phase: 'chat', topic: 'Terminal state', currentSessionId: '22222222-2222-4222-8222-222222222222',
      } });
      window.__testActivateMainView('chatView');
      window.addMessage('assistant', 'This earlier reply must remain visible.');
      return window.submitChatMessage('Retry this request');
    });
    const terminal = page.locator('#msgList .msg-error');
    await expect(terminal).toHaveCount(1);
    const retry = terminal.getByRole('button', { name: 'Retry', exact: true });
    await expect(retry).toBeVisible();
    const size = await retry.boundingBox();
    expect(size.height).toBeGreaterThanOrEqual(variant.minimum);
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.screenshot({ path: `test-results/pass2-terminal-${encodeURIComponent(variant.name)}.png` });
    await retry.press('Enter');
    await expect(page.locator('#msgList .msg.assistant').last()).toContainText('Recovered response');
    await expect(page.locator('#msgList')).toContainText('This earlier reply must remain visible.');
    await expect(page.locator('#msgList .msg-error')).toHaveCount(0);
    await expect(page.locator('.error-boundary-fallback')).toHaveCount(0);
    expect(calls).toBe(2);
    expect(errors).toEqual([]);
  });
}
