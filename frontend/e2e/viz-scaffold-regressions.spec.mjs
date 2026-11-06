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

test('a chart written as an openui fence has no frame and no header band in dark mode', async ({ page }) => {
  await open(page, [msg('bar', '图：\n\n' + BAR)], { colorScheme: 'dark' });
  const card = row(page, 'bar').locator('.visualization-card').first();
  await expect(card).toBeVisible();
  const frame = await card.evaluate((element) => {
    const header = element.querySelector('.visualization-header');
    const style = getComputedStyle(element);
    const headerStyle = getComputedStyle(header);
    return {
      border: style.borderTopWidth,
      background: style.backgroundColor,
      headerBackground: headerStyle.backgroundColor,
      headerDivider: headerStyle.borderBottomWidth,
    };
  });
  expect(frame).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)', headerBackground: 'rgba(0, 0, 0, 0)', headerDivider: '0px' });
});

test('a wrong quiz answer shows the answer key with typeset math', async ({ page }) => {
  const text = '<quiz><q>$f(z)=\\dfrac{1}{z^2}$ 在 $z=0$ 的留数是？</q><o letter="A">$0$</o><o letter="B">$1$</o><correct>A</correct></quiz>';
  await open(page, [msg('quiz', text)]);
  const quiz = row(page, 'quiz').locator('.sc-host[data-scaffold="quiz"]');
  await quiz.locator('[data-letter="B"]').click();
  await quiz.getByTestId('quiz-submit').click();
  const explanation = quiz.getByTestId('quiz-explanation');
  await expect(explanation).toBeVisible();
  await expect(explanation.locator('.katex')).toHaveCount(1);
  await expect(explanation).not.toContainText('$');
});

test('derivation steps written as bare LaTeX are typeset', async ({ page }) => {
  const text = '<derivation><title>一阶极点的留数</title><body>\n\\operatorname{Res}(f,z_0) = \\lim_{z\\to z_0}(z-z_0)f(z)\n= \\lim_{z\\to 0} z\\cdot\\frac{e^z}{z}\n= 1\n</body></derivation>';
  await open(page, [msg('der', text)]);
  const card = row(page, 'der').locator('.sc-host[data-scaffold="derivation"]');
  await expect(card).toHaveCount(1);
  await expect(card.locator('.katex').first()).toBeVisible();
  const raw = await card.evaluate((element) => {
    const clone = element.cloneNode(true);
    clone.querySelectorAll('.katex').forEach((node) => node.remove());
    return /\\(?:lim|frac|operatorname)/.test(clone.textContent || '');
  });
  expect(raw).toBe(false);
});

test('on a phone process, timeline and number line labels keep a readable size', async ({ page }) => {
  const templates = [
    ['process', '解题步骤', { items: [{ label: '找奇点' }, { label: '判类型' }, { label: '算留数' }, { label: '求和' }] }],
    ['timeline', '复分析发展', { items: [{ label: '柯西', value: '1825' }, { label: '黎曼', value: '1851' }, { label: '魏尔斯特拉斯', value: '1870' }] }],
    ['number_line', '数轴', { items: [{ label: '-2', value: -2 }, { label: '0', value: 0 }, { label: '3', value: 3 }] }],
  ];
  await open(page, templates.map(([template, title, payload]) => msg('viz-' + template, title + '：\n\n' + openui(viz(template, title, payload)))), { viewport: { width: 390, height: 844 } });
  for (const [template] of templates) {
    const stage = row(page, 'viz-' + template).locator('.visualization-stage').first();
    await stage.scrollIntoViewIfNeeded();
    await expect(stage.locator('svg text').first()).toBeVisible();
    const sizes = await stage.evaluate((element) => {
      const svg = element.querySelector('svg');
      const scale = svg.getBoundingClientRect().width / svg.viewBox.baseVal.width;
      const label = svg.querySelector('.visualization-node text');
      return { scale, fontPx: parseFloat(getComputedStyle(label).fontSize) * scale, overflow: svg.getBoundingClientRect().right - element.getBoundingClientRect().right };
    });
    expect(sizes.fontPx, template).toBeGreaterThanOrEqual(10);
    expect(sizes.overflow, template).toBeLessThanOrEqual(1);
  }
});
