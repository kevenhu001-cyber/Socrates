import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

// PERF_BASELINE=1 records the old build; PERF_ENFORCE=1 applies timing budgets
// on a dedicated runner. Structural/resource budgets always apply after fixes.
test.use({ trace: 'on' });
const baseline = process.env.PERF_BASELINE === '1';
const enforce = process.env.PERF_ENFORCE === '1';
const p95 = (values) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
const idFor = (i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, '0')}`;
const sessionsFor = (count) => Array.from({ length: count }, (_, i) => ({
  id: idFor(i), title: `Performance session ${i}`, topic: `Performance session ${i}`,
  mode: 'chat', phase: 'chat', kind: 'chat', createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z', tags: [], pinned: false,
}));
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const metrics = async (cdp) => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));

async function boot(page, sessions) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuthedApp(page);
  await page.route(/\/api\/(?:v2\/)?sessions(?:\?|$)/, (route) => route.fulfill({ json: { sessions } }));
  const requests = [];
  await page.route(/\/api\/(?:v2\/)?sessions\/[a-f0-9-]+(?:\?|$)/, async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const index = sessions.findIndex((session) => session.id === id);
    if (route.request().method() === 'PATCH') {
      Object.assign(sessions[index], route.request().postDataJSON());
      return route.fulfill({ json: { session: sessions[index] } });
    }
    requests.push({ id, at: Date.now() });
    await route.fulfill({ json: { ...sessions[index], messages: Array.from({ length: index % 2 ? 200 : 8 }, (_, i) => ({
      clientId: `${id}-message-${i}`, role: i % 2 ? 'assistant' : 'user',
      rawText: `History ${id} row ${i}. A short paragraph for the interaction fixture.`,
      html: `<p>History ${id} row ${i}.</p>`,
    })) } });
  });
  await page.addInitScript(() => {
    window.__interactionProbe = { longTasks: [], events: [] };
    for (const [type, key] of [['longtask', 'longTasks'], ['event', 'events']]) {
      try {
        new PerformanceObserver((list) => {
          for (const item of list.getEntries()) window.__interactionProbe[key].push({
            name: item.name, duration: item.duration, startTime: item.startTime,
            inputDelay: item.processingStart ? item.processingStart - item.startTime : undefined,
            interactionId: item.interactionId,
          });
        }).observe({ type, buffered: true, durationThreshold: 16 });
      } catch { /* Optional Event Timing support; CDP metrics remain available. */ }
    }
  });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await waitForAppShell(page);
  await expect(page.locator('.recent-item').first()).toBeVisible();
  expect(await page.evaluate(() => !('__socratesSessionListBridge' in window))).toBe(true);
  return { errors, requests };
}

async function captureInteraction(page, action) {
  await page.evaluate(() => {
    window.__lastInteractionPaint = null;
    document.addEventListener('pointerdown', () => {
      const start = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => { window.__lastInteractionPaint = performance.now() - start; }));
    }, { once: true, capture: true });
  });
  await action();
  await frames(page);
  return page.evaluate(() => window.__lastInteractionPaint);
}

for (const rate of [1, 4]) {
  test(`interaction matrix, CPU x${rate}`, async ({ page }, info) => {
    test.setTimeout(120_000);
    const { errors, requests } = await boot(page, sessionsFor(20));
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const report = [];
    for (const count of [20, 500, 2000]) {
      const samples = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        samples.push(await page.evaluate(async (sessions) => {
          const start = performance.now();
          // Mutate the stable cache reference to benchmark synthetic sizes above its setter cap,
          // then exercise the real recents publisher and React subscriber path.
          const source = window.SERVER_SESSIONS;
          source.splice(0, source.length, ...sessions);
          window.renderRecents();
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return performance.now() - start;
        }, sessionsFor(count)));
      }
      const row = page.locator('.recent-item').first();
      const menuSamples = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        menuSamples.push(await captureInteraction(page, () => row.locator('.recent-item-overflow').click()));
        await expect(page.locator('.recent-item-menu[role="menu"]')).toBeVisible();
        await page.keyboard.press('Escape');
      }
      const menuPaint = p95(menuSamples.slice(1));
      const inputStarted = await page.evaluate(() => performance.now());
      const before = await metrics(cdp);
      const editor = page.locator('.tiptap:visible');
      await editor.fill('');
      await editor.pressSequentially('Testing responsive input with many sessions.', { delay: 10 });
      await frames(page);
      const after = await metrics(cdp);
      const size = await page.locator('#recentsList').evaluate((node) => ({ nodes: node.querySelectorAll('*').length, rows: node.querySelectorAll('.recent-item').length }));
      report.push({ count, ...size, updatePaintP95Ms: p95(samples.slice(1)), menuPaintP95Ms: menuPaint,
        typingLayoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000,
        typingScriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000 });
      const inputEvents = await page.evaluate((start) => window.__interactionProbe.events.filter((event) =>
        event.startTime >= start && /^(keydown|keypress|keyup|beforeinput|input)$/.test(event.name)).map((event) => event.duration), inputStarted);
      report.at(-1).inputEventP95Ms = p95(inputEvents) || 0;
      if (enforce) expect(report.at(-1).inputEventP95Ms).toBeLessThanOrEqual(rate === 1 ? 100 : 200);
      if (!baseline) expect(size.rows).toBeLessThan(100);
      if (enforce) expect(menuPaint).toBeLessThanOrEqual(rate === 1 ? 100 : 200);
    }
    await page.screenshot({ path: 'test-results/performance-sidebar-desktop.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#sidebarOpenBtn').click();
    await page.screenshot({ path: 'test-results/performance-sidebar-mobile.png' });
    await info.attach('interaction-metrics', { body: JSON.stringify({ rate, report, requests: requests.length,
      browser: await page.evaluate(() => window.__interactionProbe), cdp: await metrics(cdp) }, null, 2), contentType: 'application/json' });
    console.log(`PERF_MATRIX ${JSON.stringify({ rate, report })}`);
    expect(errors).toEqual([]);
  });
}

test('100 real session switches retain bounded resources and correct history', async ({ page }, info) => {
  test.setTimeout(180_000);
  const sessions = sessionsFor(6);
  const { errors, requests } = await boot(page, sessions);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  const snapshots = [];
  const switchTimes = { cold: [], warm: [], coldNetworkMs: [], coldFrontendMs: [] };
  for (let i = 0; i < 112; i++) {
    const session = sessions[i % sessions.length];
    const requestsBefore = requests.length;
    await page.evaluate((id) => {
      window.__switchStart = 0;
      window.__switchPaint = null;
      // Measure from the browser's click dispatch, excluding Playwright's
      // locator/actionability wait, and stop after the target history paints.
      document.addEventListener('click', () => { window.__switchStart = performance.now(); }, { once: true, capture: true });
      const observer = new MutationObserver(() => {
        if (!window.__switchStart || !document.getElementById('msgList')?.textContent.includes('History ' + id)) return;
        observer.disconnect();
        requestAnimationFrame(() => requestAnimationFrame(() => { window.__switchPaint = performance.now() - window.__switchStart; }));
      });
      observer.observe(document.getElementById('msgList'), { childList: true, subtree: true, characterData: true });
    }, session.id);
    await page.locator(`.recent-item[data-recent-actual="${session.id}"] .recent-item-text`).click();
    await expect(page.locator('#msgList')).toContainText(`History ${session.id}`);
    await page.waitForFunction(() => window.__switchPaint !== null);
    const timing = await page.evaluate((id) => {
      const elapsed = window.__switchPaint;
      const network = performance.getEntriesByType('resource').filter((entry) =>
        entry.responseEnd >= window.__switchStart && entry.name.includes('/sessions/' + id))
        .reduce((total, entry) => total + Math.max(0, entry.responseEnd - Math.max(entry.startTime, window.__switchStart)), 0);
      return { elapsed, network, frontend: Math.max(0, elapsed - network) };
    }, session.id);
    const cold = requests.length > requestsBefore;
    switchTimes[cold ? 'cold' : 'warm'].push(timing.elapsed);
    if (cold) {
      switchTimes.coldNetworkMs.push(timing.network);
      switchTimes.coldFrontendMs.push(timing.frontend);
    }
    if ([11, 61, 111].includes(i)) {
      await cdp.send('HeapProfiler.collectGarbage');
      snapshots.push({ switches: i + 1, ...(await cdp.send('Memory.getDOMCounters')), ...(await metrics(cdp)) });
    }
  }
  await page.locator('#sidebarSearch').fill('Performance session 5');
  await expect(page.locator('.recent-item')).toHaveCount(1);
  await expect(page.locator('.recent-item')).toContainText('Performance session 5');
  await page.locator('#sidebarSearch').fill('');
  await expect(page.locator('.recent-item')).toHaveCount(6);
  if (!baseline) {
    const last = snapshots.at(-1), warm = snapshots[1];
    expect(last.jsEventListeners).toBeLessThanOrEqual(warm.jsEventListeners + 20);
    expect(last.nodes).toBeLessThanOrEqual(warm.nodes + 300);
    expect(last.JSHeapUsedSize).toBeLessThanOrEqual(warm.JSHeapUsedSize * 1.15 + 1_000_000);
  }
  const report = { snapshots, requestCount: requests.length, switchTimes,
    warmSwitchP95Ms: p95(switchTimes.warm), coldSwitchP95Ms: p95(switchTimes.cold) };
  if (enforce) expect(report.warmSwitchP95Ms).toBeLessThanOrEqual(200);
  await info.attach('session-soak-metrics', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  console.log(`PERF_SOAK ${JSON.stringify({ snapshots, requestCount: requests.length, warmSwitchP95Ms: report.warmSwitchP95Ms })}`);
  expect(errors).toEqual([]);
});

test('windowed history reaches the last row and retains rename, menu and drag state', async ({ page }) => {
  const { errors } = await boot(page, sessionsFor(2000));
  const first = page.locator(`.recent-item[data-recent-actual="${idFor(0)}"]`);
  await first.locator('.recent-item-overflow').click();
  await page.locator('.recent-item-menu').getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const input = first.locator('input[name="title"]');
  await input.fill('Retained rename draft');
  const scrollTo = (bottom) => page.locator('#recentsPanel').evaluate((node, bottom) => { node.scrollTop = bottom ? node.scrollHeight : 0; }, bottom);
  await scrollTo(true);
  await expect(page.locator(`.recent-item[data-recent-actual="${idFor(1999)}"]`)).toBeVisible();
  await expect(input).toHaveValue('Retained rename draft');
  expect(await page.locator('.recent-item').count()).toBeLessThan(100);
  await scrollTo(false);
  await input.press('Enter');
  await expect(first.locator('.recent-item-text')).toHaveText('Retained rename draft');
  await first.locator('.recent-item-overflow').click();
  await scrollTo(true);
  await expect(first).toHaveCount(1);
  await page.keyboard.press('Escape');
  await scrollTo(false);
  await first.dispatchEvent('dragstart', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
  await scrollTo(true);
  await expect(first).toHaveCount(1);
  await first.dispatchEvent('dragend');
  await page.locator('#sidebarSearch').fill('Performance session 1999');
  await expect(page.locator('.recent-item')).toHaveCount(1);
  await expect(page.locator('.recent-item')).toContainText('Performance session 1999');
  await page.locator('#sidebarSearch').fill('');
  expect(await page.locator('.recent-item').count()).toBeLessThan(100);
  // Organize is a phone drawer control in the existing UI.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#sidebarOpenBtn').click();
  await scrollTo(false);
  await page.locator('#recentsMoreBtn').click();
  await page.getByRole('menuitemradio', { name: 'Group by project' }).click();
  await expect(page.locator('.recents-project-label').first()).toBeVisible();
  expect(await page.locator('.recent-item').count()).toBeLessThan(100);
  await scrollTo(true);
  await expect(page.locator(`.recent-item[data-recent-actual="${idFor(1999)}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

test('immediate editor updates, Chinese composition, undo and surface switching retain the latest input', async ({ page }) => {
  const { errors } = await boot(page, sessionsFor(2));
  const editor = page.locator('.tiptap:visible');
  // Read the editor in the input task, before the browser's next render turn.
  await page.evaluate(() => {
    const input = document.querySelector('.tiptap');
    input.addEventListener('input', () => {
      window.__immediateDraft = input.textContent;
    });
  });
  await editor.fill('Latest text');
  expect(await page.evaluate(() => window.__immediateDraft)).toBe('Latest text');
  await editor.dispatchEvent('compositionstart', { data: '' });
  await page.keyboard.insertText('中文输入');
  await editor.dispatchEvent('compositionend', { data: '中文输入' });
  await expect(editor).toContainText('中文输入');
  const draft = await editor.textContent();
  await editor.press('ControlOrMeta+z');
  await editor.press('ControlOrMeta+Shift+z');
  await expect(editor).toContainText('中文输入');
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
  });
  await editor.fill('Other draft');
  await page.evaluate(() => window.__testActivateMainView('topicSetup'));
  await expect(editor).toHaveText(draft);
  expect(errors).toEqual([]);
});
