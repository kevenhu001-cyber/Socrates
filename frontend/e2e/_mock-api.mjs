// e2e/_mock-api.mjs — Wave -1
// Shared helper for Playwright specs: stub /api/* so the app boots into its
// real chat shell (instead of staying on the auth gate). Used by every spec
// that wants to exercise post-auth flows.
//
// Usage:
//   import { mockAuthedApp } from './_mock-api.mjs';
//   test.beforeEach(async ({ page }) => { await mockAuthedApp(page); });

import fs from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MOCK_USER = {
  id: 'u-test-1',
  email: 'smoke@example.test',
  name: 'Smoke Test',
  verifiedAt: '2026-01-01T00:00:00Z',
  plan: 'descartes',
  customInstructions: '',
  webSearchOn: true,
};

const MOCK_CFG = {
  hasBeagleKey: true,
  // Don't send beagleKey to client (server-only). Smoke test relies on
  // BEAGLE_BUILT_IN being wireable client-side via the existing fallback path.
};

const MOCK_SESSIONS = { sessions: [] };
const MOCK_API_KEYS = { providers: [], activeId: null };

function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Access-Control-Allow-Origin': '*' },
  };
}

const CSRF_COOKIE_VALUE = 'smoke-csrf-token';

/**
 * Stub /api/* with predictable responses. Order matters — Playwright
 * matches the LAST registered route. We register the broad fallback LAST.
 */
export async function mockAuthedApp(page, options = {}) {
  // Existing specs assume a first-visit consent banner is not in the way.
  // Cookie-consent specs can opt out with { consent: false }.
  if (options.consent !== false) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('socrates-cookie-consent', JSON.stringify({
          v: 1,
          choice: 'accept',
          nonEssential: true,
          updatedAt: new Date().toISOString(),
        }));
      } catch (_) {}
    });
  }

  // Cookies that auth/boot.js + util/api.js expect to find.
  await page.context().addCookies([{
    name: 'csrf', value: CSRF_COOKIE_VALUE, domain: '127.0.0.1', path: '/',
  }, {
    name: 'xsrf-token', value: CSRF_COOKIE_VALUE, domain: '127.0.0.1', path: '/',
  }, {
    name: 'sid', value: 'smoke-sid-abc', domain: '127.0.0.1', path: '/',
  }]);

  // IMPORTANT: Playwright route handlers are matched in REVERSE order of
  // registration — the LAST registered route is tried FIRST. So we register
  // most-specific routes AFTER the generic catch-all. We use a single
  // branching handler to avoid order-sensitivity entirely.
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = req.url();
    /* Production clients rewrite /api/* to /api/v2/* to bypass stale CDN
       caches. Normalize the versioned prefix so mocks follow the same
       endpoint branches instead of falling through to { ok: true }. */
    const apiUrl = url.replace('/api/v2/', '/api/');
    if (apiUrl.endsWith('/api/auth/me') || apiUrl.includes('/api/auth/me?')) {
      await route.fulfill(jsonResponse({ user: MOCK_USER }));
      return;
    }
    if (apiUrl.endsWith('/api/config') || apiUrl.includes('/api/config?')) {
      await route.fulfill(jsonResponse(MOCK_CFG));
      return;
    }
    if (apiUrl.endsWith('/api/auth/csrf-token')) {
      await route.fulfill(jsonResponse({ csrfToken: CSRF_COOKIE_VALUE, ok: true }));
      return;
    }
    if (apiUrl.includes('/api/sessions')) {
      if (req.method() === 'GET') {
        await route.fulfill(jsonResponse(MOCK_SESSIONS));
      } else {
        await route.fulfill(jsonResponse({ session: { id: 'smoke-saved-1' } }));
      }
      return;
    }
    if (apiUrl.includes('/api/api-key')) {
      await route.fulfill(jsonResponse(MOCK_API_KEYS));
      return;
    }
    if (apiUrl.includes('/api/memories') || apiUrl.includes('/api/usage') ||
        apiUrl.includes('/api/projects') || apiUrl.includes('/api/share') ||
        apiUrl.includes('/api/mistakes')) {
      await route.fulfill(jsonResponse({ items: [], list: [], count: 0, ok: true }));
      return;
    }
    if (apiUrl.includes('/api/connectors/zotero/items')) {
      await route.fulfill(jsonResponse({ items: [{ id: 'TEST1234', title: 'A test reference', itemType: 'journalArticle', creators: ['Ada Lovelace'], date: '1843' }] }));
      return;
    }
    if (apiUrl.includes('/api/connectors/arxiv/papers')) {
      await route.fulfill(jsonResponse({ papers: [{ id: '2501.00001', title: 'A test preprint', summary: 'A concise test abstract.', authors: ['Claude Shannon'], categories: ['cs.AI'], publishedAt: '2025-01-01T00:00:00Z', abstractUrl: 'https://arxiv.org/abs/2501.00001', pdfUrl: 'https://arxiv.org/pdf/2501.00001.pdf' }] }));
      return;
    }
    if (apiUrl.includes('/api/connectors/zotero') && req.method() === 'POST') {
      await route.fulfill(jsonResponse({ connection: { status: 'connected', displayName: 'Smoke Zotero' } }, 201));
      return;
    }
    if (apiUrl.endsWith('/api/project-connectors') || apiUrl.includes('/api/project-connectors?')) {
      await route.fulfill(jsonResponse({
        mode: 'oomol-project-connector',
        configured: true,
        connectors: [
          { id: 'github', name: 'GitHub', description: 'Bring repositories, issues, pull requests, and CI context into a chat.', capabilities: ['Repositories', 'Issues', 'Pull requests'], authType: 'oauth', connection: null },
          { id: 'gmail', name: 'Gmail', description: 'Search mail context that you explicitly authorize.', capabilities: ['Mail search'], authType: 'oauth', connection: null },
          { id: 'googledrive', name: 'Google Drive', description: 'Bring files and folders from your Google Drive into a chat.', capabilities: ['Files', 'Folders'], authType: 'oauth', connection: null },
          { id: 'googlecalendar', name: 'Google Calendar', description: 'Use your schedule and event context when planning study sessions.', capabilities: ['Events'], authType: 'oauth', connection: null },
          { id: 'notion', name: 'Notion', description: 'Search pages and knowledge you share with Socrates.', capabilities: ['Page search'], authType: 'oauth', connection: null },
        ],
      }));
      return;
    }
    if (apiUrl.includes('/api/project-connectors/') && apiUrl.endsWith('/connect')) {
      await route.fulfill(jsonResponse({ requestId: 'request-smoke-1', authorizationUrl: '/plugins?connector=smoke', expiresAt: '2026-01-01T00:10:00Z' }, 201));
      return;
    }
    if (apiUrl.includes('/api/connectors')) {
      await route.fulfill(jsonResponse({ connectors: [{ id: 'github', name: 'GitHub', description: 'Connect repositories, issues, and pull requests.', availability: 'available', configured: true, connection: null }, { id: 'feishu', name: 'Feishu', description: 'Connect documents you can access.', availability: 'available', configured: true, connection: null }, { id: 'gitee', name: 'Gitee', description: 'Connect repositories, issues, and pull requests.', availability: 'available', configured: true, connection: null }, { id: 'notion', name: 'Notion', description: 'Search pages you share with Socrates.', availability: 'available', configured: true, connection: null }, { id: 'zotero', name: 'Zotero', description: 'Search your research library with your own read-only API Key.', auth: 'api_key', availability: 'available', configured: true, connection: null }, { id: 'arxiv', name: 'arXiv', description: 'Search public preprints without connecting an account.', auth: 'public', availability: 'available', configured: true, connection: null }] }));
      return;
    }
    // Default: pretend success so callers don't throw on offline fetches.
    await route.fulfill(jsonResponse({ ok: true, stub: true }));
  });
}

/**
 * Wait until the app shows the topic-setup shell (or whatever post-auth
 * screen is currently first). The data-boot-state attribute on <html> flips
 * from "checking" → "auth" or "app". In mocked mode we want "app".
 */
export async function waitForAppShell(page, timeoutMs = 15_000) {
  await page.waitForFunction(() => {
    const s = document.documentElement.dataset.bootState;
    return s === 'app' || s === 'auth';
  }, null, { timeout: timeoutMs }).catch(() => {});
  await page.waitForTimeout(300);
}
