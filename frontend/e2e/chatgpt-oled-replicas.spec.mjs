import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

const REFERENCE_CONNECTORS = [
  { id: 'gmail', name: 'Gmail', description: 'Read and manage Gmail', capabilities: ['Mail'], authType: 'oauth', connection: null },
  { id: 'health', name: 'Health', description: 'Explore your health data in ChatGPT', capabilities: ['Health'], authType: 'oauth', connection: null },
  { id: 'googledrive', name: 'Google Drive', description: 'Drive, Docs, Sheets or Slides', capabilities: ['Files'], authType: 'oauth', connection: null },
  { id: 'github', name: 'GitHub', description: 'Triage PRs, issues, CI, and publish flows', capabilities: ['Repositories', 'Issues'], authType: 'oauth', connection: { status: 'connected', displayName: 'Study org' } },
  { id: 'supabase', name: 'Supabase', description: 'Manage and query databases', capabilities: ['Databases'], authType: 'oauth', connection: null },
  { id: 'calendar', name: 'Calendar', authType: 'oauth', connection: { status: 'connected' } },
  { id: 'zapier', name: 'Zapier', authType: 'oauth', connection: { status: 'connected' } },
  { id: 'thumbsup', name: 'Social', authType: 'oauth', connection: { status: 'connected' } },
  { id: 'workflow', name: 'Workflow', authType: 'oauth', connection: { status: 'connected' } },
  { id: 'microsoft', name: 'Microsoft', authType: 'oauth', connection: { status: 'connected' } },
  { id: 'vercel', name: 'Vercel', authType: 'oauth', connection: { status: 'connected' } },
  { id: 'discord', name: 'Discord', description: 'Chat and community integration', authType: 'oauth', connection: null },
  { id: 'asana', name: 'Asana', description: 'Manage projects and tasks', authType: 'oauth', connection: null },
  { id: 'airtable', name: 'Airtable', description: 'Connect bases and workflows', authType: 'oauth', connection: null },
  { id: 'jira', name: 'Jira', description: 'Track bugs and manage sprints', authType: 'oauth', connection: null },
  { id: 'cloudflare', name: 'Cloudflare', description: 'Manage DNS and workers', authType: 'oauth', connection: null },
  { id: 'deepseek', name: 'DeepSeek', description: 'Code and reasoning models', authType: 'oauth', connection: null },
  { id: 'perplexity', name: 'Perplexity', description: 'Live web search and research', authType: 'oauth', connection: null },
  { id: 'elevenlabs', name: 'ElevenLabs', description: 'Voice synthesis and audio tools', authType: 'oauth', connection: null },
  { id: 'pipedrive', name: 'Pipedrive', description: 'Sales CRM and pipeline', authType: 'oauth', connection: null },
  { id: 'zendesk', name: 'Zendesk', description: 'Customer service platform', authType: 'oauth', connection: null },
  { id: 'airbrake', name: 'Airbrake', description: 'Error monitoring and exceptions', authType: 'oauth', connection: null },
  { id: 'chatbotkit', name: 'ChatBotKit', description: 'Conversational AI platform', authType: 'oauth', connection: null },
  { id: 'deck_co', name: 'Deck.co', description: 'Pitch decks and slides', authType: 'oauth', connection: null },
  { id: 'emaillistverify', name: 'EmailListVerify', description: 'Verify email deliverability', authType: 'oauth', connection: null },
  { id: 'agenty', name: 'Agenty', description: 'Web scraping and automation', authType: 'oauth', connection: null },
  { id: 'neteasemail', name: 'NetEase Mail', description: 'NetEase 163 mailbox', authType: 'oauth', connection: null },
  { id: 'data247', name: 'Data247', description: 'Phone and address verification', authType: 'oauth', connection: null },
  { id: 'monday', name: 'Monday.com', description: 'Work management platform', authType: 'oauth', connection: null },
  { id: 'onedrive', name: 'OneDrive', description: 'Cloud file storage', authType: 'oauth', connection: null },
];

const MOCK_SESSIONS = [
  { id: 's-1', title: '如何用 Python 实现快速排序', updatedAt: '2026-10-02T10:00:00Z', pinned: false },
  { id: 's-2', title: '现代 UI 设计原则与色彩系统', updatedAt: '2026-10-01T15:00:00Z', pinned: false },
  { id: 's-3', title: '考研英语长难句深度解析', updatedAt: '2026-09-30T09:00:00Z', pinned: false },
];

const MOCK_FILES = [
  { id: 'f-1', name: '2024-03-24.html', kind: 'html', size: 104857, uploadedAt: new Date(Date.now() - 2 * 86400000).toISOString() },
  { id: 'f-2', name: '2024-03-23.html', kind: 'html', size: 85200, uploadedAt: new Date(Date.now() - 3 * 86400000).toISOString() },
  { id: 'f-3', name: 'screenshot.png', kind: 'image', size: 245760, uploadedAt: new Date(Date.now() - 5 * 86400000).toISOString() },
  { id: 'f-4', name: 'project_notes.docx', kind: 'doc', size: 45000, uploadedAt: new Date(Date.now() - 6 * 86400000).toISOString() },
  { id: 'f-5', name: 'api_config.json', kind: 'code', size: 12000, uploadedAt: new Date(Date.now() - 7 * 86400000).toISOString() },
  { id: 'f-6', name: 'quarterly_metrics.csv', kind: 'xlsx', size: 68000, uploadedAt: new Date(Date.now() - 8 * 86400000).toISOString() },
];

async function mockReplicas(page) {
  await mockAuthedApp(page, { lang: 'zh' });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    const apiUrl = url.replace('/api/v2/', '/api/');

    if (apiUrl.includes('/api/sessions')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: MOCK_SESSIONS }),
      });
      return;
    }
    if (apiUrl.includes('/api/files')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: MOCK_FILES }),
      });
      return;
    }
    if (apiUrl.includes('/api/artifacts')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ artifacts: [] }),
      });
      return;
    }
    if (apiUrl.includes('/api/projects')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects: [{ id: 'socrates', name: 'Socrates', description: '学习对话项目', color: '#7c9cff', createdAt: '2026-07-29T00:00:00.000Z' }] }),
      });
      return;
    }
    if (apiUrl.includes('project-connectors')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ configured: true, connectors: REFERENCE_CONNECTORS }),
      });
      return;
    }
    await route.fallback();
  });
}

test('capture all 5 reference replica screens on mobile OLED', async ({ page }) => {
  await mockReplicas(page);
  await page.setViewportSize({ width: 390, height: 844 });

  // 1. Mobile Landing Home (Image 1)
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !sidebar.classList.contains('collapsed')) window.toggleSidebar?.();
  });
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#composerInputWrap')).toBeVisible();
  await page.screenshot({ path: 'test-results/replica-1-mobile-home.png' });

  // 2. Mobile Sidebar Drawer (Image 2)
  await page.locator('#sidebarOpenBtn').click();
  await expect(page.locator('#sidebar')).not.toHaveClass(/collapsed/);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-2-mobile-sidebar.png' });

  // 3. Mobile Context Menu Popover (Image 3)
  const firstItem = page.locator('.recent-item').first();
  await expect(firstItem).toBeVisible();
  const dotsBtn = firstItem.locator('.recent-item-overflow');
  await dotsBtn.click();
  await expect(firstItem.locator('.recent-item-menu')).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/replica-3-mobile-context-menu.png' });

  // Close context menu & navigate to plugins
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.getElementById('navPlugins')?.click());
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugins.png' });

  // Scroll down to inspect more connector icons (Discord, Asana, Airtable, Jira, etc.)
  await page.locator('[data-connector-id="discord"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugins-scroll1.png' });

  await page.locator('[data-connector-id="chatbotkit"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugins-scroll2.png' });

  await page.locator('[data-connector-id="data247"]').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugins-scroll3.png' });

  // 4b. Plugin Detail View (Gmail)
  await page.locator('[data-connector-id="gmail"]').scrollIntoViewIfNeeded();
  await page.locator('[data-connector-id="gmail"]').click();
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await expect(page.locator('#plugin-detail-title')).toHaveText('Gmail');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugin-detail-gmail.png' });

  // Scroll down in detail view to see prompts and permissions
  await page.locator('.plugin-detail-security-card').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugin-detail-gmail-scroll.png' });

  // Test back navigation
  await page.locator('.plugin-detail-back-btn').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();

  // Test GitHub detail view
  await page.locator('[data-connector-id="github"]').click();
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await expect(page.locator('#plugin-detail-title')).toHaveText('GitHub');
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-4-mobile-plugin-detail-github.png' });
  await page.locator('.plugin-detail-back-btn').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();

  // 5. Mobile Library Page (Image 5)
  await page.evaluate(() => document.getElementById('navLibrary')?.click());
  await expect(page.locator('.library-directory')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/replica-5-mobile-library.png' });
});

test('capture plugin detail screen on desktop OLED', async ({ page }) => {
  await mockReplicas(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.evaluate(() => document.getElementById('navPlugins')?.click());
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.locator('[data-connector-id="gmail"]').click();
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'test-results/replica-desktop-plugin-detail-gmail.png' });

  // Test Asana detail view
  await page.locator('.plugin-detail-back-btn').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.locator('[data-connector-id="asana"]').click();
  await expect(page.locator('.plugin-detail-view')).toBeVisible();
  await expect(page.locator('#plugin-detail-title')).toHaveText('Asana');
  // Verify '关于此插件' has rich intro text
  const asanaDesc = await page.locator('.plugin-detail-desc').textContent();
  expect(asanaDesc?.length).toBeGreaterThan(30);
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test-results/replica-desktop-plugin-detail-asana.png' });
});

test('verify loading animation on plugins and projects pages', async ({ page }) => {
  await mockReplicas(page);
  // Add realistic network delay to observe loading animations
  await page.route('**/api/**project-connectors*', async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ configured: true, connectors: REFERENCE_CONNECTORS }),
    });
  });
  await page.route('**/api/**projects*', async (route) => {
    await new Promise((r) => setTimeout(r, 600));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ projects: [{ id: 'socrates', name: 'Socrates', description: '学习对话项目', color: '#7c9cff', createdAt: '2026-07-29T00:00:00.000Z' }] }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);

  // 1. Plugins Loading State
  await page.evaluate(() => document.getElementById('navPlugins')?.click());
  await expect(page.locator('.workspace-loading-plugins')).toBeVisible();
  await expect(page.locator('.workspace-loading-plugins .workspace-loading-spinner-ring')).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/loading-animation-plugins.png' });

  // Settle to plugins catalog
  await expect(page.locator('.plugin-directory')).toBeVisible({ timeout: 5000 });

  // 2. Projects Loading State
  await page.evaluate(() => document.getElementById('navProjects')?.click());
  await expect(page.locator('.workspace-loading-projects')).toBeVisible();
  await expect(page.locator('.workspace-loading-projects .workspace-loading-spinner-ring')).toBeVisible();
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'test-results/loading-animation-projects.png' });

  // Settle to projects directory
  await expect(page.locator('.projects-directory')).toBeVisible({ timeout: 5000 });
});
