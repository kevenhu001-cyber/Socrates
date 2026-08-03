import { createRoot, type Root } from 'react-dom/client';
import React from 'react';

import { t as _t } from '../../legacy/gateway';
import { installWorkspaceBridge } from './workspaceStore';
import { useWorkspaceSnapshot, useWorkspaceDispatch } from './legacyAdapter';

/* ── LobeHub brand SVG icons (raw strings inlined by Vite) ── */
import githubRaw from '@lobehub/icons-static-svg/icons/github.svg?raw';
import notionRaw from '@lobehub/icons-static-svg/icons/notion.svg?raw';
import giteeRaw from '@lobehub/icons-static-svg/icons/giteeai.svg?raw';
import baiduCloudRaw from '@lobehub/icons-static-svg/icons/baiducloud.svg?raw';
import tencentRaw from '@lobehub/icons-static-svg/icons/tencent-color.svg?raw';
import microsoftRaw from '@lobehub/icons-static-svg/icons/microsoft-color.svg?raw';

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
        data-rename-id={item.id} data-rename-key={itemKey}
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
    <>
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
    </>
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

/* Strip LobeHub's default 1em sizing / inline style / xmlns / <title>
   so every connector mark uses our viewBox + currentColor contract. */
function lobehubIcon(raw: string): string {
  return String(raw || '')
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/\s(?:width|height)="1em"/gi, '')
    .replace(/\sstyle="[^"]*"/i, '')
    .replace(/\sxmlns="[^"]*"/i, '')
    .replace(/<svg /i, '<svg aria-hidden="true" ');
}

/** Hand-crafted brand SVGs for connectors not in the LobeHub set. */
const _ICONS: Record<string, string> = {
  github: lobehubIcon(githubRaw),
  notion: lobehubIcon(notionRaw),
  gitee: lobehubIcon(giteeRaw),
  baiducloud: lobehubIcon(baiduCloudRaw),
  tencent: lobehubIcon(tencentRaw),
  microsoft: lobehubIcon(microsoftRaw),
  gmail: '<svg viewBox="0 0 24 18" aria-hidden="true"><path fill="#fff" d="M2.25 0h19.5A2.25 2.25 0 0 1 24 2.25v13.5A2.25 2.25 0 0 1 21.75 18H2.25A2.25 2.25 0 0 1 0 15.75V2.25A2.25 2.25 0 0 1 2.25 0z"/><path fill="#EA4335" d="M2.1 3.36V16.2H5.4V6.1L12 11.05l6.6-4.95v10.1h3.3V3.36L12 10.8z"/><path fill="#FBBC04" d="M0 3.36 5.4 7.4V3.32L0 0z"/><path fill="#34A853" d="M18.6 7.4 24 3.36V0l-5.4 3.32z"/><path fill="#4285F4" d="M18.6 16.2h3.3V3.36l-3.3 2.74z"/><path fill="#C5221F" d="M2.1 16.2h3.3V6.1L2.1 3.36z"/></svg>',
  googledrive: '<svg viewBox="0 0 24 21" aria-hidden="true"><path fill="#1A73E8" d="M14.4 0 24 16.63 21.6 20.8 12 4.17z"/><path fill="#34A853" d="M9.6 0 0 16.63 2.4 20.8 12 4.17z"/><path fill="#FBBC04" d="M2.4 20.8 4.8 16.63h19.2l-2.4 4.17z"/></svg>',
  googlecalendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="#4285F4" d="M22 8H2V4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/><path fill="#34A853" d="M4 22h16a2 2 0 0 0 2-2v-4H2v4a2 2 0 0 0 2 2z"/><path fill="#FBBC04" d="M2 8h5v8H2z"/><path fill="#EA4335" d="M17 8h5v8h-5z"/><path fill="#1A73E8" d="M9.2 11.3h2.1v6.1H9.8v-4.2l-1.1.7-.7-1.1zM13.2 16.7l.9-.9c.4.4.8.6 1.3.6.6 0 1-.3 1-.8s-.4-.8-1.1-.8h-.7l-.2-.8 1.4-1.5h-2.3v-1.2h4.2v1.1l-1.5 1.5c.9.2 1.7.7 1.7 1.7 0 1.2-.9 2-2.4 2-.9 0-1.7-.3-2.3-.9z"/></svg>',
  todoist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#E44332" d="M4 2h16a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path fill="#fff" d="M7.1 7.35 5.7 6.5l1.4-.85 1.4.85zm2.2-.85h9v1.7h-9zM7.1 12.85 5.7 12l1.4-.85 1.4.85zm2.2-.85h9v1.7h-9zM7.1 18.35l-1.4-.85 1.4-.85 1.4.85zm2.2-.85h7.2v1.7H9.3z"/></svg>',
  ticktick: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#4772FA" rx="5"/><path fill="#fff" d="m10.1 15.7-3.6-3.6 1.7-1.7 1.9 1.9 5.8-5.8 1.7 1.7z"/><path fill="#AFC2FF" d="M18.5 16.5a6.5 6.5 0 1 1-1.1-9l-1.6 1.6a4.2 4.2 0 1 0 .9 5.8z"/></svg>',
  discord: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#5865F2" rx="6"/><path fill="#fff" d="M17.8 7.1a13.2 13.2 0 0 0-3.1-1l-.4.8a11.3 11.3 0 0 0-4.6 0l-.4-.8a13.2 13.2 0 0 0-3.1 1C4.2 10 3.7 12.8 4 15.6a12.7 12.7 0 0 0 3.8 1.9l.8-1.3c-.4-.2-.8-.4-1.2-.6l.3-.2a9.3 9.3 0 0 0 8.6 0l.3.2c-.4.2-.8.5-1.2.6l.8 1.3a12.7 12.7 0 0 0 3.8-1.9c.4-3.2-.6-5.9-2.2-8.5zM9.3 14.2c-.7 0-1.2-.6-1.2-1.3s.5-1.3 1.2-1.3 1.2.6 1.2 1.3-.5 1.3-1.2 1.3zm5.4 0c-.7 0-1.2-.6-1.2-1.3s.5-1.3 1.2-1.3 1.2.6 1.2 1.3-.5 1.3-1.2 1.3z"/></svg>',
  onedrive: '<svg viewBox="0 0 24 16" aria-hidden="true"><path fill="#0364B8" d="M9.3 3.6A5.9 5.9 0 0 1 18 8.8l-4.9 2.1-6.8-2.8z"/><path fill="#0078D4" d="M5.8 6.2a4.7 4.7 0 0 1 7.4 4.7l-8.4.1L0 9a5 5 0 0 1 5.8-2.8z"/><path fill="#1490DF" d="M13.2 10.9 18 8.8a3.8 3.8 0 0 1 .5 7.2H5a5 5 0 0 1-.2-5z"/><path fill="#28A8EA" d="M0 9h4.8l8.4 1.9-3.6 5.1H5A5 5 0 0 1 0 9z"/></svg>',
  outlook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#0078D4" d="M9 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H9z"/><path fill="#50A7F2" d="M22 7.2 15.6 12 22 16.8z"/><path fill="#0A5DB3" d="m9 8 6.6 4L9 16z"/><rect width="11" height="13" x="2" y="5.5" fill="#106EBE" rx="1.5"/><path fill="#fff" d="M7.5 15.1c-1.8 0-3-1.3-3-3.1s1.2-3.1 3-3.1 3 1.3 3 3.1-1.2 3.1-3 3.1zm0-1.3c.9 0 1.4-.7 1.4-1.8s-.5-1.8-1.4-1.8-1.4.7-1.4 1.8.5 1.8 1.4 1.8z"/></svg>',
  gitlab: '<svg viewBox="0 0 24 22" aria-hidden="true"><path fill="#E24329" d="m12 21.4 4.4-13.5H7.6z"/><path fill="#FC6D26" d="M12 21.4 7.6 7.9H1.5zM12 21.4l4.4-13.5h6.1z"/><path fill="#FCA326" d="M1.5 7.9.2 11.8a1 1 0 0 0 .36 1.14L12 21.4zM22.5 7.9l1.3 3.9a1 1 0 0 1-.36 1.14L12 21.4z"/><path fill="#E24329" d="M7.6 7.9 9.5 2a.65.65 0 0 1 1.24 0L12 7.9zM16.4 7.9 14.5 2a.65.65 0 0 0-1.24 0L12 7.9z"/></svg>',
  qqmail: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#12B76A" rx="5"/><path fill="#fff" d="M4.5 7h15a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 16.5v-8A1.5 1.5 0 0 1 4.5 7zm.9 2 6.6 4.6L18.6 9z"/></svg>',
  tencentdocs: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#1677FF" rx="5"/><path fill="#fff" d="M7 5h7l3 3v11H7z"/><path fill="#BEDBFF" d="M14 5v4h4z"/><path fill="#1677FF" d="M9 11h6v1.3H9zm0 3h6v1.3H9z"/></svg>',
  feishu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#00D6B9" d="M5 4.2 12 2v6.9L5 11z"/><path fill="#3370FF" d="M12 2l7 2.2V11l-7-2.1z"/><path fill="#00A0FF" d="M5 13l7 2.1V22l-5-2.2z"/><path fill="#7B61FF" d="m12 15.1 7-2.1v6.8l-7 2.2z"/></svg>',
  arxiv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" fill="#B31B1B" rx="5"/><path fill="#fff" d="M5.3 16.8 10.1 6h1.7l4.8 10.8h-2l-1-2.4H8.2l-1 2.4zm3.6-4h4l-2-4.7z"/><path fill="#fff" d="M17.2 16.8v-7h1.6v7zM17 8.2V6.6h1.9v1.6z"/></svg>',
  zotero: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.231 2.462 7.18 20.923h14.564V24H2.256v-2.462L16.308 3.076H2.975V0h18.256v2.462z"/></svg>',
};

function ConnectorMark({ id, name }: { id: string; name: string }) {
  /* Normalise so `one_drive`, `OneDrive`, `qq-mail` etc. all resolve. */
  const key = id.toLowerCase().replace(/[_-]/g, '');
  const svg = _ICONS[key] || _ICONS[name.toLowerCase().replace(/[_-]/g, '')];
  if (svg) return <span dangerouslySetInnerHTML={{ __html: svg }} />;
  return <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>;
}

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
              <ConnectorMark id={connector.id} name={connector.name} />
            </span>
            <div className="workspace-row-copy">
              <strong>{connector.name}</strong>
              <span>{meta}</span>
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
      return <LibraryView data={snap.libraryData} dispatch={dispatch} />;
    case 'projects':
      return <ProjectsView projects={snap.projectsData} dispatch={dispatch} />;
    case 'plugins':
      return <PluginsView plugins={snap.pluginsData} configured={snap.projectConnectorConfigured} dispatch={dispatch} />;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/*  Mount / unmount helpers                                            */
/* ------------------------------------------------------------------ */

const roots = new Map<string, Root>();

export function mountWorkspacePage(page: string): void {
  const containerId = page === 'library' ? 'libraryList' : page === 'projects' ? 'spacesList' : 'pluginsList';
  const container = document.getElementById(containerId);
  if (!container) return;

  installWorkspaceBridge();

  let root = roots.get(page);
  if (!root) {
    root = createRoot(container);
    roots.set(page, root);
  }
  root.render(<WorkspacePage page={page} />);
  const panelId = page === 'library' ? 'libraryPanel' : page === 'projects' ? 'spacesPanel' : 'pluginsPanel';
  document.getElementById(panelId)?.classList.remove('hidden');
}

export function unmountWorkspacePage(page: string): void {
  const root = roots.get(page);
  if (root) {
    root.unmount();
    roots.delete(page);
  }
}
