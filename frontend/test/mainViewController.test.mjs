import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';

import {
  activateMainView,
  getVisibleCoreView,
} from '../src/ui/mainViewController.js';

function createDocument() {
  return new JSDOM(`<!doctype html><html><body class="workspace-active plugins-active admin-active exam-active">
    <div id="pluginWorkspaceTabs"></div>
    <div id="mobileMode"></div>
    <button id="mobileIncognitoBtn"></button>
    <div id="mainInner" class="hidden">
      <div id="topicSetup"></div>
      <div id="diagnosticView" class="hidden"></div>
      <div id="libraryPanel" class="main-page hidden"></div>
      <div id="spacesPanel" class="main-page hidden"></div>
      <div id="scheduledPanel" class="main-page hidden"></div>
      <div id="pluginsPanel" class="main-page"></div>
      <div id="imagesPanel" class="main-page hidden"></div>
      <div id="assistantsPanel" class="main-page hidden"></div>
      <div id="sitesPanel" class="main-page hidden"></div>
      <div id="adminPanel" class="main-page hidden"></div>
    </div>
    <div id="examView"></div>
    <div id="chatView" class="hidden"></div>
    <span data-exam-only="true"></span>
  </body></html>`).window.document;
}

function isHidden(document, id) {
  return document.getElementById(id).classList.contains('hidden');
}

test('activateMainView makes one workspace page authoritative', () => {
  const document = createDocument();

  activateMainView('libraryPanel', document);

  assert.equal(isHidden(document, 'libraryPanel'), false);
  for (const id of ['topicSetup', 'diagnosticView', 'chatView', 'spacesPanel', 'scheduledPanel', 'pluginsPanel', 'examView']) {
    assert.equal(isHidden(document, id), true, `${id} should be hidden`);
  }
  assert.equal(isHidden(document, 'mainInner'), false);
  assert.equal(document.body.classList.contains('workspace-active'), true);
  assert.equal(document.body.classList.contains('plugins-active'), false);
  assert.equal(document.body.classList.contains('admin-active'), false);
  assert.equal(document.body.classList.contains('exam-active'), false);
  assert.equal(document.getElementById('pluginWorkspaceTabs').hidden, true);
});

test('activateMainView applies plugin, admin and exam shell flags', () => {
  const document = createDocument();

  activateMainView('pluginsPanel', document);
  assert.equal(document.body.classList.contains('plugins-active'), true);
  assert.equal(document.getElementById('pluginWorkspaceTabs').hidden, false);
  assert.equal(document.getElementById('mobileMode').style.display, '');

  activateMainView('adminPanel', document);
  assert.equal(document.body.classList.contains('admin-active'), true);
  assert.equal(document.body.classList.contains('plugins-active'), false);
  assert.equal(document.getElementById('mobileMode').style.display, '');

  activateMainView('examView', document);
  assert.equal(document.body.classList.contains('exam-active'), true);
  assert.equal(document.body.classList.contains('workspace-active'), false);
  assert.equal(isHidden(document, 'mainInner'), true);
  assert.equal(isHidden(document, 'examView'), false);
  assert.equal(document.getElementById('mobileMode').style.display, 'none');
});

test('activateMainView restores core views and reports the visible core view', () => {
  const document = createDocument();

  activateMainView('chatView', document);

  assert.equal(getVisibleCoreView(document), 'chatView');
  assert.equal(isHidden(document, 'chatView'), false);
  assert.equal(isHidden(document, 'topicSetup'), true);
  assert.equal(isHidden(document, 'examView'), true);
  assert.equal(isHidden(document, 'mainInner'), false);
  assert.equal(document.body.className, '');
  assert.equal(document.getElementById('mobileMode').style.display, 'none');
});

test('activateMainView moves tutor sessions into the diagnostic view', () => {
  const document = createDocument();

  activateMainView('diagnosticView', document);

  assert.equal(getVisibleCoreView(document), 'diagnosticView');
  assert.equal(isHidden(document, 'topicSetup'), true);
  assert.equal(isHidden(document, 'chatView'), true);
  assert.equal(isHidden(document, 'pluginsPanel'), true);
  assert.equal(document.body.className, '');
  assert.equal(document.getElementById('mobileMode').style.display, '');
});
