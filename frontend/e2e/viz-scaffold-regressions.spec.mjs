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

test('on a phone the chart title stays readable and the plot fits below it', async ({ page }) => {
  await open(page, [msg('bar', '图：\n\n' + BAR)], { viewport: { width: 390, height: 844 } });
  const card = row(page, 'bar').locator('.visualization-card').first();
  await expect(card).toBeVisible();
  await expect(card.locator('.visualization-header h3')).toHaveText('三个班级的期中平均分');
  const geometry = await card.evaluate((element) => {
    const title = element.querySelector('.visualization-header h3').getBoundingClientRect();
    const stage = element.querySelector('.visualization-stage').getBoundingClientRect();
    return { titleWidth: title.width, titleHeight: title.height, plotBelow: stage.top >= title.bottom - 1,
      fits: element.getBoundingClientRect().right <= innerWidth + 1 };
  });
  expect(geometry.titleWidth).toBeGreaterThan(150);
  expect(geometry.titleHeight).toBeLessThan(40);
  expect(geometry.plotBelow).toBe(true);
  expect(geometry.fits).toBe(true);
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
  await expect(card.locator('[data-viz-action]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/inline-visualization-dark.png' });
  expect(frame).toEqual({ border: '0px', background: 'rgba(0, 0, 0, 0)', headerBackground: 'rgba(0, 0, 0, 0)', headerDivider: '0px' });
});

test('a wrong quiz answer shows the answer key with typeset math', async ({ page }) => {
  const text = '<quiz><q>$f(z)=\\dfrac{1}{z^2}$ 在 $z=0$ 的留数是？</q><o letter="A">$0$</o><o letter="B">$1$</o><correct>A</correct></quiz>';
  await open(page, [msg('quiz', text)]);
  const quiz = row(page, 'quiz').locator('.sc-host[data-scaffold="quiz"]');
  await quiz.locator('[data-letter="B"]').click();
  await quiz.getByTestId('quiz-submit').click();
  const explanation = quiz.getByTestId('quiz-option-explanation-B');
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


test('OpenUI headings, definitions, flashcards and tables typeset explicit dollars', async ({ page }) => {
  const source = '```openui\nroot = Col([Title("$hello$"), Text("定义：$ 123 $"), Flashcard("$USD$", "$x+1$"), Table([{key:"v",label:"$x$"}],[{v:"$y$"}])])\n```';
  await open(page, [msg('math-fields', source)]);
  const body = row(page, 'math-fields');
  await expect(body.locator('.katex')).toHaveCount(5);
  await body.locator('.iui-flashcard').click();
  await expect(body.locator('.iui-flashcard .katex')).toHaveCount(1);
  await page.screenshot({ path: 'test-results/inline-math-fields.png' });
});


test('streamed cards mount before finish and keep their nodes; no disclaimer footer trails the transcript',async({page})=>{
 await open(page,[]);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await page.evaluate(async()=>{
  window.__scaffoldCtl=await window.addStreamingMessage({userPrompt:'测试实时卡片'});
  window.__scaffoldCtl.append('已经输出的正文。\n\n<quiz><q>第一题');
 });
 const preview=page.locator('.sc-live').first();
 await expect(preview).toBeVisible();
 const skeleton=preview.locator('.sc-live-pill,.sc-live-skeleton').first();
 await expect(skeleton).toBeVisible();
 expect(await skeleton.evaluate(el=>getComputedStyle(el).animationName)).toBe('ui-shimmer-sweep');
 await page.screenshot({path:'test-results/scaffold-stream-shimmer.png'});
 await page.evaluate(()=>window.__scaffoldCtl.append('：1+1？</q><o letter="A">2</o><o letter="B">3</o><correct>A</correct></quiz>'));
 const card=page.locator('.sc-host[data-scaffold="quiz"]');
 await expect(card).toContainText('第一题');
 await page.evaluate(()=>{window.__mountedQuiz=document.querySelector('.sc-host[data-scaffold="quiz"]');});
 await page.evaluate(()=>window.__scaffoldCtl.append('\n\n继续输出的正文。'));
 await expect(page.locator('#msgList')).toContainText('继续输出的正文');
 await page.evaluate(()=>window.__scaffoldCtl.finish());
 await expect.poll(()=>page.evaluate(()=>window.__mountedQuiz===document.querySelector('.sc-host[data-scaffold="quiz"]'))).toBe(true);
 /* The transcript carries no "Socrates can make mistakes" footer line. */
 await expect(page.locator('#msgList #chatDisclaimer')).toHaveCount(0);
 await expect(page.locator('#msgList')).not.toContainText('也可能');
});


test('the first native UI block does not remount the prose already on screen',async({page})=>{
 await open(page,[]);
 await page.evaluate(async()=>{
  window.__nativeCtl=await window.addStreamingMessage({userPrompt:'组件与正文同步输出'});
  window.__nativeCtl.append('已经完成的第一段。\n\n正在继续的第二段。');
 });
 await expect(page.locator('.tool-run-prose').first()).toContainText('已经完成的第一段');
 await page.evaluate(()=>{window.__firstProse=document.querySelector('.tool-run-prose p');});
 await page.evaluate(()=>window.__nativeCtl.append('\n\n```socrates-ui\n{"id":"result","type":"metric","label":"结果","value":42}\n```'));
 await expect(page.locator('.intui-metric')).toContainText('42');
 expect(await page.evaluate(()=>window.__firstProse===document.querySelector('.tool-run-prose p'))).toBe(true);
 await page.evaluate(()=>window.__nativeCtl.finish());
 expect(await page.evaluate(()=>window.__firstProse===document.querySelector('.tool-run-prose p'))).toBe(true);
});
