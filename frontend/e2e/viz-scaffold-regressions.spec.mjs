import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

/* Regressions from the visualization and scaffold audit (viz-2): each test
   pins one rendered behaviour on the built app. */

const msg = (clientId, rawText) => ({ clientId, role: 'assistant', type: 'assistant', _streamSettled: true, rawText, html: '' });
const row = (page, clientId) => page.locator(`[data-client-id="${clientId}"]`).first();

const viz = (template, title, payload) => `Visualization(${JSON.stringify(template)}, ${JSON.stringify(title)}, ${JSON.stringify(payload)}, "summary ${template}")`;
const openui = (value) => '```openui\nroot = Col([v0])\nv0 = ' + value + '\n```';
const BAR = openui(viz('bar', '三个班级的期中平均分', { categories: ['一班', '二班', '三班'], series: [{ name: '平均分', data: [82, 76, 88] }] }));

async function open(page, messages, { viewport, colorScheme = 'light' } = {}) {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
  await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), colorScheme);
  await prepareChatWorkbench(page, { messages, viewport, lang: 'zh', allowGlobalErrors: true });
}

test('one turn mounts one quiz and one practice even when they sit in different blocks', async ({ page }) => {
  const text = [
    '同一轮里两道测验：',
    '<quiz><q>第一题：$1+1=$？</q><o letter="A">2</o><o letter="B">3</o><correct>A</correct></quiz>',
    '<quiz><q>第二题：$2\\times 3=$？</q><o letter="A">5</o><o letter="B">6</o><correct>B</correct></quiz>',
    '<practice correct="4"><problem>第一道练习：$2+2=$？</problem></practice>',
    '<practice correct="9"><problem>第二道练习：$3^2=$？</problem></practice>',
  ].join('\n\n');
  await open(page, [msg('dup', text)]);
  const body = row(page, 'dup');
  await expect(body.locator('.sc-host[data-scaffold="quiz"]')).toHaveCount(1);
  await expect(body.locator('.sc-host[data-scaffold="practice"]')).toHaveCount(1);
  await expect(body.locator('.sc-host[data-scaffold="quiz"]')).toContainText('第一题');
  /* The second quiz reads as prose and keeps its options. */
  const prose = body.locator('.tool-run-prose').filter({ hasText: '第二题' });
  await expect(prose).toHaveCount(1);
  await expect(prose.locator('li')).toHaveCount(2);
  await expect(prose).toContainText('B. 6');
  await expect(body.locator('.tool-run-prose').filter({ hasText: '第二道练习' })).toHaveCount(1);
});

test('a code fence closed on the same line as </problem> still mounts the card', async ({ page }) => {
  const text = '<practice correct="6"><problem>下面的 Python 输出什么？\n\n```python\nprint(sum(range(4)))\n```</problem><hint>range(4) 是 0 到 3。</hint></practice>\n\n结尾。';
  await open(page, [msg('glued', text)]);
  const card = row(page, 'glued').locator('.sc-host[data-scaffold="practice"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('pre code')).toContainText('print(sum(range(4)))');
  await expect(row(page, 'glued')).not.toContainText('</problem>');
});

test('on a phone the chart title keeps its line and the actions wrap under it', async ({ page }) => {
  await open(page, [msg('bar', '图：\n\n' + BAR)], { viewport: { width: 390, height: 844 } });
  const card = row(page, 'bar').locator('.visualization-card').first();
  await expect(card).toBeVisible();
  const geometry = await card.evaluate((element) => {
    const title = element.querySelector('.visualization-header h3').getBoundingClientRect();
    const actions = element.querySelector('.visualization-actions').getBoundingClientRect();
    return { titleWidth: title.width, titleHeight: title.height, actionsTop: actions.top, titleBottom: title.bottom };
  });
  expect(geometry.titleWidth).toBeGreaterThan(150);
  expect(geometry.titleHeight).toBeLessThan(40);
  expect(geometry.actionsTop).toBeGreaterThanOrEqual(geometry.titleBottom - 1);
});
