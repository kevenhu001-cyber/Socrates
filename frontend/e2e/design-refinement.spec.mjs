import { test, expect } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const plan = [
  { id: 'plan', type: 'panel', title: '本周学习计划', description: '每天留出一点时间，让理解变成习惯。', state: { hours: 2 } },
  { id: 'hours', type: 'slider', parent: 'plan', label: '每日学习时长', bind: 'hours', min: 1, max: 6, step: 1 },
  { id: 'progress', type: 'progress', parent: 'plan', label: '本周学习进度', value: 43, displayValue: '3 / 7' },
  { id: 'tip', type: 'callout', parent: 'plan', text: '先回顾概念，再完成练习。', tone: 'neutral' },
];
const answer = [
  '## 先理解，再练习', '',
  '链式法则用来求复合函数的导数。把它想象成两层函数：先求外层，再求内层。', '',
  '例如，对于 $f(x)=(3x+1)^2$，可以看作外层函数 $g(u)=u^2$，内层函数 $u=3x+1$。根据链式法则，先对外层求导，再乘以内层的导数：', '',
  "$$f'(x)=2(3x+1)\\times 3$$", '',
  '```socrates-ui', ...plan.map((node) => JSON.stringify(node)), '```',
].join('\n');

for (const theme of ['dark', 'light']) for (const size of ['desktop', 'mobile']) {
  test(`reading hierarchy and result-card controls stay coherent: ${theme}, ${size}`, async ({ page }, info) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript((mode) => localStorage.setItem('socrates-theme', mode), theme);
    await prepareChatWorkbench(page, { lang: 'zh', viewport: WORKBENCH_VIEWPORTS[size], messages: [
      { clientId: 'design-user', role: 'user', type: 'user', rawText: '帮我理解链式法则，并安排一份学习计划。' },
      { clientId: 'design-answer', role: 'assistant', type: 'assistant', rawText: answer },
    ] });
    await expect(page).toHaveTitle(/Socrates/);
    await expect(page.locator('html')).toHaveAttribute('data-mode', theme);
    const result = page.locator('.intui-surface-shell');
    await expect(result).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const list = page.locator('#msgList');
    await list.evaluate((node) => { node.scrollTop = 0; });
    const measurements = await page.evaluate(() => {
      const sample = (selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error('Missing design sample: ' + selector);
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return { fontSize: style.fontSize, weight: style.fontWeight, line: style.lineHeight,
          background: style.backgroundColor, border: style.borderColor, radius: style.borderRadius,
          x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      /* The surface toolbar deliberately paints no background of its own —
         it must not put a second frame on top of the result card. What it
         shows is whatever the card underneath paints, so the coherence
         check has to resolve the painted surface, not the declared one. */
      const paintedBackground = (element) => {
        for (let node = element; node; node = node.parentElement) {
          const value = getComputedStyle(node).backgroundColor;
          const alpha = value.startsWith('rgba') ? Number(value.split(',')[3]) : 1;
          if (value !== 'transparent' && alpha > 0) return value;
        }
        return 'rgba(0, 0, 0, 0)';
      };
      const toolbar = document.querySelector('.intui-surface-toolbar');
      return { prose: sample('.tool-run-prose p'), heading: sample('.tool-run-prose h2'),
        card: sample('.intui-surface-shell'), toolbar: sample('.intui-surface-toolbar'),
        toolbarPainted: paintedBackground(toolbar),
        cardTitle: sample('.intui-panel-title'), composer: sample('#appShell .composer-shell'),
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    console.log('DESIGN_METRICS ' + JSON.stringify({ theme, size, ...measurements }));
    await info.attach('design-metrics', { contentType: 'application/json', body: JSON.stringify(measurements, null, 2) });
    expect(measurements.overflow).toBeLessThanOrEqual(1);
    if (!process.env.DESIGN_BASELINE) {
      expect(Number(measurements.prose.weight)).toBe(400);
      expect(parseFloat(measurements.heading.fontSize)).toBeGreaterThan(parseFloat(measurements.prose.fontSize));
      expect(measurements.toolbarPainted).toBe(measurements.card.background);
    }
    await page.screenshot({ path: `test-results/design-${encodeURIComponent(theme)}-${encodeURIComponent(size)}-${encodeURIComponent(process.env.DESIGN_BASELINE ? 'before' : 'after')}.png` });
    const slider = result.getByRole('slider', { name: '每日学习时长' });
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('3');
    const expand = result.locator('.intui-surface-expand');
    await expand.click();
    await expect(result).toHaveAttribute('data-display-mode', 'fullscreen');
    await expect(slider).toHaveValue('3');
    await page.keyboard.press('Escape');
    await expect(result).toHaveAttribute('data-display-mode', 'inline');
    await expect(slider).toHaveValue('3');
    expect(errors).toEqual([]);
  });
}
