import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('composer tools visual baseline covers desktop and mobile themes and locales', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const menu = page.locator('#composerToolsMenu');
  const sizes = [
    { name: 'desktop', width: 1536, height: 868 },
    { name: 'mobile', width: 400, height: 890 },
  ];

  for (const size of sizes) {
    await page.setViewportSize({ width: size.width, height: size.height });
    for (const language of ['en', 'zh']) {
      for (const theme of ['dark', 'light']) {
        await page.evaluate(({ language: nextLanguage, theme: nextTheme }) => {
          window.setLang(nextLanguage);
          document.documentElement.setAttribute('data-mode', nextTheme);
        }, { language, theme });

        await page.locator('#topicComposerToolsBtn').click();
        await expect(menu).toBeVisible();
        await expect(menu.locator('.composer-tools-plugin-state')).toContainText(
          language === 'zh' ? '还没有已连接应用' : 'No connected apps yet',
        );
        await expect(menu).toHaveScreenshot(`composer-tools-${size.name}-${theme}-${language}.png`, {
          animations: 'disabled',
          caret: 'hide',
          maxDiffPixelRatio: 0.003,
        });
        await page.keyboard.press('Escape');
        await expect(menu).toHaveClass(/hidden/);
      }
    }
  }
});
