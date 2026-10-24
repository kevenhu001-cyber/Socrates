import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

test('new Chinese prose fades in while completed paragraphs and final text stay stable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await prepareChatWorkbench(page, { messages: [{ clientId: 'reveal-user', role: 'user', rawText: '解释一下', html: '' }] });
  const text = '已完成的段落保持稳定。\n\n新的内容正在输出';
  await page.evaluate((text) => {
    window.stateStore.dispatch({ type: 'session/append-message', payload: {
      clientId: 'reveal-answer', role: 'assistant', type: 'streaming', rawText: text, html: '',
    } });
    window.__socratesReactChatBridge.publish({ type: 'stream-delta', messageId: 'reveal-answer', textLength: text.length });
  }, text);
  const bubble = page.locator('[data-client-id="reveal-answer"]');
  await expect(bubble.locator('.is-settled').first()).toContainText('已完成的段落保持稳定');
  await page.evaluate(() => { window.__revealPrefix = document.querySelector('[data-client-id="reveal-answer"] .is-settled'); });
  const finalText = text + '，通过 **柔和渐显** 呈现，中文与 emoji 😀 都保持完整。';
  await page.evaluate((rawText) => {
    window.stateStore.dispatch({ type: 'session/update-message', index: 1, clientId: 'reveal-answer', patch: { rawText } });
    window.__socratesReactChatBridge.publish({ type: 'stream-delta', messageId: 'reveal-answer', textLength: rawText.length });
  }, finalText);
  await expect(bubble.locator('strong')).toHaveText('柔和渐显');
  const evidence = await bubble.evaluate((el) => {
    const tail = el.querySelector('.is-tail');
    const spans = [...tail.querySelectorAll('.stream-append-reveal')];
    for (const animation of tail.getAnimations({ subtree: true })) {
      animation.pause();
      animation.currentTime = 60;
    }
    return {
      prefixSame: window.__revealPrefix === el.querySelector('.is-settled'),
      prefixAnimations: el.querySelector('.is-settled').getAnimations({ subtree: true }).length,
      rootOpacity: getComputedStyle(tail).opacity,
      spans: spans.length,
      nested: tail.querySelectorAll('.stream-append-reveal .stream-append-reveal').length,
      opacities: spans.map((span) => Number(getComputedStyle(span).opacity)),
      names: spans.map((span) => getComputedStyle(span).animationName),
      filters: spans.map((span) => getComputedStyle(span).filter),
    };
  });
  expect(evidence.prefixSame).toBe(true);
  expect(evidence.prefixAnimations).toBe(0);
  expect(evidence.rootOpacity).toBe('1');
  expect(evidence.spans).toBeGreaterThan(0);
  expect(evidence.spans).toBeLessThanOrEqual(24);
  expect(evidence.nested).toBe(0);
  /* Blur filter is removed per user request: prose streams cleanly without
     an offscreen blur pass while keeping the gentle opacity reveal. */
  const revealing = evidence.names.filter((name) => name === 'stream-append-reveal').length;
  const blurred = evidence.filters.filter((filter) => filter !== 'none').length;
  expect(revealing).toBeGreaterThan(0);
  expect(blurred).toBe(0);
  expect(evidence.names.every((name, index) => name !== 'stream-append-age' || evidence.filters[index] === 'none')).toBe(true);
  expect(evidence.opacities.some((opacity) => opacity > 0.25 && opacity < 1)).toBe(true);
  await page.screenshot({ path: 'test-results/stream-reveal-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  /* The newest run is the last one in document order — the reveal splits
     the tail from the end backwards, so the first span belongs to the
     oldest run and has already aged to the opacity-only animation. */
  await expect(bubble.locator('.stream-append-reveal').last()).toHaveCSS('animation-name', 'stream-append-reveal');
  await page.screenshot({ path: 'test-results/stream-reveal-mobile.png' });
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'session/update-message', index: 1, clientId: 'reveal-answer', patch: { type: 'assistant' } });
    window.__socratesReactChatBridge.publish({ type: 'state-synced', reason: 'stream-reveal-finished' });
  });
  await expect(bubble.locator('.tool-run-prose.is-live')).toHaveCount(0);
  await expect(bubble).toContainText('中文与 emoji 😀 都保持完整');
  expect(await bubble.locator('.tool-run-prose').evaluateAll((els) => els.every((el) => el.getAnimations({ subtree: true }).length === 0))).toBe(true);
  expect(errors).toEqual([]);
});
