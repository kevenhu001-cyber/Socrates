import { toggleMorePopover } from './morePopover.js';
import { openPromptTemplatesModal } from '../ui/promptTemplates.js';
import { activateMainView, hideCoreViews } from '../ui/mainViewController.js';
import { mountAdminPage, mountScheduledPage, mountWorkspacePage } from '../react/lib/boot/pageMounts.ts';
import { registerNavigationAdapters, installNavigationRouteListeners } from './navigation.service';
import { reportSwallow } from '../util/reportSwallow.ts';
import { loadLibraryData, loadPluginsData, loadProjectsData } from '../react/pages/workspace/workspace.service';
import { loadScheduledTasks } from '../react/pages/scheduled/scheduled.service';
import { ensureConnectorIcons, restoreConnectorReturnContext } from './nav.js';

function showMainPage(pageId: string): void {
  activateMainView(pageId, document);
}

function closeAllPanels(): void {
  ['knowledgePanel', 'mistakesPanel'].forEach((id) => document.getElementById(id)?.classList.add('hidden'));
  ['tabKnowledge', 'tabRecents', 'tabMistakes'].forEach((id) => document.getElementById(id)?.classList.remove('active'));
}

function openCreation(name: 'images' | 'assistants' | 'sites'): void {
  hideCoreViews(document);
  void import('../ui/creationSurfaces.js').then((module) => {
    module.renderCreationSurface(name);
    showMainPage(name + 'Panel');
  }).catch((error) => {
    console.error('[nav] creation surface failed to load', error);
  });
}

function openLibrary(): void {
  showMainPage('libraryPanel');
  mountWorkspacePage('library');
  void loadLibraryData();
}

function openProjects(): void {
  showMainPage('spacesPanel');
  mountWorkspacePage('projects');
  void loadProjectsData();
}

function openScheduled(): void {
  showMainPage('scheduledPanel');
  mountScheduledPage(loadScheduledTasks);
}

function openPlugins(): void {
  ensureConnectorIcons();
  showMainPage('pluginsPanel');
  mountWorkspacePage('plugins');
  restoreConnectorReturnContext();
  void loadPluginsData();
}

function openExam(): void {
  const open = (window as Window & { openExamPanel?: () => void }).openExamPanel;
  open?.();
}

function openAdmin(): void {
  showMainPage('adminPanel');
  mountAdminPage();
}

function openMore(): void {
  try { toggleMorePopover(); } catch (error) { reportSwallow(error, 'sidebar/navigation.openMore'); }
}

registerNavigationAdapters({
  library: openLibrary,
  projects: openProjects,
  scheduled: openScheduled,
  plugins: openPlugins,
  images: () => openCreation('images'),
  assistants: () => openCreation('assistants'),
  sites: () => openCreation('sites'),
  exam: openExam,
  admin: openAdmin,
  more: openMore,
  skills: openPromptTemplatesModal,
  closePanels: closeAllPanels,
});

installNavigationRouteListeners();
