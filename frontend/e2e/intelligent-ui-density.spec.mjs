import { test, expect } from '@playwright/test';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';
const source = `root = Col([Title("波动实验", "lg"), Caption("拖动参数，观察波形变化。"), controls, Chart("line", [{x:"0",y:0},{x:"1",y:$a},{x:"2",y:0}], "x", ["y"]), Grid([Card([Title("频率"),Text($a + " Hz")]),Card([Title("波长"),Text($b + " cm")])])])
$a = 2
$b = 4
controls = Col([Slider($a,1,10,1,"频率"," Hz"),Slider($b,1,10,1,"振幅"," cm")],0)`;
for (const mode of ['light', 'dark', 'mobile']) {
  test(`compact borderless intelligence layout (${mode})`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(theme => localStorage.setItem('socrates-theme', theme), mode === 'dark' ? 'dark' : 'light');
    await prepareChatWorkbench(page, { lang: 'zh', viewport: WORKBENCH_VIEWPORTS[mode === 'mobile' ? 'mobile' : 'desktop'], messages: [{ clientId: 'density', role: 'assistant', type: 'assistant', rawText: '```openui\n' + source + '\n```' }] });
    const ui = page.locator('.intui-openui');
    await expect(ui).toBeVisible();
    await expect(page.locator('.intui-surface-shell')).toHaveCSS('border-top-width', '0px');
    for (const card of await ui.locator('.iui-card').all()) await expect(card).toHaveCSS('border-top-width', '0px');
    const sliders = ui.getByRole('slider');
    await expect(sliders.first()).toHaveValue('2');
    await expect(sliders.nth(1)).toHaveValue('4');
    await sliders.first().focus(); await sliders.first().press('ArrowRight');
    await expect(sliders.first()).toHaveValue('3');
    for (const slider of await ui.locator('.iui-slider').all()) {
      const rect = await slider.boundingBox();
      expect(rect.height).toBeLessThanOrEqual(48);
      expect(await slider.getByRole('slider').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `test-results/intui-density-${encodeURIComponent(mode)}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
