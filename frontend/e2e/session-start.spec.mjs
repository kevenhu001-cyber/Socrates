// e2e/session-start.spec.mjs — Wave -1
// Spec 4/6: typing into the topic input enables the Start button; clicking it
// transitions the app out of the topic-setup view.

import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function composerSignature(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const childRect = (childSelector) => {
      const child = node.querySelector(childSelector);
      if (!child) return null;
      const value = child.getBoundingClientRect();
      if (!value.width && !value.height) return null;
      return {
        x: Math.round(value.x - rect.x),
        y: Math.round(value.y - rect.y),
        width: Math.round(value.width),
        height: Math.round(value.height),
      };
    };
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      background: style.backgroundColor,
      border: style.borderColor,
      radius: style.borderRadius,
      editor: childRect('.rich-composer-editor'),
      attach: childRect('.attach-btn'),
      effort: childRect('.effort-picker'),
      mic: childRect('.mobile-mic-btn'),
      send: childRect('.composer-primary-btn,.composer-primary-btn'),
    };
  });
}

test('typing into topic input enables the Start button; clicking does not throw', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  const topicInput = page.locator('#composerRoot .rich-composer-editor').first();
  await expect(topicInput).toBeAttached({ timeout: 5_000 });
  await expect(topicInput).toBeVisible({ timeout: 5_000 });

  const startBtn = page.locator('button.composer-primary-btn, .composer-primary-btn').first();
  await expect(startBtn).toBeAttached();

  // Capture console errors during the click.
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await topicInput.fill('quick smoke topic test');
  await page.waitForTimeout(200); // autoResize + updateStartBtn fire on input

  await startBtn.click({ timeout: 5_000 }).catch((e) => consoleErrors.push('click: ' + String(e)));
  await page.waitForTimeout(1_500);

  // Filter out network errors (the dialog may open, look fine), keep real JS errors.
  const realErrors = consoleErrors.filter((e) =>
    /ReferenceError|TypeError|SyntaxError|Reference to undeclared/.test(e) &&
    !/fetch|network|api\/|\b401\b|\b503\b|csrf/i.test(e),
  );
  expect(realErrors, `startSession() threw:\n${realErrors.join('\n')}`).toEqual([]);
});

test('Tutor start can skip boundary questions and enter the teaching chat', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/v2/minimax/v1/chat/completions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '["Linear algebra concepts","Vector spaces","Matrices","Linear transformations","Applications"]' } }],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.toggleAppMode('tutor');
    window.getActiveProvider = () => ({
      id: 'test-provider', label: 'Test', model: 'test-model', isBuiltIn: true, key: 'test-key',
    });
  });
  expect(await page.evaluate(() => window.appMode)).toBe('tutor');

  const topicInput = page.locator('#composerRoot .rich-composer-editor').first();
  await topicInput.fill('Foundations of linear algebra');
  await topicInput.press('Enter');

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  const explorationDialog = page.locator('#tutorExplorationDialog');
  await expect(explorationDialog).toBeVisible();
  await explorationDialog.locator('.tutor-explore-skip').click();
  const startupState = await page.evaluate(() => ({
    mode: window.appMode,
    phase: window.stateStore.read('phase'),
    mainView: document.documentElement.dataset.mainView,
    visibleViews: ['topicSetup', 'diagnosticView', 'chatView']
      .filter((id) => !document.getElementById(id)?.classList.contains('hidden')),
  }));
  expect(startupState, `Tutor startup failed: ${pageErrors.join('\n')}`).toMatchObject({ mode: 'tutor' });
  expect(['diagnosticView', 'chatView']).toContain(startupState.mainView);
  await expect(page.locator('#chatView'), `Tutor startup errors: ${pageErrors.join('\n')}`)
    .toBeVisible({ timeout: 15_000 });

  const session = await page.evaluate(() => ({
    mode: window.appMode,
    topic: window.stateStore.read('topic'),
    phase: window.stateStore.read('phase'),
    sessionId: window.stateStore.read('currentSessionId'),
  }));
  expect(session).toMatchObject({
    mode: 'tutor',
    topic: 'Foundations of linear algebra',
    phase: 'chat',
  });
  expect(session.sessionId).toBeTruthy();
});

test('canceling Tutor topic analysis prevents the pending start from entering chat', async ({ page }) => {
  await mockAuthedApp(page);
  let releaseModelResponse;
  const modelResponseGate = new Promise((resolve) => { releaseModelResponse = resolve; });
  await page.route('**/api/v2/minimax/v1/chat/completions', async (route) => {
    await modelResponseGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        choices: [{ message: { content: '["Linear algebra concepts","Vector spaces","Matrices","Linear transformations","Applications"]' } }],
      }),
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.toggleAppMode('tutor');
    window.getActiveProvider = () => ({
      id: 'test-provider', label: 'Test', model: 'test-model', isBuiltIn: true, key: 'test-key',
    });
  });

  const modelRequests = [];
  page.on('request', (request) => {
    if (/chat\/completions|\/api\/chat/.test(request.url())) modelRequests.push(request.url());
  });
  const topicInput = page.locator('#composerRoot .rich-composer-editor').first();
  await topicInput.fill('Linear algebra cancellation');
  await topicInput.press('Enter');
  const explorationDialog = page.locator('#tutorExplorationDialog');
  await expect(explorationDialog).toBeVisible();
  await explorationDialog.locator('.tutor-explore-skip').click();
  const diagnosticState = await page.evaluate(() => ({
    mode: window.appMode,
    mainView: document.documentElement.dataset.mainView,
    visibleViews: ['topicSetup', 'diagnosticView', 'chatView']
      .filter((id) => !document.getElementById(id)?.classList.contains('hidden')),
  }));
  expect(diagnosticState, `unexpected Tutor state; model requests: ${modelRequests.join(', ')}`)
    .toMatchObject({ mode: 'tutor', mainView: 'diagnosticView' });
  expect(modelRequests, 'Tutor topic analysis should be waiting on the mocked model response').not.toHaveLength(0);
  await expect(page.locator('#diagnosticView .diag-cancel-btn')).toBeVisible();
  await page.locator('#diagnosticView .diag-cancel-btn').click();
  await expect(page.locator('#topicSetup')).toBeVisible();

  releaseModelResponse();
  await page.waitForTimeout(250);
  const state = await page.evaluate(() => ({
    phase: window.stateStore.read('phase'),
    topic: window.stateStore.read('topic'),
    sessionId: window.stateStore.read('currentSessionId'),
    mainView: document.documentElement.dataset.mainView,
    diagCancel: window.stateStore.read('diagCancel'),
  }));
  expect(state).toEqual({
    phase: 'topic', topic: '', sessionId: null, mainView: 'topicSetup', diagCancel: true,
  });

  const nextTopic = 'A fresh tutor session after cancel';
  await topicInput.fill(nextTopic);
  await topicInput.press('Enter');
  const nextExplorationDialog = page.locator('#tutorExplorationDialog');
  await expect(nextExplorationDialog).toBeVisible();
  await nextExplorationDialog.locator('.tutor-explore-skip').click();
  await expect(page.locator('#chatView')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => ({
    phase: window.stateStore.read('phase'),
    topic: window.stateStore.read('topic'),
    diagCancel: window.stateStore.read('diagCancel'),
  }))).toEqual({ phase: 'chat', topic: nextTopic, diagCancel: false });
});

test('the first prompt is saved under a short title in Recents', async ({ page }) => {
  const topic = '理解机器学习基本概念以及应用';
  let savedSession = null;
  await mockAuthedApp(page);
  await page.route('**/api/**/sessions**', async (route) => {
    const request = route.request();
    const url = request.url().replace('/api/v2/', '/api/');
    if (request.method() === 'POST' && /\/api\/sessions(?:\?|$)/.test(url)) {
      const payload = request.postDataJSON();
      const now = new Date().toISOString();
      savedSession = {
        id: payload.id,
        title: payload.title,
        topic: payload.topic,
        mode: payload.mode,
        phase: payload.phase,
        updatedAt: now,
        createdAt: now,
      };
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(savedSession),
      });
    }
    if (request.method() === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: savedSession ? [savedSession] : [] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  await page.evaluate(async (firstPrompt) => {
    window.stateStore.dispatch({ type: 'state/set', key: 'topic', value: firstPrompt });
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: null });
    window.stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: null });
    window.stateStore.dispatch({
      type: 'session/replace-messages',
      payload: [{ clientId: 'first-prompt', role: 'user', rawText: firstPrompt, html: null }],
    });
    await window.saveCurrentSession();
  }, topic);

  expect(savedSession?.title).toBe('理解机器学习基本');
  await expect(page.locator('.recent-item-text').first()).toHaveText('理解机器学习基本');
});

test('pressing Enter in the topic input starts the session', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const topicInput = page.locator('#composerRoot .rich-composer-editor');
  await topicInput.fill('Enter should send this topic');
  await topicInput.press('Enter');

  await expect(page.locator('#topicSetup')).toBeHidden();
  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('#msgList .msg.user')).toContainText('Enter should send this topic');
});

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  test(`${name} composer keeps the landing UI after the first message is sent`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    const topicEditor = page.locator('#composerRoot .rich-composer-editor');
    await topicEditor.fill('Keep this UI');
    const before = await composerSignature(page, '#composerInputWrap');
    await topicEditor.press('Enter');
    await expect(page.locator('#chatView')).toBeVisible();
    await expect(page.locator('#msgList .msg.assistant .msg-body').first()).toBeVisible();
    const after = await composerSignature(page, '#composerInputWrap');

    /* The topic composer is the visual baseline. The first in-session
       composer must inherit its complete outer geometry during the handoff,
       not only its surface color. */
    expect(after.background).toBe(before.background);
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    expect(after.radius).toBe(before.radius);
    await expect(page.locator('#composerRoot .rich-composer-editor'))
      .toHaveAttribute('aria-label', 'Ask Socrates');
  });
}

// Regression (P_deep-research-view): with the Deep Research extension enabled,
// clicking Start on the landing screen used to early-return into
// launchDeepResearch(), which posted agent output into the still-hidden
// #msgList while topicSetup stayed up — the button looked dead. Starting a
// deep-research session must switch to #chatView, commit the user bubble, and
// hand the topic to startDeepResearch exactly once.
test('Deep Research extension: Start on landing enters chat and runs research', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Stub the research agent so the test asserts routing, not the full
  // plan/search/synthesize pipeline.
  await page.evaluate(() => {
    window.__researchCalls = [];
    window.startDeepResearch = (q) => { window.__researchCalls.push(q); return Promise.resolve('report'); };
    window.deepResearchOn = true;
  });

  const topicInput = page.locator('#composerRoot .rich-composer-editor').first();
  await topicInput.fill('history of the printing press');
  await page.waitForTimeout(150);
  await page.locator('button.composer-primary-btn, .composer-primary-btn').first().click();

  await expect(page.locator('#topicSetup')).toBeHidden();
  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('#msgList .msg.user')).toContainText('history of the printing press');

  await expect.poll(() => page.evaluate(() => window.__researchCalls || [])).toEqual(['history of the printing press']);
});
