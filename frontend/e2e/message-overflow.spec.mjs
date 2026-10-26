import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

const errorsByPage = new WeakMap();
test.beforeEach(({ page }) => {
  const errors = [];
  errorsByPage.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
});
test.afterEach(({ page }) => expect(errorsByPage.get(page)).toEqual([]));

const menuOf = (page) => page.getByRole('menu', { name: 'More actions', exact: true });
const triggerOf = (page, index = 0) => page.locator('#msgList .msg.assistant').nth(index)
  .getByRole('button', { name: 'More actions', exact: true });

async function boot(page, viewport = { width: 1440, height: 900 }, count = 2) {
  await prepareChatWorkbench(page, { viewport });
  await expect(page).toHaveURL('http://127.0.0.1:4173/');
  await expect(page).toHaveTitle(/Socrates/);
  await page.evaluate((total) => {
    window.__overflowCalls = [];
    const messages = window.__socratesLegacy.messages;
    messages.branchFromMessage = (id, options) => window.__overflowCalls.push(['branch', id, options || null]);
    messages.sendFeedback = (id, rating) => window.__overflowCalls.push(['feedback', id, rating]);
    messages.toggleReadAloud = (button, text, id) => window.__overflowCalls.push(['read', id, text, button.tagName]);
    window.addMessage('assistant', 'First response for menu testing.');
    window.addMessage('assistant', 'Second response for menu testing.');
    for (let i = 2; i < total; i++) window.addMessage('assistant', `Response ${i + 1} for menu testing.`);
  }, count);
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(count);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
}

async function calls(page) { return page.evaluate(() => window.__overflowCalls); }
async function messageId(page, index = 0) {
  return page.locator('#msgList .msg.assistant').nth(index).getAttribute('data-client-id');
}

test('cold keyboard opening supports last item, bounds, wrap and typeahead without hidden phone items', async ({ page }) => {
  await boot(page);
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowUp');
  const menu = menuOf(page);
  await expect(menu.getByRole('menuitem')).toHaveCount(4);
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-controls', await menu.getAttribute('id'));
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Home');
  await expect(menu.getByRole('menuitem', { name: 'Share conversation' })).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(menu.getByRole('menuitem', { name: 'Re-explain from a different angle' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.type('branch');
  await expect(menu.getByRole('menuitem', { name: 'Branch from here' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await calls(page)).toEqual([]);
});

test('branch and read-aloud dispatch exactly once to the selected message with a native button', async ({ page }) => {
  await boot(page);
  const id = await messageId(page, 1);
  const trigger = triggerOf(page, 1);
  await trigger.click();
  await menuOf(page).getByRole('menuitem', { name: 'Branch from here' }).click();
  await expect(menuOf(page)).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await menuOf(page).getByRole('menuitem', { name: 'Read aloud' }).click();
  await expect(menuOf(page)).toHaveCount(0);
  expect(await calls(page)).toEqual([
    ['branch', id, null], ['read', id, 'Second response for menu testing.', 'BUTTON'],
  ]);
});

test('phone feedback is keyboard reachable and tracks viewport changes while open', async ({ page }) => {
  await boot(page, { width: 390, height: 640 });
  const trigger = triggerOf(page);
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  const menu = menuOf(page);
  await expect(menu.getByRole('menuitem')).toHaveCount(6);
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Not helpful', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveCount(0);
  expect(await calls(page)).toEqual([['feedback', await messageId(page), 'down']]);
  await trigger.click();
  await expect(menu.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Not helpful', exact: true })).toBeFocused();
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(menu.getByRole('menuitem')).toHaveCount(4);
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem').last()).toHaveText('Re-explain from a different angle');
  await expect(menu.getByRole('menuitem').last()).toBeFocused();
  await page.setViewportSize({ width: 390, height: 640 });
  await expect(menu.getByRole('menuitem')).toHaveCount(6);
  await page.keyboard.press('End');
  await expect(menu.getByRole('menuitem', { name: 'Not helpful', exact: true })).toBeFocused();
});

test('switching message menus and dismissing with Tab or outside press preserves the destination', async ({ page }) => {
  await boot(page, { width: 1440, height: 900 }, 4);
  // Reach the far trigger first. The open surface must not cover the trigger
  // the user aims at, whichever way the transcript anchors its content, so
  // the two triggers under test sit far enough apart to clear each other's
  // menu.
  await triggerOf(page, 0).click();
  await triggerOf(page, 3).click();
  await expect(menuOf(page)).toHaveCount(1);
  await menuOf(page).getByRole('menuitem', { name: 'Branch from here' }).click();
  expect(await calls(page)).toEqual([['branch', await messageId(page, 3), null]]);
  await triggerOf(page).click();
  await page.keyboard.press('Tab');
  await expect(menuOf(page)).toHaveCount(0);
  expect(await page.locator(':focus').evaluate((node) => node !== document.body && !node.closest('[role="menu"]'))).toBe(true);
  await triggerOf(page).click();
  const editor = page.locator('#composerRoot .rich-composer-editor');
  await editor.click();
  await expect(menuOf(page)).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test('an action handing off to a confirmation keeps modal focus and restores the message trigger', async ({ page }) => {
  await boot(page);
  await page.evaluate(() => {
    window.__socratesLegacy.messages.branchFromMessage = async () => {
      const accepted = await window.showConfirm('Branch response?', 'Continue in a new chat?');
      window.__overflowCalls.push(['confirmed', accepted]);
    };
  });
  const trigger = triggerOf(page);
  for (const accepted of [false, true]) {
    await trigger.click();
    await menuOf(page).getByRole('menuitem', { name: 'Branch from here' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Branch response?' });
    await expect(dialog).toBeVisible();
    await dialog.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    await expect(page.locator('#confirmTitle')).toBeFocused();
    await expect(menuOf(page)).toHaveCount(0);
    if (accepted) await page.locator('#confirmOkBtn').click();
    else await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  expect(await calls(page)).toEqual([['confirmed', false], ['confirmed', true]]);
});

test('a delayed first menu load cannot reopen after Escape', async ({ page }) => {
  const graph = JSON.parse(readFileSync(new URL('../dist/.vite/entry-graph.json', import.meta.url), 'utf8'));
  const runtime = graph.modules.find((module) => module.id === 'src/react/menu/FoundationMenu.tsx');
  expect(graph.chunks.find((chunk) => chunk.file === runtime.chunk).eager).toBe(false);
  let release;
  let requested;
  const held = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { requested = resolve; });
  await page.route(`**/${runtime.chunk}`, async (route) => { requested(); await held; await route.continue(); });
  try {
    await boot(page);
    const trigger = triggerOf(page);
    await trigger.click();
    await started;
    await expect(trigger).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    release();
    await page.evaluate((path) => import(path).then(() => undefined), `/${runtime.chunk}`);
    await expect(menuOf(page)).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await expect(menuOf(page).getByRole('menuitem').first()).toBeFocused();
  } finally { release(); }
});

for (const variant of ['desktop', 'phone']) {
  test(`the ${variant} message menu stays in the viewport with shared motion and surface`, async ({ page }) => {
    await boot(page, variant === 'phone' ? { width: 390, height: 420 } : { width: 1440, height: 900 });
    if (variant === 'phone') await page.evaluate(() => window.toggleTheme());
    await triggerOf(page, 1).click();
    const menu = menuOf(page);
    await expect(menu).toBeVisible();
    await expect(menu).toHaveCSS('animation-name', 'none');
    await expect(menu).toHaveCSS('transition-property', 'opacity, transform');
    await menu.evaluate((node) => Promise.all(node.getAnimations().map((animation) => animation.finished)));
    const box = await menu.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(6);
    expect(box.y).toBeGreaterThanOrEqual(6);
    expect(box.x + box.width).toBeLessThanOrEqual((variant === 'phone' ? 390 : 1440) - 6);
    expect(box.y + box.height).toBeLessThanOrEqual((variant === 'phone' ? 420 : 900) - 6);
    await expect(menu).toHaveAttribute('data-align', 'start');
    const above = await menu.getAttribute('data-placement') === 'above';
    const origin = await menu.evaluate((node) => getComputedStyle(node).transformOrigin.split(' ').map(Number.parseFloat));
    expect(origin[0]).toBe(0);
    expect(origin[1]).toBeCloseTo(above ? box.height : 0, 0);
    if (variant === 'phone') {
      await expect(menu.getByRole('menuitem').last()).toHaveCSS('min-height', '44px');
    }
    await page.screenshot({ path: `test-results/message-menu-${encodeURIComponent(variant)}.png` });
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem').last()).toBeFocused();
    await expect(menu.getByRole('menuitem').last()).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
  });
}
