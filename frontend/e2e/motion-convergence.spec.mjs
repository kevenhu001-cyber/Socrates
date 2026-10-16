import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test.beforeEach(async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
});

test('desktop sidebar commits layout once and animates the main surface with transform', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });

  const result = await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    const main = document.querySelector('#appShell .main');
    if (!(sidebar instanceof HTMLElement) || !(main instanceof HTMLElement)) return null;

    sidebar.classList.remove('collapsed');
    main.getAnimations().forEach((animation) => animation.cancel());

    const beforeInset = Number.parseFloat(getComputedStyle(main).paddingLeft);
    window.toggleSidebar?.();

    const afterInset = Number.parseFloat(getComputedStyle(main).paddingLeft);
    const sidebarTransition = getComputedStyle(sidebar).transitionDuration;
    const mainTransition = getComputedStyle(main).transitionDuration;
    const animations = main.getAnimations().map((animation) => ({
      duration: Number(animation.effect?.getTiming().duration || 0),
      keyframes: animation.effect instanceof KeyframeEffect
        ? animation.effect.getKeyframes().map((frame) => String(frame.transform || ''))
        : [],
    }));

    return { beforeInset, afterInset, sidebarTransition, mainTransition, animations };
  });

  expect(result).not.toBeNull();
  expect(result.beforeInset - result.afterInset).toBeGreaterThan(100);
  expect(result.sidebarTransition).toMatch(/^0s(?:, 0s)*$/);
  expect(result.mainTransition).toMatch(/^0s(?:, 0s)*$/);
  const spatial = result.animations.find((animation) => animation.keyframes.join(' ').includes('translateX'));
  expect(spatial).toBeTruthy();
  expect(spatial.duration).toBe(180);
});

test('thinking, tools and recording share one primary persistent cue', async ({ page }) => {
  const normal = await page.evaluate(() => {
    const shell = document.getElementById('appShell');
    if (!shell) return null;
    const fixture = document.createElement('div');
    fixture.id = 'motion-convergence-fixture';
    fixture.innerHTML = `
      <div class="thinking-status">
        <span class="tool-inline-tool-icon"></span>
        <span class="thinking-status-label shimmer-text">Thinking</span>
      </div>
      <details class="tool-inline" data-state="running">
        <summary class="tool-inline-head">
          <span class="tool-inline-tool-icon"></span>
          <span class="tool-inline-label shimmer-text">Searching</span>
        </summary>
      </details>
      <div class="tool-run-group" data-state="running">
        <button class="tool-run-summary">
          <span class="tool-run-summary-icon"></span>
          <span class="tool-run-summary-label shimmer-text">Reading sources</span>
        </button>
      </div>
      <div class="agent-step" data-state="running">
        <span class="agent-step-icon"></span>
        <span class="agent-step-label shimmer-text">Running command</span>
      </div>
      <span class="voice-recording-indicator"></span>
    `;
    shell.appendChild(fixture);

    const animation = (selector, pseudo) => {
      const node = fixture.querySelector(selector);
      return node ? getComputedStyle(node, pseudo).animationName : null;
    };
    const thinking = fixture.querySelector('.thinking-status-label');

    return {
      thinkingLabel: animation('.thinking-status-label'),
      thinkingIcon: animation('.thinking-status .tool-inline-tool-icon'),
      thinkingBackground: thinking ? getComputedStyle(thinking).backgroundImage : null,
      inlineLabel: animation('.tool-inline-label'),
      inlineIcon: animation('.tool-inline .tool-inline-tool-icon'),
      groupLabel: animation('.tool-run-summary-label'),
      groupIcon: animation('.tool-run-summary-icon'),
      agentLabel: animation('.agent-step-label'),
      agentIcon: animation('.agent-step-icon'),
      voiceCore: animation('.voice-recording-indicator'),
      voiceHalo: animation('.voice-recording-indicator', '::after'),
    };
  });

  expect(normal).not.toBeNull();
  expect(normal.thinkingLabel).toBe('ui-activity-shimmer');
  expect(normal.thinkingIcon).toBe('none');
  expect(normal.thinkingBackground).toContain('linear-gradient');
  expect(normal.inlineLabel).toBe('ui-activity-shimmer');
  expect(normal.inlineIcon).toBe('none');
  expect(normal.groupLabel).toBe('ui-activity-shimmer');
  expect(normal.groupIcon).toBe('none');
  expect(normal.agentLabel).toBe('ui-activity-shimmer');
  expect(normal.agentIcon).toBe('none');
  expect(normal.voiceCore).toBe('none');
  expect(normal.voiceHalo).toBe('ui-recording-ring');

  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reduced = await page.evaluate(() => {
    const fixture = document.getElementById('motion-convergence-fixture');
    if (!fixture) return null;
    const animation = (selector, pseudo) => {
      const node = fixture.querySelector(selector);
      return node ? getComputedStyle(node, pseudo).animationName : null;
    };
    const thinking = fixture.querySelector('.thinking-status-label');
    return {
      thinking: animation('.thinking-status-label'),
      inline: animation('.tool-inline-label'),
      group: animation('.tool-run-summary-label'),
      agent: animation('.agent-step-label'),
      voiceHalo: animation('.voice-recording-indicator', '::after'),
      fill: thinking ? getComputedStyle(thinking).webkitTextFillColor : null,
    };
  });

  expect(reduced).not.toBeNull();
  expect(reduced.thinking).toBe('none');
  expect(reduced.inline).toBe('none');
  expect(reduced.group).toBe('none');
  expect(reduced.agent).toBe('none');
  expect(reduced.voiceHalo).toBe('none');
  expect(reduced.fill).not.toBe('transparent');
});
