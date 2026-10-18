import { test, expect } from '@playwright/test';
import { prepareChatWorkbench } from './_chat-workbench.mjs';
import { waitForAppShell } from './_mock-api.mjs';

const SESSION = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const JOB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REFINED = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const USER = { clientId: 'user-question', role: 'user', rawText: 'Research evidence', type: 'user' };

async function setup(page) {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
  await prepareChatWorkbench(page, { sessionId: SESSION, messages: [USER] });
  // Loaded sessions already have a title. Keep automatic title generation
  // outside the assertion that research performs no browser LLM/tool work.
  await page.evaluate(() => window.stateStore.dispatch({ type: 'state/set', key: 'sessionTitle', value: 'Research evidence' }));
  const state = { job: null, refinedJob: null, message: null, submissions: [], refinements: [], cursors: [], controls: [], failSubmit: false, holdResult: null, resultRequests: 0, browserTools: 0 };
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  await page.route('**/api/**/sessions**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const detail = url.pathname.match(/\/sessions\/([^/]+)$/);
    if (request.method() === 'POST') return json(route, { session: { id: request.postDataJSON().id || SESSION } });
    const session = { id: detail?.[1] || SESSION, title: 'Research evidence', topic: 'Research evidence', mode: 'chat', kind: 'chat', phase: 'chat', projectId: null,
      messages: detail?.[1] === OTHER ? [] : [USER, ...(state.message ? [state.message] : [])] };
    return json(route, detail ? session : { sessions: [session] });
  });
  await page.route('**/api/**/research-jobs**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname.endsWith('/research-jobs') && req.method() === 'POST') {
      const body = req.postDataJSON();
      state.submissions.push(body);
      state.job ||= { id: JOB, sessionId: body.sessionId, projectId: null, query: body.query, focus: null, status: 'queued', eventSequence: 1, plan: ['Clarify the research question', 'Compare relevant sources', 'Write a sourced report'], searched: 0, sourceCount: 0, resultArtifactId: null, error: null, attempts: 0,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null };
      if (state.failSubmit) { state.failSubmit = false; return route.abort('failed'); }
      return json(route, { job: state.job }, 202);
    }
    if (url.pathname.endsWith('/research-jobs')) return json(route, { jobs: url.searchParams.get('sessionId') === SESSION ? [state.job, state.refinedJob].filter(Boolean) : [] });
    if (url.pathname.endsWith('/events')) {
      const after = Number(req.headers()['last-event-id'] || 0);
      state.cursors.push(after);
      const eventJobId = url.pathname.match(/research-jobs\/([^/]+)\/events/)?.[1];
      const eventJob = eventJobId === REFINED ? state.refinedJob : state.job;
      const event = { jobId: eventJobId || JOB, sequence: eventJob?.eventSequence || 1, stage: eventJob?.status === 'succeeded' ? 'completed' : eventJob?.status || 'queued', status: eventJob?.status || 'queued' };
      return route.fulfill({ contentType: 'text/event-stream', body: event.sequence > after ? `id: ${event.sequence}\nevent: research_event\ndata: ${JSON.stringify(event)}\n\n` : ': keepalive\n\n' });
    }
    if (url.pathname.endsWith('/result')) {
      state.resultRequests++;
      if (state.holdResult) await state.holdResult;
      return json(route, { message: state.message });
    }
    const refine = url.pathname.endsWith('/refine');
    if (refine) {
      const body = req.postDataJSON();
      state.controls.push('refine');
      state.refinements.push(body.instruction);
      state.job.status = 'cancelled';
      state.job.eventSequence++;
      state.refinedJob = { ...state.job, id: REFINED, status: 'queued', eventSequence: 1, focus: body.instruction, plan: ['Clarify the research question', 'Compare relevant sources', 'Write a sourced report'], searched: 0, sourceCount: 0 };
      return json(route, { job: state.refinedJob, previous: state.job }, 202);
    }
    const action = url.pathname.match(/\/(cancel|retry)$/)?.[1];
    if (action) {
      state.controls.push(action);
      state.job.status = action === 'cancel' ? 'cancelled' : 'queued';
      state.job.error = null;
      state.job.eventSequence++;
      return json(route, { job: state.job }, action === 'retry' ? 202 : 200);
    }
    return json(route, { job: state.job });
  });
  await page.route(/\/api\/(?:v2\/)?(?:chat(?:\/stream)?|web-search|fetch-batch)(?:\?|$)/, async (route) => {
    state.browserTools++;
    await json(route, { error: 'Research must execute on the server' }, 500);
  });
  state.complete = () => {
    Object.assign(state.job, { status: 'succeeded', eventSequence: state.job.eventSequence + 1, resultArtifactId: 'artifact', sourceCount: 2 });
    state.message = { id: JOB, clientId: `research-${JOB}`, role: 'assistant', type: 'assistant', content: 'Persistent research report sentinel', rawText: 'Persistent research report sentinel' };
  };
  return state;
}

test('submits a durable task, shows reconnecting state and supports cancel/retry in both languages', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  await expect(page.getByRole('button', { name: 'Cancel research', exact: true })).toBeVisible();
  await expect(page.locator('.research-plan-panel')).toBeVisible();
  await expect(page.locator('.research-plan-title')).toHaveText('Plan');
  await expect(page.locator('.research-plan-step').first()).toContainText('Clarify the research question');
  expect(state.submissions).toHaveLength(1);
  expect(state.submissions[0]).toMatchObject({ sessionId: SESSION, query: 'Research evidence' });
  expect(state.submissions[0].idempotencyKey).toBeTruthy();
  expect(state.browserTools).toBe(0);
  await expect(page.locator('.research-jobs')).toContainText('Reconnecting');
  await page.screenshot({ path: 'test-results/research-running-desktop-light.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Cancel research', exact: true }).click();
  await expect(page.locator('.research-jobs')).toContainText('Research cancelled');
  await expect(page.getByRole('button', { name: 'Retry research', exact: true })).toBeVisible();
  await page.evaluate(() => window.setLang('zh'));
  await expect(page.getByRole('button', { name: '重试研究', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '重试研究', exact: true }).click();
  await expect(page.getByRole('button', { name: '取消研究', exact: true })).toBeVisible();
  expect(state.controls).toEqual(['cancel', 'retry']);
  expect(state.submissions).toHaveLength(1);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.toggleTheme());
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.screenshot({ path: 'test-results/research-running-mobile-dark.png', animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a lost submission response retries the same key and reports appear once after reload', async ({ page }) => {
  const state = await setup(page);
  state.failSubmit = true;
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  await page.getByRole('button', { name: 'Resume submission', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel research', exact: true })).toBeVisible();
  expect(state.submissions).toHaveLength(2);
  expect(state.submissions[0].idempotencyKey).toBe(state.submissions[1].idempotencyKey);
  state.complete();
  await expect(page.locator('#msgList')).toContainText('Persistent research report sentinel');
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);
  await page.reload();
  await waitForAppShell(page);
  await page.evaluate((id) => window.loadSession(id), SESSION);
  await expect(page.locator('#msgList')).toContainText('Persistent research report sentinel');
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);
  expect(state.submissions).toHaveLength(2);
  expect(state.browserTools).toBe(0);
});

test('a delayed result cannot enter another session and is recovered when its session reopens', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  let release;
  state.holdResult = new Promise((resolve) => { release = resolve; });
  state.complete();
  await expect.poll(() => state.resultRequests).toBeGreaterThan(0);
  await page.evaluate((id) => window.loadSession(id), OTHER);
  release();
  await expect(page.locator('#msgList')).not.toContainText('Persistent research report sentinel');
  await expect(page.locator('.research-jobs')).toHaveCount(0);
  await page.evaluate((id) => window.loadSession(id), SESSION);
  await expect(page.locator('#msgList')).toContainText('Persistent research report sentinel');
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);
});

test('unloading the page leaves the task running and reopening restores its completed report', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  await expect(page.getByRole('button', { name: 'Cancel research', exact: true })).toBeVisible();
  await page.goto('about:blank');
  expect(state.job.status).toBe('queued');
  state.complete();
  await page.goto('/');
  await waitForAppShell(page);
  await page.evaluate((id) => window.loadSession(id), SESSION);
  await expect(page.locator('#msgList')).toContainText('Persistent research report sentinel');
  await expect(page.locator('#msgList .msg.assistant')).toHaveCount(1);
  expect(state.submissions).toHaveLength(1);
  expect(state.controls).toEqual([]);
});

test('failed research retains a visible reason and retries the same task', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  Object.assign(state.job, { status: 'failed', error: 'research_no_sources', eventSequence: 2 });
  await expect(page.locator('.research-job-error')).toContainText('No usable sources');
  await page.evaluate(() => window.toggleTheme());
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'dark');
  await page.screenshot({ path: 'test-results/research-failed-desktop-dark.png', animations: 'disabled' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.toggleTheme());
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light');
  await page.screenshot({ path: 'test-results/research-failed-mobile-light.png', animations: 'disabled' });
  await page.getByRole('button', { name: 'Retry research', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel research', exact: true })).toBeVisible();
  expect(state.controls).toEqual(['retry']);
  expect(state.submissions).toHaveLength(1);
});

test('adjusting focus cancels the current run and shows the replacement focus', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  await page.getByRole('button', { name: 'Adjust focus', exact: true }).click();
  await expect(page.getByLabel('What should the next research run focus on?')).toBeVisible();
  await page.getByLabel('What should the next research run focus on?').fill('Compare primary sources and call out disagreements.');
  await page.getByRole('button', { name: 'Run with this focus', exact: true }).click();
  await expect(page.locator('.research-job-focus')).toContainText('Compare primary sources and call out disagreements.');
  expect(state.controls).toEqual(['refine']);
  expect(state.refinements).toEqual(['Compare primary sources and call out disagreements.']);
  await expect(page.locator('[data-research-status="cancelled"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adjust focus', exact: true })).toBeVisible();
});

test('completed research opens a report workspace with plan, sources and activity sections', async ({ page }) => {
  const state = await setup(page);
  await page.evaluate(() => window.startDeepResearch('Research evidence'));
  state.complete();
  await expect(page.locator('#msgList')).toContainText('Persistent research report sentinel');
  await page.getByRole('button', { name: 'Open report', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Research evidence' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Persistent research report sentinel');
  await expect(dialog.locator('#research-report-plan')).toContainText('Clarify the research question');
  await expect(dialog.locator('#research-report-sources')).toContainText('Sources are attached to the report.');
  await expect(dialog.locator('#research-report-activity')).toContainText('Completed');
  await page.screenshot({ path: 'test-results/research-report-workspace-desktop.png', animations: 'disabled' });
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toBeHidden();
});
