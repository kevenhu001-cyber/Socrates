import { createRoot, type Root } from 'react-dom/client';
import React, { useMemo, useState } from 'react';

import { t as _t } from '../../legacy/gateway';
import { installWorkspaceBridge, useWorkspaceSnapshot, useWorkspaceDispatch } from './workspace.bridge';
import { getConnectorIconMarkup } from '../../../connector-icons';

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

function i18n(key: string, fallback: string): string {
  const v = _t(key);
  return v !== key ? v : fallback;
}

function fileSize(item: { size?: number }): string {
  const size = Number(item.size || 0);
  return size
    ? size < 1024 * 1024
      ? Math.max(1, Math.round(size / 1024)) + ' KB'
      : (size / (1024 * 1024)).toFixed(1) + ' MB'
    : i18n('library.metaCreated', 'Created');
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></svg>;
}

function projectMeta(project: { description?: string; createdAt?: string | number; updatedAt?: string | number; created_at?: string | number; updated_at?: string | number }): string {
  const rawDate = project.updatedAt || project.updated_at || project.createdAt || project.created_at;
  if (rawDate) {
    const date = new Date(rawDate);
    if (!Number.isNaN(date.getTime())) {
      const locale = document.documentElement.lang.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US';
      return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }).format(date);
    }
  }
  return project.description || '';
}

/* File-type glyphs for the Library thumbnail box. Resolution order is
   `kind` (from the files.kind column) first, then the filename extension,
   so records saved before `kind` existed still get the right icon. */
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg'];
const VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov', 'mkv', 'avi'];
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'];
const TABLE_EXTENSIONS = ['csv', 'tsv', 'xls', 'xlsx'];
const SLIDE_EXTENSIONS = ['ppt', 'pptx', 'key', 'odp'];
const DOC_EXTENSIONS = ['doc', 'docx', 'rtf', 'odt', 'md', 'markdown', 'txt'];
const BOOK_EXTENSIONS = ['epub', 'mobi', 'azw3'];

function FileGlyph({ children }: { children: React.ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function fileTypeGlyph(item: { name?: string; title?: string; kind?: string }): React.ReactNode {
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || item.title || '');
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const has = (list: string[]) => list.includes(ext);

  if (kind === 'image' || has(IMAGE_EXTENSIONS)) {
    return (
      <FileGlyph>
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <circle cx="8.6" cy="8.6" r="1.6" />
        <path d="m21 15.5-4.5-4.5L5 22" />
      </FileGlyph>
    );
  }
  if (kind === 'video' || has(VIDEO_EXTENSIONS)) {
    return (
      <FileGlyph>
        <rect x="2.5" y="4.5" width="19" height="15" rx="2.5" />
        <path d="m10 9 5 3-5 3z" />
      </FileGlyph>
    );
  }
  if (kind === 'audio' || has(AUDIO_EXTENSIONS)) {
    return (
      <FileGlyph>
        <path d="M9 18V5l12-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="18" cy="16" r="3" />
      </FileGlyph>
    );
  }
  if (kind === 'xlsx' || has(TABLE_EXTENSIONS)) {
    return (
      <FileGlyph>
        <rect x="3" y="3" width="18" height="18" rx="2.5" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </FileGlyph>
    );
  }
  if (kind === 'pptx' || has(SLIDE_EXTENSIONS)) {
    return (
      <FileGlyph>
        <rect x="3" y="3.5" width="18" height="12.5" rx="2" />
        <path d="M12 16v5M8.5 21h7" />
      </FileGlyph>
    );
  }
  if (kind === 'epub' || has(BOOK_EXTENSIONS)) {
    return (
      <FileGlyph>
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      </FileGlyph>
    );
  }
  if (kind === 'pdf' || kind === 'text' || kind === 'docx' || kind === 'rtf' || has(DOC_EXTENSIONS)) {
    return (
      <FileGlyph>
        <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
        <path d="M14 2.5V8h5.5" />
        <path d="M8.5 13h7M8.5 17h4.5" />
      </FileGlyph>
    );
  }
  return (
    <FileGlyph>
      <path d="M14 2.5H6.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V8z" />
      <path d="M14 2.5V8h5.5" />
    </FileGlyph>
  );
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
      <span className={'workspace-row-icon library-file-icon' + (item.kind === 'image' ? ' is-image' : '')} onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        {fileTypeGlyph(item)}
      </span>
      <div className="workspace-row-copy" onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        {nameEl}
        <span className="library-mobile-meta">{item.uploadedAt || item.updatedAt || '—'} · {fileSize(item)}</span>
      </div>
      <span className="library-updated">{item.uploadedAt || item.updatedAt || '—'}</span>
      <span className="library-size">{fileSize(item)}</span>
      <span className="library-row-actions">{actions}</span>
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
    <section className="workspace-surface library-directory" aria-labelledby="library-directory-title">
      <div className="workspace-page-head">
        <div>
          <h1 id="library-directory-title">{i18n('sidebar.library.title', 'Library')}</h1>
          <p>{i18n('library.directoryDesc', 'Files and items you have added or created.')}</p>
        </div>
        <div className="workspace-head-actions">
          <label className="workspace-search-field">
            <SearchIcon />
            <input type="search" value={data.query} onChange={(event) => dispatch.filter(event.target.value)} placeholder={i18n('library.filterPlaceholder', 'Search library')} aria-label={i18n('library.filterPlaceholder', 'Search library')} />
          </label>
          <button type="button" className="workspace-create-button" onClick={() => document.getElementById('libraryUploadInput')?.click()}><PlusIcon /><span>{i18n('library.upload', 'Upload')}</span></button>
        </div>
      </div>
      <div className="workspace-toolbar">
        <div className="workspace-tabs" role="tablist" aria-label={i18n('sidebar.library.title', 'Library')}>
          <button type="button" role="tab" aria-selected={key === 'files'} className={key === 'files' ? 'active' : ''} onClick={() => dispatch.switchTab('files')}>{i18n('sidebar.library.files', 'Files')}</button>
          <button type="button" role="tab" aria-selected={key === 'artifacts'} className={key === 'artifacts' ? 'active' : ''} onClick={() => dispatch.switchTab('artifacts')}>{i18n('sidebar.library.artifacts', 'Created')}</button>
        </div>
      </div>
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
        <div className="workspace-table">
          <div className="workspace-table-head"><span>{i18n('library.columnName', 'Name')}</span><span>{i18n('library.columnModified', 'Modified')}</span><span>{i18n('library.columnSize', 'Size')}</span><span /></div>
          {items.map((item: any) => (
            <LibraryItemRow key={item.id} item={item} itemKey={key} tab={key} selection={data.selection} renameItem={data.renameItem} dispatch={dispatch} />
          ))}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Projects sub-component                                             */
/* ------------------------------------------------------------------ */

function ProjectsView({ projects, dispatch }: {
  projects: ReadonlyArray<{ id: string; name: string; description?: string; color?: string; createdAt?: string | number; updatedAt?: string | number; created_at?: string | number; updated_at?: string | number; shared?: boolean; isShared?: boolean; visibility?: string }>;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all' | 'owned' | 'shared'>('all');
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const scoped = projects.filter((project) => {
      if (scope === 'all') return true;
      /* APIs may expose either `shared`/`isShared` or a visibility marker;
         absent metadata stays in the owned bucket without inventing a
         sharing state for a real project. */
      const record = project as typeof project & { shared?: boolean; isShared?: boolean; visibility?: string };
      const isShared = record.shared === true || record.isShared === true || record.visibility === 'shared';
      return scope === 'shared' ? isShared : !isShared;
    });
    if (!needle) return scoped;
    return scoped.filter((project) => [project.name, project.description].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [projects, query, scope]);

  const projectTabs = (
    <div className="projects-filter-tabs" role="tablist" aria-label={i18n('projects.filter', 'Project filter')}>
      <button type="button" role="tab" aria-selected={scope === 'all'} className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>{i18n('projects.all', 'All')}</button>
      <button type="button" role="tab" aria-selected={scope === 'owned'} className={scope === 'owned' ? 'active' : ''} onClick={() => setScope('owned')}>{i18n('projects.owned', 'Created by you')}</button>
      <button type="button" role="tab" aria-selected={scope === 'shared'} className={scope === 'shared' ? 'active' : ''} onClick={() => setScope('shared')}>{i18n('projects.shared', 'Shared with you')}</button>
    </div>
  );

  return (
    <section className="workspace-surface projects-directory" aria-labelledby="projects-directory-title">
      <WorkspacePageHeader
        title={i18n('sidebar.spaces.title', 'Projects')}
        description={i18n('projects.directoryDesc', 'Keep related chats, files, and instructions together.')}
        query={query}
        onQuery={setQuery}
        actionLabel={i18n('projects.new', 'New')}
        onAction={() => dispatch.createProject()}
        compactAction
      />
      {projectTabs}
      {projects.length === 0 ? (
        <div className="workspace-empty"><strong>{i18n('projects.empty', 'Make space for ongoing work')}</strong><span>{i18n('projects.emptyDesc', 'Projects keep related chats, files, and instructions together.')}</span><button className="workspace-primary" onClick={() => dispatch.createProject()}>{i18n('projects.create', 'Create project')}</button></div>
      ) : (
        <div className="projects-list">
          <div className="projects-list-heading">{i18n('projects.name', 'Name')}</div>
          {visibleProjects.map((project) => {
            const color = /^#[0-9a-f]{3,8}$/i.test(project.color || '') ? project.color! : 'hsl(var(--accent-000))';
            return (
              <div className="workspace-row project-row" key={project.id}>
                <button className="project-main" onClick={() => dispatch.openProject(project.id)}>
                  <span className="project-icon" style={{ color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17z" /></svg></span>
                  <span className="workspace-row-copy">
                    <strong>{project.name}</strong>
                    <span>{projectMeta(project)}</span>
                  </span>
                </button>
                <button className="workspace-row-action workspace-icon-action" aria-label={i18n('projects.edit', 'Edit')} title={i18n('projects.edit', 'Edit')} onClick={(e) => { e.stopPropagation(); dispatch.editProject(project.id); }}><MoreIcon /></button>
              </div>
            );
          })}
          {visibleProjects.length === 0 ? <div className="workspace-empty"><strong>{i18n('projects.noMatch', 'No matching projects')}</strong><span>{i18n('projects.noMatchDesc', 'Try a different search.')}</span></div> : null}
        </div>
      )}
    </section>
  );
}

function WorkspacePageHeader({ title, description, query, onQuery, actionLabel, onAction, compactAction }: {
  title: string; description: string; query: string; onQuery: (value: string) => void; actionLabel: string; onAction: () => void; compactAction?: boolean;
}) {
  const searchLabel = i18n('projects.search', i18n('common.search', 'Search'));
  return (
    <div className="workspace-page-head">
      <div><h1 id="projects-directory-title">{title}</h1><p>{description}</p></div>
      <div className="workspace-head-actions">
        <label className="workspace-search-field"><SearchIcon /><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
        <button type="button" className={'workspace-create-button' + (compactAction ? ' projects-create-button' : '')} onClick={onAction}>{compactAction ? null : <PlusIcon />}<span>{actionLabel}</span></button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Plugins sub-component                                              */
/* ------------------------------------------------------------------ */

/* Every connector renders a bundled real brand mark from
   src/connector-icons.ts — no remote favicon/image CDNs. Unknown ids fall
   back to a two-letter monogram. */
function ConnectorMark({ id, name }: { id: string; name: string }) {
  const markup = getConnectorIconMarkup(id) || getConnectorIconMarkup(name);
  if (markup) return <span dangerouslySetInnerHTML={{ __html: markup }} />;
  return (
    <span className="connector-logo-fallback" aria-hidden="true">
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

type WorkspacePlugin = {
  id: string;
  name: string;
  description?: string;
  capabilities?: string[];
  authType?: string;
  connection?: { status?: string; displayName?: string } | null;
  /* OpenConnector apps the sidecar is not serving yet come back with
     available: false and stay disabled until it comes online. */
  available?: boolean;
};

function PluginDirectory({ plugins, configured, openConnectorAvailable, dispatch }: {
  plugins: ReadonlyArray<WorkspacePlugin>;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'public' | 'personal'>('public');
  const catalog = plugins;
  const visiblePlugins = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return catalog.filter((plugin) => {
      const isInstalled = plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated';
      if (scope === 'personal' && !isInstalled) return false;
      if (!needle) return true;
      return [plugin.name, plugin.description, ...(plugin.capabilities || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [catalog, query, scope]);
  const installedPlugins = useMemo(
    () => catalog.filter((plugin) => plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated'),
    [catalog],
  );

  const searchLabel = i18n('plugins.search', 'Search plugins');
  const renderAction = (plugin: WorkspacePlugin) => {
    const status = plugin.connection?.status;
    if (status === 'connected') {
      return (
        <button type="button" className="plugin-directory-icon-action" aria-label={i18n('plugins.manage', 'Manage') + ' ' + plugin.name} title={i18n('plugins.manage', 'Manage')} onClick={() => dispatch.openPluginForm(plugin.id)}><MoreIcon /></button>
      );
    }
    if (status === 'initiated') {
      return <button type="button" className="plugin-directory-icon-action" aria-label={i18n('plugins.refreshStatus', 'Refresh') + ' ' + plugin.name} title={i18n('plugins.refreshStatus', 'Refresh')} onClick={() => dispatch.refreshPlugin(plugin.id)}><PlusIcon /></button>;
    }
    /* Legacy OOMOL apps need the gateway configured; OpenConnector apps
       need the sidecar actually serving them (available: true). Stub
       catalog entries (available: false) stay disabled until the
       sidecar serves the app. */
    const isOc = plugin.id.startsWith('oc_');
    const connectable = plugin.available !== false && (isOc || configured);
    const connectTitle = connectable ? i18n('plugins.connect', 'Connect') : i18n('plugins.serverSetupNeeded', 'Unavailable');
    if (plugin.authType === 'api_key' || plugin.authType === 'custom_credential') {
      return <button type="button" className="plugin-directory-icon-action" disabled={!connectable} aria-label={connectTitle + ' ' + plugin.name} title={connectTitle} onClick={() => dispatch.openPluginForm(plugin.id)}><PlusIcon /></button>;
    }
    return <button type="button" className="plugin-directory-icon-action" disabled={!connectable} aria-label={connectTitle + ' ' + plugin.name} title={connectTitle} onClick={() => dispatch.connectPlugin(plugin.id)}><PlusIcon /></button>;
  };

  const popularPlugins = visiblePlugins.slice(0, 6);
  const newPlugins = visiblePlugins.slice(6);

  return (
    <section className="workspace-surface plugin-directory" aria-labelledby="plugin-directory-title">
      <div className="plugin-directory-head">
        <div className="plugin-directory-heading">
          <h2 id="plugin-directory-title">{i18n('sidebar.plugins.title', 'Plugins')}</h2>
          <p className="plugin-directory-desc">{i18n('plugins.directoryDesc', 'Connect apps so Socrates can use them in chat.')}</p>
        </div>
        <div className="plugin-directory-tools">
          <label className="plugin-directory-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
          <button
            type="button"
            className="plugin-directory-add-btn"
            aria-label={i18n('plugins.add', 'Add plugin')}
            title={i18n('plugins.add', 'Add plugin')}
            onClick={() => {
              const openMarketplace = (window as Window & { openPluginMarketplace?: () => void }).openPluginMarketplace;
              openMarketplace?.();
            }}
          >
            <PlusIcon />
          </button>
        </div>
      </div>

      {installedPlugins.length > 0 ? (
        <div className="plugin-installed-strip" aria-label={i18n('plugins.installed', 'Installed')}>
          <button type="button" className="plugin-installed-label" onClick={() => setScope('personal')}>{i18n('plugins.installed', 'Installed')} <span aria-hidden="true">›</span></button>
          <div className="plugin-installed-icons">{installedPlugins.map((plugin) => <span className={'workspace-row-icon connector-icon connector-' + plugin.id} key={plugin.id} title={plugin.name}><ConnectorMark id={plugin.id} name={plugin.name} /></span>)}</div>
        </div>
      ) : null}

      <div className="plugin-directory-tabs" role="tablist" aria-label={i18n('plugins.filter', 'Plugin filter')}>
        <button type="button" role="tab" aria-selected={scope === 'public'} className={scope === 'public' ? 'active' : ''} onClick={() => setScope('public')}>{i18n('plugins.public', 'Public')}</button>
        <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>{i18n('plugins.personal', 'Personal')}</button>
      </div>

      <div className="plugin-directory-body">
        {visiblePlugins.length === 0 ? <div className="plugin-directory-empty"><strong>{i18n('plugins.noMatch', 'No matching plugins')}</strong><span>{i18n('plugins.tryDifferent', 'Try a different search.')}</span></div> : null}
        {popularPlugins.length > 0 ? <section className="plugin-directory-section"><h3>{i18n('plugins.popular', 'Popular')}</h3><div className="plugin-directory-list">{popularPlugins.map((plugin) => <div className="connector-row plugin-directory-row" data-connector-id={plugin.id} key={plugin.id}><span className={'workspace-row-icon connector-icon connector-' + plugin.id}><ConnectorMark id={plugin.id} name={plugin.name} /></span><div className="workspace-row-copy"><strong>{plugin.name}</strong><span>{plugin.description || i18n('plugins.noDescription', 'Use this app in chat')}</span></div><div className="plugin-directory-row-action">{renderAction(plugin)}</div></div>)}</div></section> : null}
        {newPlugins.length > 0 ? <section className="plugin-directory-section"><h3>{i18n('plugins.new', 'New and notable')}</h3><div className="plugin-directory-list">{newPlugins.map((plugin) => <div className="connector-row plugin-directory-row" data-connector-id={plugin.id} key={plugin.id}><span className={'workspace-row-icon connector-icon connector-' + plugin.id}><ConnectorMark id={plugin.id} name={plugin.name} /></span><div className="workspace-row-copy"><strong>{plugin.name}</strong><span>{plugin.description || i18n('plugins.noDescription', 'Use this app in chat')}</span></div><div className="plugin-directory-row-action">{renderAction(plugin)}</div></div>)}</div></section> : null}
      </div>
      {!configured && !openConnectorAvailable && plugins.length > 0 ? <p className="plugin-directory-note">{i18n('plugins.serverSetupNeeded', 'Connector service needs setup')}</p> : null}
    </section>
  );
}

function PluginsView({ plugins, configured, openConnectorAvailable, dispatch }: {
  plugins: ReadonlyArray<WorkspacePlugin>;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  return (
    <>
      <PluginDirectory plugins={plugins} configured={configured} openConnectorAvailable={openConnectorAvailable} dispatch={dispatch} />
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
  const containerId = page === 'library' ? 'libraryList' : page === 'projects' ? 'spacesList' : 'pluginsList';
  const container = document.getElementById(containerId);
  if (!container) return;

  container.classList.remove('visually-hidden');
  const panelId = page === 'library' ? 'libraryPanel' : page === 'projects' ? 'spacesPanel' : 'pluginsPanel';
  const panel = document.getElementById(panelId);
  panel?.setAttribute('data-live-directory', 'true');

  installWorkspaceBridge();

  let root = roots.get(page);
  if (!root) {
    root = createRoot(container);
    roots.set(page, root);
  }
  root.render(<WorkspacePage page={page} />);
  panel?.classList.remove('hidden');
}

export function unmountWorkspacePage(page: string): void {
  const root = roots.get(page);
  if (root) {
    root.unmount();
    roots.delete(page);
  }
}
