import { createRoot, type Root } from 'react-dom/client';
import React from 'react';

import { t as _t } from '../../legacy/gateway';
import { installWorkspaceBridge } from './workspaceStore';
import { useWorkspaceSnapshot, useWorkspaceDispatch } from './legacyAdapter';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function fileMeta(item: { size?: number; uploadedAt?: string; updatedAt?: string }): string {
  const size = Number(item.size || 0);
  const sizeLabel = size
    ? size < 1024 * 1024
      ? Math.max(1, Math.round(size / 1024)) + ' KB'
      : (size / (1024 * 1024)).toFixed(1) + ' MB'
    : i18n('library.metaCreated', 'Created');
  return sizeLabel + (item.uploadedAt || item.updatedAt ? ' · ' + (item.uploadedAt || item.updatedAt) : '');
}

/* ------------------------------------------------------------------ */
/*  Library sub-components                                             */
/* ------------------------------------------------------------------ */

function LibraryTabBar({ tab, onSwitch }: { tab: string; onSwitch: (t: string) => void }) {
  return (
    <div className="library-tabs">
      <button type="button" className={'library-tab' + (tab === 'files' ? ' active' : '')} onClick={() => onSwitch('files')}>{i18n('library.tabUploaded', 'Uploaded')}</button>
      <button type="button" className={'library-tab' + (tab === 'artifacts' ? ' active' : '')} onClick={() => onSwitch('artifacts')}>{i18n('library.tabCreated', 'Created')}</button>
    </div>
  );
}

function LibrarySearch({ query, onSearch }: { query: string; onSearch: (q: string) => void }) {
  return (
    <input type="text" className="library-search" placeholder={i18n('library.filterPlaceholder', 'Filter items...')} value={query} onChange={(e) => onSearch(e.target.value)} aria-label={i18n('library.filterPlaceholder', 'Filter items...')} />
  );
}

function LibraryItemRow({ item, itemKey, tab, selection, renameItem, dispatch }: {
  item: { id: string; name?: string; title?: string; kind?: string; size?: number; uploadedAt?: string; updatedAt?: string };
  itemKey: string; tab: string; selection: Record<string, boolean>; renameItem: string | null;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const name = item.name || item.title || i18n('library.untitled', 'Untitled');
  const isSelected = !!selection[item.id];
  const isRenaming = renameItem === item.id;

  let nameEl: React.ReactNode;
  if (isRenaming) {
    nameEl = (
      <input className="library-rename-input" type="text" defaultValue={name} maxLength={255} autoFocus
        onKeyDown={(e) => { if (e.key === 'Enter') dispatch.saveRename(e.currentTarget); if (e.key === 'Escape') dispatch.cancelRename(); }} />
    );
  } else {
    nameEl = (
      <strong className="library-name" onClick={(e) => { e.stopPropagation(); dispatch.startRename(item.id, itemKey); }} title={i18n('library.clickToRename', 'Click to rename')}>{name}</strong>
    );
  }

  const actions = tab === 'files' ? (
    <button className="workspace-row-action" onClick={(e) => { e.stopPropagation(); dispatch.deleteFile(item.id); }}>{i18n('common.delete', 'Delete')}</button>
  ) : (
    <button className="workspace-row-action" onClick={(e) => { e.stopPropagation(); dispatch.renameArtifact(item.id); }}>{i18n('library.rename', 'Rename')}</button>
  );

  return (
    <div className={'workspace-row library-row' + (isSelected ? ' library-row-selected' : '')}>
      <label className="library-checkbox-label" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="library-checkbox" checked={isSelected} onChange={(e) => dispatch.toggleSelect(item.id, e.target.checked)} aria-label={'Select ' + name} />
      </label>
      <span className="workspace-row-icon" onClick={() => dispatch.openItem(item.id, item.kind || 'file')}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <use href={'#icon-' + (item.kind === 'image' ? 'image' : 'file')} />
        </svg>
      </span>
      <div className="workspace-row-copy" onClick={() => dispatch.openItem(item.id, item.kind || 'file')}>
        {nameEl}
        <span>{fileMeta(item)}</span>
      </div>
      {actions}
    </div>
  );
}

function LibraryView({ data, dispatch }: {
  data: { tab: string; query: string; files: ReadonlyArray<any>; artifacts: ReadonlyArray<any>; selection: Readonly<Record<string, boolean>>; renameItem: string | null };
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const key = data.tab === 'artifacts' ? 'artifacts' : 'files';
  const items = data[key].filter((item: any) => {
    if (!data.query) return true;
    return (item.name || item.title || '').toLowerCase().includes(data.query.toLowerCase());
  });
  const anySelected = items.some((item: any) => !!data.selection[item.id]);
  const allSelected = items.length > 0 && items.every((item: any) => !!data.selection[item.id]);

  return (
    <div className="library-list" id="libraryList">
      {anySelected && (
        <div className="library-selection-bar visible">
          <label className="library-select-all">
            <input type="checkbox" className="library-checkbox" checked={allSelected} onChange={(e) => dispatch.toggleSelectAll(e.target.checked)} aria-label={i18n('library.selectAll', 'Select all')} />
            <span>{i18n('library.selectedCount', '{n} selected').replace('{n}', String(Object.keys(data.selection).length))}</span>
          </label>
          <button className="workspace-row-action library-bulk-delete" onClick={() => dispatch.deleteSelected()} disabled={!anySelected}>{i18n('library.deleteSelected', 'Delete selected')}</button>
        </div>
      )}
      {items.length === 0 ? (
        <div className="workspace-empty">
          {data.query ? (
            <><strong>{i18n('library.noMatch', 'No matching items')}</strong><span>{i18n('library.noMatchDesc', 'Try a different search.')}</span></>
          ) : key === 'files' ? (
            <><strong>{i18n('library.emptyFiles', 'Your library is ready')}</strong><span>{i18n('library.emptyFilesDesc', 'Upload a file or attach one in a chat.')}</span></>
          ) : (
            <><strong>{i18n('library.emptyArtifacts', 'No created items yet')}</strong><span>{i18n('library.emptyArtifactsDesc', 'Generated documents and artifacts will appear here.')}</span></>
          )}
        </div>
      ) : (
        items.map((item: any) => (
          <LibraryItemRow key={item.id} item={item} itemKey={key} tab={key} selection={data.selection} renameItem={data.renameItem} dispatch={dispatch} />
        ))
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Projects sub-component                                             */
/* ------------------------------------------------------------------ */

function ProjectsView({ projects, dispatch }: {
  projects: ReadonlyArray<{ id: string; name: string; description?: string; color?: string }>;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  if (projects.length === 0) {
    return (
      <div className="workspace-empty">
        <strong>{i18n('projects.empty', 'Make space for ongoing work')}</strong>
        <span>{i18n('projects.emptyDesc', 'Projects keep related chats, files, and instructions together.')}</span>
        <button className="workspace-primary" onClick={() => dispatch.createProject()}>{i18n('projects.create', 'Create project')}</button>
      </div>
    );
  }
  return (
    <>
      {projects.map((project) => {
        const color = /^#[0-9a-f]{3,8}$/i.test(project.color || '') ? project.color! : 'hsl(var(--accent-000))';
        return (
          <div className="workspace-row project-row" key={project.id}>
            <button className="project-main" onClick={() => dispatch.openProject(project.id)}>
              <span className="project-swatch" style={{ background: color }} />
              <span className="workspace-row-copy">
                <strong>{project.name}</strong>
                <span>{project.description || ''}</span>
              </span>
            </button>
            <button className="workspace-row-action" onClick={(e) => { e.stopPropagation(); dispatch.editProject(project.id); }}>{i18n('projects.edit', 'Edit')}</button>
          </div>
        );
      })}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugins sub-component                                              */
/* ------------------------------------------------------------------ */

function PluginsView({ plugins, configured, dispatch }: {
  plugins: ReadonlyArray<{ id: string; name: string; description?: string; capabilities?: string[]; authType?: string; connection?: { status?: string; displayName?: string } | null }>;
  configured: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  if (plugins.length === 0) {
    return (
      <div className="workspace-empty">
        <strong>{i18n('plugins.unavailable', 'Apps are unavailable')}</strong>
        <span>{i18n('plugins.unavailableDesc', 'Refresh and try again.')}</span>
      </div>
    );
  }
  return (
    <>
      {plugins.map((connector) => {
        const connection = connector.connection || null;
        const connected = connection && connection.status === 'connected';
        const pending = connection && connection.status === 'initiated';
        const meta = connected
          ? i18n('plugins.connected', 'Connected') + (connection.displayName ? ' · ' + connection.displayName : '')
          : pending ? i18n('plugins.waitingAuth', 'Waiting for authorization to finish') : connector.description || '';
        let actionEl: React.ReactNode;
        if (connected) actionEl = <span className="connector-coming-soon">{i18n('plugins.connected', 'Connected')}</span>;
        else if (pending) actionEl = <button className="workspace-secondary connector-connect" onClick={() => dispatch.refreshPlugin(connector.id)}>{i18n('plugins.refreshStatus', 'Refresh status')}</button>;
        else if (!configured) actionEl = <span className="connector-coming-soon">{i18n('plugins.serverSetupNeeded', 'Server setup needed')}</span>;
        else if (connector.authType === 'api_key' || connector.authType === 'custom_credential') actionEl = <button className="workspace-secondary connector-connect" onClick={() => dispatch.openPluginForm(connector.id)}>{i18n('plugins.connect', 'Connect')}</button>;
        else actionEl = <button className="workspace-secondary connector-connect" onClick={() => dispatch.connectPlugin(connector.id)}>{i18n('plugins.connect', 'Connect')}</button>;
        return (
          <div className={'workspace-row connector-row' + (connected ? ' is-connected' : '')} key={connector.id}>
            <span className={'workspace-row-icon connector-icon connector-' + connector.id}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><use href={'#icon-' + connector.id} /></svg>
            </span>
            <div className="workspace-row-copy">
              <strong>{connector.name}</strong>
              <span>{meta}</span>
              <small className="workspace-note">{(connector.capabilities || []).join(' · ')}</small>
            </div>
            {actionEl}
          </div>
        );
      })}
      {configured ? (
        <div className="workspace-note">{i18n('plugins.oauthNote', 'OAuth tokens stay in the OOMOL gateway. Neither the browser nor the model receives a provider token.')}</div>
      ) : (
        <div className="workspace-empty"><strong>{i18n('plugins.setupTitle', 'Connector service needs setup')}</strong><span>{i18n('plugins.setupDesc', 'Add OOMOL_PROJECT_API_KEY to the server environment. Authorization remains disabled until then.')}</span></div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

function WorkspacePage({ page }: { page: string }) {
  const snap = useWorkspaceSnapshot();
  const dispatch = useWorkspaceDispatch();

  switch (page) {
    case 'library':
      return (
        <div className="library-panel main-page" id="libraryPanel">
          <div className="library-header">
            <span className="library-title" data-i18n-key="sidebar.library.title">{i18n('sidebar.library.title', 'Library')}</span>
          </div>
          <LibraryTabBar tab={snap.libraryData.tab} onSwitch={(t) => dispatch.switchTab(t)} />
          <LibrarySearch query={snap.libraryData.query} onSearch={(q) => dispatch.filter(q)} />
          <LibraryView data={snap.libraryData} dispatch={dispatch} />
        </div>
      );
    case 'projects':
      return (
        <div className="spaces-panel main-page" id="spacesPanel">
          <div className="spaces-list" id="spacesList">
            <ProjectsView projects={snap.projectsData} dispatch={dispatch} />
          </div>
        </div>
      );
    case 'plugins':
      return (
        <div className="plugins-panel main-page" id="pluginsPanel">
          <div className="plugins-header">
            <span className="plugins-title" data-i18n-key="plugins.title">{i18n('plugins.title', 'Connectors')}</span>
          </div>
          <div className="plugins-list" id="pluginsList">
            <PluginsView plugins={snap.pluginsData} configured={snap.projectConnectorConfigured} dispatch={dispatch} />
          </div>
        </div>
      );
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Mount / unmount helpers                                            */
/* ------------------------------------------------------------------ */

const roots = new Map<string, Root>();

export function mountWorkspacePage(page: string): void {
  const containerId = page === 'library' ? 'libraryPanel' : page === 'projects' ? 'spacesPanel' : 'pluginsPanel';
  const container = document.getElementById(containerId);
  if (!container) return;

  installWorkspaceBridge();

  let root = roots.get(page);
  if (!root) {
    root = createRoot(container);
    roots.set(page, root);
  }
  root.render(<WorkspacePage page={page} />);
  container.classList.remove('hidden');
}

export function unmountWorkspacePage(page: string): void {
  const root = roots.get(page);
  if (root) {
    root.unmount();
    roots.delete(page);
  }
}
