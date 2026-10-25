import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const nativeNodes = [
  { id: 'plan', type: 'panel', title: '本周学习计划', description: '每天前进一步，让知识慢慢积累。', state: { hours: 2 } },
  { id: 'stats', type: 'grid', parent: 'plan', columns: 2 },
  { id: 'weekly', type: 'metric', parent: 'stats', label: '每周学习时长（包含复习与练习）', value: 14, suffix: ' 小时', delta: '+2 小时' },
  { id: 'complete', type: 'metric', parent: 'stats', label: '已完成章节', value: '8 / 12' },
  { id: 'hours', type: 'slider', parent: 'plan', label: '每日学习时长', bind: 'hours', min: 1, max: 6, step: 1 },
  { id: 'progress', type: 'progress', parent: 'plan', label: '本周学习进度', value: 67, tone: 'success' },
  { id: 'tip', type: 'callout', parent: 'plan', title: '循序渐进', text: '建议：先回顾概念，再完成练习。', tone: 'info' },
];
const program = `root = Card([Title("本周学习计划", "lg"), Caption("调整每天的投入，找到适合自己的学习节奏。"), hours, result, reset])
$hours = 2
hours = Slider($hours, 1, 6, 1, "每日学习时长")
result = Title("每周学习：" + ($hours * 7) + " 小时", "xl")
reset = Button("重置计划", @Reset($hours), "outline")`;

function message(format) {
  const source = format === 'native' ? nativeNodes.map((node) => JSON.stringify(node)).join('\n') : program;
  const fence = format === 'native' ? 'socrates-ui' : 'openui';
  return { clientId: 'presentation', role: 'assistant', type: 'assistant', rawText: `这是你的学习安排。\n\n\`\`\`${fence}\n${source}\n\`\`\`` };
}

for (const format of ['native', 'openui']) {
  for (const mode of ['desktop', 'dark', 'mobile']) {
    test(`${format} presentation stays readable and retains edits across fullscreen (${mode})`, async ({ page }) => {
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (entry) => { if (entry.type() === 'error') errors.push(entry.text()); });
      const theme = mode === 'dark' ? 'dark' : 'light';
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((value) => localStorage.setItem('socrates-theme', value), theme);
      await prepareChatWorkbench(page, { lang: 'zh', messages: [message(format)], viewport: mode === 'mobile' ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop });
      expect(page.url()).toContain('http://127.0.0.1:4173');
      await expect(page).toHaveTitle(/Socrates/);
      await expect(page.locator('html')).toHaveAttribute('data-mode', theme);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      const shell = page.locator('.intui-surface-shell');
      await expect(shell).toBeVisible();
      if (format === 'native') {
        await expect(shell.getByRole('heading', { name: '本周学习计划', exact: true })).toHaveCount(1);
        await expect(shell).toHaveAccessibleName('本周学习计划');
      } else await expect(shell.locator('.intui-surface-label')).toHaveText('交互结果');
      await expect(shell).toContainText('本周学习计划');
      const slider = shell.getByRole('slider', { name: '每日学习时长' });
      await slider.focus();
      await slider.press('ArrowRight');
      await expect(slider).toHaveValue('3');
      if (format === 'openui') {
        await expect(shell).toContainText('每周学习：21 小时');
        await expect(shell.locator('.iui-card')).toHaveCSS('border-top-width', '0px');
      } else {
        await expect(slider).toHaveCSS('outline-style', 'none');
      }
      const expand = shell.locator('.intui-surface-expand');
      await expand.scrollIntoViewIfNeeded();
      const bounds = await shell.locator('.intui-surface-toolbar').evaluate((toolbar) => {
        const rect = toolbar.getBoundingClientRect();
        return [...toolbar.children].every((child) => {
          const box = child.getBoundingClientRect();
          return box.left >= rect.left && box.right <= rect.right;
        });
      });
      expect(bounds).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await page.screenshot({ path: `test-results/intui-${encodeURIComponent(format)}-${encodeURIComponent(mode)}.png` });
      await expand.click();
      await expect(shell).toHaveAttribute('data-display-mode', 'fullscreen');
      expect(await shell.evaluate((node) => node.matches(':modal'))).toBe(false);
      await expect(shell).toHaveAttribute('aria-modal', 'false');
      await expect(slider).toHaveValue('3');
      const editor = page.locator('#composerRoot .rich-composer-editor');
      await editor.fill('根据当前计划，帮我调整下一步。');
      await expect(editor).toBeFocused();
      const composerBox = await page.locator('.composer-shell').boundingBox();
      const surfaceBox = await shell.boundingBox();
      expect(surfaceBox.y + surfaceBox.height).toBeLessThanOrEqual(composerBox.y + 1);
      await page.locator('#composerToolsBtn').click();
      const tools = page.locator('#composerToolsMenu');
      await expect(tools).toBeVisible();
      const tool = tools.getByRole('button').first();
      await expect(tool).toBeVisible();
      expect(await tool.evaluate((node) => {
        const rect = node.getBoundingClientRect();
        return node.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })).toBe(true);
      await page.keyboard.press('Escape');
      await expect(tools).toBeHidden();
      await expect(shell).toHaveAttribute('data-display-mode', 'fullscreen');
      expect(await shell.evaluate((node) => getComputedStyle(node).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
      await page.screenshot({ path: `test-results/intui-${encodeURIComponent(format)}-${encodeURIComponent(mode)}-fullscreen.png` });
      await page.keyboard.press('Escape');
      await expect(shell).toHaveAttribute('data-display-mode', 'inline');
      await expect(expand).toBeFocused();
      await expect(slider).toHaveValue('3');
      expect(errors).toEqual([]);
    });
  }
}
