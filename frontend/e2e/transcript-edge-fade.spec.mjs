import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const longAnswer = Array.from(
  { length: 36 },
  (_, index) => `Paragraph ${index + 1}: the transcript remains readable while the page edges blend softly into the surrounding interface.`,
).join('\n\n');

for (const [label, viewport] of Object.entries(WORKBENCH_VIEWPORTS)) {
  test(`transcript edge fades blend the header and composer on ${label}`, async ({ page }) => {
    await prepareChatWorkbench(page, {
      viewport,
      messages: [
        { clientId: 'fade-user', role: 'user', rawText: 'Show the transcript boundary.', html: null },
        { clientId: 'fade-assistant', role: 'assistant', rawText: longAnswer, html: null },
      ],
    });

    const initial = await page.evaluate(() => {
      const top = getComputedStyle(document.querySelector('#topBar'), '::after');
      const bottom = getComputedStyle(document.querySelector('#chatView'), '::before');
      const list = document.getElementById('msgList');
      return {
        scrollable: list.scrollHeight > list.clientHeight,
        topHeight: top.height,
        topOpacity: top.opacity,
        bottomHeight: bottom.height,
        bottomGradient: bottom.backgroundImage,
        bottomPointerEvents: bottom.pointerEvents,
        composerPosition: getComputedStyle(document.getElementById('chatView')).position,
      };
    });

    expect(initial.scrollable).toBe(true);
    expect(initial.topHeight).toBe('32px');
    expect(initial.topOpacity).toBe('0');
    expect(initial.bottomHeight).toBe('56px');
    expect(initial.bottomGradient).toContain('linear-gradient');
    expect(initial.bottomPointerEvents).toBe('none');
    expect(initial.composerPosition).toBe('relative');

    await page.locator('#msgList').evaluate((list) => {
      list.scrollTop = 80;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(() =>
      page.evaluate(() => document.body.dataset.transcriptScrolled),
    ).toBe('true');
    await expect.poll(() =>
      page.evaluate(() => getComputedStyle(document.querySelector('#topBar'), '::after').opacity),
    ).toBe('1');

    await page.locator('#msgList').evaluate((list) => {
      list.scrollTop = 0;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect.poll(() =>
      page.evaluate(() => document.body.dataset.transcriptScrolled),
    ).toBe('false');
    await expect.poll(() =>
      page.evaluate(() => getComputedStyle(document.querySelector('#topBar'), '::after').opacity),
    ).toBe('0');
  });
}
