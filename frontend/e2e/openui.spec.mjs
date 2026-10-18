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
