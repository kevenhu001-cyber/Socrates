// e2e/tool-card-lifecycle.spec.mjs — Task 10.4
//
// Playwright coverage for the detailed tool-card lifecycle (Requirement 5.3):
//   • Req 3.2 — while a run is not terminal, the card shows a running
//     indicator and a LIVE elapsed timer in `.agent-tool-status` that
//     advances over time.
//   • Req 3.3 — on the first terminal transition the card reports the
//     terminal state (data-tool-state) and a final total-duration label.
//   • Req 3.1 — the card header toggles collapse: clicking it flips the
//     `.open` class and the header's `aria-expanded`.
//
// The detailed `.agent-tool-card` chrome is what history/share replay and
// the streaming controller mount via `window.appendToolModule(name, input,
// container, opts)`. Rather than reproduce a full live tool run through the
// mock stream, this spec drives a card directly through that global and then
// simulates completion by flipping `card.dataset.toolState` — the same
// attribute `chat/toolRuntime.ts` writes on a real terminal event. A shared
// ~250ms interval in ui/toolCards.js recomputes `toolCardView(run, Date.now())`
// for running cards and writes `.agent-tool-status`; on the terminal
// transition it latches the final total-duration label.
//
// Validation-only: creates a new spec file, no source changes.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
});

/* Mount a fresh, running detailed tool card inside a dedicated assistant
   bubble and return a stable selector for it. We tag the card with a unique
   data-testid so parallel bubbles never cross-match. */
async function mountRunningCard(page, { tool = 'code_interpreter', input = { code: 'print(1)', language: 'python' } } = {}) {
  const testid = `lifecycle-${Math.random().toString(36).slice(2, 8)}`;
  await page.evaluate(({ tool: toolName, input: toolInput, testid: id }) => {
    // Reveal the chat view so the mounted card is actually laid out and
    // clickable (the composer/topic-setup shell hides #msgList otherwise).
    try {
      window.state.phase = 'chat';
      document.getElementById('topicSetup')?.classList.add('hidden');
      document.getElementById('chatView')?.classList.remove('hidden');
    } catch (_) {}
    const list = document.getElementById('msgList');
    const wrap = document.createElement('div');
    wrap.className = 'msg assistant';
    const bodyHost = document.createElement('div');
    bodyHost.className = 'msg-body';
    wrap.appendChild(bodyHost);
    list.appendChild(wrap);
    window.appendToolModule(toolName, toolInput, bodyHost);
    const card = bodyHost.querySelector('.agent-tool-card');
    card.setAttribute('data-testid', id);
  }, { tool, input, testid });
  return page.locator(`[data-testid="${testid}"]`);
}

test('running tool card shows a live elapsed timer that advances', async ({ page }) => {
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // The global must be wired by windowExports.js for the mount below.
  await expect.poll(() => page.evaluate(() => typeof window.appendToolModule)).toBe('function');

  const card = await mountRunningCard(page);

  // Req 3.2 — running indicator: the card is in the running state and
  // (per the collapse default) mounts expanded so progress is visible.
  await expect(card).toHaveAttribute('data-tool-state', 'running');
  await expect(card).toHaveClass(/\bopen\b/);

  const status = card.locator('.agent-tool-status');
  // A running elapsed label lands quickly (the timer seeds immediately and
  // ticks ~every 250ms). It should be non-empty and look like a duration.
  await expect.poll(async () => (await status.textContent())?.trim() ?? '', { timeout: 5_000 })
    .toMatch(/\d+\s*ms|\d+\.\d+s/);

  // The elapsed label must ADVANCE while the run stays non-terminal. Sample,
  // wait a few hundred ms, sample again, and assert the reported time grew.
  const readMs = async () => {
    const raw = ((await status.textContent()) || '').trim();
    const sMatch = raw.match(/([\d.]+)\s*s/);
    if (sMatch) return Math.round(parseFloat(sMatch[1]) * 1000);
    const msMatch = raw.match(/(\d+)\s*ms/);
    if (msMatch) return parseInt(msMatch[1], 10);
    return 0;
  };
  const first = await readMs();
  await page.waitForTimeout(700);
  await expect.poll(readMs, { timeout: 5_000 }).toBeGreaterThan(first);

  // Retire the card so the shared interval stops and does not leak into the
  // next test (workers:1 shares the page's module state within a spec run).
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) { el.dataset.toolState = 'complete'; el.dataset.endedAt = String(Date.now()); }
  }, await card.getAttribute('data-testid'));
});

test('completed tool card shows the terminal state and a final total-duration label', async ({ page }) => {
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await expect.poll(() => page.evaluate(() => typeof window.appendToolModule)).toBe('function');

  const card = await mountRunningCard(page);
  await expect(card).toHaveAttribute('data-tool-state', 'running');

  const id = await card.getAttribute('data-testid');
  const status = card.locator('.agent-tool-status');

  // Let the run accrue a little elapsed time so the terminal duration is
  // observably non-zero.
  await page.waitForTimeout(400);

  // Drive the terminal transition the way toolRuntime.ts does: stamp an
  // endedAt and flip data-tool-state off "running". The card's
  // MutationObserver (and the shared tick) latches the final duration.
  await page.evaluate((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    el.dataset.endedAt = String(Number(el.dataset.startedAt || Date.now()) + 1400);
    el.dataset.toolState = 'complete';
  }, id);

  // Req 3.3 — terminal state is reflected on the card...
  await expect(card).toHaveAttribute('data-tool-state', 'complete');
  // ...and a final total-duration label is written. endedAt-startedAt = 1400ms
  // so formatDuration reports "1.4s". Assert it is present and stable (no
  // longer advancing, because the run is terminal).
  await expect.poll(async () => (await status.textContent())?.trim() ?? '', { timeout: 5_000 })
    .toMatch(/1\.4s/);

  const settled = ((await status.textContent()) || '').trim();
  await page.waitForTimeout(500);
  expect(((await status.textContent()) || '').trim()).toBe(settled);
});

test('error terminal state is reflected on the card', async ({ page }) => {
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await expect.poll(() => page.evaluate(() => typeof window.appendToolModule)).toBe('function');

  const card = await mountRunningCard(page, { tool: 'web_search', input: { query: 'kittens' } });
  await expect(card).toHaveAttribute('data-tool-state', 'running');

  await page.evaluate((testid) => {
    const el = document.querySelector(`[data-testid="${testid}"]`);
    el.dataset.endedAt = String(Number(el.dataset.startedAt || Date.now()) + 800);
    el.dataset.toolState = 'error';
  }, await card.getAttribute('data-testid'));

  await expect(card).toHaveAttribute('data-tool-state', 'error');
  // A finite total-duration label is latched for the failed run too.
  await expect.poll(async () => (await card.locator('.agent-tool-status').textContent())?.trim() ?? '', { timeout: 5_000 })
    .toMatch(/\d+\s*ms|\d+\.\d+s/);
});

test('header click toggles collapse (.open / aria-expanded)', async ({ page }) => {
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await expect.poll(() => page.evaluate(() => typeof window.appendToolModule)).toBe('function');

  // Use a code tool so the disclosure body carries content (a code block),
  // matching the collapse default the renderer applies to running cards.
  const card = await mountRunningCard(page, { tool: 'code_interpreter', input: { code: 'print(1)', language: 'python' } });
  const head = card.locator('.agent-tool-head');
  const body = card.locator('.agent-tool-body');

  const bodyHidden = () => body.evaluate((el) => el.hasAttribute('hidden'));

  // Req 3.1 — a running card starts expanded: .open + aria-expanded true and
  // the disclosure body is not hidden.
  await expect(card).toHaveClass(/\bopen\b/);
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  expect(await bodyHidden()).toBe(false);

  // Collapse.
  await head.click();
  await expect(card).not.toHaveClass(/\bopen\b/);
  await expect(head).toHaveAttribute('aria-expanded', 'false');
  expect(await bodyHidden()).toBe(true);

  // Expand again.
  await head.click();
  await expect(card).toHaveClass(/\bopen\b/);
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  expect(await bodyHidden()).toBe(false);

  // Retire so the shared timer stops before the spec run ends.
  await page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (el) { el.dataset.toolState = 'complete'; el.dataset.endedAt = String(Date.now()); }
  }, await card.getAttribute('data-testid'));
});
