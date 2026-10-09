import { createRoot, type Root } from 'react-dom/client';
import { useWorkspaceSnapshot, useWorkspaceDispatch } from './workspace.hooks';
import { WorkspaceLoadingView } from './WorkspaceLoadingView';
import { LibraryView } from './LibraryView';
import { ProjectsView } from './ProjectsView';
import { PluginsView } from './PluginsView';

function WorkspacePage({ page }: { page: string }) {
  const snap = useWorkspaceSnapshot();
  const dispatch = useWorkspaceDispatch();

  if (snap.loading) {
    return <WorkspaceLoadingView page={page} />;
  }

  switch (page) {
    case 'library':
      return <LibraryView data={snap.libraryData} dispatch={dispatch} />;
    case 'projects':
      return <ProjectsView projects={snap.projectsData} dispatch={dispatch} />;
    case 'plugins':
      return <PluginsView plugins={snap.pluginsData} configured={snap.projectConnectorConfigured} openConnectorAvailable={snap.openConnectorAvailable} dispatch={dispatch} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Mount / unmount helpers                                            */
/* ------------------------------------------------------------------ */

const roots = new Map<string, Root>();

export function mountWorkspacePage(page: string): void {
  const panelId = page === 'library' ? 'libraryPanel' : page === 'projects' ? 'spacesPanel' : 'pluginsPanel';
  const panel = document.getElementById(panelId);
  if (!panel) return;

  let root = roots.get(page);
  if (!root) {
    root = createRoot(panel);
    roots.set(page, root);
  }
  root.render(<WorkspacePage page={page} />);
  panel.classList.remove('hidden');
}

export function unmountWorkspacePage(page: string): void {
  const root = roots.get(page);
  if (root) {
    root.unmount();
    roots.delete(page);
  }
}
