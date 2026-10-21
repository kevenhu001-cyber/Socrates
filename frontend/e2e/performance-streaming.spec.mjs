import { expect, test } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test.use({ trace: 'on' });
for (const rate of [1, 4]) {
  test(`long streamed answers reuse settled paragraphs, CPU x${rate}`, async ({ page }, info) => {
    test.setTimeout(90_000);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepareChatWorkbench(page, { messages: Array.from({ length: 500 }, (_, i) => ({
      clientId: `long-history-${i}`, role: i % 2 ? 'assistant' : 'user',
      rawText: `Historical context ${i}`, html: `<p>Historical context ${i}</p>`,
    })) });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Performance.enable');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const readMetrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]));
    await page.evaluate(() => {
      const render = window.__socratesLegacy.render;
      const original = render.renderAssistantProgressive;
      window.__streamPerf = { settledPaints: 0, tailPaints: 0, longTasks: [] };
      render.renderAssistantProgressive = (text, options) => {
        window.__streamPerf[options?.complete ? 'settledPaints' : 'tailPaints']++;
        return original(text, options);
      };
      new PerformanceObserver((list) => window.__streamPerf.longTasks.push(...list.getEntries().map((entry) => entry.duration)))
        .observe({ type: 'longtask' });
      // More completed blocks than the former 200-entry per-turn cache.
      const prefix = Array.from({ length: 260 }, (_, i) => `Paragraph ${i}: ${'A completed explanation should not be parsed again when the next word arrives. '.repeat(3)}`).join('\n\n');
      window.__longStreamText = prefix + '\n\nLive tail';
      window.stateStore.dispatch({ type: 'session/append-message', payload: {
        clientId: 'long-live', role: 'assistant', type: 'streaming', rawText: window.__longStreamText, html: '',
      } });
      window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'long-stream-fixture' });
    });
    const bubble = page.locator('[data-client-id="long-live"]');
    await expect(bubble.locator('.tool-run-prose.is-settled')).toHaveCount(260);
    await page.evaluate(() => {
      window.__streamPerf.settledPaints = 0;
      window.__streamPerf.tailPaints = 0;
      window.__streamPerf.longTasks = [];
      window.__firstStreamParagraph = document.querySelector('[data-client-id="long-live"] .is-settled');
    });
    const before = await readMetrics();
    const streaming = page.evaluate(async () => {
      for (let i = 0; i < 60; i++) {
        await new Promise(requestAnimationFrame);
        window.__longStreamText += ` word-${i}`;
        window.stateStore.dispatch({ type: 'session/update-message', index: 500, clientId: 'long-live', patch: { rawText: window.__longStreamText } });
        window.__socratesReactChatBridge.publish({ type: 'stream-delta', messageId: 'long-live', textLength: window.__longStreamText.length });
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    });
    await page.locator('#composerInputWrap .tiptap').pressSequentially('Typing during a long answer.', { delay: 20 });
    await streaming;
    await expect(bubble.locator('.is-tail')).toContainText('word-59');
    const after = await readMetrics();
    const result = await page.evaluate(() => ({ ...window.__streamPerf,
      prefixPreserved: window.__firstStreamParagraph === document.querySelector('[data-client-id="long-live"] .is-settled'),
      mountedMessages: document.querySelectorAll('#msgList .msg').length,
    }));
    const report = { rate, ...result, scriptMs: (after.ScriptDuration - before.ScriptDuration) * 1000,
      layoutMs: (after.LayoutDuration - before.LayoutDuration) * 1000 };
    await info.attach('stream-performance', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
    console.log(`STREAM_PERF ${JSON.stringify(report)}`);
    if (process.env.PERF_BASELINE !== '1') expect(report.settledPaints).toBe(0);
    expect(report.tailPaints).toBeGreaterThan(0);
    expect(report.prefixPreserved).toBe(true);
    expect(report.mountedMessages).toBeLessThan(121);
    await expect(page.locator('#composerInputWrap .tiptap')).toHaveText('Typing during a long answer.');
    await bubble.locator('.is-tail').scrollIntoViewIfNeeded();
    await expect(bubble.locator('.is-tail')).toBeVisible();
    await page.screenshot({ path: 'test-results/long-stream-verified.png' });
    if (rate === 4) {
      await page.setViewportSize({ width: 390, height: 844 });
      await bubble.locator('.is-tail').scrollIntoViewIfNeeded();
      await expect(bubble.locator('.is-tail')).toBeVisible();
      await page.screenshot({ path: 'test-results/long-stream-mobile.png' });
    }
    expect(errors).toEqual([]);
  });
}
