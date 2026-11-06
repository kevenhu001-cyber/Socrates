import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';

for (const mode of ['light', 'dark', 'mobile']) {
  test(`native diffraction computes light, animates and reaches Rayleigh limit (${mode})`, async ({ page }) => {
    await page.addInitScript(theme => localStorage.setItem('socrates-theme', theme), mode === 'dark' ? 'dark' : 'light');
    const remote = [];
    page.on('request', request => { if (/intelligent-ui\/(images|tiles|geocode)/.test(request.url())) remote.push(request.url()); });
    await prepareChatWorkbench(page, { lang: 'en', viewport: mode === 'mobile' ? { width: 390, height: 844 } : { width: 1280, height: 900 }, messages: [{ clientId: 'rayleigh', role: 'assistant', type: 'assistant', rawText: 'Circular aperture diffraction:\n```socrates-ui\n{"id":"optic","type":"physics","scene":"rayleigh","title":"Rayleigh lab"}\n```' }] });
    const lab = page.getByRole('region', { name: 'Rayleigh lab', exact: true });
    await expect(lab).toBeVisible();
    const separation = lab.getByRole('slider', { name: 'Separation', exact: true });
    await expect.poll(async () => Number(await separation.inputValue())).toBeLessThan(2.35);
    await lab.getByRole('button', { name: 'Show Rayleigh limit' }).click();
    await expect(separation).toHaveValue('1');
    await expect(lab.locator('output')).toContainText('1.00 θR');
    const pixels = await lab.locator('canvas').evaluate(canvas => {
      const ctx = canvas.getContext('2d');
      const brightness = (x, y) => [...ctx.getImageData(x, y, 1, 1).data].slice(0,3).reduce((a,b) => a+b,0);
      return { peak: brightness(265,120), middle: brightness(240,120), corner: brightness(0,0) };
    });
    expect(pixels.peak).toBeGreaterThan(pixels.middle);
    expect(pixels.middle).toBeGreaterThan(pixels.corner + 100);
    await lab.locator('summary').click();
    await lab.getByRole('slider', { name: 'Wavelength' }).fill('650');
    await expect(lab.locator('output')).toContainText('0.85 θR');
    await lab.getByRole('button', { name: 'Show Rayleigh limit' }).click();
    await expect(lab.locator('output')).toContainText('1.00 θR');
    await separation.fill('0.4');
    await expect(lab.locator('output')).toContainText('Below the Rayleigh limit');
    expect(remote).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await lab.getByRole('button', { name: 'Show Rayleigh limit' }).click();
    await lab.locator('summary').click();
    await lab.locator('canvas').evaluate(element => element.scrollIntoView({ block: 'center' }));
    await lab.locator('canvas').screenshot({ path: `test-results/rayleigh-${encodeURIComponent(mode)}.png` });
    await expectNoGlobalError(page);
  });
}

test('OpenUI adapter uses the same native renderer and respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await prepareChatWorkbench(page, { lang: 'en', messages: [{ clientId: 'optic', role: 'assistant', type: 'assistant', rawText: '```openui\nroot = Col([Rayleigh("Optical resolution", 1, 550, 100)])\n```' }] });
  const lab = page.getByRole('region', { name: 'Optical resolution', exact: true });
  await expect(lab.locator('canvas')).toBeVisible();
  await expect(lab.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  await expect(lab.getByRole('slider', { name: 'Separation', exact: true })).toHaveValue('1');
  await lab.getByRole('slider', { name: 'Separation', exact: true }).fill('2');
  await expect(lab.locator('output')).toContainText('2.00 θR');
  await expectNoGlobalError(page);
});
