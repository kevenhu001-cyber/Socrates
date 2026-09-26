import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';
const CONNECTORS = [{
  id: 'github',
  name: 'GitHub',
  description: 'Bring repositories, issues, pull requests, and CI context into a chat.',
  capabilities: ['Repositories', 'Issues'],
  authType: 'oauth',
  connection: {
    status: 'connected',
    displayName: 'Study org'
  }
}, {
  id: 'gmail',
  name: 'Gmail',
  description: 'Search mail context that you explicitly authorize.',
  capabilities: ['Mail search'],
  authType: 'oauth',
  connection: null
}, {
  id: 'notion',
  name: 'Notion',
  description: 'Search pages and knowledge you share with Socrates.',
  capabilities: ['Page search'],
  authType: 'oauth',
  connection: {
    status: 'connected',
    displayName: 'Personal notes'
  }
}];
async function mockConnectedCatalog(page) {
  await page.route('**/api/**', async route => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        connectors: CONNECTORS
      })
    });
  });
}
test('plus menu supports real connector search, multi-select, and removal', async ({
  page
}) => {
  await mockAuthedApp(page, {
    lang: 'en'
  });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#topicComposerToolsBtn').click();
  const menu = page.locator('#composerToolsMenu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-composer-plugin]')).toHaveCount(2);
  // Disconnected connectors stay out of the composer roster.
  await expect(menu.locator('[data-composer-plugin="gmail"]')).toHaveCount(0);
  const search = menu.locator('.composer-tools-search input');
  await search.fill('notion');
  await expect(menu.locator('[data-composer-plugin]')).toHaveCount(1);
  await expect(menu.locator('[data-composer-plugin="notion"]')).toBeVisible();
  await search.fill('');
  await page.locator('[data-composer-plugin="github"]').click();
  await page.locator('[data-composer-plugin="notion"]').click();
  await expect(page.locator('#topicInputWrap .composer-plugin-chip')).toHaveCount(2);
  await expect(page.locator('#topicInputWrap .composer-plugin-chip-label')).toHaveText(['GitHub', 'Notion']);
  await page.locator('#topicInputWrap .composer-plugin-chip-remove').first().click();
  await expect(page.locator('#topicInputWrap .composer-plugin-chip')).toHaveCount(1);
  await expect(page.locator('#topicInputWrap .composer-plugin-chip-label')).toHaveText(['Notion']);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});
test('plugin center filters public/personal apps and scheduled templates prefill the form', async ({
  page
}) => {
  await mockAuthedApp(page, {
    lang: 'en'
  });
  await mockConnectedCatalog(page);
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  // The public scope is the default, matching the reference design.
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);
  const appSearch = page.locator('.plugin-directory-search input');
  await appSearch.fill('gmail');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(1);
  await appSearch.fill('zzz-no-such-app');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(0);
  await expect(page.locator('.plugin-directory-empty')).toBeVisible();
  await appSearch.fill('');
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);
  await page.getByRole('tab', {
    name: 'Personal'
  }).click();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);

  // The directory is a direct sidebar destination; new-chat returns home.
  await page.locator('#navNew').click();
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#pluginsPanel')).toBeHidden();
  await page.locator('#navScheduled').click();
  await expect(page.locator('.scheduled-directory')).toBeVisible();
  await expect(page.locator('.scheduled-recommendation')).toHaveCount(5);
  await page.locator('.scheduled-recommendation').first().click();
  await expect(page.locator('#taskForm')).toBeVisible();
  await expect(page.locator('#taskForm input[name="title"]')).toHaveValue(/daily briefing/i);
  await expect(page.locator('#taskForm textarea[name="prompt"]')).toHaveValue(/daily briefing/i);
});
test('OpenConnector apps the hosted runtime does not serve yet render disabled', async ({
  page
}) => {
  await mockAuthedApp(page, {
    lang: 'en'
  });
  await page.route('**/api/**', async route => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        openConnector: {
          available: false
        },
        connectors: [{
          id: 'github',
          name: 'GitHub',
          description: 'Repositories',
          authType: 'oauth',
          available: undefined,
          connection: null
        }, {
          id: 'oc_slack',
          name: 'Slack',
          description: 'Connect Slack to use its actions in chat. (via OpenConnector)',
          capabilities: ['Actions'],
          authType: 'oauth',
          available: false,
          connection: null
        }, {
          id: 'oc_amap',
          name: '高德地图',
          description: 'Connect 高德地图 to use its actions in chat. (via OpenConnector)',
          capabilities: ['Actions'],
          authType: 'api_key',
          available: false,
          connection: null
        }]
      })
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(3);

  /* Legacy OOMOL apps stay connectable when the gateway is configured. */
  await expect(page.locator('[data-connector-id="github"] button.plugin-directory-icon-action')).toBeEnabled();
  /* Stub-catalog apps (not covered by the gateway snapshot) are greyed out
     with the setup-needed title. */
  const slack = page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action');
  await expect(slack).toBeDisabled();
  await expect(slack).toHaveAttribute('title', 'Server setup needed');
  const amap = page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action');
  await expect(amap).toBeDisabled();
});
test('connected apps open manage or credential dialogs, disconnect works', async ({
  page
}) => {
  await mockAuthedApp(page, {
    lang: 'en'
  });
  let deleteSeen = null;
  await page.route('**/api/**', async route => {
    const url = route.request().url();
    if (url.includes('project-connectors') && route.request().method() === 'DELETE') {
      deleteSeen = url;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'disconnected'
        })
      });
      return;
    }
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        connectors: [{
          id: 'oc_slack',
          name: 'Slack',
          description: 'Team chat',
          capabilities: ['Messaging'],
          authType: 'oauth',
          available: true,
          connection: {
            status: 'connected',
            displayName: 'Study org',
            updatedAt: '2026-09-09T00:00:00.000Z'
          }
        }, {
          id: 'oc_amap',
          name: '高德地图',
          description: 'Maps',
          capabilities: ['Location'],
          authType: 'api_key',
          available: true,
          credentialInput: {
            fields: [{
              key: 'apiKey',
              label: 'API Key',
              type: 'password',
              required: true
            }]
          },
          connection: {
            status: 'connected',
            displayName: null,
            updatedAt: '2026-09-09T00:00:00.000Z'
          }
        }]
      })
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await page.evaluate(() => {
    window.showConfirm = async () => true;
  });

  /* OAuth app without a credential form gets the manage dialog. */
  await page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action').click();
  await expect(page.locator('#workspaceDialog [data-action="disconnect"]')).toBeVisible();
  await expect(page.locator('#workspaceDialog input').first()).toHaveValue(/connected.*Study org/);
  await page.locator('#workspaceDialog [data-action="disconnect"]').click();
  await expect.poll(() => deleteSeen).toContain('/oc_slack/connection');
  await expect(page.locator('#workspaceDialog')).toHaveClass(/hidden/);

  /* Key-based app still gets its credential form. */
  await page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action').click();
  await expect(page.locator('#projectConnectorForm')).toBeVisible();
});
test('OpenConnector apps served through the OOMOL cloud stay connectable', async ({
  page
}) => {
  await mockAuthedApp(page, {
    lang: 'en'
  });
  await page.route('**/api/**', async route => {
    if (!route.request().url().includes('project-connectors')) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        configured: true,
        openConnector: {
          available: false,
          cloud: true
        },
        connectors: [{
          id: 'oc_slack',
          name: 'Slack',
          description: 'Connect Slack to use its 2 actions in chat. (via OpenConnector)',
          capabilities: ['Messaging'],
          authType: 'oauth',
          available: true,
          connection: null
        }, {
          id: 'oc_amap',
          name: '高德地图',
          description: 'Connect 高德地图 to use its 15 actions in chat. (via OpenConnector)',
          capabilities: ['Location'],
          authType: 'api_key',
          available: true,
          credentialInput: {
            fields: [{
              key: 'apiKey',
              label: 'API Key',
              type: 'password',
              required: true
            }]
          },
          connection: null
        }]
      })
    });
  });
  await gotoAndSettle(page, '/');
  await waitForAppShell(page);
  await page.locator('#navPlugins').click();
  await expect(page.locator('.plugin-directory')).toBeVisible();
  await expect(page.locator('.plugin-directory-row')).toHaveCount(2);

  /* Cloud-served apps are enabled with the Connect title. */
  await expect(page.locator('[data-connector-id="oc_slack"] button.plugin-directory-icon-action')).toBeEnabled();
  const amap = page.locator('[data-connector-id="oc_amap"] button.plugin-directory-icon-action');
  await expect(amap).toBeEnabled();
  await expect(amap).toHaveAttribute('title', 'Connect');
});
test('OAuth return restores the original composer surface and plugin context', async ({
  page
}) => {
  await mockAuthedApp(page, {
    lang: 'en'
  });
  await page.addInitScript(() => {
    sessionStorage.setItem('socrates-connector-return-v1', JSON.stringify({
      connectorId: 'github',
      returnPath: '/',
      createdAt: Date.now(),
      composer: {
        topic: [{
          id: 'github',
          name: 'GitHub',
          description: 'Repositories',
          capabilities: ['Repositories'],
          directiveTemplate: 'Use my connected GitHub context.',
          iconMarkup: ''
        }],
        chat: [],
        drafts: {
          topic: 'Restored OAuth draft',
          chat: ''
        }
      }
    }));
  });
  await gotoAndSettle(page, '/plugins?connector=github');
  await waitForAppShell(page);
  await expect(page.locator('#topicSetup')).toBeVisible();
  await expect(page.locator('#pluginsPanel')).toBeHidden();
  await expect(page.locator('#topicInputWrap .composer-plugin-chip-label')).toHaveText(['GitHub']);
  await expect.poll(() => page.evaluate(() => window.__socratesComposerController?.getMarkdown('topic'))).toBe('Restored OAuth draft');
  await expect(page).toHaveURL(/127\.0\.0\.1:4173\/$/);
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJ0ZXN0IiwiZXhwZWN0IiwiZ290b0FuZFNldHRsZSIsIm1vY2tBdXRoZWRBcHAiLCJ3YWl0Rm9yQXBwU2hlbGwiLCJDT05ORUNUT1JTIiwiaWQiLCJuYW1lIiwiZGVzY3JpcHRpb24iLCJjYXBhYmlsaXRpZXMiLCJhdXRoVHlwZSIsImNvbm5lY3Rpb24iLCJzdGF0dXMiLCJkaXNwbGF5TmFtZSIsIm1vY2tDb25uZWN0ZWRDYXRhbG9nIiwicGFnZSIsInJvdXRlIiwicmVxdWVzdCIsInVybCIsImluY2x1ZGVzIiwiZmFsbGJhY2siLCJmdWxmaWxsIiwiY29udGVudFR5cGUiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsImNvbmZpZ3VyZWQiLCJjb25uZWN0b3JzIiwibGFuZyIsImxvY2F0b3IiLCJjbGljayIsIm1lbnUiLCJ0b0JlVmlzaWJsZSIsInRvSGF2ZUNvdW50Iiwic2VhcmNoIiwiZmlsbCIsInRvSGF2ZVRleHQiLCJmaXJzdCIsImtleWJvYXJkIiwicHJlc3MiLCJ0b0JlSGlkZGVuIiwiYXBwU2VhcmNoIiwiZ2V0QnlSb2xlIiwidG9IYXZlVmFsdWUiLCJvcGVuQ29ubmVjdG9yIiwiYXZhaWxhYmxlIiwidW5kZWZpbmVkIiwidG9CZUVuYWJsZWQiLCJzbGFjayIsInRvQmVEaXNhYmxlZCIsInRvSGF2ZUF0dHJpYnV0ZSIsImFtYXAiLCJkZWxldGVTZWVuIiwibWV0aG9kIiwidXBkYXRlZEF0IiwiY3JlZGVudGlhbElucHV0IiwiZmllbGRzIiwia2V5IiwibGFiZWwiLCJ0eXBlIiwicmVxdWlyZWQiLCJldmFsdWF0ZSIsIndpbmRvdyIsInNob3dDb25maXJtIiwicG9sbCIsInRvQ29udGFpbiIsInRvSGF2ZUNsYXNzIiwiY2xvdWQiLCJhZGRJbml0U2NyaXB0Iiwic2Vzc2lvblN0b3JhZ2UiLCJzZXRJdGVtIiwiY29ubmVjdG9ySWQiLCJyZXR1cm5QYXRoIiwiY3JlYXRlZEF0IiwiRGF0ZSIsIm5vdyIsImNvbXBvc2VyIiwidG9waWMiLCJkaXJlY3RpdmVUZW1wbGF0ZSIsImljb25NYXJrdXAiLCJjaGF0IiwiZHJhZnRzIiwiX19zb2NyYXRlc0NvbXBvc2VyQ29udHJvbGxlciIsImdldE1hcmtkb3duIiwidG9CZSIsInRvSGF2ZVVSTCJdLCJzb3VyY2VzIjpbInBsdWdpbi1kaXJlY3Rvcnkuc3BlYy5tanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgdGVzdCwgZXhwZWN0IH0gZnJvbSAnQHBsYXl3cmlnaHQvdGVzdCc7XHJcbmltcG9ydCB7IGdvdG9BbmRTZXR0bGUgfSBmcm9tICcuL19saWIubWpzJztcclxuaW1wb3J0IHsgbW9ja0F1dGhlZEFwcCwgd2FpdEZvckFwcFNoZWxsIH0gZnJvbSAnLi9fbW9jay1hcGkubWpzJztcclxuXHJcbmNvbnN0IENPTk5FQ1RPUlMgPSBbXHJcbiAge1xyXG4gICAgaWQ6ICdnaXRodWInLFxyXG4gICAgbmFtZTogJ0dpdEh1YicsXHJcbiAgICBkZXNjcmlwdGlvbjogJ0JyaW5nIHJlcG9zaXRvcmllcywgaXNzdWVzLCBwdWxsIHJlcXVlc3RzLCBhbmQgQ0kgY29udGV4dCBpbnRvIGEgY2hhdC4nLFxyXG4gICAgY2FwYWJpbGl0aWVzOiBbJ1JlcG9zaXRvcmllcycsICdJc3N1ZXMnXSxcclxuICAgIGF1dGhUeXBlOiAnb2F1dGgnLFxyXG4gICAgY29ubmVjdGlvbjogeyBzdGF0dXM6ICdjb25uZWN0ZWQnLCBkaXNwbGF5TmFtZTogJ1N0dWR5IG9yZycgfSxcclxuICB9LFxyXG4gIHtcclxuICAgIGlkOiAnZ21haWwnLFxyXG4gICAgbmFtZTogJ0dtYWlsJyxcclxuICAgIGRlc2NyaXB0aW9uOiAnU2VhcmNoIG1haWwgY29udGV4dCB0aGF0IHlvdSBleHBsaWNpdGx5IGF1dGhvcml6ZS4nLFxyXG4gICAgY2FwYWJpbGl0aWVzOiBbJ01haWwgc2VhcmNoJ10sXHJcbiAgICBhdXRoVHlwZTogJ29hdXRoJyxcclxuICAgIGNvbm5lY3Rpb246IG51bGwsXHJcbiAgfSxcclxuICB7XHJcbiAgICBpZDogJ25vdGlvbicsXHJcbiAgICBuYW1lOiAnTm90aW9uJyxcclxuICAgIGRlc2NyaXB0aW9uOiAnU2VhcmNoIHBhZ2VzIGFuZCBrbm93bGVkZ2UgeW91IHNoYXJlIHdpdGggU29jcmF0ZXMuJyxcclxuICAgIGNhcGFiaWxpdGllczogWydQYWdlIHNlYXJjaCddLFxyXG4gICAgYXV0aFR5cGU6ICdvYXV0aCcsXHJcbiAgICBjb25uZWN0aW9uOiB7IHN0YXR1czogJ2Nvbm5lY3RlZCcsIGRpc3BsYXlOYW1lOiAnUGVyc29uYWwgbm90ZXMnIH0sXHJcbiAgfSxcclxuXTtcclxuXHJcbmFzeW5jIGZ1bmN0aW9uIG1vY2tDb25uZWN0ZWRDYXRhbG9nKHBhZ2UpIHtcclxuICBhd2FpdCBwYWdlLnJvdXRlKCcqKi9hcGkvKionLCBhc3luYyAocm91dGUpID0+IHtcclxuICAgIGlmICghcm91dGUucmVxdWVzdCgpLnVybCgpLmluY2x1ZGVzKCdwcm9qZWN0LWNvbm5lY3RvcnMnKSkge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mYWxsYmFjaygpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHtcclxuICAgICAgc3RhdHVzOiAyMDAsXHJcbiAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgY29uZmlndXJlZDogdHJ1ZSwgY29ubmVjdG9yczogQ09OTkVDVE9SUyB9KSxcclxuICAgIH0pO1xyXG4gIH0pO1xyXG59XHJcblxyXG50ZXN0KCdwbHVzIG1lbnUgc3VwcG9ydHMgcmVhbCBjb25uZWN0b3Igc2VhcmNoLCBtdWx0aS1zZWxlY3QsIGFuZCByZW1vdmFsJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgYXdhaXQgbW9ja0F1dGhlZEFwcChwYWdlLCB7IGxhbmc6ICdlbicgfSk7XHJcbiAgYXdhaXQgbW9ja0Nvbm5lY3RlZENhdGFsb2cocGFnZSk7XHJcbiAgYXdhaXQgZ290b0FuZFNldHRsZShwYWdlLCAnLycpO1xyXG4gIGF3YWl0IHdhaXRGb3JBcHBTaGVsbChwYWdlKTtcclxuXHJcbiAgYXdhaXQgcGFnZS5sb2NhdG9yKCcjdG9waWNDb21wb3NlclRvb2xzQnRuJykuY2xpY2soKTtcclxuICBjb25zdCBtZW51ID0gcGFnZS5sb2NhdG9yKCcjY29tcG9zZXJUb29sc01lbnUnKTtcclxuICBhd2FpdCBleHBlY3QobWVudSkudG9CZVZpc2libGUoKTtcclxuICBhd2FpdCBleHBlY3QobWVudS5sb2NhdG9yKCdbZGF0YS1jb21wb3Nlci1wbHVnaW5dJykpLnRvSGF2ZUNvdW50KDIpO1xyXG4gIC8vIERpc2Nvbm5lY3RlZCBjb25uZWN0b3JzIHN0YXkgb3V0IG9mIHRoZSBjb21wb3NlciByb3N0ZXIuXHJcbiAgYXdhaXQgZXhwZWN0KG1lbnUubG9jYXRvcignW2RhdGEtY29tcG9zZXItcGx1Z2luPVwiZ21haWxcIl0nKSkudG9IYXZlQ291bnQoMCk7XHJcblxyXG4gIGNvbnN0IHNlYXJjaCA9IG1lbnUubG9jYXRvcignLmNvbXBvc2VyLXRvb2xzLXNlYXJjaCBpbnB1dCcpO1xyXG4gIGF3YWl0IHNlYXJjaC5maWxsKCdub3Rpb24nKTtcclxuICBhd2FpdCBleHBlY3QobWVudS5sb2NhdG9yKCdbZGF0YS1jb21wb3Nlci1wbHVnaW5dJykpLnRvSGF2ZUNvdW50KDEpO1xyXG4gIGF3YWl0IGV4cGVjdChtZW51LmxvY2F0b3IoJ1tkYXRhLWNvbXBvc2VyLXBsdWdpbj1cIm5vdGlvblwiXScpKS50b0JlVmlzaWJsZSgpO1xyXG5cclxuICBhd2FpdCBzZWFyY2guZmlsbCgnJyk7XHJcbiAgYXdhaXQgcGFnZS5sb2NhdG9yKCdbZGF0YS1jb21wb3Nlci1wbHVnaW49XCJnaXRodWJcIl0nKS5jbGljaygpO1xyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignW2RhdGEtY29tcG9zZXItcGx1Z2luPVwibm90aW9uXCJdJykuY2xpY2soKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdG9waWNJbnB1dFdyYXAgLmNvbXBvc2VyLXBsdWdpbi1jaGlwJykpLnRvSGF2ZUNvdW50KDIpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN0b3BpY0lucHV0V3JhcCAuY29tcG9zZXItcGx1Z2luLWNoaXAtbGFiZWwnKSkudG9IYXZlVGV4dChbJ0dpdEh1YicsICdOb3Rpb24nXSk7XHJcblxyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignI3RvcGljSW5wdXRXcmFwIC5jb21wb3Nlci1wbHVnaW4tY2hpcC1yZW1vdmUnKS5maXJzdCgpLmNsaWNrKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3RvcGljSW5wdXRXcmFwIC5jb21wb3Nlci1wbHVnaW4tY2hpcCcpKS50b0hhdmVDb3VudCgxKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdG9waWNJbnB1dFdyYXAgLmNvbXBvc2VyLXBsdWdpbi1jaGlwLWxhYmVsJykpLnRvSGF2ZVRleHQoWydOb3Rpb24nXSk7XHJcbiAgYXdhaXQgcGFnZS5rZXlib2FyZC5wcmVzcygnRXNjYXBlJyk7XHJcbiAgYXdhaXQgZXhwZWN0KG1lbnUpLnRvQmVIaWRkZW4oKTtcclxufSk7XHJcblxyXG50ZXN0KCdwbHVnaW4gY2VudGVyIGZpbHRlcnMgcHVibGljL3BlcnNvbmFsIGFwcHMgYW5kIHNjaGVkdWxlZCB0ZW1wbGF0ZXMgcHJlZmlsbCB0aGUgZm9ybScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gIGF3YWl0IG1vY2tBdXRoZWRBcHAocGFnZSwgeyBsYW5nOiAnZW4nIH0pO1xyXG4gIGF3YWl0IG1vY2tDb25uZWN0ZWRDYXRhbG9nKHBhZ2UpO1xyXG4gIGF3YWl0IGdvdG9BbmRTZXR0bGUocGFnZSwgJy8nKTtcclxuICBhd2FpdCB3YWl0Rm9yQXBwU2hlbGwocGFnZSk7XHJcblxyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignI25hdlBsdWdpbnMnKS5jbGljaygpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5JykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgLy8gVGhlIHB1YmxpYyBzY29wZSBpcyB0aGUgZGVmYXVsdCwgbWF0Y2hpbmcgdGhlIHJlZmVyZW5jZSBkZXNpZ24uXHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnBsdWdpbi1kaXJlY3Rvcnktcm93JykpLnRvSGF2ZUNvdW50KDMpO1xyXG5cclxuICBjb25zdCBhcHBTZWFyY2ggPSBwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5LXNlYXJjaCBpbnB1dCcpO1xyXG4gIGF3YWl0IGFwcFNlYXJjaC5maWxsKCdnbWFpbCcpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5LXJvdycpKS50b0hhdmVDb3VudCgxKTtcclxuICBhd2FpdCBhcHBTZWFyY2guZmlsbCgnenp6LW5vLXN1Y2gtYXBwJyk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnBsdWdpbi1kaXJlY3Rvcnktcm93JykpLnRvSGF2ZUNvdW50KDApO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5LWVtcHR5JykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgYXdhaXQgYXBwU2VhcmNoLmZpbGwoJycpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5LXJvdycpKS50b0hhdmVDb3VudCgzKTtcclxuICBhd2FpdCBwYWdlLmdldEJ5Um9sZSgndGFiJywgeyBuYW1lOiAnUGVyc29uYWwnIH0pLmNsaWNrKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnBsdWdpbi1kaXJlY3Rvcnktcm93JykpLnRvSGF2ZUNvdW50KDIpO1xyXG5cclxuICAvLyBUaGUgZGlyZWN0b3J5IGlzIGEgZGlyZWN0IHNpZGViYXIgZGVzdGluYXRpb247IG5ldy1jaGF0IHJldHVybnMgaG9tZS5cclxuICBhd2FpdCBwYWdlLmxvY2F0b3IoJyNuYXZOZXcnKS5jbGljaygpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN0b3BpY1NldHVwJykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3BsdWdpbnNQYW5lbCcpKS50b0JlSGlkZGVuKCk7XHJcblxyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignI25hdlNjaGVkdWxlZCcpLmNsaWNrKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnNjaGVkdWxlZC1kaXJlY3RvcnknKSkudG9CZVZpc2libGUoKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcuc2NoZWR1bGVkLXJlY29tbWVuZGF0aW9uJykpLnRvSGF2ZUNvdW50KDUpO1xyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignLnNjaGVkdWxlZC1yZWNvbW1lbmRhdGlvbicpLmZpcnN0KCkuY2xpY2soKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFza0Zvcm0nKSkudG9CZVZpc2libGUoKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFza0Zvcm0gaW5wdXRbbmFtZT1cInRpdGxlXCJdJykpLnRvSGF2ZVZhbHVlKC9kYWlseSBicmllZmluZy9pKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdGFza0Zvcm0gdGV4dGFyZWFbbmFtZT1cInByb21wdFwiXScpKS50b0hhdmVWYWx1ZSgvZGFpbHkgYnJpZWZpbmcvaSk7XHJcbn0pO1xyXG5cclxudGVzdCgnT3BlbkNvbm5lY3RvciBhcHBzIHRoZSBob3N0ZWQgcnVudGltZSBkb2VzIG5vdCBzZXJ2ZSB5ZXQgcmVuZGVyIGRpc2FibGVkJywgYXN5bmMgKHsgcGFnZSB9KSA9PiB7XHJcbiAgYXdhaXQgbW9ja0F1dGhlZEFwcChwYWdlLCB7IGxhbmc6ICdlbicgfSk7XHJcbiAgYXdhaXQgcGFnZS5yb3V0ZSgnKiovYXBpLyoqJywgYXN5bmMgKHJvdXRlKSA9PiB7XHJcbiAgICBpZiAoIXJvdXRlLnJlcXVlc3QoKS51cmwoKS5pbmNsdWRlcygncHJvamVjdC1jb25uZWN0b3JzJykpIHtcclxuICAgICAgYXdhaXQgcm91dGUuZmFsbGJhY2soKTtcclxuICAgICAgcmV0dXJuO1xyXG4gICAgfVxyXG4gICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7XHJcbiAgICAgIHN0YXR1czogMjAwLFxyXG4gICAgICBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLFxyXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XHJcbiAgICAgICAgY29uZmlndXJlZDogdHJ1ZSxcclxuICAgICAgICBvcGVuQ29ubmVjdG9yOiB7IGF2YWlsYWJsZTogZmFsc2UgfSxcclxuICAgICAgICBjb25uZWN0b3JzOiBbXHJcbiAgICAgICAgICB7IGlkOiAnZ2l0aHViJywgbmFtZTogJ0dpdEh1YicsIGRlc2NyaXB0aW9uOiAnUmVwb3NpdG9yaWVzJywgYXV0aFR5cGU6ICdvYXV0aCcsIGF2YWlsYWJsZTogdW5kZWZpbmVkLCBjb25uZWN0aW9uOiBudWxsIH0sXHJcbiAgICAgICAgICB7IGlkOiAnb2Nfc2xhY2snLCBuYW1lOiAnU2xhY2snLCBkZXNjcmlwdGlvbjogJ0Nvbm5lY3QgU2xhY2sgdG8gdXNlIGl0cyBhY3Rpb25zIGluIGNoYXQuICh2aWEgT3BlbkNvbm5lY3RvciknLCBjYXBhYmlsaXRpZXM6IFsnQWN0aW9ucyddLCBhdXRoVHlwZTogJ29hdXRoJywgYXZhaWxhYmxlOiBmYWxzZSwgY29ubmVjdGlvbjogbnVsbCB9LFxyXG4gICAgICAgICAgeyBpZDogJ29jX2FtYXAnLCBuYW1lOiAn6auY5b635Zyw5Zu+JywgZGVzY3JpcHRpb246ICdDb25uZWN0IOmrmOW+t+WcsOWbviB0byB1c2UgaXRzIGFjdGlvbnMgaW4gY2hhdC4gKHZpYSBPcGVuQ29ubmVjdG9yKScsIGNhcGFiaWxpdGllczogWydBY3Rpb25zJ10sIGF1dGhUeXBlOiAnYXBpX2tleScsIGF2YWlsYWJsZTogZmFsc2UsIGNvbm5lY3Rpb246IG51bGwgfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9KSxcclxuICAgIH0pO1xyXG4gIH0pO1xyXG4gIGF3YWl0IGdvdG9BbmRTZXR0bGUocGFnZSwgJy8nKTtcclxuICBhd2FpdCB3YWl0Rm9yQXBwU2hlbGwocGFnZSk7XHJcblxyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignI25hdlBsdWdpbnMnKS5jbGljaygpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5JykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnBsdWdpbi1kaXJlY3Rvcnktcm93JykpLnRvSGF2ZUNvdW50KDMpO1xyXG5cclxuICAvKiBMZWdhY3kgT09NT0wgYXBwcyBzdGF5IGNvbm5lY3RhYmxlIHdoZW4gdGhlIGdhdGV3YXkgaXMgY29uZmlndXJlZC4gKi9cclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCdbZGF0YS1jb25uZWN0b3ItaWQ9XCJnaXRodWJcIl0gYnV0dG9uLnBsdWdpbi1kaXJlY3RvcnktaWNvbi1hY3Rpb24nKSkudG9CZUVuYWJsZWQoKTtcclxuICAvKiBTdHViLWNhdGFsb2cgYXBwcyAobm90IGNvdmVyZWQgYnkgdGhlIGdhdGV3YXkgc25hcHNob3QpIGFyZSBncmV5ZWQgb3V0XHJcbiAgICAgd2l0aCB0aGUgc2V0dXAtbmVlZGVkIHRpdGxlLiAqL1xyXG4gIGNvbnN0IHNsYWNrID0gcGFnZS5sb2NhdG9yKCdbZGF0YS1jb25uZWN0b3ItaWQ9XCJvY19zbGFja1wiXSBidXR0b24ucGx1Z2luLWRpcmVjdG9yeS1pY29uLWFjdGlvbicpO1xyXG4gIGF3YWl0IGV4cGVjdChzbGFjaykudG9CZURpc2FibGVkKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHNsYWNrKS50b0hhdmVBdHRyaWJ1dGUoJ3RpdGxlJywgJ1NlcnZlciBzZXR1cCBuZWVkZWQnKTtcclxuICBjb25zdCBhbWFwID0gcGFnZS5sb2NhdG9yKCdbZGF0YS1jb25uZWN0b3ItaWQ9XCJvY19hbWFwXCJdIGJ1dHRvbi5wbHVnaW4tZGlyZWN0b3J5LWljb24tYWN0aW9uJyk7XHJcbiAgYXdhaXQgZXhwZWN0KGFtYXApLnRvQmVEaXNhYmxlZCgpO1xyXG59KTtcclxuXHJcbnRlc3QoJ2Nvbm5lY3RlZCBhcHBzIG9wZW4gbWFuYWdlIG9yIGNyZWRlbnRpYWwgZGlhbG9ncywgZGlzY29ubmVjdCB3b3JrcycsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gIGF3YWl0IG1vY2tBdXRoZWRBcHAocGFnZSwgeyBsYW5nOiAnZW4nIH0pO1xyXG4gIGxldCBkZWxldGVTZWVuID0gbnVsbDtcclxuICBhd2FpdCBwYWdlLnJvdXRlKCcqKi9hcGkvKionLCBhc3luYyAocm91dGUpID0+IHtcclxuICAgIGNvbnN0IHVybCA9IHJvdXRlLnJlcXVlc3QoKS51cmwoKTtcclxuICAgIGlmICh1cmwuaW5jbHVkZXMoJ3Byb2plY3QtY29ubmVjdG9ycycpICYmIHJvdXRlLnJlcXVlc3QoKS5tZXRob2QoKSA9PT0gJ0RFTEVURScpIHtcclxuICAgICAgZGVsZXRlU2VlbiA9IHVybDtcclxuICAgICAgYXdhaXQgcm91dGUuZnVsZmlsbCh7IHN0YXR1czogMjAwLCBjb250ZW50VHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nLCBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHN0YXR1czogJ2Rpc2Nvbm5lY3RlZCcgfSkgfSk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGlmICghcm91dGUucmVxdWVzdCgpLnVybCgpLmluY2x1ZGVzKCdwcm9qZWN0LWNvbm5lY3RvcnMnKSkge1xyXG4gICAgICBhd2FpdCByb3V0ZS5mYWxsYmFjaygpO1xyXG4gICAgICByZXR1cm47XHJcbiAgICB9XHJcbiAgICBhd2FpdCByb3V0ZS5mdWxmaWxsKHtcclxuICAgICAgc3RhdHVzOiAyMDAsXHJcbiAgICAgIGNvbnRlbnRUeXBlOiAnYXBwbGljYXRpb24vanNvbicsXHJcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgICBjb25maWd1cmVkOiB0cnVlLFxyXG4gICAgICAgIGNvbm5lY3RvcnM6IFtcclxuICAgICAgICAgIHsgaWQ6ICdvY19zbGFjaycsIG5hbWU6ICdTbGFjaycsIGRlc2NyaXB0aW9uOiAnVGVhbSBjaGF0JywgY2FwYWJpbGl0aWVzOiBbJ01lc3NhZ2luZyddLCBhdXRoVHlwZTogJ29hdXRoJywgYXZhaWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjb25uZWN0aW9uOiB7IHN0YXR1czogJ2Nvbm5lY3RlZCcsIGRpc3BsYXlOYW1lOiAnU3R1ZHkgb3JnJywgdXBkYXRlZEF0OiAnMjAyNi0wOS0wOVQwMDowMDowMC4wMDBaJyB9IH0sXHJcbiAgICAgICAgICB7IGlkOiAnb2NfYW1hcCcsIG5hbWU6ICfpq5jlvrflnLDlm74nLCBkZXNjcmlwdGlvbjogJ01hcHMnLCBjYXBhYmlsaXRpZXM6IFsnTG9jYXRpb24nXSwgYXV0aFR5cGU6ICdhcGlfa2V5JywgYXZhaWxhYmxlOiB0cnVlLFxyXG4gICAgICAgICAgICBjcmVkZW50aWFsSW5wdXQ6IHsgZmllbGRzOiBbeyBrZXk6ICdhcGlLZXknLCBsYWJlbDogJ0FQSSBLZXknLCB0eXBlOiAncGFzc3dvcmQnLCByZXF1aXJlZDogdHJ1ZSB9XSB9LFxyXG4gICAgICAgICAgICBjb25uZWN0aW9uOiB7IHN0YXR1czogJ2Nvbm5lY3RlZCcsIGRpc3BsYXlOYW1lOiBudWxsLCB1cGRhdGVkQXQ6ICcyMDI2LTA5LTA5VDAwOjAwOjAwLjAwMFonIH0gfSxcclxuICAgICAgICBdLFxyXG4gICAgICB9KSxcclxuICAgIH0pO1xyXG4gIH0pO1xyXG4gIGF3YWl0IGdvdG9BbmRTZXR0bGUocGFnZSwgJy8nKTtcclxuICBhd2FpdCB3YWl0Rm9yQXBwU2hlbGwocGFnZSk7XHJcblxyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignI25hdlBsdWdpbnMnKS5jbGljaygpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJy5wbHVnaW4tZGlyZWN0b3J5JykpLnRvQmVWaXNpYmxlKCk7XHJcbiAgYXdhaXQgcGFnZS5ldmFsdWF0ZSgoKSA9PiB7IHdpbmRvdy5zaG93Q29uZmlybSA9IGFzeW5jICgpID0+IHRydWU7IH0pO1xyXG5cclxuICAvKiBPQXV0aCBhcHAgd2l0aG91dCBhIGNyZWRlbnRpYWwgZm9ybSBnZXRzIHRoZSBtYW5hZ2UgZGlhbG9nLiAqL1xyXG4gIGF3YWl0IHBhZ2UubG9jYXRvcignW2RhdGEtY29ubmVjdG9yLWlkPVwib2Nfc2xhY2tcIl0gYnV0dG9uLnBsdWdpbi1kaXJlY3RvcnktaWNvbi1hY3Rpb24nKS5jbGljaygpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN3b3Jrc3BhY2VEaWFsb2cgW2RhdGEtYWN0aW9uPVwiZGlzY29ubmVjdFwiXScpKS50b0JlVmlzaWJsZSgpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN3b3Jrc3BhY2VEaWFsb2cgaW5wdXQnKS5maXJzdCgpKS50b0hhdmVWYWx1ZSgvY29ubmVjdGVkLipTdHVkeSBvcmcvKTtcclxuICBhd2FpdCBwYWdlLmxvY2F0b3IoJyN3b3Jrc3BhY2VEaWFsb2cgW2RhdGEtYWN0aW9uPVwiZGlzY29ubmVjdFwiXScpLmNsaWNrKCk7XHJcbiAgYXdhaXQgZXhwZWN0LnBvbGwoKCkgPT4gZGVsZXRlU2VlbikudG9Db250YWluKCcvb2Nfc2xhY2svY29ubmVjdGlvbicpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyN3b3Jrc3BhY2VEaWFsb2cnKSkudG9IYXZlQ2xhc3MoL2hpZGRlbi8pO1xyXG5cclxuICAvKiBLZXktYmFzZWQgYXBwIHN0aWxsIGdldHMgaXRzIGNyZWRlbnRpYWwgZm9ybS4gKi9cclxuICBhd2FpdCBwYWdlLmxvY2F0b3IoJ1tkYXRhLWNvbm5lY3Rvci1pZD1cIm9jX2FtYXBcIl0gYnV0dG9uLnBsdWdpbi1kaXJlY3RvcnktaWNvbi1hY3Rpb24nKS5jbGljaygpO1xyXG4gIGF3YWl0IGV4cGVjdChwYWdlLmxvY2F0b3IoJyNwcm9qZWN0Q29ubmVjdG9yRm9ybScpKS50b0JlVmlzaWJsZSgpO1xyXG59KTtcclxuXHJcbnRlc3QoJ09wZW5Db25uZWN0b3IgYXBwcyBzZXJ2ZWQgdGhyb3VnaCB0aGUgT09NT0wgY2xvdWQgc3RheSBjb25uZWN0YWJsZScsIGFzeW5jICh7IHBhZ2UgfSkgPT4ge1xyXG4gIGF3YWl0IG1vY2tBdXRoZWRBcHAocGFnZSwgeyBsYW5nOiAnZW4nIH0pO1xyXG4gIGF3YWl0IHBhZ2Uucm91dGUoJyoqL2FwaS8qKicsIGFzeW5jIChyb3V0ZSkgPT4ge1xyXG4gICAgaWYgKCFyb3V0ZS5yZXF1ZXN0KCkudXJsKCkuaW5jbHVkZXMoJ3Byb2plY3QtY29ubmVjdG9ycycpKSB7XHJcbiAgICAgIGF3YWl0IHJvdXRlLmZhbGxiYWNrKCk7XHJcbiAgICAgIHJldHVybjtcclxuICAgIH1cclxuICAgIGF3YWl0IHJvdXRlLmZ1bGZpbGwoe1xyXG4gICAgICBzdGF0dXM6IDIwMCxcclxuICAgICAgY29udGVudFR5cGU6ICdhcHBsaWNhdGlvbi9qc29uJyxcclxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xyXG4gICAgICAgIGNvbmZpZ3VyZWQ6IHRydWUsXHJcbiAgICAgICAgb3BlbkNvbm5lY3RvcjogeyBhdmFpbGFibGU6IGZhbHNlLCBjbG91ZDogdHJ1ZSB9LFxyXG4gICAgICAgIGNvbm5lY3RvcnM6IFtcclxuICAgICAgICAgIHsgaWQ6ICdvY19zbGFjaycsIG5hbWU6ICdTbGFjaycsIGRlc2NyaXB0aW9uOiAnQ29ubmVjdCBTbGFjayB0byB1c2UgaXRzIDIgYWN0aW9ucyBpbiBjaGF0LiAodmlhIE9wZW5Db25uZWN0b3IpJywgY2FwYWJpbGl0aWVzOiBbJ01lc3NhZ2luZyddLCBhdXRoVHlwZTogJ29hdXRoJywgYXZhaWxhYmxlOiB0cnVlLCBjb25uZWN0aW9uOiBudWxsIH0sXHJcbiAgICAgICAgICB7IGlkOiAnb2NfYW1hcCcsIG5hbWU6ICfpq5jlvrflnLDlm74nLCBkZXNjcmlwdGlvbjogJ0Nvbm5lY3Qg6auY5b635Zyw5Zu+IHRvIHVzZSBpdHMgMTUgYWN0aW9ucyBpbiBjaGF0LiAodmlhIE9wZW5Db25uZWN0b3IpJywgY2FwYWJpbGl0aWVzOiBbJ0xvY2F0aW9uJ10sIGF1dGhUeXBlOiAnYXBpX2tleScsIGF2YWlsYWJsZTogdHJ1ZSwgY3JlZGVudGlhbElucHV0OiB7IGZpZWxkczogW3sga2V5OiAnYXBpS2V5JywgbGFiZWw6ICdBUEkgS2V5JywgdHlwZTogJ3Bhc3N3b3JkJywgcmVxdWlyZWQ6IHRydWUgfV0gfSwgY29ubmVjdGlvbjogbnVsbCB9LFxyXG4gICAgICAgIF0sXHJcbiAgICAgIH0pLFxyXG4gICAgfSk7XHJcbiAgfSk7XHJcbiAgYXdhaXQgZ290b0FuZFNldHRsZShwYWdlLCAnLycpO1xyXG4gIGF3YWl0IHdhaXRGb3JBcHBTaGVsbChwYWdlKTtcclxuXHJcbiAgYXdhaXQgcGFnZS5sb2NhdG9yKCcjbmF2UGx1Z2lucycpLmNsaWNrKCk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignLnBsdWdpbi1kaXJlY3RvcnknKSkudG9CZVZpc2libGUoKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcucGx1Z2luLWRpcmVjdG9yeS1yb3cnKSkudG9IYXZlQ291bnQoMik7XHJcblxyXG4gIC8qIENsb3VkLXNlcnZlZCBhcHBzIGFyZSBlbmFibGVkIHdpdGggdGhlIENvbm5lY3QgdGl0bGUuICovXHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignW2RhdGEtY29ubmVjdG9yLWlkPVwib2Nfc2xhY2tcIl0gYnV0dG9uLnBsdWdpbi1kaXJlY3RvcnktaWNvbi1hY3Rpb24nKSkudG9CZUVuYWJsZWQoKTtcclxuICBjb25zdCBhbWFwID0gcGFnZS5sb2NhdG9yKCdbZGF0YS1jb25uZWN0b3ItaWQ9XCJvY19hbWFwXCJdIGJ1dHRvbi5wbHVnaW4tZGlyZWN0b3J5LWljb24tYWN0aW9uJyk7XHJcbiAgYXdhaXQgZXhwZWN0KGFtYXApLnRvQmVFbmFibGVkKCk7XHJcbiAgYXdhaXQgZXhwZWN0KGFtYXApLnRvSGF2ZUF0dHJpYnV0ZSgndGl0bGUnLCAnQ29ubmVjdCcpO1xyXG59KTtcclxuXHJcbnRlc3QoJ09BdXRoIHJldHVybiByZXN0b3JlcyB0aGUgb3JpZ2luYWwgY29tcG9zZXIgc3VyZmFjZSBhbmQgcGx1Z2luIGNvbnRleHQnLCBhc3luYyAoeyBwYWdlIH0pID0+IHtcclxuICBhd2FpdCBtb2NrQXV0aGVkQXBwKHBhZ2UsIHsgbGFuZzogJ2VuJyB9KTtcclxuICBhd2FpdCBwYWdlLmFkZEluaXRTY3JpcHQoKCkgPT4ge1xyXG4gICAgc2Vzc2lvblN0b3JhZ2Uuc2V0SXRlbSgnc29jcmF0ZXMtY29ubmVjdG9yLXJldHVybi12MScsIEpTT04uc3RyaW5naWZ5KHtcclxuICAgICAgY29ubmVjdG9ySWQ6ICdnaXRodWInLFxyXG4gICAgICByZXR1cm5QYXRoOiAnLycsXHJcbiAgICAgIGNyZWF0ZWRBdDogRGF0ZS5ub3coKSxcclxuICAgICAgY29tcG9zZXI6IHtcclxuICAgICAgICB0b3BpYzogW3tcclxuICAgICAgICAgIGlkOiAnZ2l0aHViJyxcclxuICAgICAgICAgIG5hbWU6ICdHaXRIdWInLFxyXG4gICAgICAgICAgZGVzY3JpcHRpb246ICdSZXBvc2l0b3JpZXMnLFxyXG4gICAgICAgICAgY2FwYWJpbGl0aWVzOiBbJ1JlcG9zaXRvcmllcyddLFxyXG4gICAgICAgICAgZGlyZWN0aXZlVGVtcGxhdGU6ICdVc2UgbXkgY29ubmVjdGVkIEdpdEh1YiBjb250ZXh0LicsXHJcbiAgICAgICAgICBpY29uTWFya3VwOiAnJyxcclxuICAgICAgICB9XSxcclxuICAgICAgICBjaGF0OiBbXSxcclxuICAgICAgICBkcmFmdHM6IHsgdG9waWM6ICdSZXN0b3JlZCBPQXV0aCBkcmFmdCcsIGNoYXQ6ICcnIH0sXHJcbiAgICAgIH0sXHJcbiAgICB9KSk7XHJcbiAgfSk7XHJcbiAgYXdhaXQgZ290b0FuZFNldHRsZShwYWdlLCAnL3BsdWdpbnM/Y29ubmVjdG9yPWdpdGh1YicpO1xyXG4gIGF3YWl0IHdhaXRGb3JBcHBTaGVsbChwYWdlKTtcclxuXHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UubG9jYXRvcignI3RvcGljU2V0dXAnKSkudG9CZVZpc2libGUoKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjcGx1Z2luc1BhbmVsJykpLnRvQmVIaWRkZW4oKTtcclxuICBhd2FpdCBleHBlY3QocGFnZS5sb2NhdG9yKCcjdG9waWNJbnB1dFdyYXAgLmNvbXBvc2VyLXBsdWdpbi1jaGlwLWxhYmVsJykpLnRvSGF2ZVRleHQoWydHaXRIdWInXSk7XHJcbiAgYXdhaXQgZXhwZWN0LnBvbGwoKCkgPT4gcGFnZS5ldmFsdWF0ZSgoKSA9PiB3aW5kb3cuX19zb2NyYXRlc0NvbXBvc2VyQ29udHJvbGxlcj8uZ2V0TWFya2Rvd24oJ3RvcGljJykpKVxyXG4gICAgLnRvQmUoJ1Jlc3RvcmVkIE9BdXRoIGRyYWZ0Jyk7XHJcbiAgYXdhaXQgZXhwZWN0KHBhZ2UpLnRvSGF2ZVVSTCgvMTI3XFwuMFxcLjBcXC4xOjQxNzNcXC8kLyk7XHJcbn0pO1xyXG4iXSwibWFwcGluZ3MiOiJBQUFBLFNBQVNBLElBQUksRUFBRUMsTUFBTSxRQUFRLGtCQUFrQjtBQUMvQyxTQUFTQyxhQUFhLFFBQVEsWUFBWTtBQUMxQyxTQUFTQyxhQUFhLEVBQUVDLGVBQWUsUUFBUSxpQkFBaUI7QUFFaEUsTUFBTUMsVUFBVSxHQUFHLENBQ2pCO0VBQ0VDLEVBQUUsRUFBRSxRQUFRO0VBQ1pDLElBQUksRUFBRSxRQUFRO0VBQ2RDLFdBQVcsRUFBRSx3RUFBd0U7RUFDckZDLFlBQVksRUFBRSxDQUFDLGNBQWMsRUFBRSxRQUFRLENBQUM7RUFDeENDLFFBQVEsRUFBRSxPQUFPO0VBQ2pCQyxVQUFVLEVBQUU7SUFBRUMsTUFBTSxFQUFFLFdBQVc7SUFBRUMsV0FBVyxFQUFFO0VBQVk7QUFDOUQsQ0FBQyxFQUNEO0VBQ0VQLEVBQUUsRUFBRSxPQUFPO0VBQ1hDLElBQUksRUFB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