import { expect, test } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';
for (const mode of ['light', 'dark', 'mobile']) {
  test(`projectile simulation controls and playback (${mode})`, async ({ page }) => {
    const theme = mode === 'dark' ? 'dark' : 'light';
    await page.addInitScript(theme => { localStorage.setItem('socrates-theme', theme); localStorage.setItem('socrates-lang', 'en'); }, theme);
    await prepareChatWorkbench(page, { viewport: mode === 'mobile' ? WORKBENCH_VIEWPORTS.mobile : WORKBENCH_VIEWPORTS.desktop, messages: [{ clientId: 'physics', role: 'assistant', type: 'assistant', rawText: '```openui\nroot = Col([Simulation("Projectile lab", 20, 45, 10)])\n```', html: '' }] });
    const lab = page.getByRole('region', { name: 'Projectile lab' });
    await expect(lab).toBeVisible();
    const controls = lab.getByRole('slider');
    await expect(controls).toHaveCount(4);
    await controls.nth(0).focus(); await controls.nth(0).press('ArrowRight');
    await expect(controls.nth(0)).toHaveValue('21');
    await lab.getByRole('button').first().click();
    await expect.poll(async () => Number(await controls.last().inputValue())).toBeGreaterThan(0);
    await lab.getByRole('button').first().click();
    const paused = await controls.last().inputValue();
    await page.waitForTimeout(150);
    expect(await controls.last().inputValue()).toBe(paused);
    await lab.getByRole('button').last().click();
    await expect(controls.last()).toHaveValue('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/simulation-${encodeURIComponent(mode)}.png`, fullPage: true });
  });
}
