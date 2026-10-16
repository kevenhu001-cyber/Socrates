import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';

const source = { id: 'source-1', url: 'https://example.test/guide', title: 'Official source guide', snippet: 'A short excerpt supporting the claim.' };
const quote = 'The verified result is 42.';
const citation = { id: 'citation-1', sourceId: source.id };
const claim = { id: 'claim-1', start: 0, end: quote.length, quote, citationIds: [citation.id] };

for (const theme of ['light', 'dark']) for (const mobile of [false, true]) {
  test(`structured citations preview, keyboard dismissal and sources: ${theme}, ${mobile ? 'mobile' : 'desktop'}`, async ({ page }) => {
    await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
    await prepareChatWorkbench(page);
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(({ source, quote, citation, claim }) => {
      const ctl = window.__evidenceCtl = window.addStreamingMessage({ userPrompt: 'Check the result.' });
      let seq = 0;
      window.__evidenceEvent = (payload) => ctl.recordTurnEvent({ version: 1, turnId: 'evidence', seq: ++seq, at: Date.now(), ...payload });
      window.__evidenceEvent({ type: 'source.upsert', source });
      ctl.append(quote + '\n\n');
      window.__evidenceEvent({ type: 'claim.annotate', claim, citations: [citation] });
    }, { source, quote, citation, claim });
    const bubble = page.locator('#msgList .msg.assistant').last();
    const inline = bubble.locator('a[href="#socrates-citation-claim-1"]');
    await expect(inline).toBeVisible();
    await expect(inline).toHaveText('1');
    await inline.hover();
    const preview = page.getByRole('dialog', { name: 'Source preview' });
    await expect(preview).toContainText(source.title);
    await expect(preview).toContainText(source.snippet);
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await inline.focus();
    await page.keyboard.press('Enter');
    await expect(preview).toBeFocused();
    await expect(preview.locator('a')).toHaveAttribute('rel', 'noopener noreferrer');
    await page.keyboard.press('Escape');
    await expect(inline).toBeFocused();
    await expect(preview).toHaveCount(0);
    await inline.click();
    await expect(preview).toBeVisible();
    const bounds = await preview.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual((await page.viewportSize()).width);
    if (theme === 'light' && mobile) await page.screenshot({ path: 'test-results/citation-preview-light-mobile.png' });
    else if (theme === 'light') await page.screenshot({ path: 'test-results/citation-preview-light-desktop.png' });
    else if (mobile) await page.screenshot({ path: 'test-results/citation-preview-dark-mobile.png' });
    else await page.screenshot({ path: 'test-results/citation-preview-dark-desktop.png' });
    await page.keyboard.press('Escape');
    await bubble.locator('.turn-sources summary').click();
    await expect(bubble.locator('.turn-sources a')).toHaveAttribute('href', source.url);
    await page.evaluate(() => { window.__evidenceEvent({ type: 'turn.done', phase: 'done' }); window.__evidenceCtl.finish(); });
    await expect(bubble).toHaveAttribute('data-stream-settled', 'true');
    await expect(inline).toHaveCount(1);
    await expect(bubble.locator('.turn-sources li')).toHaveCount(1);
  });
}

test('historical evidence restores; stale and unsafe metadata cannot create references', async ({ page }) => {
  const runtime = { version: 1, turnId: 'history', seq: 3, lifecycle: 'done', generation: 'done', activities: [], uiSurfaces: [], sources: [source], citations: [citation], claims: [claim] };
  await prepareChatWorkbench(page, { messages: [
    { clientId: 'restored-citation', role: 'assistant', rawText: quote, turnRuntime: runtime },
    { clientId: 'changed-citation', role: 'assistant', rawText: 'This claim changed after the annotation.', turnRuntime: runtime },
  ] });
  await expect(page.locator('[data-client-id="restored-citation"] a[href^="#socrates-citation-"]')).toHaveCount(1);
  await expect(page.locator('[data-client-id="changed-citation"] a[href^="#socrates-citation-"]')).toHaveCount(0);
  await expect(page.locator('[data-client-id="changed-citation"] .turn-sources')).toHaveCount(0);
});
