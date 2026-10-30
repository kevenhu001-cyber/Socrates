import { test, expect } from '@playwright/test';
import { gotoAndSettle, publishChatRuntime } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const VIEWPORTS = [{ width: 1440, height: 900 }, { width: 1280, height: 800 }, { width: 390, height: 844 }];
const SOURCE = '## 清晰的阅读节奏\n\n第一段，中文与 Latin text 使用一致的正文尺度。\n\n第二段应保留相同间距。\n\n### 一个简短的例子\n\n```python\ndef square(x):\n    return x * x\n```\n\n公式：$x^2 + y^2 = z^2$。\n\n最后一段保持稳定。';

async function publish(page, rawText, { live = false, clientId = 'visual-answer', activity = false, restored = false } = {}) {
  await page.evaluate(({ rawText, live, clientId, activity, restored }) => {
    const message = { clientId, role: 'assistant', type: live ? 'streaming' : 'assistant', _streamSettled: !live, rawText,
      restoredFromHistory: restored,
      ...(activity ? { _activity: { type: 'public_reasoning_summary', text: '先说明，再用代码和公式验证。' } } : {}) };
    for (const [key, value] of Object.entries({ phase: 'chat', currentSessionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', messages: [message] })) {
      window.stateStore.dispatch({ type: 'state/set', key, value });
    }
    window.__testActivateMainView('chatView');
    document.body.dataset.conversationActive = 'true';
  }, { rawText, live, clientId, activity, restored });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'visual-system-fixture' });
  await expect(page.locator('.msg.assistant')).toHaveAttribute('data-client-id', clientId);
  if (!live) await expect(page.locator('.msg.assistant')).toHaveAttribute('data-stream-settled', 'true');
  await expect(page.locator('.tool-run-prose')).toContainText([rawText.startsWith('##') ? '清晰的阅读节奏' : 'First paragraph.']);
}

async function bodyGeometry(page) {
  return page.locator('.msg.assistant .msg-body').evaluate(body => {
    const top = body.getBoundingClientRect().top;
    return { height: body.getBoundingClientRect().height, blocks: [...body.querySelectorAll('.tool-run-prose > :is(p,h2,h3,pre)')].map(el => ({
      tag: el.tagName, top: el.getBoundingClientRect().top - top, height: el.getBoundingClientRect().height,
    })) };
  });
}

for (const viewport of VIEWPORTS) for (const mode of ['light', 'dark']) {
  test(`semantic prose and shared geometry ${viewport.width} ${mode}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.addInitScript(mode => localStorage.setItem('socrates-theme', mode), mode);
    await mockAuthedApp(page, { lang: 'zh' });
    await gotoAndSettle(page);
    await waitForAppShell(page);
    await expect(page).toHaveTitle(/Socrates/);
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    await expect(page.locator('html')).toHaveAttribute('data-mode', mode);
    const composer = page.locator('#composerInputWrap');
    const home = await composer.boundingBox();
    await page.screenshot({ path: `test-results/ui-convergence/verified/${encodeURIComponent(viewport.width)}-${encodeURIComponent(mode)}-home.png` });
    await publish(page, SOURCE, { activity: true });
    await expect(page.locator('.katex')).not.toHaveCount(0);
    const chat = await composer.boundingBox();
    expect(Math.abs(home.x - chat.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(home.width - chat.width)).toBeLessThanOrEqual(1);
    const typography = await page.locator('.msg.assistant .msg-body').evaluate(body => {
      const style = getComputedStyle(body), h2 = getComputedStyle(body.querySelector('h2')), h3 = getComputedStyle(body.querySelector('h3'));
      return { size: style.fontSize, line: style.lineHeight, h2: h2.fontSize, h3: h3.fontSize, headingColors: [h2.color, h3.color],
        primary: style.color, font: style.fontFamily, border: style.borderTopWidth, shadow: style.boxShadow, background: style.backgroundColor,
        overflow: document.documentElement.scrollWidth - innerWidth, x: body.getBoundingClientRect().x, width: body.getBoundingClientRect().width };
    });
    expect(typography).toMatchObject({ size: '16px', line: '28px', h2: '20px', h3: '18px', border: '0px', shadow: 'none', background: 'rgba(0, 0, 0, 0)', overflow: 0 });
    expect(typography.headingColors).toEqual([typography.primary, typography.primary]);
    expect(typography.font).toContain('Geist Sans');
    expect(typography.font).toContain('Noto Sans SC');
    expect(Math.abs(typography.x - chat.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(typography.width - chat.width)).toBeLessThanOrEqual(1);
    const toggle = page.locator('.thinking-accordion-toggle');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('.thinking-accordion-text')).toBeVisible();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await page.locator('#composerRoot .rich-composer-editor').focus();
    await expect(composer).toHaveClass(/composer-focused/);
    const focused = await composer.boundingBox();
    expect(focused).toEqual(chat);
    await page.screenshot({ path: `test-results/ui-convergence/verified/${encodeURIComponent(viewport.width)}-${encodeURIComponent(mode)}-chat-focus.png` });
    // Scale must be normalized once for both prose and headings.
    await page.evaluate(() => document.documentElement.style.setProperty('--app-font-scale', '1.35'));
    await expect(page.locator('.msg.assistant .msg-body')).toHaveCSS('font-size', '19.2px');
    await expect(page.locator('.tool-run-prose h3')).toHaveCSS('font-size', '21.6px');
    expect(errors).toEqual([]);
  });
}

for (const viewport of [VIEWPORTS[0], VIEWPORTS[2]]) {
  test(`prose identity and geometry survive promotion, finish and restore ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockAuthedApp(page);
    await gotoAndSettle(page);
    await waitForAppShell(page);
    await publish(page, 'First paragraph.', { live: true });
    await page.evaluate(() => {
      const p = document.querySelector('.tool-run-prose p');
      window.__visualParagraph = p;
      const selection = getSelection(), range = document.createRange();
      range.selectNodeContents(p); selection.removeAllRanges(); selection.addRange(range);
    });
    await publish(page, 'First paragraph.\n\nSecond paragraph.', { live: true });
    await expect(page.locator('.msg-body')).toContainText('Second paragraph.');
    expect(await page.evaluate(() => window.__visualParagraph === document.querySelector('.tool-run-prose p'))).toBe(true);
    expect(await page.evaluate(() => getSelection().toString())).toBe('First paragraph.');
    await page.evaluate(() => getSelection().removeAllRanges());
    await publish(page, SOURCE, { live: true });
    await expect(page.locator('.katex')).not.toHaveCount(0);
    const live = await bodyGeometry(page);
    const pendingToolbar = await page.locator('.msg-toolbar').boundingBox();
    await expect(page.locator('.msg-toolbar')).toHaveAttribute('inert', '');
    await publish(page, SOURCE);
    await expect(page.locator('.msg.assistant')).toHaveAttribute('data-stream-settled', 'true');
    await expect(page.locator('.stream-cursor')).toHaveCount(0);
    const finished = await bodyGeometry(page);
    expect(finished).toEqual(live);
    expect((await page.locator('.msg-toolbar').boundingBox()).height).toBe(pendingToolbar.height);
    await page.screenshot({ path: `test-results/ui-convergence/verified/${encodeURIComponent(viewport.width)}-finished.png` });
    await publish(page, SOURCE, { clientId: 'visual-history', restored: true });
    await expect(page.locator('.code-block-header')).toBeVisible();
    expect(await bodyGeometry(page)).toEqual(finished);
    await page.screenshot({ path: `test-results/ui-convergence/verified/${encodeURIComponent(viewport.width)}-restored.png` });
    // A trailing separator promotes the final p but must not leave extra space.
    await publish(page, SOURCE + '\n\n', { live: true, clientId: 'visual-blank-tail' });
    await publish(page, SOURCE + '\n\n', { clientId: 'visual-blank-tail' });
    expect(await bodyGeometry(page)).toEqual(finished);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await publish(page, SOURCE + ' More text.', { live: true, clientId: 'visual-reduced' });
    expect(await page.locator('.tool-run-prose').evaluateAll(nodes => nodes.every(node => node.getAnimations({ subtree: true }).length === 0))).toBe(true);
  });
}
