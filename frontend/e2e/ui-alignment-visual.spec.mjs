import { test, expect } from './_state-fixture.mjs';
import {
  prepareChatWorkbench,
  expectNoGlobalError,
  snapshotWorkbenchGeometry,
  WORKBENCH_VIEWPORTS,
} from './_chat-workbench.mjs';

/*
 * Review captures of the real built SPA, not hand-drawn mockups or new
 * golden-image gates. The visual project uploads these through its HTML
 * report; they supplement the blocking interaction and theme tests.
 */
const prompt = '分析一下储能系统的优化调度。';
const introduction = '我先查阅资料，再计算储能系统的运行成本。';
const answer = '\n\n## 优化目标\n\n在满足约束的前提下，降低运行成本。\n\n```python\ncost = sum(price * power * dt)\n```';
const tools = [
  {
    id: 'search-a',
    name: 'web_search',
    status: 'completed',
    textOffset: introduction.length,
    input: { query: '储能系统优化调度' },
    output: 'Found sources.',
  },
  {
    id: 'search-b',
    name: 'web_search',
    status: 'completed',
    textOffset: introduction.length,
    input: { query: '电力系统运行成本' },
    output: 'Found sources.',
  },
];

async function capture(page, info, name) {
  await expectNoGlobalError(page);
  await expect(page.locator('#composerInputWrap')).toBeVisible();
  const geometry = await snapshotWorkbenchGeometry(page);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await info.attach(name, {
    body: await page.screenshot({ animations: 'disabled', caret: 'hide' }),
    contentType: 'image/png',
  });
}

for (const [device, viewport] of Object.entries(WORKBENCH_VIEWPORTS)) {
  for (const theme of ['light', 'dark']) {
    test(`alignment captures: ${device} ${theme}`, async ({ page }, info) => {
      await page.addInitScript((mode) => {
        localStorage.setItem('socrates-theme', mode);
        localStorage.setItem('socrates-theme-style', 'socrates');
      }, theme);
      await prepareChatWorkbench(page, {
        viewport,
        lang: 'zh',
        messages: [
          { clientId: 'alignment-user', role: 'user', rawText: prompt, html: null },
          {
            clientId: 'alignment-answer',
            role: 'assistant',
            rawText: introduction + answer,
            html: null,
            toolCalls: tools,
          },
        ],
      });
      await expect(page.locator('html')).toHaveAttribute('data-mode', theme);
      const burst = page.locator('.tool-activity-burst-toggle');
      await expect(burst).toBeVisible();
      await expect(page.getByTestId('tool-row-search-a')).toBeVisible();
      await capture(page, info, `${device}-${theme}-completed-expanded`);
      await burst.click();
      await expect(page.getByTestId('tool-row-search-a')).toBeHidden();
      await capture(page, info, `${device}-${theme}-completed-folded`);

      await page.evaluate(async () => {
        const ctl = await window.addStreamingMessage({ userPrompt: '检查项目代码。' });
        window.__alignmentController = ctl;
        ctl.recordToolUse({
          id: 'alignment-agent',
          name: 'workspace_agent',
          input: { task: '检查项目代码' },
        });
        ctl.recordAgentStep({
          type: 'step', id: 'alignment-agent', runId: 'alignment-run',
          stepId: 'read', kind: 'read', status: 'done',
        });
        ctl.recordAgentStep({
          type: 'step', id: 'alignment-agent', runId: 'alignment-run',
          stepId: 'test', kind: 'command', status: 'running',
          command: 'npm run test:unit',
        });
      });
      await expect(page.getByTestId('agent-activity-preview')).toBeVisible();
      await expect(page.getByTestId('agent-activity-preview')).toContainText('1/2');
      await capture(page, info, `${device}-${theme}-live-workspace`);
      await page.getByTestId('tool-row-alignment-agent').click();
      await expect(page.locator('.agent-step')).toHaveCount(2);
      await capture(page, info, `${device}-${theme}-live-details`);
      await page.evaluate(() => {
        const ctl = window.__alignmentController;
        ctl.recordToolResult({
          id: 'alignment-agent', name: 'workspace_agent',
          ok: true, status: 'completed', output: 'Done.',
        });
        ctl.append('检查完成。');
        ctl.finish();
      });
      await expect(page.getByTestId('agent-activity-preview')).toHaveCount(0);
    });
  }
}
