import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { expectNoGlobalError, prepareChatWorkbench } from './_chat-workbench.mjs';

for (const fixture of [
  { name: 'desktop-light', viewport: { width: 1280, height: 800 }, mode: 'light', lang: 'en', retry: 'Try again', draft: 'saved draft' },
  { name: 'phone-dark-zh', viewport: { width: 390, height: 844 }, mode: 'dark', lang: 'zh', retry: '重试', draft: '草稿' },
]) {
test(`a failed composer chunk recovers locally without reloading (${fixture.name})`, async ({ page }) => {
  const graph = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
  const composer = graph.modules.find((entry) => entry.id === 'src/react/composer-input/index.ts');
  expect(composer, 'the editor must remain a lazy module').toBeTruthy();
  await page.setViewportSize(fixture.viewport);
  await mockAuthedApp(page, { lang: fixture.lang });
  await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), fixture.mode);
  let blocked = true;
  let failures = 0;
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(`**/${composer.chunk}`, (route) => {
    if (blocked) {
      failures++;
      return route.abort('failed');
    }
    return route.continue();
  });
  await page.goto('/');
  await waitForAppShell(page);
  const notice = page.locator('#composerInputWrap [data-mount-recovery="composer-shell"]');
  await expect(notice).toBeVisible();
  await expect(notice.getByRole('status')).toContainText(fixture.draft);
  const retryButton = notice.getByRole('button', { name: fixture.retry, exact: true });
  await expect(retryButton).toHaveAttribute('type', 'button');
  await expect(page.locator('#sidebarNav')).toBeAttached();
  await expect(page.locator('#topModelSwitcher')).toBeVisible();
  expect(failures).toBeGreaterThan(0);
  await retryButton.focus();
  await expect(retryButton).toBeFocused();
  await page.screenshot({ path: 'test-results/composer-load-recovery-' + encodeURIComponent(fixture.name) + '.png' });

  const bootId = await page.evaluate(() => {
    document.documentElement.dataset.recoveryBoot = 'original';
    return performance.timeOrigin;
  });
  blocked = false;
  await page.keyboard.press('Enter');
  await expect(page.locator('#composerRoot .rich-composer-editor').first()).toBeVisible();
  await expect(notice).toHaveCount(0);
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(bootId);
  await expect(page.locator('html')).toHaveAttribute('data-recovery-boot', 'original');
  const editor = page.locator('#composerRoot .rich-composer-editor').first();
  await editor.fill('Draft after recovery');
  await page.evaluate(() => window.__socratesMountReactCompatibility());
  await expect(editor).toHaveText('Draft after recovery');
  await expect(page.locator('#composerRoot')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
}

test('a failed transcript chunk recovers stored messages without changing the composer draft', async ({ page }) => {
  const graph = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
  const transcript = graph.modules.find((entry) => entry.id === 'src/react/message-list/MessageList.tsx');
  expect(graph.chunks.find((chunk) => chunk.file === transcript.chunk).eager).toBe(false);
  let blocked = true;
  await page.route(`**/${transcript.chunk}`, (route) => blocked ? route.abort('failed') : route.continue());
  await prepareChatWorkbench(page, {
    messages: [{ id: 'recovery-answer', role: 'assistant', rawText: 'Preserved answer', text: 'Preserved answer' }],
  });
  const notice = page.locator('#msgList [data-mount-recovery="msg-list"]');
  await expect(notice).toBeVisible();
  const editor = page.locator('#composerRoot .rich-composer-editor').first();
  await editor.fill('Unsent draft');
  const bootId = await page.evaluate(() => performance.timeOrigin);
  blocked = false;
  await notice.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(notice).toHaveCount(0);
  await expect(page.locator('#msgList')).toContainText('Preserved answer');
  await expect(editor).toHaveText('Unsent draft');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(bootId);
  await expectNoGlobalError(page);
});

test('a failed navigation chunk remains locally retryable while the composer boots', async ({ page }) => {
  const graph = JSON.parse(readFileSync(resolve(import.meta.dirname, '../dist/.vite/entry-graph.json'), 'utf8'));
  const navigation = graph.modules.find((entry) => entry.id === 'src/react/sidebar/SidebarNav.tsx');
  let blocked = true;
  await mockAuthedApp(page);
  await page.route(`**/${navigation.chunk}`, (route) => blocked ? route.abort('failed') : route.continue());
  await page.goto('/');
  const editor = page.locator('#composerRoot .rich-composer-editor').first();
  await expect(editor).toBeVisible();
  await editor.fill('Draft while navigation is unavailable');
  const notice = page.locator('#sidebarNav [data-mount-recovery="sidebar-nav"]');
  await expect(notice).toBeVisible();
  await expect(notice).toHaveCount(1);
  blocked = false;
  await notice.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('#navLibrary')).toBeVisible();
  await expect(notice).toHaveCount(0);
  await expect(editor).toHaveText('Draft while navigation is unavailable');
  await expect(page.locator('#__socrates_global_err_banner')).toHaveCount(0);
});
