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
  webSearchOn: true
};
const MOCK_CFG = {
  hasBeagleKey: true
  // Don't send beagleKey to client (server-only). Smoke test relies on
  // BEAGLE_BUILT_IN being wireable client-side via the existing fallback path.
};
const MOCK_SESSIONS = {
  sessions: []
};
const MOCK_API_KEYS = {
  providers: [],
  activeId: null
};
function jsonResponse(body, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'Access-Control-Allow-Origin': '*'
    }
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
          updatedAt: new Date().toISOString()
        }));
      } catch (_) {}
    });
  }

  /* Pin the UI language. Most specs assert English copy, and i18n.js reads
     `socrates-lang-app` synchronously at module load — so without a recorded
     preference the assertion is really about whatever the app's shipped
     default happens to be. Specs that test the other locale say so explicitly
     with their own addInitScript (which registers after this one and wins) or
     by calling setLang() at runtime. Pass { lang: false } to opt out. */
  if (options.lang !== false) {
    const lang = options.lang || 'en';
    await page.addInitScript(value => {
      try {
        localStorage.setItem('socrates-lang-app', value);
      } catch (_) {}
    }, lang);
  }

  // Cookies that auth/boot.js + util/api.js expect to find.
  await page.context().addCookies([{
    name: 'csrf',
    value: CSRF_COOKIE_VALUE,
    domain: '127.0.0.1',
    path: '/'
  }, {
    name: 'xsrf-token',
    value: CSRF_COOKIE_VALUE,
    domain: '127.0.0.1',
    path: '/'
  }, {
    name: 'sid',
    value: 'smoke-sid-abc',
    domain: '127.0.0.1',
    path: '/'
  }]);

  // IMPORTANT: Playwright route handlers are matched in REVERSE order of
  // registration — the LAST registered route is tried FIRST. So we register
  // most-specific routes AFTER the generic catch-all. We use a single
  // branching handler to avoid order-sensitivity entirely.
  await page.route('**/api/**', async route => {
    const req = route.request();
    const url = req.url();
    /* Production clients rewrite /api/* to /api/v2/* to bypass stale CDN
       caches. Normalize the versioned prefix so mocks follow the same
       endpoint branches instead of falling through to { ok: true }. */
    const apiUrl = url.replace('/api/v2/', '/api/');
    if (apiUrl.endsWith('/api/auth/me') || apiUrl.includes('/api/auth/me?')) {
      await route.fulfill(jsonResponse({
        user: {
          ...MOCK_USER,
          ...(options.user || {})
        }
      }));
      return;
    }
    if (apiUrl.endsWith('/api/config') || apiUrl.includes('/api/config?')) {
      await route.fulfill(jsonResponse(MOCK_CFG));
      return;
    }
    if (apiUrl.endsWith('/api/auth/csrf-token')) {
      await route.fulfill(jsonResponse({
        csrfToken: CSRF_COOKIE_VALUE,
        ok: true
      }));
      return;
    }
    if (apiUrl.includes('/api/sessions')) {
      if (req.method() === 'GET') {
        await route.fulfill(jsonResponse(MOCK_SESSIONS));
      } else {
        await route.fulfill(jsonResponse({
          session: {
            id: 'smoke-saved-1'
          }
        }));
      }
      return;
    }
    if (apiUrl.includes('/api/api-key')) {
      await route.fulfill(jsonResponse(MOCK_API_KEYS));
      return;
    }
    if (apiUrl.includes('/api/memories') || apiUrl.includes('/api/usage') || apiUrl.includes('/api/projects') || apiUrl.includes('/api/share') || apiUrl.includes('/api/mistakes')) {
      await route.fulfill(jsonResponse({
        items: [],
        list: [],
        count: 0,
        ok: true
      }));
      return;
    }
    if (apiUrl.includes('/api/connectors/zotero/items')) {
      await route.fulfill(jsonResponse({
        items: [{
          id: 'TEST1234',
          title: 'A test reference',
          itemType: 'journalArticle',
          creators: ['Ada Lovelace'],
          date: '1843'
        }]
      }));
      return;
    }
    if (apiUrl.includes('/api/connectors/arxiv/papers')) {
      await route.fulfill(jsonResponse({
        papers: [{
          id: '2501.00001',
          title: 'A test preprint',
          summary: 'A concise test abstract.',
          authors: ['Claude Shannon'],
          categories: ['cs.AI'],
          publishedAt: '2025-01-01T00:00:00Z',
          abstractUrl: 'https://arxiv.org/abs/2501.00001',
          pdfUrl: 'https://arxiv.org/pdf/2501.00001.pdf'
        }]
      }));
      return;
    }
    if (apiUrl.includes('/api/connectors/zotero') && req.method() === 'POST') {
      await route.fulfill(jsonResponse({
        connection: {
          status: 'connected',
          displayName: 'Smoke Zotero'
        }
      }, 201));
      return;
    }
    if (apiUrl.endsWith('/api/project-connectors') || apiUrl.includes('/api/project-connectors?')) {
      await route.fulfill(jsonResponse({
        mode: 'oomol-project-connector',
        configured: true,
        connectors: [{
          id: 'github',
          name: 'GitHub',
          description: 'Bring repositories, issues, pull requests, and CI context into a chat.',
          capabilities: ['Repositories', 'Issues', 'Pull requests'],
          authType: 'oauth',
          connection: null
        }, {
          id: 'gmail',
          name: 'Gmail',
          description: 'Search mail context that you explicitly authorize.',
          capabilities: ['Mail search'],
          authType: 'oauth',
          connection: null
        }, {
          id: 'googledrive',
          name: 'Google Drive',
          description: 'Bring files and folders from your Google Drive into a chat.',
          capabilities: ['Files', 'Folders'],
          authType: 'oauth',
          connection: null
        }, {
          id: 'googlecalendar',
          name: 'Google Calendar',
          description: 'Use your schedule and event context when planning study sessions.',
          capabilities: ['Events'],
          authType: 'oauth',
          connection: null
        }, {
          id: 'notion',
          name: 'Notion',
          description: 'Search pages and knowledge you share with Socrates.',
          capabilities: ['Page search'],
          authType: 'oauth',
          connection: null
        }]
      }));
      return;
    }
    if (apiUrl.includes('/api/project-connectors/') && apiUrl.endsWith('/connect')) {
      await route.fulfill(jsonResponse({
        requestId: 'request-smoke-1',
        authorizationUrl: '/plugins?connector=smoke',
        expiresAt: '2026-01-01T00:10:00Z'
      }, 201));
      return;
    }
    if (apiUrl.includes('/api/connectors')) {
      await route.fulfill(jsonResponse({
        connectors: [{
          id: 'github',
          name: 'GitHub',
          description: 'Connect repositories, issues, and pull requests.',
          availability: 'available',
          configured: true,
          connection: null
        }, {
          id: 'gmail',
          name: 'Gmail',
          description: 'Search and triage your inbox without leaving the chat.',
          auth: 'oauth',
          availability: 'available',
          configured: true,
          connection: null
        }, {
          id: 'googledrive',
          name: 'Google Drive',
          description: 'Pull documents and spreadsheets you have access to.',
          auth: 'oauth',
          availability: 'available',
          configured: true,
          connection: null
        }, {
          id: 'notion',
          name: 'Notion',
          description: 'Search pages you share with Socrates.',
          availability: 'available',
          configured: true,
          connection: null
        }, {
          id: 'zotero',
          name: 'Zotero',
          description: 'Search your research library with your own read-only API Key.',
          auth: 'api_key',
          availability: 'available',
          configured: true,
          connection: null
        }]
      }));
      return;
    }
    // Default: pretend success so callers don't throw on offline fetches.
    await route.fulfill(jsonResponse({
      ok: true,
      stub: true
    }));
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
  }, null, {
    timeout: timeoutMs
  }).catch(() => {});
  await page.waitForTimeout(300);
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJmcyIsImRpcm5hbWUiLCJyZXNvbHZlIiwiZmlsZVVSTFRvUGF0aCIsIl9fZGlybmFtZSIsImltcG9ydCIsIm1ldGEiLCJ1cmwiLCJNT0NLX1VTRVIiLCJpZCIsImVtYWlsIiwibmFtZSIsInZlcmlmaWVkQXQiLCJwbGFuIiwiY3VzdG9tSW5zdHJ1Y3Rpb25zIiwid2ViU2VhcmNoT24iLCJNT0NLX0NGRyIsImhhc0JlYWdsZUtleSIsIk1PQ0tfU0VTU0lPTlMiLCJzZXNzaW9ucyIsIk1PQ0tfQVBJX0tFWVMiLCJwcm92aWRlcnMiLCJhY3RpdmVJZCIsImpzb25SZXNwb25zZSIsImJvZHkiLCJzdGF0dXMiLCJjb250ZW50VHlwZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJoZWFkZXJzIiwiQ1NSRl9DT09LSUVfVkFMVUUiLCJtb2NrQXV0aGVkQXBwIiwicGFnZSIsIm9wdGlvbnMiLCJjb25zZW50IiwiYWRkSW5pdFNjcmlwdCIsImxvY2FsU3RvcmFnZSIsInNldEl0ZW0iLCJ2IiwiY2hvaWNlIiwibm9uRXNzZW50aWFsIiwidXBkYXRlZEF0IiwiRGF0ZSIsInRvSVNPU3RyaW5nIiwiXyIsImxhbmciLCJ2YWx1ZSIsImNvbnRleHQiLCJhZGRDb29raWVzIiwiZG9tYWluIiwicGF0aCIsInJvdXRlIiwicmVxIiwicmVxdWVzdCIsImFwaVVybCIsInJlcGxhY2UiLCJlbmRzV2l0aCIsImluY2x1ZGVzIiwiZnVsZmlsbCIsInVzZXIiLCJjc3JmVG9rZW4iLCJvayIsIm1ldGhvZCIsInNlc3Npb24iLCJpdGVtcyIsImxpc3QiLCJjb3VudCIsInRpdGxlIiwiaXRlbVR5cGUiLCJjcmVhdG9ycyIsImRhdGUiLCJwYXBlcnMiLCJzdW1tYXJ5IiwiYXV0aG9ycyIsImNhdGVnb3JpZXMiLCJwdWJsaXNoZWRBdCIsImFic3RyYWN0VXJsIiwicGRmVXJsIiwiY29ubmVjdGlvbiIsImRpc3BsYXlOYW1lIiwibW9kZSIsImNvbmZpZ3VyZWQiLCJjb25uZWN0b3JzIiwiZGVzY3JpcHRpb24iLCJjYXBhYmlsaXRpZXMiLCJhdXRoVHlwZSIsInJlcXVlc3RJZCIsImF1dGhvcml6YXRpb25VcmwiLCJleHBpcmVzQXQiLCJhdmFpbGFiaWxpdHkiLCJhdXRoIiwic3R1YiIsIndhaXRGb3JBcHBTaGVsbCIsInRpbWVvdXRNcyIsIndhaXRGb3JGdW5jdGlvbiIsInMiLCJkb2N1bWVudCIsImRvY3VtZW50RWxlbWVudCIsImRhdGFzZXQiLCJib290U3RhdGUiLCJ0aW1lb3V0IiwiY2F0Y2giLCJ3YWl0Rm9yVGltZW91dCJdLCJzb3VyY2VzIjpbIl9tb2NrLWFwaS5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gZTJlL19tb2NrLWFwaS5tanMg4oCUIFdhdmUgLTFcclxuLy8gU2hhcmVkIGhlbHBlciBmb3IgUGxheXdyaWdodCBzcGVjczogc3R1YiAvYXBpLyogc28gdGhlIGFwcCBib290cyBpbnRvIGl0c1xyXG4vLyByZWFsIGNoYXQgc2hlbGwgKGluc3RlYWQgb2Ygc3RheWluZyBvbiB0aGUgYXV0aCBnYXRlKS4gVXNlZCBieSBldmVyeSBzcGVjXHJcbi8vIHRoYXQgd2FudHMgdG8gZXhlcmNpc2UgcG9zdC1hdXRoIGZsb3dzLlxyXG4vL1xyXG4vLyBVc2FnZTpcclxuLy8gICBpbXBvcnQgeyBtb2NrQXV0aGVkQXBwIH0gZnJvbSAnLi9fbW9jay1hcGkubWpzJztcclxuLy8gICB0ZXN0LmJlZm9yZUVhY2goYXN5bmMgKHsgcGFnZSB9KSA9PiB7IGF3YWl0IG1vY2tBdXRoZWRBcHAocGFnZSk7IH0pO1xyXG5cclxuaW1wb3J0IGZzIGZyb20gJ25vZGU6ZnMnO1xyXG5pbXBvcnQgeyBkaXJuYW1lLCByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJztcclxuaW1wb3J0IHsgZmlsZVVSTFRvUGF0aCB9IGZyb20gJ25vZGU6dXJsJztcclxuXHJcbmNvbnN0IF9fZGlybmFtZSA9IGRpcm5hbWUoZmlsZVVSTFRvUGF0aChpbXBvcnQubWV0YS51cmwpKTtcclxuXHJcbmNvbnN0IE1PQ0tfVVNFUiA9IHtcclxuICBpZDogJ3UtdGVzdC0xJyxcclxuICBlbWFpbDogJ3Ntb2tlQGV4YW1wbGUudGVzdCcsXHJcbiAgbmFtZTogJ1Ntb2tlIFRlc3QnLFxyXG4gIHZlcmlmaWVkQXQ6ICcyMDI2LTAxLTAxVDAwOjAwOjAwWicsXHJcbiAgcGxhbjogJ2Rlc2NhcnRlcycsXHJcbiAgY3VzdG9tSW5zdHJ1Y3Rpb25zOiAnJyxcclxuICB3ZWJTZWFyY2hPbjogdHJ1ZSxcclxufTtcclxuXHJcbmNvbnN0IE1PQ0tfQ0ZHID0ge1xyXG4gIGhhc0JlYWdsZUtleTogdHJ1ZSxcclxuICAvLyBEb24ndCBzZW5kIGJlYWdsZUtleSB0byBjbGllbnQgKHNlcnZlci1vbmx5KS4gU21va2UgdGVzdCByZWxpZXMgb25cclxuICAvLyBCRUFHTEVfQlVJTFRfSU4gYmVpbmcgd2lyZWFibGUgY2xpZW50LXNpZGUgdmlhIHRoZSBleGlzdGluZyBmYWxsYmFjayBwYXRoLlxyXG59O1xyXG5cclxuY29uc3QgTU9DS19TRVNTSU9OUyA9IHsgc2Vzc2lvbnM6IFtdIH07XHJcbmNvbnN0IE1PQ0tfQVBJX0tFWVMgPSB7IHByb3ZpZGVyczogW10sIGFjdGl2ZUlkOiBudWxsIH07XHJcblxyXG5mdW5jdGlvbiBqc29uUmVzcG9uc2UoYm9keSwgc3RhdHVzID0gMjAwKSB7XHJcbiAgcmV0dXJuIHtcclxuICAgIHN0YXR1cyxcclxuICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICBib2R5OiB0eXBlb2YgYm9keSA9PT0gJ3N0cmluZycgPyBib2R5IDogSlNPTi5zdHJpbmdpZnkoYm9keSksXHJcbiAgICBoZWFkZXJzOiB7ICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicgfSxcclxuICB9O1xyXG59XHJcblxyXG5jb25zdCBDU1JGX0NPT0tJRV9WQUxVRSA9ICdzbW9rZS1jc3JmLXRva2VuJztcclxuXHJcbi8qKlxyXG4gKiBTdHViIC9hcGkvKiB3aXRoIHByZWRpY3RhYmxlIHJlc3BvbnNlcy4gT3JkZXIgbWF0dGVycyDigJQgUGxheXdyaWdodFxyXG4gKiBtYXRjaGVzIHRoZSBMQVNUIHJlZ2lzdGVyZWQgcm91dGUuIFdlIHJlZ2lzdGVyIHRoZSBicm9hZCBmYWxsYmFjayBMQVNULlxyXG4gKi9cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1vY2tBdXRoZWRBcHAocGFnZSwgb3B0aW9ucyA9IHt9KSB7XHJcbiAgLy8gRXhpc3Rpbmcgc3BlY3MgYXNzdW1lIGEgZmlyc3QtdmlzaXQgY29uc2VudCBiYW5uZXIgaXMgbm90IGluIHRoZSB3YXkuXHJcbiAgLy8gQ29va2llLWNvbnNlbnQgc3BlY3MgY2FuIG9wdCBvdXQgd2l0aCB7IGNvbnNlbnQ6IGZhbHNlIH0uXHJcbiAgaWYgKG9wdGlvbnMuY29uc2VudCAhPT0gZmFsc2UpIHtcclxuICAgIGF3YWl0IHBhZ2UuYWRkSW5pdFNjcmlwdCgoKSA9PiB7XHJcbiAgICAgIHRyeSB7XHJcbiAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3NvY3JhdGVzLWNvb2tpZS1jb25zZW50JywgSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgICAgdjogMSxcclxuICAgICAgICAgIGNob2ljZTogJ2FjY2VwdCcsXHJcbiAgICAgICAgICBub25Fc3NlbnRpYWw6IHRydWUsXHJcbiAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICB9KSk7XHJcbiAgICAgIH0gY2F0Y2ggKF8pIHt9XHJcbiAgICB9KTtcclxuICB9XHJcblxyXG4gIC8qIFBpbiB0aGUgVUkgbGFuZ3VhZ2UuIE1vc3Qgc3BlY3MgYXNzZXJ0IEVuZ2xpc2ggY29weSwgYW5kIGkxOG4uanMgcmVhZHNcclxuICAgICBgc29jcmF0ZXMtbGFuZy1hcHBgIHN5bmNocm9ub3VzbHkgYXQgbW9kdWxlIGxvYWQg4oCUIHNvIHdpdGhvdXQgYSByZWNvcmRlZFxyXG4gICAgIHByZWZlcmVuY2UgdGhlIGFzc2VydGlvbiBpcyByZWFsbHkgYWJvdXQgd2hhdGV2ZXIgdGhlIGFwcCdzIHNoaXBwZWRcclxuICAgICBkZWZhdWx0IGhhcHBlbnMgdG8gYmUuIFNwZWNzIHRoYXQgdGVzdCB0aGUgb3RoZXIgbG9jYWxlIHNheSBzbyBleHBsaWNpdGx5XHJcbiAgICAgd2l0aCB0aGVpciBvd24gYWRkSW5pdFNjcmlwdCAod2hpY2ggcmVnaXN0ZXJzIGFmdGVyIHRoaXMgb25lIGFuZCB3aW5zKSBvclxyXG4gICAgIGJ5IGNhbGxpbmcgc2V0TGFuZygpIGF0IHJ1bnRpbWUuIFBhc3MgeyBsYW5nOiBmYWxzZSB9IHRvIG9wdCBvdXQuICovXHJcbiAgaWYgKG9wdGlvbnMubGFuZyAhPT0gZmFsc2UpIHtcclxuICAgIGNvbnN0IGxhbmcgPSBvcHRpb25zLmxhbmcgfHwgJ2VuJztcclxuICAgIGF3YWl0IHBhZ2UuYWRkSW5pdFNjcmlwdCgodmFsdWUpID0+IHtcclxuICAgICAgdHJ5IHsgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ3NvY3JhdGVzLWxhbmctYXBwJywgdmFsdWUpOyB9IGNhdGNoIChfKSB7fVxyXG4gICAgfSwgbGFuZyk7XHJcbiAgfVxyXG5cclxuICAvLyBDb29raWVzIHRoYXQgYXV0aC9ib290LmpzICsgdXRpbC9hcGkuanMgZXhwZWN0IHRvIGZpbmQuXHJcbiAgYXdhaXQgcGFnZS5jb250ZXh0KCkuYWRkQ29va2llcyhbe1xyXG4gICAgbmFtZTogJ2NzcmYnLCB2YWx1ZTogQ1NSRl9DT09LSUVfVkFMVUUsIGRvbWFpbjogJzEyNy4wLjAuMScsIHBhdGg6ICcvJyxcclxuICB9LCB7XHJcbiAgICBuYW1lOiAneHNyZi10b2tlbicsIHZhbHVlOiBDU1JGX0NPT0tJRV9WQUxVRSwgZG9tYWluOiAnMTI3LjAuMC4xJywgcGF0aDogJy8nLFxyXG4gIH0sIHtcclxuICAgIG5hbWU6ICdzaWQnLCB2YWx1ZTogJ3Ntb2tlLXNpZC1hYmMnLCBkb21haW46ICcxMjcuMC4wLjEnLCBwYXRoOiAnLycsXHJcbiAgfV0pO1xyXG5cclxuICAvLyBJTVBPUlRBTlQ6IFBsYXl3cmlnaHQgcm91dGUgaGFuZGxlcnMgYXJlIG1hdGNoZWQgaW4gUkVWRVJTRSBvcmRlciBvZlxyXG4gIC8vIHJlZ2lzdHJhdGlvbiDigJQgdGhlIExBU1QgcmVnaXN0ZXJlZCByb3V0ZSBpcyB0cmllZCBGSVJTVC4gU28gd2UgcmVnaXN0ZXJcclxuICAvLyBtb3N0LXNwZWNpZmljIHJvdXRlcyBBRlRFUiB0aGUgZ2VuZXJpYyBjYXRjaC1hbGwuIFdlIHVzZSBhIHNpbmdsZVxyXG4gIC8vIGJyYW5jaGluZyBoYW5kbGVyIHRvIGF2b2lkIG9yZGVyLXNlbnNpdGl2aXR5IGVudGlyZWx5LlxyXG4gIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2FwaS8qKicsIGFzeW5jIChyb3V0ZSkgPT4ge1xyXG4gICAgY29uc3QgcmVxID0gcm91dGUucmVxdWVzdCgpO1xyXG4gICAgY29uc3QgdXJsID0gcmVxLnVybCgpO1xyXG4gICAgLyogUHJvZHVjdGlvbiBjbGllbnRzIHJld3JpdGUgL2FwaS8qIHRvIC9hcGkvdjIvKiB0byBieXBhc3Mgc3RhbGUgQ0ROXHJcbiAgICAgICBjYWNoZXMuIE5vcm1hbGl6ZSB0aGUgdmVyc2lvbmVkIHByZWZpeCBzbyBtb2NrcyBmb2xsb3cgdGhlIHNhbWVcclxuICAgICAgIGVuZHBvaW50IGJyYW5jaGVzIGluc3RlYWQgb2YgZmFsbGluZyB0aHJvdWdoIHRvIHsgb2s6IHRydWUgfS4gKi9cclxuICAgIGNvbnN0IGFwaVVybCA9IHVybC5yZXBsYWNlKCcvYXBpL3YyLycsICcvYXBpLycpO1xyXG4gICAgaWYgKGFwaVVybC5lbmRzV2l0aCgnL2FwaS9hdXRoL21lJykgfHwgYXBpVXJsLmluY2x1ZGVzKCcvYXBpL2F1dGgvbWU/JykpIHtcclxuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbChqc29uUmVzcG9uc2UoeyB1c2VyOiB7IC4uLk1PQ0tfVVNFUiwgLi4uKG9wdGlvbnMudXNlciB8fCB7fSkgfSB9KSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChhcGlVcmwuZW5kc1dpdGgoJy9hcGkvY29uZmlnJykgfHwgYXBpVXJsLmluY2x1ZGVzKCcvYXBpL2NvbmZpZz8nKSkge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZShNT0NLX0NGRykpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoYXBpVXJsLmVuZHNXaXRoKCcvYXBpL2F1dGgvY3NyZi10b2tlbicpKSB7XHJcbiAgICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoanNvblJlc3BvbnNlKHsgY3NyZlRva2VuOiBDU1JGX0NPT0tJRV9WQUxVRSwgb2s6IHRydWUgfSkpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoYXBpVXJsLmluY2x1ZGVzKCcvYXBpL3Nlc3Npb25zJykpIHtcclxuICAgICAgaWYgKHJlcS5tZXRob2QoKSA9PT0gJ0dFVCcpIHtcclxuICAgICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZShNT0NLX1NFU1NJT05TKSk7XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbChqc29uUmVzcG9uc2UoeyBzZXNzaW9uOiB7IGlkOiAnc21va2Utc2F2ZWQtMScgfSB9KSk7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKGFwaVVybC5pbmNsdWRlcygnL2FwaS9hcGkta2V5JykpIHtcclxuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbChqc29uUmVzcG9uc2UoTU9DS19BUElfS0VZUykpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoYXBpVXJsLmluY2x1ZGVzKCcvYXBpL21lbW9yaWVzJykgfHwgYXBpVXJsLmluY2x1ZGVzKCcvYXBpL3VzYWdlJykgfHxcclxuICAgICAgICBhcGlVcmwuaW5jbHVkZXMoJy9hcGkvcHJvamVjdHMnKSB8fCBhcGlVcmwuaW5jbHVkZXMoJy9hcGkvc2hhcmUnKSB8fFxyXG4gICAgICAgIGFwaVVybC5pbmNsdWRlcygnL2FwaS9taXN0YWtlcycpKSB7XHJcbiAgICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoanNvblJlc3BvbnNlKHsgaXRlbXM6IFtdLCBsaXN0OiBbXSwgY291bnQ6IDAsIG9rOiB0cnVlIH0pKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgaWYgKGFwaVVybC5pbmNsdWRlcygnL2FwaS9jb25uZWN0b3JzL3pvdGVyby9pdGVtcycpKSB7XHJcbiAgICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoanNvblJlc3BvbnNlKHsgaXRlbXM6IFt7IGlkOiAnVEVTVDEyMzQnLCB0aXRsZTogJ0EgdGVzdCByZWZlcmVuY2UnLCBpdGVtVHlwZTogJ2pvdXJuYWxBcnRpY2xlJywgY3JlYXRvcnM6IFsnQWRhIExvdmVsYWNlJ10sIGRhdGU6ICcxODQzJyB9XSB9KSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChhcGlVcmwuaW5jbHVkZXMoJy9hcGkvY29ubmVjdG9ycy9hcnhpdi9wYXBlcnMnKSkge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZSh7IHBhcGVyczogW3sgaWQ6ICcyNTAxLjAwMDAxJywgdGl0bGU6ICdBIHRlc3QgcHJlcHJpbnQnLCBzdW1tYXJ5OiAnQSBjb25jaXNlIHRlc3QgYWJzdHJhY3QuJywgYXV0aG9yczogWydDbGF1ZGUgU2hhbm5vbiddLCBjYXRlZ29yaWVzOiBbJ2NzLkFJJ10sIHB1Ymxpc2hlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMFonLCBhYnN0cmFjdFVybDogJ2h0dHBzOi8vYXJ4aXYub3JnL2Ficy8yNTAxLjAwMDAxJywgcGRmVXJsOiAnaHR0cHM6Ly9hcnhpdi5vcmcvcGRmLzI1MDEuMDAwMDEucGRmJyB9XSB9KSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChhcGlVcmwuaW5jbHVkZXMoJy9hcGkvY29ubmVjdG9ycy96b3Rlcm8nKSAmJiByZXEubWV0aG9kKCkgPT09ICdQT1NUJykge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZSh7IGNvbm5lY3Rpb246IHsgc3RhdHVzOiAnY29ubmVjdGVkJywgZGlzcGxheU5hbWU6ICdTbW9rZSBab3Rlcm8nIH0gfSwgMjAxKSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmIChhcGlVcmwuZW5kc1dpdGgoJy9hcGkvcHJvamVjdC1jb25uZWN0b3JzJykgfHwgYXBpVXJsLmluY2x1ZGVzKCcvYXBpL3Byb2plY3QtY29ubmVjdG9ycz8nKSkge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZSh7XHJcbiAgICAgICAgbW9kZTogJ29vbW9sLXByb2plY3QtY29ubmVjdG9yJyxcclxuICAgICAgICBjb25maWd1cmVkOiB0cnVlLFxyXG4gICAgICAgIGNvbm5lY3RvcnM6IFtcclxuICAgICAgICAgIHsgaWQ6ICdnaXRodWInLCBuYW1lOiAnR2l0SHViJywgZGVzY3JpcHRpb246ICdCcmluZyByZXBvc2l0b3JpZXMsIGlzc3VlcywgcHVsbCByZXF1ZXN0cywgYW5kIENJIGNvbnRleHQgaW50byBhIGNoYXQuJywgY2FwYWJpbGl0aWVzOiBbJ1JlcG9zaXRvcmllcycsICdJc3N1ZXMnLCAnUHVsbCByZXF1ZXN0cyddLCBhdXRoVHlwZTogJ29hdXRoJywgY29ubmVjdGlvbjogbnVsbCB9LFxyXG4gICAgICAgICAgeyBpZDogJ2dtYWlsJywgbmFtZTogJ0dtYWlsJywgZGVzY3JpcHRpb246ICdTZWFyY2ggbWFpbCBjb250ZXh0IHRoYXQgeW91IGV4cGxpY2l0bHkgYXV0aG9yaXplLicsIGNhcGFiaWxpdGllczogWydNYWlsIHNlYXJjaCddLCBhdXRoVHlwZTogJ29hdXRoJywgY29ubmVjdGlvbjogbnVsbCB9LFxyXG4gICAgICAgICAgeyBpZDogJ2dvb2dsZWRyaXZlJywgbmFtZTogJ0dvb2dsZSBEcml2ZScsIGRlc2NyaXB0aW9uOiAnQnJpbmcgZmlsZXMgYW5kIGZvbGRlcnMgZnJvbSB5b3VyIEdvb2dsZSBEcml2ZSBpbnRvIGEgY2hhdC4nLCBjYXBhYmlsaXRpZXM6IFsnRmlsZXMnLCAnRm9sZGVycyddLCBhdXRoVHlwZTogJ29hdXRoJywgY29ubmVjdGlvbjogbnVsbCB9LFxyXG4gICAgICAgICAgeyBpZDogJ2dvb2dsZWNhbGVuZGFyJywgbmFtZTogJ0dvb2dsZSBDYWxlbmRhcicsIGRlc2NyaXB0aW9uOiAnVXNlIHlvdXIgc2NoZWR1bGUgYW5kIGV2ZW50IGNvbnRleHQgd2hlbiBwbGFubmluZyBzdHVkeSBzZXNzaW9ucy4nLCBjYXBhYmlsaXRpZXM6IFsnRXZlbnRzJ10sIGF1dGhUeXBlOiAnb2F1dGgnLCBjb25uZWN0aW9uOiBudWxsIH0sXHJcbiAgICAgICAgICB7IGlkOiAnbm90aW9uJywgbmFtZTogJ05vdGlvbicsIGRlc2NyaXB0aW9uOiAnU2VhcmNoIHBhZ2VzIGFuZCBrbm93bGVkZ2UgeW91IHNoYXJlIHdpdGggU29jcmF0ZXMuJywgY2FwYWJpbGl0aWVzOiBbJ1BhZ2Ugc2VhcmNoJ10sIGF1dGhUeXBlOiAnb2F1dGgnLCBjb25uZWN0aW9uOiBudWxsIH0sXHJcbiAgICAgICAgXSxcclxuICAgICAgfSkpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoYXBpVXJsLmluY2x1ZGVzKCcvYXBpL3Byb2plY3QtY29ubmVjdG9ycy8nKSAmJiBhcGlVcmwuZW5kc1dpdGgoJy9jb25uZWN0JykpIHtcclxuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbChqc29uUmVzcG9uc2UoeyByZXF1ZXN0SWQ6ICdyZXF1ZXN0LXNtb2tlLTEnLCBhdXRob3JpemF0aW9uVXJsOiAnL3BsdWdpbnM/Y29ubmVjdG9yPXNtb2tlJywgZXhwaXJlc0F0OiAnMjAyNi0wMS0wMVQwMDoxMDowMFonIH0sIDIwMSkpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBpZiAoYXBpVXJsLmluY2x1ZGVzKCcvYXBpL2Nvbm5lY3RvcnMnKSkge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZSh7IGNvbm5lY3RvcnM6IFt7IGlkOiAnZ2l0aHViJywgbmFtZTogJ0dpdEh1YicsIGRlc2NyaXB0aW9uOiAnQ29ubmVjdCByZXBvc2l0b3JpZXMsIGlzc3VlcywgYW5kIHB1bGwgcmVxdWVzdHMuJywgYXZhaWxhYmlsaXR5OiAnYXZhaWxhYmxlJywgY29uZmlndXJlZDogdHJ1ZSwgY29ubmVjdGlvbjogbnVsbCB9LCB7IGlkOiAnZ21haWwnLCBuYW1lOiAnR21haWwnLCBkZXNjcmlwdGlvbjogJ1NlYXJjaCBhbmQgdHJpYWdlIHlvdXIgaW5ib3ggd2l0aG91dCBsZWF2aW5nIHRoZSBjaGF0LicsIGF1dGg6ICdvYXV0aCcsIGF2YWlsYWJpbGl0eTogJ2F2YWlsYWJsZScsIGNvbmZpZ3VyZWQ6IHRydWUsIGNvbm5lY3Rpb246IG51bGwgfSwgeyBpZDogJ2dvb2dsZWRyaXZlJywgbmFtZTogJ0dvb2dsZSBEcml2ZScsIGRlc2NyaXB0aW9uOiAnUHVsbCBkb2N1bWVudHMgYW5kIHNwcmVhZHNoZWV0cyB5b3UgaGF2ZSBhY2Nlc3MgdG8uJywgYXV0aDogJ29hdXRoJywgYXZhaWxhYmlsaXR5OiAnYXZhaWxhYmxlJywgY29uZmlndXJlZDogdHJ1ZSwgY29ubmVjdGlvbjogbnVsbCB9LCB7IGlkOiAnbm90aW9uJywgbmFtZTogJ05vdGlvbicsIGRlc2NyaXB0aW9uOiAnU2VhcmNoIHBhZ2VzIHlvdSBzaGFyZSB3aXRoIFNvY3JhdGVzLicsIGF2YWlsYWJpbGl0eTogJ2F2YWlsYWJsZScsIGNvbmZpZ3VyZWQ6IHRydWUsIGNvbm5lY3Rpb246IG51bGwgfSwgeyBpZDogJ3pvdGVybycsIG5hbWU6ICdab3Rlcm8nLCBkZXNjcmlwdGlvbjogJ1NlYXJjaCB5b3VyIHJlc2VhcmNoIGxpYnJhcnkgd2l0aCB5b3VyIG93biByZWFkLW9ubHkgQVBJIEtleS4nLCBhdXRoOiAnYXBpX2tleScsIGF2YWlsYWJpbGl0eTogJ2F2YWlsYWJsZScsIGNvbmZpZ3VyZWQ6IHRydWUsIGNvbm5lY3Rpb246IG51bGwgfV0gfSkpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICAvLyBEZWZhdWx0OiBwcmV0ZW5kIHN1Y2Nlc3Mgc28gY2FsbGVycyBkb24ndCB0aHJvdyBvbiBvZmZsaW5lIGZldGNoZXMuXHJcbiAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKGpzb25SZXNwb25zZSh7IG9rOiB0cnVlLCBzdHViOiB0cnVlIH0pKTtcclxuICB9KTtcclxufVxyXG5cclxuLyoqXHJcbiAqIFdhaXQgdW50aWwgdGhlIGFwcCBzaG93cyB0aGUgdG9waWMtc2V0dXAgc2hlbGwgKG9yIHdoYXRldmVyIHBvc3QtYXV0aFxyXG4gKiBzY3JlZW4gaXMgY3VycmVudGx5IGZpcnN0KS4gVGhlIGRhdGEtYm9vdC1zdGF0ZSBhdHRyaWJ1dGUgb24gPGh0bWw+IGZsaXBzXHJcbiAqIGZyb20gXCJjaGVja2luZ1wiIOKGkiBcImF1dGhcIiBvciBcImFwcFwiLiBJbiBtb2NrZWQgbW9kZSB3ZSB3YW50IFwiYXBwXCIuXHJcbiAqL1xyXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gd2FpdEZvckFwcFNoZWxsKHBhZ2UsIHRpbWVvdXRNcyA9IDE1XzAwMCkge1xyXG4gIGF3YWl0IHBhZ2Uud2FpdEZvckZ1bmN0aW9uKCgpID0+IHtcclxuICAgIGNvbnN0IHMgPSBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQuZGF0YXNldC5ib290U3RhdGU7XHJcbiAgICByZXR1cm4gcyA9PT0gJ2FwcCcgfHwgcyA9PT0gJ2F1dGgnO1xyXG4gIH0sIG51bGwsIHsgdGltZW91dDogdGltZW91dE1zIH0pLmNhdGNoKCgpID0+IHt9KTtcclxuICBhd2FpdCBwYWdlLndhaXRGb3JUaW1lb3V0KDMwMCk7XHJcbn1cclxuIl0sIm1hcHBpbmdzIjoiQUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQUVBLE9BQU9BLEVBQUUsTUFBTSxTQUFTO0FBQ3hCLFNBQVNDLE9BQU8sRUFBRUMsT0FBTyxRQUFRLFdBQVc7QUFDNUMsU0FB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