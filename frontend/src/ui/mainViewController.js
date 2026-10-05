import { setConversationChrome } from './topBarState.js';
import { activateComposerSurface } from '../composer/controller.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { closeDetailSurface } from './detailSurface.ts';

export const CORE_VIEW_IDS = ['topicSetup', 'diagnosticView', 'chatView'];

export const MAIN_PAGE_IDS = [
  'libraryPanel', 'spacesPanel', 'scheduledPanel', 'pluginsPanel', 'imagesPanel',
  'assistantsPanel', 'sitesPanel', 'adminPanel', 'examView',
];

const WORKSPACE_PAGE_IDS = new Set(MAIN_PAGE_IDS.filter((id) => id !== 'examView'));
const CONVERSATION_CHROME_VIEWS = new Set(['chatView', 'examView']);
const VIEW_IDS = new Set(CORE_VIEW_IDS.concat(MAIN_PAGE_IDS));

function resolveDocument(doc) {
  return doc || (typeof document !== 'undefined' ? document : null);
}

function setHidden(doc, ids, hidden) {
  ids.forEach((id) => {
    const element = doc.getElementById(id);
    if (element) element.classList.toggle('hidden', hidden);
  });
}

function resetShellState(doc) {
  doc.body.classList.remove('workspace-active', 'plugins-active', 'library-active', 'admin-active', 'exam-active');
  const pluginTabs = doc.getElementById('pluginWorkspaceTabs');
  if (pluginTabs) pluginTabs.hidden = true;
  doc.querySelectorAll("[data-exam-only='true']").forEach((element) => element.classList.add('hidden'));
}

function syncChatPageGate(doc) {
  const chatPage = doc.getElementById('chatPage');
  const chatView = doc.getElementById('chatView');
  if (chatPage && chatView) chatPage.classList.toggle('hidden', chatView.classList.contains('hidden'));
}

export function hideCoreViews(doc) {
  const currentDocument = resolveDocument(doc);
  if (!currentDocument) return;
  setHidden(currentDocument, CORE_VIEW_IDS, true);
  syncChatPageGate(currentDocument);
  setConversationChrome(false, currentDocument);
}

export function getVisibleCoreView(doc) {
  const currentDocument = resolveDocument(doc);
  if (!currentDocument) return 'topicSetup';
  for (const id of CORE_VIEW_IDS) {
    const element = currentDocument.getElementById(id);
    if (element && !element.classList.contains('hidden')) return id;
  }
  return 'topicSetup';
}

export function activateMainView(viewId, doc) {
  const currentDocument = resolveDocument(doc);
  if (!currentDocument || !VIEW_IDS.has(viewId)) return false;
  const target = currentDocument.getElementById(viewId);
  if (!target) return false;
  if (currentDocument.documentElement.dataset.mainView !== viewId) closeDetailSurface(undefined, currentDocument, false);
  currentDocument.documentElement.dataset.mainView = viewId;

  setHidden(currentDocument, CORE_VIEW_IDS, true);
  setHidden(currentDocument, MAIN_PAGE_IDS, true);
  resetShellState(currentDocument);

  target.classList.remove('hidden');
  syncChatPageGate(currentDocument);
  if (viewId === 'topicSetup' || viewId === 'chatView') {
    try { activateComposerSurface(viewId === 'chatView' ? 'chat' : 'topic', currentDocument); }
    catch (error) { reportSwallow(error, 'mainViewController.activateComposerSurface'); }
  }

  const mainInner = currentDocument.getElementById('mainInner');
  if (mainInner) mainInner.classList.toggle('hidden', viewId === 'examView');

  if (WORKSPACE_PAGE_IDS.has(viewId)) {
    currentDocument.body.classList.add('workspace-active');
    currentDocument.body.classList.toggle('plugins-active', viewId === 'pluginsPanel');
    currentDocument.body.classList.toggle('library-active', viewId === 'libraryPanel');
    currentDocument.body.classList.toggle('admin-active', viewId === 'adminPanel');
    const pluginTabs = currentDocument.getElementById('pluginWorkspaceTabs');
    if (pluginTabs) pluginTabs.hidden = viewId !== 'pluginsPanel';
  } else if (viewId === 'examView') {
    currentDocument.body.classList.add('exam-active');
  }

  setConversationChrome(CONVERSATION_CHROME_VIEWS.has(viewId), currentDocument);
  return true;
}

/* Test hook — e2e drives the production view and composer transition. */
if (typeof window !== 'undefined') {
  window.__testActivateMainView = (viewId) => activateMainView(viewId, document);
}
