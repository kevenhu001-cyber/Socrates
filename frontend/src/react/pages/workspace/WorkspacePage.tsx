import { createRoot, type Root } from 'react-dom/client';
import React, { useMemo, useState } from 'react';

import { t as _t } from '../../legacy/gateway';
import { installWorkspaceBridge, useWorkspaceSnapshot, useWorkspaceDispatch } from './workspace.bridge';

/* ── LobeHub brand SVG icons (raw strings inlined by Vite) ── */
import githubRaw from '@lobehub/icons-static-svg/icons/github.svg?raw';
import notionRaw from '@lobehub/icons-static-svg/icons/notion.svg?raw';
import giteeRaw from '@lobehub/icons-static-svg/icons/giteeai.svg?raw';
import baiduCloudRaw from '@lobehub/icons-static-svg/icons/baiducloud.svg?raw';
import tencentRaw from '@lobehub/icons-static-svg/icons/tencent-color.svg?raw';
import microsoftRaw from '@lobehub/icons-static-svg/icons/microsoft-color.svg?raw';
import googleRaw from '@lobehub/icons-static-svg/icons/google-color.svg?raw';

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
  /* LobeHub ships a single "google" mark; reuse it for the Google-suite
     connectors so the offline test path always sees an <svg>, not a
     two-letter <span> fallback. */
  gmail: lobehubIcon(googleRaw),
  googledrive: lobehubIcon(googleRaw),
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
  const offlineSvg = _OFFLINE_SVG[normalise(id)] || _OFFLINE_SVG[normalise(name)];
  /* Prefer bundled brand assets whenever available. This keeps the icon
     visible while an external favicon CDN is slow or unavailable, and makes
     the connector catalog usable offline. */
  if (offlineSvg) return <span dangerouslySetInnerHTML={{ __html: offlineSvg }} />;

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
  return fallbackMark(name);
}

type WorkspacePlugin = {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  authType?: string;
  connection?: { status?: string; displayName?: string } | null;
};

function PluginDirectory({ plugins, configured, dispatch }: {
  plugins: ReadonlyArray<WorkspacePlugin>;
  configured: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'installed' | 'all'>('installed');
  const visiblePlugins = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plugins.filter((plugin) => {
      const isInstalled = plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated';
      if (scope === 'installed' && !isInstalled) return false;
      if (!needle) return true;
      return [plugin.name, plugin.description, ...(plugin.capabilities || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [plugins, query, scope]);

  const searchLabel = i18n('plugins.search', 'Search plugins');
  const renderAction = (plugin: WorkspacePlugin) => {
    const status = plugin.connection?.status;
    if (status === 'connected') {
      return <span className="plugin-directory-connected">{i18n('plugins.connected', 'Connected')}</span>;
    }
    if (status === 'initiated') {
      return <button type="button" className="plugin-directory-action" onClick={() => dispatch.refreshPlugin(plugin.id)}>{i18n('plugins.refreshStatus', 'Refresh')}</button>;
    }
    if (!configured) {
      return <span className="plugin-directory-muted">{i18n('plugins.serverSetupNeeded', 'Unavailable')}</span>;
    }
    if (plugin.authType === 'api_key' || plugin.authType === 'custom_credential') {
      return <button type="button" className="plugin-directory-action" onClick={() => dispatch.openPluginForm(plugin.id)}>{i18n('plugins.connect', 'Connect')}</button>;
    }
    return <button type="button" className="plugin-directory-action" onClick={() => dispatch.connectPlugin(plugin.id)}>{i18n('plugins.connect', 'Connect')}</button>;
  };

  const showInstalledEmpty = visiblePlugins.length === 0 && !query.trim() && scope === 'installed';

  return (
    <section className="plugin-directory" aria-labelledby="plugin-directory-title">
      <div className="plugin-directory-topbar">
        <button type="button" className="plugin-directory-back" onClick={() => dispatch.exitPlugins()} aria-label={i18n('plugins.back', 'Back')} title={i18n('plugins.back', 'Back')}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg>
        </button>
        <h2 id="plugin-directory-title">{i18n('sidebar.plugins.title', 'Plugins')}</h2>
      </div>

      <label className="plugin-directory-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
      </label>

      <div className="plugin-directory-tabs" role="tablist" aria-label={i18n('plugins.filter', 'Plugin filter')}>
        <button type="button" role="tab" aria-selected={scope === 'installed'} className={scope === 'installed' ? 'active' : ''} onClick={() => setScope('installed')}>{i18n('plugins.installed', 'Installed')}</button>
        <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{i18n('plugins.allPlugins', 'All plugins')}</button>
      </div>

      <div className="plugin-directory-list">
        {visiblePlugins.length === 0 ? (
          <div className="plugin-directory-empty">
            <strong>{showInstalledEmpty ? i18n('plugins.installedEmpty', 'No installed plugins yet') : i18n('plugins.noMatch', 'No matching plugins')}</strong>
            <span>{showInstalledEmpty ? i18n('plugins.installedEmptyDesc', 'Apps you connect will appear here.') : i18n('plugins.tryDifferent', 'Try a different search.')}</span>
            {showInstalledEmpty ? (
              <button type="button" className="plugin-directory-action plugin-directory-browse" onClick={() => setScope('all')}>{i18n('plugins.browseAll', 'Browse all plugins')}</button>
            ) : null}
          </div>
        ) : visiblePlugins.map((plugin) => {
          const connection = plugin.connection || null;
          const connectedState = connection?.status === 'connected';
          const description = plugin.description || (plugin.capabilities || []).slice(0, 2).join(' · ');
          return (
            <div className={'connector-row plugin-directory-row' + (connectedState ? ' is-connected' : '')} key={plugin.id}>
              <span className={'workspace-row-icon connector-icon connector-' + plugin.id}>
                <ConnectorMark id={plugin.id} name={plugin.name} />
              </span>
              <div className="workspace-row-copy">
                <strong>{plugin.name}</strong>
                <span>{description || i18n('plugins.noDescription', 'Use this app in chat')}</span>
              </div>
              <div className="plugin-directory-row-action">{renderAction(plugin)}</div>
            </div>
          );
        })}
      </div>
      {configured ? (
        <p className="plugin-directory-note">{i18n('plugins.oauthNote', 'OAuth tokens stay in the secure connector gateway.')}</p>
      ) : (
        <div className="plugin-directory-warning"><strong>{i18n('plugins.setupTitle', 'Connector service needs setup')}</strong><span>{i18n('plugins.setupDesc', 'Add OOMOL_PROJECT_API_KEY to the server environment to enable authorization.')}</span></div>
      )}
    </section>
  );
}

function CodexMcpView({ servers, configured, dispatch }: {
  servers: ReadonlyArray<{ key: string; name: string; description?: string; endpointHost?: string; enabled?: boolean; scope?: string; healthStatus?: string; lastError?: string | null }>;
  configured: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  return (
    <section className="codex-mcp-card" aria-labelledby="codex-mcp-title">
      <div className="codex-mcp-heading">
        <div>
          <span className="workspace-eyebrow">{i18n('plugins.codexWorkspace', 'Codex workspace')}</span>
          <h2 id="codex-mcp-title">{i18n('plugins.codexProjectTools', 'Project tools')}</h2>
        </div>
        <span className="codex-mcp-badge">{configured ? i18n('plugins.codexServerManaged', 'Server managed') : i18n('plugins.codexNotConfigured', 'Not configured')}</span>
      </div>
      <p className="workspace-note">{i18n('plugins.codexMcpPolicy', 'Choose which approved MCP servers Codex may use in this project. URLs, credentials, sandbox, and approval rules stay under server control.')}</p>
      {!configured ? (
        <div className="codex-mcp-empty">{i18n('plugins.codexMcpEmpty', 'No MCP servers have been configured by the administrator.')}</div>
      ) : servers.length === 0 ? (
        <div className="codex-mcp-empty">{i18n('plugins.codexMcpUnavailable', 'No approved MCP servers are available for this account.')}</div>
      ) : (
        <div className="codex-mcp-list">
          {servers.map((server) => {
            const enabled = !!server.enabled;
            const health = server.healthStatus === 'reachable' ? i18n('plugins.codexMcpHealthy', 'Healthy') : server.healthStatus === 'unavailable' ? i18n('plugins.codexMcpUnavailableStatus', 'Unavailable') : i18n('plugins.codexMcpNotChecked', 'Not checked');
            return (
              <div className={'codex-mcp-row' + (enabled ? ' is-enabled' : '')} key={server.key}>
                <div className="codex-mcp-copy">
                  <strong>{server.name}</strong>
                  <span>{server.description || i18n('plugins.codexMcpTools', 'MCP tools')} · {server.endpointHost || i18n('plugins.codexServerManaged', 'server-managed')} · {server.scope === 'project' ? i18n('plugins.codexProjectOverride', 'Project override') : i18n('plugins.codexGlobalDefault', 'Global default')}</span>
                  <small>{health}{server.lastError ? ' · ' + server.lastError : ''}</small>
                </div>
                <div className="codex-mcp-actions">
                  <button type="button" className="workspace-secondary codex-mcp-health" onClick={() => dispatch.checkCodexMcpHealth(server.key)}>{i18n('plugins.codexCheck', 'Check')}</button>
                  <button type="button" className={'codex-mcp-toggle' + (enabled ? ' is-on' : '')} role="switch" aria-checked={enabled} onClick={() => dispatch.toggleCodexMcp(server.key, !enabled)}>
                    {enabled ? i18n('common.on', 'On') : i18n('common.off', 'Off')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function PluginsView({ plugins, configured, mcp, mcpConfigured, dispatch }: {
  plugins: ReadonlyArray<WorkspacePlugin>;
  configured: boolean;
  mcp: ReadonlyArray<{ key: string; name: string; description?: string; endpointHost?: string; enabled?: boolean; scope?: string; healthStatus?: string; lastError?: string | null }>;
  mcpConfigured: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  if (plugins.length === 0) {
    return (
      <>
        <PluginDirectory plugins={plugins} configured={configured} dispatch={dispatch} />
        <CodexMcpView servers={mcp} configured={mcpConfigured} dispatch={dispatch} />
      </>
    );
  }
  return (
    <>
      <PluginDirectory plugins={plugins} configured={configured} dispatch={dispatch} />
      <CodexMcpView servers={mcp} configured={mcpConfigured} dispatch={dispatch} />
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
      return <PluginsView plugins={snap.pluginsData} configured={snap.projectConnectorConfigured} mcp={snap.mcpData} mcpConfigured={snap.mcpConfigured} dispatch={dispatch} />;
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
