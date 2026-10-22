import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';
import { WORKING_TOOLS_SOURCE } from './_intelligent-tools.mjs';

for (const mode of ['light', 'dark', 'mobile']) {
  test(`generated tools connect inputs, lists, filters, charts and submitted forms (${mode})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const theme = mode === 'dark' ? 'dark' : 'light';
    await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
    await prepareChatWorkbench(page, { lang: 'zh', viewport: mode === 'mobile' ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop,
      messages: [{ clientId: 'working-tools', role: 'assistant', type: 'assistant', rawText: '这是你的学习工作台。\n\n```openui\n' + WORKING_TOOLS_SOURCE + '\n```', html: '<p>这是你的学习工作台。</p>' }],
    });
    await expect(page).toHaveTitle(/Socrates/i);
    const ui = page.locator('.intui-openui');
    await expect(ui.getByText('每周总计 100 分钟', { exact: true })).toBeVisible();
    await expect(ui.locator('p[role="status"]')).toHaveCount(0);
    await page.evaluate(() => {
      window.__toolRequests = [];
      document.addEventListener('tool-retry', (event) => window.__toolRequests.push(event.detail));
    });
    await ui.getByRole('textbox', { name: '每天练习（分钟）', exact: true }).fill('30');
    await expect(ui.getByText('每周总计 150 分钟', { exact: true })).toBeVisible();
    const slider = ui.getByRole('slider', { name: '每周练习天数' });
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(ui.getByText('每周总计 180 分钟', { exact: true })).toBeVisible();
    const stage = ui.locator('.visualization-stage');
    await expect.poll(() => stage.evaluate((el) => window.echarts?.getInstanceByDom(el)?.getOption().series[0].data[0])).toBe(180);
    await expect.poll(() => stage.evaluate((el) => window.echarts.getInstanceByDom(el).getZr().animation.isFinished())).toBe(true);
    await page.locator('#msgList').evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/intelligent-tools-plan-${encodeURIComponent(mode)}.png`, fullPage: true });
    await ui.getByRole('radio', { name: '任务清单', exact: true }).click();
    await ui.getByRole('textbox', { name: '新任务', exact: true }).fill('学习几何');
    await ui.getByRole('button', { name: '添加任务', exact: true }).click();
    await expect(ui.getByText('任务数：2', { exact: true })).toBeVisible();
    await expect(ui.getByText('复习函数 · 学习几何', { exact: true })).toBeVisible();
    await expect(ui.getByRole('textbox', { name: '新任务', exact: true })).toHaveValue('');
    await expect(ui.getByRole('button', { name: '添加任务', exact: true })).toBeDisabled();
    await expect(ui.locator('table')).toContainText('函数与图像');
    await ui.getByRole('combobox', { name: '资料状态', exact: true }).selectOption('done');
    await expect(ui.locator('table')).toContainText('概率基础');
    await expect(ui.locator('table')).not.toContainText('函数与图像');
    await page.locator('#msgList').evaluate((el) => { el.scrollTop = 0; });
    await page.screenshot({ path: `test-results/intelligent-tools-tasks-${encodeURIComponent(mode)}.png`, fullPage: true });
    await ui.getByRole('button', { name: '清空任务', exact: true }).click();
    await expect(ui.getByText('任务数：0', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.__toolRequests)).toEqual([]);
    await ui.getByRole('radio', { name: '练习计划', exact: true }).click();
    await expect(ui.getByText('每周总计 180 分钟', { exact: true })).toBeVisible();
    await ui.getByRole('radio', { name: '向导师提问', exact: true }).click();
    await ui.getByRole('textbox', { name: '学科', exact: true }).fill('物理');
    await ui.getByRole('textbox', { name: '你的问题', exact: true }).fill('如何理解动量守恒？');
    await page.locator('#msgList').evaluate((el) => { el.scrollTop = 0; });
    const primaryColors = await ui.getByRole('button', { name: '提交给导师', exact: true }).evaluate((button) => ({ button: getComputedStyle(button).backgroundColor, input: getComputedStyle(button.closest('.intui-openui').querySelector('input')).backgroundColor }));
    expect(primaryColors.button).not.toBe(primaryColors.input);
    await page.screenshot({ path: `test-results/intelligent-tools-form-${encodeURIComponent(mode)}.png`, fullPage: true });
    await ui.getByRole('button', { name: '提交给导师', exact: true }).click();
    await expect.poll(() => page.evaluate(() => window.__toolRequests.length)).toBe(1);
    const prompt = await page.evaluate(() => window.__toolRequests[0].prompt);
    expect(prompt).toContain('物理');
    expect(prompt).toContain('如何理解动量守恒？');
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expect(ui.locator('p[role="status"]')).toHaveCount(0);
  });
}

test('the intelligent UI tool call renders an OpenUI program with a native visual', async ({ page }) => {
  const program = 'root = Col([Slider($n, 1, 8, 1, "Amount"), Text("Amount: " + $n), Visualization("bar", "Linked", {categories:["A"],series:[{name:"Amount",data:[$n]}]}, "Linked chart")])\n$n = 2';
  await prepareChatWorkbench(page, { messages: [{
    clientId: 'tool-openui', role: 'assistant', rawText: 'Here is the tool.', type: null,
    toolCalls: [{ id: 'ui', name: 'render_intelligent_ui', status: 'completed', textOffset: 0, output: '', input: {
      version: 1, nodes: [{ id: 'openui', type: 'openui', source: program }],
    } }],
  }] });
  const ui = page.locator('.intui-openui');
  await expect(ui.getByText('Amount: 2', { exact: true })).toBeVisible();
  const stage = ui.locator('.visualization-stage');
  await expect(stage).toBeVisible();
  await expect.poll(() => stage.evaluate((el) => window.echarts?.getInstanceByDom(el)?.getOption().series[0].data[0])).toBe(2);
});

test('invalid local results surface a repair action with current input state', async ({ page }) => {
  const source = 'root = Col([Input($amount,"Amount","number"),Input($divisor,"Divisor","number"),Button("Compute",@Set($result,$amount / $divisor)),Text("Result: " + $result)])\n$amount = 5\n$divisor = 1\n$result = 0';
  await prepareChatWorkbench(page, { messages: [{ clientId: 'bad-result', role: 'assistant', type: 'assistant', rawText: '```openui\n' + source + '\n```', html: '' }] });
  const ui = page.locator('.intui-openui');
  await ui.getByRole('textbox', { name: 'Amount', exact: true }).fill('7');
  await ui.getByRole('textbox', { name: 'Divisor', exact: true }).fill('0');
  await ui.getByRole('button', { name: 'Compute', exact: true }).click();
  await expect(ui.locator('p[role="status"]')).toBeVisible();
  await expect(ui.getByText('Result: 0', { exact: true })).not.toBeVisible();
  await ui.getByRole('textbox', { name: 'Divisor', exact: true }).fill('2');
  await ui.getByRole('button', { name: 'Compute', exact: true }).click();
  await expect(ui.getByText('Result: 3.5', { exact: true })).toBeVisible();
  await expect(ui.locator('p[role="status"]')).toHaveCount(0);
  await ui.getByRole('textbox', { name: 'Divisor', exact: true }).fill('0');
  await expect(ui.locator('p[role="status"]')).toBeVisible();
  await page.evaluate(() => {
    window.__diagnostics = [];
    document.addEventListener('tool-retry', (event) => window.__diagnostics.push(event.detail));
  });
  await ui.getByRole('button', { name: 'Fix with AI', exact: true }).click();
  const prompt = await page.evaluate(() => window.__diagnostics[0].prompt);
  expect(prompt).toContain('zero');
  expect(prompt).toContain('Current local state');
  expect(prompt).toContain('7');
});
