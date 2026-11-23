import { test, expect } from './_state-fixture.mjs';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function addNaturalContent(page, batch) {
  return page.locator('#msgList').evaluate((list, batch) => {
    const body = list.querySelector('.msg:last-child .msg-body');
    const before = body.getBoundingClientRect().height;
    const section = document.createElement('section');
    section.dataset.lateBatch = batch;
    for (let index = 0; index < 8; index += 1) {
      const paragraph = document.createElement('p');
      paragraph.textContent =
        `Late answer ${batch}, paragraph ${index + 1}: naturally wrapping text adds real content, without a height placeholder or a scroll write. `.repeat(
          3,
        );
      section.appendChild(paragraph);
    }
    body.appendChild(section);
    return { before, after: body.getBoundingClientRect().height };
  }, batch);
}

for (const width of [1280, 390]) {
  test(`settled tail stays measured and follows growth until a real upward gesture (${width}px)`, async ({
    page,
  }) => {
    await mockAuthedApp(page);
    await page.setViewportSize({ width, height: 800 });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);
    await page.evaluate(() => {
      window.__socratesTestState.patch({ session: { phase: 'chat' } });
      window.__testActivateMainView('chatView');
      window.addMessage(
        'user',
        'Measured history 1: settled answers should retain accurate geometry.',
      );
    });
    await expect(page.locator('#msgList > .msg')).toHaveCount(1);
    await page.evaluate(() => {
      for (let index = 1; index < 18; index += 1) {
        window.addMessage(
          index % 2 ? 'assistant' : 'user',
          `Measured history ${index + 1}: settled answers should retain accurate geometry.`,
        );
      }
    });
    const list = page.locator('#msgList');
    await expect(list.locator(':scope > .msg')).toHaveCount(18);
    /* The assistant body is a lazy chunk. Measure history only after every
       answer has painted its real height, not the empty Suspense boundary. */
    await expect
      .poll(() =>
        list.evaluate((node) =>
          [...node.querySelectorAll('.msg.assistant .msg-body')].every(
            (body) => body.textContent.trim().length > 0,
          ),
        ),
      )
      .toBe(true);
    const tail = list.locator(':scope > .msg').last();
    await expect(tail).toHaveAttribute('data-stream-settled', 'true');
    // A settled tail below the fold must have its true height BEFORE the
    // initial bottom write. Previously it used 240px, then shrank to 64px.
    expect(await tail.evaluate((row) => getComputedStyle(row).contentVisibility)).toBe('visible');
    await list.evaluate(async (list) => {
      // Already at the bottom writes no scroll event; wait two painted frames
      // so the scroll-intent sampler and the first off-screen layout pass see
      // the pinned position either way.
      list.scrollTop = list.scrollHeight;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    const initial = await list.evaluate((list) => {
      return {
        client: list.clientHeight,
        height: list.scrollHeight,
        ids: [...list.children].map((row) => row.dataset.clientId),
      };
    });
    await page.evaluate(() => {
      document.getElementById('composerInputWrap').style.minHeight = '240px';
    });
    await expect
      .poll(() => list.evaluate((list) => list.scrollHeight - list.scrollTop - list.clientHeight))
      .toBeLessThanOrEqual(2);
    expect(await list.evaluate((list) => list.clientHeight)).toBeLessThan(initial.client);
    expect(await list.evaluate((list) => list.scrollHeight)).toBe(initial.height);

    for (const batch of ['first', 'second']) {
      const growth = await addNaturalContent(page, batch);
      expect(growth.after).toBeGreaterThan(growth.before);
      await expect
        .poll(() => list.evaluate((list) => list.scrollHeight - list.scrollTop - list.clientHeight))
        .toBeLessThanOrEqual(2);
      expect(await page.evaluate(() => window.__socratesTestState.ui()._userScrolledAway)).toBe(
        false,
      );
    }

    const pinnedTop = await list.evaluate((list) => list.scrollTop);
    await list.hover();
    await page.mouse.wheel(0, -320);
    await expect
      .poll(() => page.evaluate(() => window.__socratesTestState.ui()._userScrolledAway))
      .toBe(true);
    await expect.poll(() => list.evaluate((list) => list.scrollTop)).toBeLessThan(pinnedTop - 100);
    // Wait for the browser's wheel motion to end, not a hand-written away flag.
    await list.evaluate(
      (list) =>
        new Promise((resolve) => {
          let previous = list.scrollTop;
          let stable = 0;
          const check = () => {
            stable = Math.abs(list.scrollTop - previous) < 0.1 ? stable + 1 : 0;
            previous = list.scrollTop;
            if (stable >= 5) resolve();
            else requestAnimationFrame(check);
          };
          requestAnimationFrame(check);
        }),
    );
    const reading = await list.evaluate((list) => {
      const section = list.querySelector('[data-late-batch="first"]');
      return { top: list.scrollTop, sectionTop: section.getBoundingClientRect().top };
    });
    await addNaturalContent(page, 'while-reading');
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
    );
    const after = await list.evaluate((list) => ({
      top: list.scrollTop,
      sectionTop: list.querySelector('[data-late-batch="first"]').getBoundingClientRect().top,
      ids: [...list.children].map((row) => row.dataset.clientId),
    }));
    expect(after.top).toBe(reading.top);
    expect(after.sectionTop).toBe(reading.sectionTop);
    expect(after.ids).toEqual(initial.ids);
    expect(await page.evaluate(() => window.__socratesTestState.ui()._userScrolledAway)).toBe(true);
  });
}
