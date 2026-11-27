import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { publishChatRuntime } from './_lib.mjs';
import { TURN, openActivity, openToolDetail, thoughtsScope, toolRow } from './_turn-ui.mjs';

const message = {
  clientId: 'activity-polish',
  role: 'assistant',
  rawText: 'The comparison is ready.',
  reasoningDurationSec: 6,
  _activity: {
    type: 'public_reasoning_summary',
    text: '**Comparison**\n\nCompared the original sources and checked the result.',
  },
  toolCalls: [
    {
      id: 'output-polish',
      name: 'Read',
      input: { file_path: 'comparison.txt' },
      output: 'A concise comparison from the original sources.',
      status: 'completed',
      textOffset: 0,
    },
  ],
};

for (const mobile of [false, true]) {
  test(`activity disclosure stays borderless inline and opens Thoughts sheet/drawer (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await prepareChatWorkbench(page, {
      messages: [message],
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    });
    const surface = page.locator(TURN.surface);
    const toggle = surface.locator(TURN.toggle);
    const label = surface.locator(TURN.label);
    const arrow = toggle.locator('.activity-chevron');
    const panel = thoughtsScope(page);

    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAttribute('aria-haspopup', 'dialog');
    await expect(toggle).toHaveAttribute('aria-controls', 'thoughtsPanel');
    await expect(label).toHaveText('Thought for 6s');
    await expect(toggle.locator('.activity-leading-glyph')).toBeVisible();
    await expect(toggle.getByTestId('tool-site-mark')).toHaveCount(0);
    await expect(page.locator(TURN.body)).toHaveCount(0);
    await expect(panel).toBeHidden();

    // Borderless, backgroundless, content-hugging trigger with `>` beside text.
    await expect(page.locator(TURN.wrapper)).toHaveCSS('border-top-width', '0px');
    await expect(page.locator(TURN.wrapper)).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
    expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(mobile ? 44 : 32);
    const triggerGeom = await Promise.all([
      label.boundingBox(),
      arrow.boundingBox(),
      toggle.boundingBox(),
      page.locator('.msg-body').last().boundingBox(),
    ]);
    expect(triggerGeom[1].x - (triggerGeom[0].x + triggerGeom[0].width)).toBeLessThan(24);
    expect(triggerGeom[2].width).toBeLessThan(triggerGeom[3].width * 0.7);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(panel).toBeVisible();
    await expect(panel.locator(TURN.thoughtsTitle)).toHaveText('Thoughts');
    await expect(toolRow(page, 'output-polish')).toBeVisible();

    if (mobile) {
      await expect(page.locator(TURN.thoughtsBackdrop)).toBeVisible();
      await expect(panel.locator('.thoughts-sheet-handle')).toBeVisible();
      const radius = await panel.evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius));
      expect(radius).toBeGreaterThanOrEqual(16);
    } else {
      await expect(page.locator('#appShell')).toHaveClass(/has-thoughts-open/);
    }

    const timelineGeometry = await panel.locator(TURN.timeline).evaluate((node) => {
      const summaryTitle = node.querySelector('.activity-summary-title').getBoundingClientRect();
      const summaryDetail = node.querySelector('.thinking-step-summary').getBoundingClientRect();
      const bullet = node.querySelector('.activity-step-bullet').getBoundingClientRect();
      const glyph = node.querySelector('.activity-summary-step > svg').getBoundingClientRect();
      const toolLabel = node.querySelector('.tool-run-label').getBoundingClientRect();
      const connector = getComputedStyle(node.firstElementChild, '::after');
      return {
        labelOffset: Math.abs(summaryTitle.x - toolLabel.x),
        detailOffset: Math.abs(summaryTitle.x - summaryDetail.x),
        bulletAlign: Math.abs((bullet.x + bullet.width / 2) - (glyph.x + glyph.width / 2)),
        connector: connector.borderInlineStartStyle,
      };
    });
    expect(timelineGeometry.labelOffset).toBeLessThanOrEqual(2);
    expect(timelineGeometry.detailOffset).toBeLessThanOrEqual(1);
    expect(timelineGeometry.bulletAlign).toBeLessThanOrEqual(1.5);
    expect(timelineGeometry.connector).toBe('none');

    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect(arrow).toHaveCSS('transition-property', 'none');
    await toggle.click();
    await expect(panel).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

test('internal tool output has no copy button or empty detail panel', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [message] });
  const bubble = page.locator('.msg.assistant').last();
  const panel = await openActivity(bubble);
  const row = panel.getByTestId('tool-row-output-polish');
  await expect(row).toBeVisible();
  await expect(row).not.toHaveAttribute('aria-expanded', /.+/);
  await expect(panel.locator(TURN.detail)).toHaveCount(0);
  await expect(panel.locator(TURN.codeCopy)).toHaveCount(0);
  await expect(panel).not.toContainText('A concise comparison from the original sources.');
});

for (const mobile of [false, true]) {
  test(`live spark + two-tone search caption + domain-only source chips (${mobile ? 'mobile' : 'desktop'})`, async ({
    page,
  }) => {
    await page.addInitScript(() => localStorage.setItem('socrates-theme', 'dark'));
    const lead = '我会先核对官方发布页与原始资料，再按相同口径整理对比结果。';
    await prepareChatWorkbench(page, {
      lang: 'zh',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      messages: [
        {
          clientId: 'reference-question',
          role: 'user',
          rawText: '搜索一下今日的 AI 圈的新闻',
        },
        {
          ...message,
          type: 'streaming',
          _streamSettled: false,
          rawText: lead + '\n\n',
          _activity: {
            type: 'public_reasoning_summary',
            text: "**Summarizing today's AI news**\n\n整理今日 AI 圈热点新闻",
          },
          toolCalls: [
            {
              id: 'reference-search',
              name: 'web_search',
              input: { query: 'OpenAI Anthropic Google DeepMind latest AI news' },
              textOffset: lead.length + 2,
            },
          ],
        },
      ],
    });
    const wrapper = page.locator(TURN.wrapper);
    const surface = page.locator(TURN.surface);
    const caption = surface.locator(TURN.label);
    const toggle = surface.locator(TURN.toggle);

    await expect(wrapper).toHaveAttribute('data-live', 'true');
    await expect(toggle.locator(TURN.spark)).toBeVisible();
    await expect(toggle.locator('.activity-caption-verb')).toHaveText('正在搜索');
    await expect(toggle.locator('.activity-caption-target')).toHaveText(
      'OpenAI Anthropic Google DeepMind latest AI news',
    );
    await expect(caption).not.toContainText('"');
    await expect(toggle.locator(TURN.spinner)).toHaveCount(0);
    await expect(surface.locator('.turn-activity-dot')).toHaveCount(0);

    await page.mouse.move(0, 0);
    if (mobile) {
      await page.screenshot({ path: 'test-results/activity-polish-live-mobile.png' });
    } else {
      await page.screenshot({ path: 'test-results/activity-polish-live-desktop.png' });
    }

    const panel = await openActivity(page);
    await expect(panel.locator(TURN.step).first()).toBeVisible();
    const liveRow = toolRow(page, 'reference-search');
    await expect(liveRow.locator(TURN.spinner)).toHaveCount(1);

    await page.evaluate(() => {
      const messages = window.__socratesTestState.session().messages.map((entry) =>
        entry.role === 'assistant'
          ? {
              ...entry,
              type: 'assistant',
              _streamSettled: true,
              toolCalls: entry.toolCalls.map((call) => ({
                ...call,
                status: 'completed',
                output: '已完成资料核对。',
                results: [
                  {
                    title: 'OpenAI API Overview — Should Not Appear',
                    url: 'https://docs.openai.com/api/overview',
                    snippet: 'Long snippet text that must not appear in search UI.',
                  },
                  {
                    title: 'Anthropic Research',
                    url: 'https://www.anthropic.com/news',
                  },
                  {
                    title: 'BBC Technology',
                    url: 'https://news.bbc.co.uk/technology',
                  },
                ],
              })),
            }
          : entry,
      );
      window.__socratesTestState.patch({ session: { messages: messages } });
    });
    await publishChatRuntime(page, { type: 'state-synced', reason: 'reference-complete' });

    await expect(wrapper).not.toHaveAttribute('data-live', 'true');
    await expect(caption).not.toHaveAttribute('role', 'status');
    await expect(caption).toHaveText('思考了 6 秒');
    await expect(liveRow.locator(TURN.spinner)).toHaveCount(0);
    await expect(liveRow.getByTestId('activity-source-preview')).toHaveCount(0);

    if (mobile) {
      await page.screenshot({
        path: 'test-results/activity-polish-complete-mobile.png',
        animations: 'disabled',
      });
    } else {
      await page.screenshot({
        path: 'test-results/activity-polish-complete-desktop.png',
        animations: 'disabled',
      });
    }

    // Expanding search row reveals ONLY compact [favicon] + second-level domain chips.
    const detail = await openToolDetail(page, page, 'reference-search');
    await expect(detail.getByTestId('tool-source-title')).toHaveCount(0);
    await expect(detail.getByTestId('tool-sources-open')).toHaveCount(0);
    await expect(detail.getByTestId('tool-source-host')).toHaveText([
      'openai.com',
      'anthropic.com',
      'bbc.co.uk',
    ]);
    await expect(detail).not.toContainText('Should Not Appear');
    await expect(detail).not.toContainText('Long snippet text');
    await expect(detail).not.toContainText('https://');
  });
}
