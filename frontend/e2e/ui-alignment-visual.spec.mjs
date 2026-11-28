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
const answer =
  '\n\n## 优化目标\n\n在满足约束的前提下，降低运行成本。\n\n```python\ncost = sum(price * power * dt)\n```';
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
      const burst = page.locator('[data-testid="turn-activity-toggle"]');
      await expect(burst).toBeVisible();
      await expect(page.getByTestId('tool-row-search-a')).toBeHidden();
      await burst.click();
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
          type: 'step',
          id: 'alignment-agent',
          runId: 'alignment-run',
          stepId: 'read',
          kind: 'read',
          status: 'done',
        });
        ctl.recordAgentStep({
          type: 'step',
          id: 'alignment-agent',
          runId: 'alignment-run',
          stepId: 'test',
          kind: 'command',
          status: 'running',
          command: 'npm run test:unit',
        });
      });
      await expect(page.getByTestId('agent-activity-preview')).toBeVisible();
      await expect(page.getByTestId('agent-activity-preview')).toHaveCount(0);
      await capture(page, info, `${device}-${theme}-live-workspace`);
      const activity = page.getByTestId('turn-activity-toggle').last();
      if ((await activity.getAttribute('aria-expanded')) === 'false') await activity.click();
      await page.getByTestId('tool-row-alignment-agent').click();
      await expect(page.locator('.agent-step')).toHaveCount(2);
      await capture(page, info, `${device}-${theme}-live-details`);
      await page.evaluate(() => {
        const ctl = window.__alignmentController;
        ctl.recordToolResult({
          id: 'alignment-agent',
          name: 'workspace_agent',
          ok: true,
          status: 'completed',
          output: 'Done.',
        });
        ctl.append('检查完成。');
        ctl.finish();
      });
      await expect(page.getByTestId('agent-activity-preview')).toHaveCount(0);
    });
  }
}

/* Review the migrated surfaces together at the same viewport and theme.
 * Attach real browser captures to the advisory visual report. */
for (const [device, viewport] of Object.entries(WORKBENCH_VIEWPORTS)) {
  for (const theme of ['light', 'dark']) {
    test(`page kit captures: ${device} ${theme}`, async ({ page }, info) => {
      await page.addInitScript((mode) => {
        localStorage.setItem('socrates-theme', mode);
        localStorage.setItem('socrates-theme-style', 'socrates');
      }, theme);
      await prepareChatWorkbench(page, { viewport, lang: 'en' });
      await page.route(/\/api\/(?:v2\/)?files(?:\?|$)/, (route) =>
        route.fulfill({
          json: {
            files: [
              { id: 'review-pdf', name: 'Research notes.pdf', kind: 'pdf', size: 10240 },
              { id: 'review-image', name: 'Diagram.png', kind: 'image', size: 8192 },
            ],
            hasMore: false,
          },
        }),
      );
      await page.route(/\/api\/(?:v2\/)?creations\/items\/sites(?:\?|$)/, (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      const capturePage = async (name, panel) => {
        await expect(panel).toBeVisible();
        await expectNoGlobalError(page);
        await expect
          .poll(() =>
            panel.evaluate((element) => {
              const rect = element.getBoundingClientRect();
              return rect.left >= -1 && rect.right <= innerWidth + 1;
            }),
          )
          .toBe(true);
        expect((await snapshotWorkbenchGeometry(page)).overflow).toBeLessThanOrEqual(1);
        await info.attach(`${device}-${theme}-${name}`, {
          body: await page.screenshot({ animations: 'disabled', caret: 'hide' }),
          contentType: 'image/png',
        });
      };

      await page.evaluate(() => window.__socratesLegacy.navigation.openNav('library'));
      const library = page.locator('.library-directory');
      await expect(library.locator('.library-row')).toHaveCount(2);
      const views = library.locator('.ui-page-view-toggle [data-slot="toggle-group-item"]');
      await views.nth(0).click();
      await expect(views.nth(0)).toHaveAttribute('aria-pressed', 'true');
      await capturePage('library-grid', library);
      await views.nth(1).click();
      await expect(views.nth(1)).toHaveAttribute('aria-pressed', 'true');
      await capturePage('library-list', library);

      await page.evaluate(() => window.__socratesLegacy.navigation.openNav('sites'));
      const sites = page.locator('#sitesPanel');
      await expect(sites.locator('.ui-page-view-toggle')).toBeVisible();
      await capturePage('sites', sites);

      await page.evaluate(() => window.__socratesLegacy.navigation.openSettings());
      const settings = page.locator('#settingsPage');
      const back = settings.locator('#settingsMobileBack');
      if (device === 'mobile') {
        if (await back.isVisible()) await back.click();
        await capturePage('settings-index', settings);
      }
      await settings.locator('.settings-nav [data-section="display"]').click();
      await expect(settings.locator('.settings-choice--segmented .ui-page-tabs')).toHaveCount(2);
      await capturePage('settings-display', settings);
    });
  }
}
