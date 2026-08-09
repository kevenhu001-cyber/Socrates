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
      <span className="workspace-row-icon" onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <use href={'#icon-' + (item.kind === 'image' ? 'image' : 'file')} />
        </svg>
      </span>
      <div className="workspace-row-copy" onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
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

/* Real brand-asset URLs for every connector.
   icon.horse is a free CDN that returns the live favicon for any domain.
   SimpleIcons covers the two cases where icon.horse returned a generic
   site default instead of the brand mark. */
const _IMAGE_URLS: Record<string, string> = {
  github: 'https://icon.horse/icon/github.com',
  notion: 'https://icon.horse/icon/notion.so',
  gitee: 'https://icon.horse/icon/gitee.com',
  baiducloud: 'https://icon.horse/icon/baidu.com',
  gmail: 'https://icon.horse/icon/mail.google.com',
  googledrive: 'https://icon.horse/icon/drive.google.com',
  googlecalendar: 'https://cdn.simpleicons.org/googlecalendar',
  todoist: 'https://icon.horse/icon/todoist.com',
  ticktick: 'https://icon.horse/icon/ticktick.com',
  discord: 'https://icon.horse/icon/discord.com',
  gitlab: 'https://icon.horse/icon/gitlab.com',
  arxiv: 'https://icon.horse/icon/arxiv.org',
  zotero: 'https://icon.horse/icon/zotero.org',
  onedrive: 'https://raw.githubusercontent.com/gilbarbara/logos/master/logos/microsoft-onedrive.svg',
  outlook: 'https://icon.horse/icon/outlook.live.com',
  feishu: 'https://icon.horse/icon/feishu.cn',
  tencentdocs: 'https://icon.horse/icon/docs.qq.com',
  qqmail: 'https://icon.horse/icon/mail.qq.com',
};

/* LobeHub brand SVGs as the offline fallback for the six connectors
   whose assets they ship. */
const _OFFLINE_SVG: Record<string, string> = {
  github: lobehubIcon(githubRaw),
  notion: lobehubIcon(notionRaw),
  gitee: lobehubIcon(giteeRaw),
  baiducloud: lobehubIcon(baiduCloudRaw),
  tencent: lobehubIcon(tencentRaw),
  microsoft: lobehubIcon(microsoftRaw),
};

function normalise(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

function resolveLogo(id: string, name: string): string | null {
  return _IMAGE_URLS[normalise(id)] || _IMAGE_URLS[normalise(name)] || null;
}

function fallbackMark(name: string): React.ReactNode {
  return <span aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>;
}

function ConnectorMark({ id, name }: { id: string; name: string }) {
  const url = resolveLogo(id, name);
  if (url) {
    return (
      <>
        <img
          className="connector-logo"
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => {
            const img = e.currentTarget;
            img.style.display = 'none';
            const sib = img.nextElementSibling as HTMLElement | null;
            if (sib) sib.style.display = 'flex';
          }}
        />
        <span className="connector-logo-fallback" style={{ display: 'none' }} aria-hidden="true">
          {name.slice(0, 2).toUpperCase()}
        </span>
      </>
    );
  }
  const offline = _OFFLINE_SVG[normalise(id)] || _OFFLINE_SVG[normalise(name)];
  if (offline) return <span dangerouslySetInnerHTML={{ __html: offline }} />;
  return fallbackMark(name);
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
