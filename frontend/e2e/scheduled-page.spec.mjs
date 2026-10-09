import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const SCHEDULED_TASKS = [
  {
    id: 'task-active',
    title: 'Morning briefing',
    prompt: 'Summarize my newsletter and saved topics.',
    frequency: 'daily',
    nextRunAt: '2026-10-10T08:00:00.000Z',
    status: 'active',
    lastRunAt: null,
    runCount: 0,
  },
  {
    id: 'task-paused',
    title: 'Weekly research pulse',
    prompt: 'Compare new work on robotics.',
    frequency: 'weekly',
    nextRunAt: null,
    status: 'paused',
    lastRunAt: '2026-10-08T08:00:00.000Z',
    runCount: 1,
  },
  {
    id: 'task-completed',
    title: 'Project review',
    prompt: 'Review my project milestone.',
    frequency: 'once',
    nextRunAt: null,
    status: 'completed',
    lastRunAt: '2026-10-07T08:00:00.000Z',
    runCount: 1,
  },
];

test('scheduled task list searches, filters active tasks, and dispatches row actions', async ({ page }) => {
  await mockAuthedApp(page, { lang: 'en' });
  let tasks = SCHEDULED_TASKS.map((task) => ({ ...task }));
  const runRequests = [];

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v2/', '/api/');
    if (path === '/api/scheduled-tasks' && request.method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tasks }) });
      return;
    }
    const runMatch = path.match(/\/api\/scheduled-tasks\/([^/]+)\/run$/);
    if (runMatch && request.method() === 'POST') {
      runRequests.push(decodeURIComponent(runMatch[1]));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    const taskMatch = path.match(/\/api\/scheduled-tasks\/([^/]+)$/);
    if (taskMatch && request.method() === 'PATCH') {
      const patch = request.postDataJSON();
      tasks = tasks.map((task) => task.id === decodeURIComponent(taskMatch[1]) ? { ...task, ...patch } : task);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
      return;
    }
    await route.fallback();
  });

  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navScheduled').click();
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await expect(page.locator('.task-row')).toHaveCount(3);

  const search = page.locator('.workspace-search-field input');
  await search.fill('newsletter');
  await expect(page.locator('.task-row')).toHaveCount(1);
  await expect(page.locator('.task-row')).toContainText('Morning briefing');
  await search.fill('');

  await page.locator('.scheduled-filter-tabs [role="tab"]').nth(1).click();
  await expect(page.locator('.task-row')).toHaveCount(1);
  await expect(page.locator('.task-row')).toContainText('Morning briefing');

  const runRequest = page.waitForRequest((request) =>
    request.method() === 'POST' && /\/api\/(v2\/)?scheduled-tasks\/task-active\/run(?:\?|$)/.test(request.url()),
  );
  await page.getByRole('button', { name: 'Run task now' }).click();
  await runRequest;
  await expect.poll(() => runRequests).toEqual(['task-active']);

  await page.locator('.task-row .workspace-row-action').nth(1).click();
  await expect(page.locator('.workspace-empty')).toContainText('No active tasks');
  await expect(page.locator('.task-row')).toHaveCount(0);
});
