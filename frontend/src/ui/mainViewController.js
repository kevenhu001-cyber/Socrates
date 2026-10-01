import { setConversationChrome } from './topBarState.js';

export const CORE_VIEW_IDS = ['topicSetup', 'diagnosticView', 'chatView'];

export const MAIN_PAGE_IDS = [
  'libraryPanel',
  'spacesPanel',
  'scheduledPanel',
  'pluginsPanel',
  'imagesPanel',
  'assistantsPanel',
  'sitesPanel',
  'adminPanel',
  'examView',
];

const WORKSPACE_PAGE_IDS = new Set(MAIN_PAGE_IDS.filter(function (id) { return id !== 'examView'; }));
const CONVERSATION_CHROME_VIEWS = new Set(['chatView', 'examView']);
const VIEW_IDS = new Set(CORE_VIEW_IDS.concat(MAIN_PAGE_IDS));

function resolveDocument(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function setHidden(doc, ids, hidden) {
  ids.forEach(function (id) {
    var element = doc.getElementById(id);
    if (element) element.classList.toggle('hidden', hidden);
  });
}

function resetShellState(doc) {
  doc.body.classList.remove('workspace-active', 'plugins-active', 'admin-active', 'exam-active');
  var pluginTabs = doc.getElementById('pluginWorkspaceTabs');
  if (pluginTabs) pluginTabs.hidden = true;
  doc.querySelectorAll("[data-exam-only='true']").forEach(function (element) {
    element.classList.add('hidden');
  });
}

export function hideCoreViews(doc) {
  var d = resolveDocument(doc);
  if (!d) return;
  setHidden(d, CORE_VIEW_IDS, true);
  setConversationChrome(false, d);
}

export function getVisibleCoreView(doc) {
  var d = resolveDocument(doc);
  if (!d) return 'topicSetup';
  for (var i = 0; i < CORE_VIEW_IDS.length; i++) {
    var id = CORE_VIEW_IDS[i];
    var element = d.getElementById(id);
    if (element && !element.classList.contains('hidden')) return id;
  }
  return 'topicSetup';
}

export function activateMainView(viewId, doc) {
  var d = resolveDocument(doc);
  if (!d || !VIEW_IDS.has(viewId)) return false;

  setHidden(d, CORE_VIEW_IDS, true);
  setHidden(d, MAIN_PAGE_IDS, true);
  resetShellState(d);

  var target = d.getElementById(viewId);
  if (target) target.classList.remove('hidden');

  var mainInner = d.getElementById('mainInner');
  if (mainInner) mainInner.classList.toggle('hidden', viewId === 'examView');

  if (WORKSPACE_PAGE_IDS.has(viewId)) {
    d.body.classList.add('workspace-active');
    d.body.classList.toggle('plugins-active', viewId === 'pluginsPanel');
    d.body.classList.toggle('admin-active', viewId === 'adminPanel');
    var pluginTabs = d.getElementById('pluginWorkspaceTabs');
    if (pluginTabs) pluginTabs.hidden = viewId !== 'pluginsPanel';
  } else if (viewId === 'examView') {
    d.body.classList.add('exam-active');
  }

  setConversationChrome(CONVERSATION_CHROME_VIEWS.has(viewId), d);
  return Boolean(target);
}
