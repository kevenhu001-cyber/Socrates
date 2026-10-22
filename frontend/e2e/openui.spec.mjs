import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const PROGRAM = `root = Col([Card([Title("Study planner", "lg"), Caption("Adjust your daily practice and see the weekly total."), hours, result, reset]), chart, flash, form])
$hours = 2
hours = Slider($hours, 1, 8, 1, "Hours per day")
result = Title("Weekly hours: " + ($hours * 7), "2xl")
reset = Button("Reset hours", @Reset($hours), "outline")
chart = Chart("bar", [{day:"Mon",hours:2},{day:"Tue",hours:3},{day:"Wed",hours:4}], "day", ["hours"])
flash = Flashcard("What is active recall?", "Retrieving an answer from memory.", "Study card")
$subject = "Geometry"
form = Form([Input($subject, "Subject"), Button("Make a plan", @ToAssistant("Create a study plan"))])`;

function message(source, id = 'openui-history') {
  return { clientId: id, role: 'assistant', type: 'assistant', rawText: `Here is your interactive planner.\n\n\`\`\`openui\n${source}\n\`\`\`\nContinue with the practice.`, html: '<p>Here is your interactive planner.</p>' };
}

for (const mode of ['light', 'dark', 'mobile']) {
  test(`OpenUI history renders working controls, charts and flashcards (${mode})`, async ({ page }) => {
    const theme = mode === 'dark' ? 'dark' : 'light';
    await page.emulateMedia({ colorScheme: theme });
    await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
    await prepareChatWorkbench(page, { messages: [message(PROGRAM)], viewport: mode === 'mobile' ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop });
    await expect(page.locator('html')).toHaveAttribute('data-mode', theme);
    const ui = page.locator('.intui-openui');
    await expect(ui).toBeVisible();
    await expect(ui.getByRole('heading', { name: 'Weekly hours: 14' })).toBeVisible();
    const slider = ui.getByRole('slider', { name: 'Hours per day' });
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(ui.getByRole('heading', { name: 'Weekly hours: 21' })).toBeVisible();
    await ui.getByRole('button', { name: 'Reset hours' }).click();
    await expect(ui.getByRole('heading', { name: 'Weekly hours: 14' })).toBeVisible();
    await expect(ui.getByRole('img', { name: 'bar chart of hours by day' })).toBeVisible();
    await ui.getByRole('button', { name: 'Study card' }).click();
    await expect(ui).toContainText('Retrieving an answer from memory.');
    await expect(page.locator('#msgList')).toContainText('Continue with the practice.');
    await expect(ui.locator('p[role="status"]')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/openui-${encodeURIComponent(mode)}.png`, fullPage: true });
    await page.evaluate(() => {
      window.__openuiRequests = [];
      document.addEventListener('tool-retry', (event) => window.__openuiRequests.push(event.detail));
    });
    await ui.getByRole('textbox', { name: 'Subject' }).fill('Algebra');
    await ui.getByRole('button', { name: 'Make a plan' }).click();
    await expect.poll(() => page.evaluate(() => window.__openuiRequests.length)).toBe(1);
    const request = await page.evaluate(() => window.__openuiRequests[0].prompt);
    expect(request).toContain('Create a study plan');
    expect(request).toContain('Algebra');
  });
}

test('OpenUI streams incrementally and preserves local state through the final fence', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    window.__openuiTurn = await window.addStreamingMessage({ userPrompt: 'Build an interactive study planner.' });
    window.__openuiTurn.append('Your planner:\n\n```openui\nroot = Col([hours, result, note])\n$hours = 2\nhours = Slider($hours, 1, 8, 1, "Hours per day")\nresult = Text("Weekly hours: " + ($hours * 7))\n');
  });
  const ui = page.locator('.intui-openui');
  await expect(ui).toContainText('Weekly hours: 14');
  const slider = ui.getByRole('slider', { name: 'Hours per day' });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(ui).toContainText('Weekly hours: 21');
  await page.evaluate(() => {
    window.__openuiTurn.append('note = Caption("A little practice every day.")\n```\nThe planner is ready.');
    window.__openuiTurn.finish();
  });
  await expect(ui).toHaveAttribute('data-openui-streaming', 'false');
  await expect(ui).toContainText('A little practice every day.');
  await expect(ui).toContainText('Weekly hours: 21');
  await expect(page.locator('#msgList .msg.assistant').last()).toContainText('The planner is ready.');
});

test('the native UI tool renders OpenUI, applies source patches and restores from persisted tool arguments', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async (program) => {
    const ctl = await window.addStreamingMessage({ userPrompt: 'Build my planner.' });
    window.__nativeOpenUi = ctl;
    let seq = 0;
    window.__nativeUiEvent = (payload) => ctl.recordTurnEvent({ version: 1, turnId: 'openui-native', seq: ++seq, at: Date.now(), ...payload });
    const node = { id: 'planner', type: 'openui', source: program };
    window.__nativeUiEvent({ type: 'ui.begin', surfaceId: 'openui-tool', toolCallId: 'openui-tool', textOffset: 0 });
    window.__nativeUiEvent({ type: 'ui.commit', surfaceId: 'openui-tool', nodes: [node] });
    ctl.recordToolUse({ id: 'openui-tool', name: 'render_intelligent_ui', input: { version: 1, nodes: [node] } });
    ctl.recordToolResult({ id: 'openui-tool', name: 'render_intelligent_ui', ok: true, status: 'completed', output: 'Rendered 1 UI nodes' });
    ctl.append('Your planner is ready.');
  }, PROGRAM);
  const ui = page.locator('.intui-openui');
  await expect(ui).toContainText('Weekly hours: 14');
  await ui.getByRole('slider', { name: 'Hours per day' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(ui).toContainText('Weekly hours: 21');
  await page.evaluate((source) => {
    window.__nativeUiEvent({ type: 'ui.edit', surfaceId: 'openui-tool', baseRevision: 0, operations: [{ op: 'patch', nodeId: 'planner', props: { source: source.replace('Study planner', 'Updated planner') } }] });
    window.__nativeOpenUi.finish();
  }, PROGRAM);
  await expect(ui).toContainText('Updated planner');
  await expect(ui).toContainText('Weekly hours: 21');
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify(window.stateStore.read('messages'))));
  await prepareChatWorkbench(page, { messages: saved });
  await expect(page.locator('.intui-openui')).toContainText('Weekly hours: 14');
  await expect(page.locator('.tool-inline-attachments[data-tool-anchor="openui-tool"] .intui-openui')).toHaveCount(1);
});

test('unsafe media, unknown components and malformed programs stay isolated from prose', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [
    message('root = Col([Text("Safe text"), Image("javascript:alert(1)", "Unsafe image"), Link("Unsafe link", "javascript:alert(1)"), HtmlView("<script>bad()</script>")])'),
    message('this is not a program', 'invalid-openui'),
  ] });
  await expect(page.locator('.intui-openui')).toHaveCount(2);
  await expect(page.locator('.intui-openui').last().locator('p[role="status"]')).toContainText('could not be displayed');
  await expect(page.locator('.intui-openui').first()).toContainText('Safe text');
  await expect(page.locator('.intui-openui img')).toHaveCount(0);
  await expect(page.locator('.intui-openui a')).toHaveCount(0);
  await expect(page.locator('.intui-openui iframe')).toHaveCount(0);
  await expect(page.locator('#msgList')).toContainText('Continue with the practice.');
});


test('the production bundle keeps OpenUI and its library out of the eager graph', () => {
  const report = JSON.parse(readFileSync(new URL('../dist/.vite/entry-graph.json', import.meta.url), 'utf8'));
  const eager = new Set(report.chunks.filter((chunk) => chunk.eager).map((chunk) => chunk.file));
  const modules = report.modules.filter((module) => module.id.includes('@openuidev/') || module.id.includes('/openui/'));
  expect(modules.length).toBeGreaterThan(10);
  for (const module of modules) expect(eager.has(module.chunk), module.id).toBe(false);
});

for (const viewport of ['desktop', 'mobile']) {
  test(`calculator performs local arithmetic without sending chat (${viewport})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepareChatWorkbench(page, { messages: [message('root = Col([Calculator("计算器")])')], viewport: WORKBENCH_VIEWPORTS[viewport] });
    await expect(page).toHaveTitle(/Socrates/i);
    const calculator = page.getByRole('group', { name: '计算器', exact: true });
    await expect(calculator).toBeVisible();
    await page.evaluate(() => {
      window.__localUiRequests = [];
      document.addEventListener('tool-retry', (event) => window.__localUiRequests.push(event.detail));
    });
    for (const [keys, result] of [
      [['2', '+', '3', '='], '5'], [['9', '−', '4', '='], '5'],
      [['6', '×', '7', '='], '42'], [['8', '÷', '2', '='], '4'],
      [['0', '.', '1', '+', '0', '.', '2', '='], '0.3'],
      [['8', '÷', '0', '='], 'Error'],
    ]) {
      await calculator.getByRole('button', { name: 'C', exact: true }).click();
      for (const key of keys) await calculator.getByRole('button', { name: key, exact: true }).click();
      await expect(calculator.locator('output')).toHaveText(result);
    }
    await calculator.focus();
    await page.keyboard.press('Escape');
    await page.keyboard.type('12+3');
    await page.keyboard.press('Enter');
    await expect(calculator.locator('output')).toHaveText('15');
    expect(await page.evaluate(() => window.__localUiRequests)).toEqual([]);
    expect(errors).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/openui-calculator-${encodeURIComponent(viewport)}.png`, fullPage: true });
  });
}

test('OpenUI inputs update the native visualization in place', async ({ page }) => {
  const source = 'root = Col([Slider($n, 1, 8, 1, "Amount"), Text("Amount: " + $n), Visualization("bar", "Linked visual", {categories:["A"],series:[{name:"Amount",data:[$n]}]}, "Amount controlled by the slider")])\n$n = 2';
  await prepareChatWorkbench(page, { messages: [message(source)] });
  const ui = page.locator('.intui-openui');
  const card = ui.locator('.visualization-card');
  await expect(card).toHaveAttribute('data-visualization-renderer', 'echarts');
  await expect(card.locator('.visualization-data')).toContainText('2');
  await card.evaluate((element) => { element.dataset.mountIdentity = 'original'; });
  const slider = ui.getByRole('slider', { name: 'Amount' });
  await slider.focus();
  await slider.press('ArrowRight');
  await expect(ui).toContainText('Amount: 3');
  await expect(card.locator('.visualization-data')).toContainText('3');
  await expect(card).toHaveAttribute('data-mount-identity', 'original');
  await expect.poll(() => card.locator('.visualization-stage').evaluate((stage) => window.echarts.getInstanceByDom(stage).getOption().series[0].data[0])).toBe(3);
  await expect(ui.locator('p[role="status"]')).toHaveCount(0);
  await expect.poll(() => card.locator('.visualization-stage').evaluate((stage) => window.echarts.getInstanceByDom(stage).getZr().animation.isFinished())).toBe(true);
  await page.screenshot({ path: 'test-results/openui-linked-visual.png', fullPage: true });
});

test('the slider draws its own rail and keeps the knob on the value', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [message('root = Col([Slider($n, 1, 8, 1, "Amount"), Text("Amount: " + $n)])\n$n = 2')] });
  const ui = page.locator('.intui-openui');
  const track = ui.locator('.iui-slider-track');
  const knob = ui.locator('.iui-slider-thumb');
  const rail = await track.boundingBox();
  const offset = async () => {
    const box = await knob.boundingBox();
    return (box.x + box.width / 2 - rail.x) / rail.width;
  };
  // 2 of 1..8 is one seventh of the rail.
  expect(await offset()).toBeCloseTo(1 / 7, 2);
  // Clicking the rail sets the value, and the knob follows it.
  await page.mouse.click(rail.x + rail.width * 0.75, rail.y + rail.height / 2);
  await expect(ui.getByText('Amount: 6', { exact: true })).toBeVisible();
  expect(await offset()).toBeCloseTo(5 / 7, 2);
  // The native input stays transparent, so the app-wide focus frame cannot
  // draw a box around the rail; the focus ring belongs to the knob.
  expect(await ui.locator('.iui-range').evaluate((el) => getComputedStyle(el).opacity)).toBe('0');
  await ui.getByRole('slider', { name: 'Amount' }).focus();
  await expect.poll(() => knob.evaluate((el) => getComputedStyle(el).boxShadow)).toContain('rgb');
});

test('buttons without actions cannot accidentally send chat and offer explicit repair', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [message('root = Col([Title("Incomplete calculator"), Button("=")])')] });
  const ui = page.locator('.intui-openui');
  await expect(ui.getByRole('button', { name: '=', exact: true })).toBeDisabled();
  await expect(ui.locator('p[role="status"]')).toBeVisible();
  await page.evaluate(() => {
    window.__repairRequests = [];
    document.addEventListener('tool-retry', (event) => window.__repairRequests.push(event.detail));
  });
  await ui.getByRole('button', { name: 'Fix with AI' }).click();
  await expect.poll(() => page.evaluate(() => window.__repairRequests.length)).toBe(1);
  expect(await page.evaluate(() => window.__repairRequests[0].prompt)).toContain('Button requires an explicit action');
});
