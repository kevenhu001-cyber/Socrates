import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

for (const width of [360, 390, 430]) {
  test(`phone ${width}: floating chrome and keyboard-safe transcript`, async ({ page }) => {
    await prepareChatWorkbench(page, {
      viewport: { width, height: 844 },
      messages: [
        { clientId: 'question', role: 'user', type: 'user', rawText: 'A question', html: '' },
        {
          clientId: 'answer',
          role: 'assistant',
          type: 'assistant',
          rawText: 'An answer.\n\n'.repeat(40),
          html: '',
        },
      ],
    });
    const transcript = page.locator('#msgList');
    const header = page.locator('.top-bar');
    /* The bar overlaps the transcript, so it must paint the page colour: a
       translucent bar lets the scrolled transcript show through the title. */
    await expect(header).toHaveCSS('background-color', 'rgb(14, 14, 14)');
    const headerChrome = await page.evaluate(() => ({
      bar: getComputedStyle(document.querySelector('.top-bar')).backgroundColor,
      page: getComputedStyle(document.body).backgroundColor,
    }));
    expect(headerChrome.bar).toBe(headerChrome.page);
    await expect(transcript).toHaveCSS('mask-image', /linear-gradient/);
    const bounds = await page.evaluate(() => {
      const h = document.querySelector('.top-bar').getBoundingClientRect();
      const t = document.querySelector('#msgList').getBoundingClientRect();
      const c = document.querySelector('#composerInputWrap').getBoundingClientRect();
      return {
        overlap: h.bottom - t.top,
        gap: c.top - t.bottom,
        overflow: document.documentElement.scrollWidth - innerWidth,
      };
    });
    expect(bounds.overlap).toBeGreaterThan(0);
    expect(bounds.gap).toBeGreaterThanOrEqual(-1);
    expect(bounds.overflow).toBeLessThanOrEqual(0);
    await page.locator('#sidebarOpenBtn').click();
    await expect(page.locator('#sidebar')).toBeVisible();
  });
}

test('Mermaid preview and source switch without replacing the diagram', async ({ page }) => {
  await prepareChatWorkbench(page, {
    viewport: { width: 390, height: 844 },
    messages: [
      {
        clientId: 'diagram',
        role: 'assistant',
        type: 'assistant',
        rawText: '```mermaid\nflowchart TD\n  A[Start] --> B[Finish]\n```',
        html: '',
      },
    ],
  });
  const card = page.locator('.viz[data-viz-kind="mermaid"]');
  await expect(card.locator('.viz-mermaid-title')).toHaveText('Mermaid');
  await expect(card).toHaveAttribute('data-viz-state', 'ready');
  const svg = card.locator('.viz-body > svg');
  await expect(svg).toBeVisible();
  await card.locator('[data-viz-view-opt="code"]').click();
  await expect(card.locator('.viz-code-pane')).toContainText('A[Start] --> B[Finish]');
  await expect(card.locator('.viz-code-pane')).toBeVisible();
  await expect(svg).toBeHidden();
  await card.locator('[data-viz-view-opt="preview"]').click();
  await expect(svg).toBeVisible();
  await expect(card.locator('.viz-code-pane')).toBeHidden();
  await expect(card.locator('.viz-btn-reload, .viz-btn-expand')).toHaveCount(0);
});
