import { test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
import { prepareChatWorkbench, WORKBENCH_VIEWPORTS } from './_chat-workbench.mjs';

/* Temporary diagnostic: print the computed geometry the failing visual specs
   assert on, so the fixes can target the real winning cascade values. */
test('diag visual geometry', async ({ page }) => {
  const out = {};
  const info = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      w: Math.round(r.width * 100) / 100,
      h: Math.round(r.height * 100) / 100,
      minH: cs.minHeight,
      width: cs.width,
      height: cs.height,
      padding: cs.padding,
      border: cs.borderTopWidth,
      radius: cs.borderRadius,
      display: cs.display,
      fontSize: cs.fontSize,
      gridRows: cs.gridTemplateRows,
      gridCols: cs.gridTemplateColumns,
      bg: cs.backgroundColor,
      bgImage: cs.backgroundImage,
      color: cs.color,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
    };
  };

  try {
    await mockAuthedApp(page, { lang: 'zh' });
    await page.route('**/api/v2/suggestions/starters**', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        source: 'ai',
        suggestions: [{ id: 's1', prompt: '继续分析', icon: 'spark' }],
      }),
    }));
    await page.setViewportSize({ width: 1440, height: 960 });
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    out.landing = await page.evaluate((fn) => {
      // eslint-disable-next-line no-new-func
      const info = new Function('return ' + fn)();
      return {
        wrap: info('#topicInputWrap'),
        editorRoot: info('#topicInputWrap .composer-editor-root'),
        editor: info('#topicComposerRoot .rich-composer-editor'),
        prose: info('#topicComposerRoot .ProseMirror'),
        title: info('#topicTitle'),
        suggestion: info('.home-suggestion-btn'),
        suggestionWrapDisplay: (() => {
          const el = document.querySelector('.home-suggestions-wrap');
          return el ? getComputedStyle(el).display : null;
        })(),
      };
    }, info.toString());

    out.landingScaled = await page.evaluate(() => {
      document.documentElement.style.setProperty('--app-font-scale', '1.375');
      const title = document.getElementById('topicTitle');
      return title ? getComputedStyle(title).fontSize : null;
    });

    await page.evaluate(() => window.openExamPanel());
    out.exam = await page.evaluate(() => {
      const el = document.getElementById('newChatBtn');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        display: cs.display,
        visibility: cs.visibility,
        rects: el.getClientRects().length,
        parentDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : null,
        offsetParent: !!el.offsetParent,
      };
    });
    await page.evaluate(() => { document.documentElement.style.removeProperty('--app-font-scale'); });

    await prepareChatWorkbench(page, {
      messages: [
        { clientId: 'diag-u', role: 'user', rawText: 'hi', html: '<p>hi</p>', type: 'user' },
        { clientId: 'diag-a', role: 'assistant', rawText: 'yo', html: '<p>yo</p>', type: 'assistant' },
      ],
      viewport: WORKBENCH_VIEWPORTS.desktop,
    });
    out.chatIdle = await page.evaluate((fn) => {
      // eslint-disable-next-line no-new-func
      const info = new Function('return ' + fn)();
      return {
        wrap: info('#chatInputWrap'),
        send: info('#sendBtn'),
        attach: info('#chatComposerToolsBtn'),
        userBubble: info('#msgList .msg.user .msg-body'),
        bar: info('.chat-input-bar'),
        mainContent: info('.main-content'),
        sidebar: info('#sidebar'),
        menu: info('#composerToolsMenu'),
        effort: info('#chatInputWrap .effort-picker'),
      };
    }, info.toString());

    await page.locator('#chatComposerRoot .rich-composer-editor').click();
    await page.locator('#chatComposerRoot .rich-composer-editor').fill('one');
    await page.locator('#chatComposerRoot .rich-composer-editor').press('Shift+Enter');
    await page.locator('#chatComposerRoot .rich-composer-editor').type('two');
    await page.waitForTimeout(300);
    out.chatFocused = await page.evaluate((fn) => {
      // eslint-disable-next-line no-new-func
      const info = new Function('return ' + fn)();
      const wrap = document.getElementById('chatInputWrap');
      return {
        wrapClass: wrap ? wrap.className : null,
        wrap: info('#chatInputWrap'),
        send: info('#sendBtn'),
        attach: info('#chatComposerToolsBtn'),
        effort: info('#chatInputWrap .effort-picker'),
      };
    }, info.toString());

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => {
      document.documentElement.setAttribute('data-mode', 'light');
      document.getElementById('chatView')?.classList.add('hidden');
      document.getElementById('mainInner')?.classList.remove('hidden');
      document.getElementById('topicSetup')?.classList.remove('hidden');
      const sidebar = document.getElementById('sidebar');
      if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
    });
    await page.waitForTimeout(400);
    out.mobileLightLanding = await page.evaluate((fn) => {
      // eslint-disable-next-line no-new-func
      const info = new Function('return ' + fn)();
      return {
        bar: info('.chat-input-bar'),
        find: info('#findBtn'),
        share: info('#shareBtn'),
        sidebarOpen: info('#sidebarOpenBtn'),
        menu: info('#composerToolsMenu'),
        page: info('.main-content'),
        topicWrap: info('#topicInputWrap'),
        effort: info('#topicInputWrap .effort-picker'),
      };
    }, info.toString());

    await page.setViewportSize({ width: 420, height: 860 });
    await page.evaluate(() => {
      const sidebar = document.getElementById('sidebar');
      if (sidebar?.classList.contains('collapsed')) window.toggleSidebar?.();
    });
    await page.waitForTimeout(400);
    out.chips = await page.evaluate(() => {
      const el = document.querySelector('#recentsFilterChips');
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        display: cs.display,
        w: r.width,
        h: r.height,
        parentDisplay: el.parentElement ? getComputedStyle(el.parentElement).display : null,
        sidebarClass: document.getElementById('sidebar')?.className || null,
      };
    });
  } catch (error) {
    out.error = String((error && error.message) || error);
  }
  console.log('DIAG ' + JSON.stringify(out));
});
