/* Page-mount entry points — the module-level replacement for the former
   window.__socratesMount* globals. Sidebar navigation imports these
   directly; each call lazy-loads the page chunk through loadPage and
   mounts it into its panel (which React owns outright). */

import { loadPage } from './pageLoader.ts';
import { DESTINATIONS, isWorkspacePage, type WorkspacePage } from '../../../sidebar/navigation.destinations';

export function mountWorkspacePage(page: WorkspacePage): void {
  if (!isWorkspacePage(page)) return;
  loadPage(DESTINATIONS[page].host, async () => {
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
