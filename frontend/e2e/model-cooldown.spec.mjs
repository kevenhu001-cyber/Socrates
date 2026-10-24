import { test, expect } from '@playwright/test';
import { prepareChatWorkbench, namedFrame, completeFrame } from './_chat-workbench.mjs';

test('busy model shows a localized cooldown, restores input and never auto-replays the turn', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => { await window.setLang('zh'); });
  let requests = 0;
  await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, async (route) => {
    requests++;
    await route.fulfill({ status: 200, contentType: 'text/event-stream', body:
      namedFrame('error', { status: 429, upstreamStatus: 429, code: 'LLM_UPSTREAM_ERROR', retryable: false,
        retryAfterMs: 30_001, message: 'Upstream busy' }) + completeFrame(),
    });
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const input = page.locator('#composerInputWrap .tiptap');
  await input.fill('请解释一下这个问题');
  await page.locator('#composerPrimaryBtn').click();
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('模型繁忙，约 31 秒后可重试，也可以切换模型。');
  await expect(page.locator('#composerPrimaryBtn')).not.toHaveAttribute('data-stop', '1');
  await input.fill('下一条问题仍可输入');
  await expect(input).toHaveText('下一条问题仍可输入');
  // The previous automatic replay happened after five seconds.
  await page.waitForTimeout(5200);
  expect(requests).toBe(1);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'test-results/model-cooldown.png' });
});
