import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
  test(`Chinese prose and system hints use full-width punctuation, width ${viewport.width}`, async ({ page }) => {
    await prepareChatWorkbench(page, { viewport, lang: 'zh' });
    expect(page.viewportSize()).toEqual(viewport);
    await expect(page).toHaveURL(/127\.0\.0\.1:4173/);
    await expect(page).toHaveTitle(/Socrates/i);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await page.evaluate(() => window.__socratesLegacy.profile.setLang('zh'));
    const input = page.locator('#composerInputWrap .tiptap');
    await expect(input).toHaveAttribute('aria-label', '有问题，随便问');
    await expect.poll(() => page.evaluate(() => window.t('chat.placeholder'))).toBe('输入你的想法……');
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /ReferenceError|TypeError|SyntaxError/.test(message.text())) errors.push(message.text());
    });
    await page.evaluate(() => {
      const original = window.fetch.bind(window);
      window.fetch = (input, init) => {
        const url = typeof input === 'string' ? input : input.url;
        if (!/\/api\/(?:v2\/)?chat\/stream/.test(url)) return original(input, init);
        const encoder = new TextEncoder();
        let timer;
        const body = new ReadableStream({
          start(controller) {
            const deltas = ['他说: "**你好', '**,世界!" (再试一次); 下一步?\n\n',
              '点击[文档](https://example.test/中文?q=1,2), 然后运行 `print("你好,世界.")`.\n\n',
              '```json\n{"提示":"你好,世界.","值":1.5}\n```\n\n', '数学: $f(x)=1.5$。\n\n',
              '```socrates-ui\n' + [
                { id: 'chinese-panel', type: 'panel', title: 'AI卡片: "说明"', description: '这是说明(可选).' },
                { id: 'chinese-ui-text', parent: 'chinese-panel', type: 'text', text: '你好,世界!' },
              ].map((node) => JSON.stringify(node)).join('\n') + '\n```'];
            let index = 0;
            const push = () => {
              if (index === deltas.length) { window.__chineseArrived = true; return; }
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: deltas[index++] } }] })}\n\n`));
              timer = setTimeout(push, 80);
            };
            window.__finishChinese = () => { controller.enqueue(encoder.encode('data: [DONE]\n\n')); controller.close(); };
            timer = setTimeout(push, 20);
          },
          cancel() { clearTimeout(timer); },
        });
        return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
      };
      window.__chineseTurn = window.askChatTurn('演示中文排版');
    });
    const answer = page.locator('#msgList .msg.assistant').last();
    await expect.poll(() => page.evaluate(() => window.__chineseArrived)).toBe(true);
    await expect(answer).toContainText('他说： “你好，世界！” （再试一次）； 下一步？');
    await expect(answer.locator('a', { hasText: '文档' })).toHaveAttribute('href', 'https://example.test/%E4%B8%AD%E6%96%87?q=1,2');
    await expect(answer.locator('code').filter({ hasText: 'print' })).toHaveText('print("你好,世界.")');
    await expect(answer.locator('pre code')).toContainText('{"提示":"你好,世界.","值":1.5}');
    await page.evaluate(async () => { window.__finishChinese(); await window.__chineseTurn; });
    await expect(answer).toContainText('他说： “你好，世界！” （再试一次）； 下一步？');
    await expect(answer.locator('pre code')).toContainText('{"提示":"你好,世界.","值":1.5}');
    await expect(page.locator('.intui-panel-title')).toHaveText('AI卡片： “说明”');
    await expect(page.locator('.intui-panel-description')).toHaveText('这是说明（可选）。');
    await expect(page.locator('.intui-text')).toHaveText('你好，世界！');
    await page.evaluate(() => window.showToast('已保存: "中文提示",请继续.', { duration: 10_000 }));
    await expect(page.locator('.msg-toast')).toHaveText('已保存： “中文提示”，请继续。');
    await page.evaluate(() => { window.__chineseConfirm = window.__socratesLegacy.confirm.showConfirm('系统提示: "确认"', '是否继续(本次操作)?'); });
    await expect(page.locator('#confirmTitle')).toHaveText('系统提示： “确认”');
    await expect(page.locator('#confirmMsg')).toHaveText('是否继续（本次操作）？');
    await page.locator('#confirmCancelBtn').click();
    await expect(page.locator('#confirmDialog')).toBeHidden();
    expect(errors).toEqual([]);
    if (viewport.width === 1440) await page.screenshot({ path: 'test-results/chinese-typography-desktop.png' });
    else await page.screenshot({ path: 'test-results/chinese-typography-mobile.png' });
  });
}
