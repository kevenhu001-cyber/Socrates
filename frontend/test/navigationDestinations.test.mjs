import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DESTINATIONS, isPageDestination, isWorkspacePage } from '../src/sidebar/navigation.destinations.ts';
import { WORKSPACE_ROUTES, workspaceForPath } from '../src/app/router.js';
import { openNav, exitPluginsView, registerNavigationAdapters, syncWorkspaceRoute } from '../src/sidebar/navigation.service.ts';
import { getActiveDestination } from '../src/sidebar/navigation.store.ts';

const dom = new JSDOM('<!doctype html><html><body><div id="topicSetup" class="hidden"></div><div id="chatView"></div><div id="pluginsPanel" class="hidden"></div><div id="spacesPanel" class="hidden"></div></body></html>', { url: 'http://localhost/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, location: dom.window.location, history: dom.window.history });

test('route metadata resolves trailing slashes and rejects non-page keys', () => {
  for (const [name, { path }] of Object.entries(DESTINATIONS)) {
    assert.equal(WORKSPACE_ROUTES[name], path);
    assert.equal(workspaceForPath(path + '/'), name);
  }
  assert.equal(isPageDestination('constructor'), false);
  assert.equal(isPageDestination('more'), false);
  assert.equal(isWorkspacePage('unknown'), false);
  assert.equal(workspaceForPath('/unknown'), null);
});

test('home and plugin return restore the existing chat; transient menus preserve navigation', () => {
  registerNavigationAdapters({});
  openNav('projects');
  assert.equal(location.pathname, '/projects');
  assert.equal(getActiveDestination(), 'projects');
  openNav('more');
  assert.equal(getActiveDestination(), 'projects');
  openNav('unknown');
  assert.equal(location.pathname, '/projects');
  openNav('plugins');
  openNav('plugins');
  exitPluginsView();
  assert.equal(location.pathname, '/');
  assert.equal(document.getElementById('chatView').classList.contains('hidden'), false);
  assert.equal(getActiveDestination(), null);
  openNav('projects');
  history.replaceState({}, '', '/');
  syncWorkspaceRoute();
  assert.equal(getActiveDestination(), null);
  assert.equal(document.getElementById('spacesPanel').classList.contains('hidden'), true);
  assert.equal(document.getElementById('chatView').classList.contains('hidden'), false);
  dom.window.close();
});
