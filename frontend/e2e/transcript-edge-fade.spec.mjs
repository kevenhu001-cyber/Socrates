import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

const longAnswer = Array.from(
  { length: 36 },
  (_, index) =>
    `Paragraph ${index + 1}: the transcript remains readable while the page edges blend softly into the surrounding interface.`,
).join('\\n\\n');

for (const [label, viewport] of Object.entries(WORKBENCH_VIEWPORTS)) {
  test(`one transcript mask softens the header and composer edges on ${label}`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await prepareChatWorkbench(page, {
      viewport,
      messages: [
        {
          clientId: 'fade-user',
          role: 'user',
          rawText: 'Show the transcript boundary.',
          html: null,
        },
        { clientId: 'fade-assistant', role: 'assistant', rawText: longAnswer, html: null },
      ],
    });

    const initial = await page.locator('#msgList').evaluate((list) => {
      const style = getComputedStyle(list);
      return {
        scrollable: list.scrollHeight > list.clientHeight,
        top: list.style.getPropertyValue('--ui-scroll-fade-top'),
        bottom: list.style.getPropertyValue('--ui-scroll-fade-bottom'),
        active: list.dataset.scrollFade,
        mask: style.maskImage || style.webkitMaskImage,
      };
    });
    expect(initial.scrollable).toBe(true);
    expect(initial.top).toBe('0px');
    expect(initial.bottom).toBe('48px');
    expect(initial.active).toBe('true');
    expect(initial.mask).toContain('linear-gradient');

    await page.locator('#msgList').evaluate((list) => {
      list.scrollTop = 80;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.transcriptScrolled))
      .toBe('true');
    await expect
      .poll(() =>
        page
          .locator('#msgList')
          .evaluate((list) => list.style.getPropertyValue('--ui-scroll-fade-top')),
      )
      .toBe('36px');
    await expect
      .poll(() =>
        page
          .locator('#msgList')
          .evaluate((list) => list.style.getPropertyValue('--ui-scroll-fade-bottom')),
      )
      .toBe('48px');

    await page.locator('#msgList').evaluate((list) => {
      list.scrollTop = list.scrollHeight;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await expect
      .poll(() =>
        page
          .locator('#msgList')
          .evaluate((list) => list.style.getPropertyValue('--ui-scroll-fade-bottom')),
      )
      .toBe('24px');
    await expect
      .poll(() => page.evaluate(() => document.body.dataset.transcriptScrolled))
      .toBe('true');
  });
}
