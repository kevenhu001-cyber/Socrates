import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

const errorsByPage = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(({ page }) => expect(errorsByPage.get(page)).toEqual([]));

function runtimePath() {
  const graph = JSON.parse(readFileSync(new URL('../dist/.vite/entry-graph.json', import.meta.url), 'utf8'));
  const module = graph.modules.find((entry) => entry.id === 'src/react/confirm/ConfirmDialogContent.tsx');
  expect(module).toBeTruthy();
  expect(graph.chunks.find((entry) => entry.file === module.chunk).eager).toBe(false);
  return `/${module.chunk}`;
}

async function boot(page, options = {}) {
  await prepareChatWorkbench(page, options);
  await page.waitForFunction(() => typeof window.__socratesLegacy.confirm.showConfirm === 'function');
}

async function open(page, options = {}) {
  await page.evaluate((options) => {
    window.__confirmResults = [];
    void window.__socratesLegacy.confirm.showConfirm(options.title || 'Confirm action', options.msg || 'Continue with this change?', options.danger || false)
      .then((result) => window.__confirmResults.push(result));
  }, options);
}

async function result(page, value) {
  await expect.poll(() => page.evaluate(() => window.__confirmResults)).toEqual([value]);
}

test('the cold dialog is deferred, labelled, modal, and initially focuses its title', async ({ page }) => {
  const path = runtimePath();
  await boot(page);
  expect(await page.evaluate((path) => performance.getEntriesByType('resource')
    .some((entry) => new URL(entry.name).pathname === path), path)).toBe(false);
  const opener = page.locator('.sidebar-account-trigger');
  await opener.focus();
  await open(page);
  const dialog = page.getByRole('alertdialog', { name: 'Confirm action' });
  await expect(dialog).toHaveAccessibleDescription('Continue with this change?');
  await expect(dialog).toHaveAttribute('aria-modal', 'true');
  await expect(page.locator('#confirmTitle')).toBeFocused();
  await expect(page.locator('#appShell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#confirmOkBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirmCancelBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirmOkBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirmCancelBtn')).toBeFocused();
  await page.keyboard.press('Escape');
  await result(page, false);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#appShell')).not.toHaveAttribute('inert', '');
  await expect(opener).toBeFocused();
});

test('cancel, backdrop and accept preserve the boolean Promise result across repeated opens', async ({ page }) => {
  await boot(page);
  const opener = page.locator('.sidebar-account-trigger');
  for (const action of ['cancel', 'backdrop', 'accept']) {
    await opener.focus();
    await open(page, { danger: action === 'accept' });
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await page.locator('#confirmTitle').click();
    await expect(dialog).toBeVisible();
    if (action === 'cancel') await page.locator('#confirmCancelBtn').click();
    else if (action === 'backdrop') await page.locator('#confirmDialog').click({ position: { x: 10, y: 10 } });
    else {
      await expect(page.locator('#confirmOkBtn')).toHaveText('Delete');
      await expect(page.locator('#confirmOkBtn')).toHaveClass(/danger/);
      await page.locator('#confirmOkBtn').click();
    }
    await result(page, action === 'accept');
    await expect(dialog).toHaveCount(0);
    await expect(opener).toBeFocused();
  }
});

test('a confirmation above settings releases only its own modal and restores parent focus', async ({ page }) => {
  await boot(page);
  const trigger = page.locator('#apiSettingsBtn');
  await trigger.click();
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await expect(settings).toBeVisible();
  const opener = page.locator('#settingsOverlay .settings-nav button').first();
  await opener.focus();
  await open(page);
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(settings).toHaveCount(0); // background dialog is hidden from AT
  await page.keyboard.press('Escape');
  await result(page, false);
  await expect(dialog).toHaveCount(0);
  await expect(settings).toBeVisible();
  await expect(opener).toBeFocused();
  await expect(page.locator('#appShell')).toHaveAttribute('inert', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settingsOverlay')).toBeHidden();
  await expect(page.locator('#appShell')).not.toHaveAttribute('inert', '');
  await expect(trigger).toBeFocused();
});

test('reopening during exit keeps the next confirmation visible and uses the new copy', async ({ page }) => {
  await boot(page);
  await open(page, { title: 'First question' });
  await page.locator('#confirmCancelBtn').click();
  await result(page, false);
  await open(page, { title: 'Second question', msg: 'A new confirmation.' });
  const dialog = page.getByRole('alertdialog', { name: 'Second question' });
  await expect(dialog).toBeVisible();
  await dialog.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAccessibleDescription('A new confirmation.');
  await page.locator('#confirmOkBtn').click();
  await result(page, true);
});

for (const action of ['Escape', 'Tab', 'outside']) {
  test(`${action} cancels a delayed dialog without a late reopen or focus steal`, async ({ page }) => {
    const path = runtimePath();
    let release;
    let requested;
    const held = new Promise((resolve) => { release = resolve; });
    const started = new Promise((resolve) => { requested = resolve; });
    await page.route(`**${path}`, async (route) => {
      requested();
      await held;
      await route.continue();
    });
    try {
      await boot(page);
      await page.locator('.sidebar-account-trigger').focus();
      await open(page);
      await started;
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      if (action === 'outside') await page.locator('#composerRoot .rich-composer-editor').click();
      else await page.keyboard.press(action);
      await result(page, false);
      const destination = await page.locator(':focus').elementHandle();
      release();
      await page.evaluate((path) => import(path).then(() => undefined), path);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect(await page.evaluate((node) => document.activeElement === node, destination)).toBe(true);
      await open(page);
      await expect(page.getByRole('alertdialog')).toBeVisible();
      await page.locator('#confirmCancelBtn').click();
      await result(page, false);
    } finally { release(); }
  });
}

test('a failed runtime load settles the pending confirmation as cancel', async ({ page }) => {
  await page.route(`**${runtimePath()}`, (route) => route.abort('failed'));
  await boot(page);
  await open(page);
  await result(page, false);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.locator('#appShell')).not.toHaveAttribute('inert', '');
});

test('long confirmation text scrolls while the actions remain keyboard reachable', async ({ page }) => {
  await boot(page, { viewport: { width: 390, height: 420 } });
  await open(page, { msg: 'A long explanation. '.repeat(160) });
  const dialog = page.getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((node) => node.scrollHeight > node.clientHeight)).toBe(true);
  const bounds = await dialog.boundingBox();
  expect(bounds.y).toBeGreaterThanOrEqual(15);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(405);
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirmCancelBtn')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#confirmOkBtn')).toBeFocused();
  await expect(page.locator('#confirmOkBtn')).toBeInViewport();
  await page.keyboard.press('Enter');
  await result(page, true);
});

for (const variant of ['desktop', 'phone']) {
  test(`confirmation preserves the ${variant} surface and motion`, async ({ page }) => {
    await boot(page, { viewport: variant === 'phone' ? { width: 390, height: 640 } : { width: 1440, height: 900 } });
    if (variant === 'phone') await page.evaluate(() => document.getElementById('themeToggle')?.click());
    await open(page, { title: 'Delete this draft?', msg: 'This action removes the selected draft.', danger: true });
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveCSS('animation-name', 'none');
    await expect(dialog).toHaveCSS('transition-property', 'opacity, transform');
    await dialog.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await expect(dialog).toBeInViewport();
    await page.screenshot({ path: `test-results/confirm-dialog-${encodeURIComponent(variant)}.png` });
    await page.locator('#confirmCancelBtn').click();
    await expect(dialog).toHaveAttribute('data-state', 'closing');
    await expect(dialog).toHaveCount(0);
  });
}
