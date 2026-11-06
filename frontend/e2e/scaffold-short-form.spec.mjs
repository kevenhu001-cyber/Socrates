import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';

const rawText = [
  '学习卡片：',
  '<definition>瑞利判据：最小分辨角为 $\\theta=1.22\\lambda/D$。</definition>',
  '<example>当口径 $D$ 增大时，分辨角变小。</example>',
  '<theorem>增大口径可以提高角分辨能力。</theorem>',
  '<proof>固定波长时，$\\theta$ 与 $D$ 成反比。</proof>',
  '<derivation>$$\\theta=1.22\\lambda/D$$\n\n$$s=f\\theta$$</derivation>',
  '<quiz>波长 600 nm 的光通过直径 20 cm 的圆形光阑，最小分辨角是多少？</quiz>',
  '<practice>换成相同口径但焦距更长的镜头，分辨力会改变吗？为什么？</practice>',
].join('\n\n');

for (const mobile of [false, true]) {
  test(`short-form cards from history render content and accept a written answer (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await prepareChatWorkbench(page, { lang: 'zh', viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      messages: [{ clientId: 'short-cards', role: 'assistant', type: 'assistant', restoredFromHistory: true, _streamSettled: true, rawText }],
    });
    const body = page.locator('#msgList .msg.assistant .msg-body');
    await expect(body.locator('.inline-block-fallback')).toHaveCount(0);
    for (const kind of ['definition', 'example', 'theorem', 'proof', 'derivation', 'quiz', 'practice']) {
      await expect(body.locator(`.sc-host[data-scaffold="${kind}"]`)).toHaveCount(1);
    }
    await expect(body.locator('[data-part="definition-body"]')).toContainText('瑞利判据');
    await expect(body.locator('[data-part="definition-body"] .katex')).toHaveCount(1);
    await expect(body.locator('[data-part="example-problem"]')).toContainText('分辨角变小');
    const question = body.locator('.sc-host[data-scaffold="quiz"]');
    await expect(question.locator('textarea')).toBeVisible();
    await expect(question.locator('[data-letter]')).toHaveCount(0);
    await expect(question).not.toContainText('选择题');
    await expect(question.getByTestId('practice-reveal')).toHaveCount(0);
    await question.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `test-results/scaffold-short-form-${encodeURIComponent(mobile ? 'mobile' : 'desktop')}.png` });
    await page.route(/\/api\/(?:v2\/)?chat\/stream(?:\?|$)/, route => route.fulfill({ contentType: 'text/event-stream',
      body: `data: ${JSON.stringify({ choices: [{ delta: { content: '我们一起核对计算过程。' } }] })}\n\ndata: [DONE]\n\n`,
    }));
    await question.locator('textarea').fill('约为 0.75 角秒');
    await question.getByTestId('practice-submit').click();
    await expect(question.getByTestId('practice-feedback')).toHaveAttribute('data-state', 'recorded');
    await expect(page.locator('#msgList .msg.assistant').last()).toContainText('我们一起核对计算过程。');
    await expectNoGlobalError(page);
  });
}

test('plain definition content remains visible during streaming and mounts as a card when finished', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    window.__shortCardTurn = await window.addStreamingMessage({ userPrompt: 'Explain the definition.' });
    window.__shortCardTurn.append('Definition:\n<definition>Resolution depends on the aperture.');
  });
  const body = page.locator('#msgList .msg.assistant .msg-body');
  await expect(body.locator('[data-scaffold-live="definition"]')).toContainText('Resolution depends on the aperture.');
  await page.evaluate(() => { window.__shortCardTurn.append('</definition>'); window.__shortCardTurn.finish(); });
  await expect(body.locator('.sc-host[data-scaffold="definition"] [data-part="definition-body"]')).toHaveText('Resolution depends on the aperture.');
  await expect(body.locator('.inline-block-fallback')).toHaveCount(0);
  await expectNoGlobalError(page);
});
