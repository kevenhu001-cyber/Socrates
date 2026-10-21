import { createRoot, type Root } from 'react-dom/client';
import { useWorkspaceSnapshot, useWorkspaceDispatch } from './workspace.hooks';
import { WorkspaceLoadingView } from './WorkspaceLoadingView';
import { LibraryView } from './LibraryView';
import { ProjectsView } from './ProjectsView';
import { PluginsView } from './PluginsView';
import { DESTINATIONS, isWorkspacePage, type WorkspacePage as WorkspacePageKey } from '../../../sidebar/navigation.destinations';

function WorkspacePage({ page }: { page: WorkspacePageKey }) {
  const snap = useWorkspaceSnapshot(page);
  const dispatch = useWorkspaceDispatch();

  if (snap.loading) {
    return <WorkspaceLoadingView page={page} />;
  }

  switch (snap.page) {
    case 'library':
      return <LibraryView data={snap.data} dispatch={dispatch} />;
    case 'projects':
      return <ProjectsView projects={snap.data} dispatch={dispatch} />;
    case 'plugins':
      return <PluginsView plugins={snap.data} configured={snap.configured} openConnectorAvailable={snap.openConnectorAvailable} dispatch={dispatch} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Mount / unmount helpers                                            */
/* ------------------------------------------------------------------ */

const roots = new Map<WorkspacePageKey, Root>();

export function mountWorkspacePage(page: WorkspacePageKey): void {
  if (!isWorkspacePage(page)) return;
  const panelId = DESTINATIONS[page].host;
  const panel = document.getElementById(panelId);
  if (!panel) return;

  let root = roots.get(page);
  if (!root) {
    root = createRoot(panel);
    roots.set(page, root);
  }
  root.render(<WorkspacePage page={page} />);
}

export function unmountWorkspacePage(page: WorkspacePageKey): void {
  const root = roots.get(page);
  if (root) {
    root.unmount();
    roots.delete(page);
  }
}
