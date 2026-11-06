import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';

const separator = ']<]minimax[>[';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 260"><rect width="420" height="260" fill="white"/><path d="M10 150 Q130 -40 210 150 Q290 -40 410 150" fill="none" stroke="blue"/><text x="20" y="230">Rayleigh criterion</text></svg>';
const program = `root = Col([Visualization("svg_illustration", "瑞利判据：两艾里斑恰好分开", ${JSON.stringify({ source: svg })}, "Two overlapping diffraction peaks")])`;
const invoke = '<invoke name="render_intelligent_ui">' + separator
  + ['<version>1', '</version>', '<nodes>', '<item>', '<id>fig', '</id>', '<type>openui', '</type>', '<source>' + program, '</source>', '</item>', '</nodes>', '</invoke>'].join(separator)
  + '\n' + separator + '</tool_call>';
const rawText = '最小分辨角距离为 $$\\theta_{\\min}=1.22\\frac{\\lambda}{D}$$\n\n## 一个直观的图' + invoke + '\n\n图示结束。';

for (const mobile of [false, true]) {
  test(`restored serialized UI renders the diagram instead of protocol text (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
    await prepareChatWorkbench(page, {
      viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
      messages: [{ clientId: 'serialized-history', role: 'assistant', type: 'assistant', restoredFromHistory: true, _streamSettled: true, rawText }],
    });
    const body = page.locator('#msgList .msg.assistant .msg-body');
    await expect(body.locator('.katex')).toHaveCount(1);
    await expect(body.getByRole('heading', { name: '一个直观的图', exact: true })).toBeVisible();
    await expect(body).not.toContainText('minimax');
    await expect(body).not.toContainText('root = Col');
    await expect(body).toContainText('图示结束。');
    const frame = body.locator('.visualization-card iframe');
    await expect(frame).toBeVisible();
    await expect(frame.contentFrame().locator('.visualization-svg-illustration')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await expectNoGlobalError(page);
    await page.screenshot({ path: `test-results/serialized-ui-${encodeURIComponent(mobile ? 'mobile' : 'desktop')}.png`, fullPage: true });
  });
}

test('a leaked call stays isolated during streaming and renders on completion', async ({ page }) => {
  await prepareChatWorkbench(page);
  await page.evaluate(async () => {
    window.__serializedTurn = await window.addStreamingMessage({ userPrompt: 'Explain the Rayleigh criterion.' });
  });
  const prefix = rawText.slice(0, rawText.indexOf('</source>'));
  await page.evaluate(text => window.__serializedTurn.append(text), prefix);
  const body = page.locator('#msgList .msg.assistant .msg-body');
  await expect(body.getByRole('heading', { name: '一个直观的图', exact: true })).toBeVisible();
  await expect(body).not.toContainText('minimax');
  await expect(body).not.toContainText('root = Col');
  await page.evaluate(text => {
    window.__serializedTurn.append(text);
    window.__serializedTurn.finish();
  }, rawText.slice(prefix.length));
  const frame = body.locator('.visualization-card iframe');
  await expect(frame).toBeVisible();
  await expect(frame.contentFrame().locator('.visualization-svg-illustration')).toBeVisible();
  await expect(body).toContainText('图示结束。');
  await expectNoGlobalError(page);
});


test('unrecoverable serialized UI offers repair without exposing protocol or executing tools', async ({ page }) => {
  await prepareChatWorkbench(page, { messages: [{ clientId: 'bad-serialized', role: 'assistant', type: 'assistant',
    rawText: 'Before.\n<invoke name="render_intelligent_ui"><nodes><item><type>script</type><source>alert(1)</source></item></nodes></invoke>\nAfter.', _streamSettled: true,
  }] });
  const body = page.locator('#msgList .msg.assistant .msg-body');
  await expect(body).toContainText('Before.');
  await expect(body).toContainText('After.');
  await expect(body.getByRole('status')).toContainText('could not be displayed');
  await expect(body.getByRole('button', { name: 'Fix with AI' })).toBeVisible();
  await expect(body).not.toContainText('alert(1)');
  await expectNoGlobalError(page);
});
