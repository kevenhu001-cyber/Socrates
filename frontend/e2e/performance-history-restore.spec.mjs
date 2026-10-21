import { expect, test } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.use({ trace: 'on' });
for (const rate of [1, 4]) {
  for (const count of [200, 1000]) {
    test(`raw-only history first open, ${count} messages, CPU x${rate}`, async ({ page }, info) => {
      test.setTimeout(120_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await mockAuthedApp(page);
      const id = '55555555-5555-4555-8555-555555555555';
      const messages = Array.from({ length: count }, (_, i) => ({
        clientId: `raw-history-${i}`, role: i % 2 ? 'assistant' : 'user',
        rawText: i % 2
          ? `## Explanation ${i}\n\n${`A **distinct** historical explanation ${i} with [a local link](/). `.repeat(12)}\n\n- First step ${i}\n- Second step\n\n\`\`\`python\nresult = ${i} * 2\n\`\`\``
          : `Explain question ${i}`,
      }));
      await page.route(new RegExp('/api/(?:v2/)?sessions/' + id + '(?:\\?.*)?$'), (route) => route.fulfill({ json: {
        id, title: 'Raw-only history', topic: 'Raw-only history', mode: 'chat', kind: 'chat', phase: 'chat',
        messages, kbNodes: [], mistakes: [],
      } }));
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await waitForAppShell(page);
      await page.waitForFunction(() => typeof window.loadSession === 'function');
      await page.evaluate(() => {
        window.__historyLongTasks = [];
        new PerformanceObserver((list) => window.__historyLongTasks.push(...list.getEntries().map((entry) => ({ startTime: entry.startTime, duration: entry.duration }))))
          .observe({ type: 'longtask' });
      });
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('Performance.enable');
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
      const before = await metrics();
      const result = await page.evaluate(async (id) => {
        const start = performance.now();
        await window.loadSession(id);
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rows = window.stateStore.read('messages');
        const end = performance.now();
        const request = performance.getEntriesByType('resource').find((entry) => entry.name.includes('/sessions/' + id));
        return { openMs: end - start, rows: rows.length,
          requestMs: request ? request.responseEnd - request.startTime : null,
          responseToPaintMs: request ? end - request.responseEnd : null,
          longTasks: window.__historyLongTasks.filter((entry) => entry.startTime >= start),
          synthesizedSnapshots: rows.filter((m) => m.html).length,
          mountedMessages: document.querySelectorAll('#msgList .msg').length };
      }, id);
      await expect(page.locator('#msgList .msg.assistant').last()).toContainText(`Explanation ${count - 1}`);
      const after = await metrics();
      const report = { count, rate, ...result, scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
        taskMs: (after.TaskDuration - before.TaskDuration) * 1000,
        layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000 };
      console.log(`HISTORY_RESTORE_PERF ${JSON.stringify(report)}`);
      await info.attach('history-restore-performance', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
      expect(result.rows).toBe(count);
      expect(result.mountedMessages).toBeLessThanOrEqual(60);
      if (process.env.PERF_BASELINE !== '1') expect(result.synthesizedSnapshots).toBe(0);
      await expect(page.locator('#msgList .msg.assistant').last().locator('pre code')).toContainText(`result = ${count - 1} * 2`);
      // Rows outside the first window must still render when scrolled into
      // history, even though the loader no longer manufactured their HTML.
      const older = page.locator(`[data-client-id="raw-history-${count - 13}"]`);
      await expect.poll(async () => {
        await page.locator('#msgList').evaluate((el) => {
          el.scrollTop = 0;
          el.dispatchEvent(new Event('scroll'));
        });
        return older.count();
      }).toBe(1);
      await expect(older.locator('pre code')).toContainText(`result = ${count - 13} * 2`);
      expect(await page.locator('#msgList .msg').count()).toBeLessThanOrEqual(60);
      expect(errors).toEqual([]);
    });
  }
}
