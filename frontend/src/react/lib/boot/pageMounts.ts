/* Page-mount entry points — the module-level replacement for the former
   window.__socratesMount* globals. Sidebar navigation imports these
   directly; each call lazy-loads the page chunk through loadPage and
   mounts it into its panel (which React owns outright). */

import { loadPage } from './pageLoader';

const WORKSPACE_HOSTS: Record<string, string> = {
  library: 'libraryPanel',
  projects: 'spacesPanel',
  plugins: 'pluginsPanel',
};

export function mountWorkspacePage(page: string): void {
  loadPage(WORKSPACE_HOSTS[page] || 'pluginsPanel', async () => {
    const { mountWorkspacePage: mount } = await import('../../pages/workspace/WorkspacePage');
    mount(page);
  });
}

export function mountScheduledPage(afterMount?: () => void): void {
  loadPage('scheduledPanel', async () => {
    const { mountScheduledPage: mount } = await import('../../pages/scheduled/ScheduledPage');
    mount();
    afterMount?.();
  });
}

export function mountAdminPage(): void {
  loadPage('adminPanel', async () => {
    const { mountAdminPage: mount } = await import('../../adminModal/AdminPage');
    mount();
  });
}
