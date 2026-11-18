import { toggleMorePopover } from './morePopover.ts';
import { openPromptTemplatesModal } from '../legacy/promptTemplates.ts';
import {
  mountAdminPage,
  mountScheduledPage,
  mountWorkspacePage,
} from '../react/lib/boot/pageMounts.ts';
import { registerNavigationAdapters, installNavigationRouteListeners } from './navigation.service';
import { reportSwallow } from '../util/reportSwallow.ts';
import {
  loadLibraryData,
  loadPluginsData,
  loadProjectsData,
} from '../react/pages/workspace/workspace.service';
import { loadScheduledTasks } from '../react/pages/scheduled/scheduled.service';
import { ensureConnectorIcons, restoreConnectorReturnContext } from './nav.ts';
import { getActiveDestination } from './navigation.store';
import { setSidebarPanelView } from './sidebar.store';
import { activateMainView } from '../legacy/mainViewController.ts';
import { DESTINATIONS } from './navigation.destinations';
import { loadSettingsPage } from '../react/settings/settings.preload';
import { publishProfileSnapshot } from '../legacy/profile';
import { showToast } from '../legacy/toast.js';
import { t } from '../i18n';

function closeAllPanels(): void {
  setSidebarPanelView('recents');
}

function openCreation(name: 'images' | 'assistants' | 'sites'): void {
  void import('../legacy/creationSurfaces.ts')
    .then(async (module) => {
      if (getActiveDestination() !== name) return;
      await module.openCreationSurface(name);
      if (getActiveDestination() !== name) return;
      activateMainView(DESTINATIONS[name].host, document);
    })
    .catch((error) => {
      console.error('[nav] creation surface failed to load', error);
    });
}

function openLibrary(): void {
  mountWorkspacePage('library');
  void loadLibraryData();
}

function openProjects(): void {
  mountWorkspacePage('projects');
  void loadProjectsData();
}

function openScheduled(): void {
  mountScheduledPage(loadScheduledTasks);
}

function openPlugins(): void {
  ensureConnectorIcons();
  mountWorkspacePage('plugins');
  restoreConnectorReturnContext();
  void loadPluginsData();
}

function openExam(): void {
  void import('../exam/index.ts')
    .then((module) => module.openExamPanel())
    .catch((error) => {
      reportSwallow(error, 'sidebar/navigation.openExam');
    });
}

function openAdmin(): void {
  mountAdminPage();
}

function openMore(): void {
  try {
    toggleMorePopover();
  } catch (error) {
    reportSwallow(error, 'sidebar/navigation.openMore');
  }
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
  settings: () => {
    publishProfileSnapshot();
    void loadSettingsPage()
      .then(({ mountSettingsPage }) => mountSettingsPage())
      .catch(() => showToast(t('toast.settingsLoadFailed')));
  },
  profile: () => {
    publishProfileSnapshot();
    void import('../react/profile/ProfilePage')
      .then(({ mountProfilePage }) => mountProfilePage())
      .catch((error) => reportSwallow(error, 'sidebar/navigation.openProfile'));
  },
  more: openMore,
  skills: openPromptTemplatesModal,
  closePanels: closeAllPanels,
});

installNavigationRouteListeners();
