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

/* ------------------------------------------------------------------ */
/*  Library sub-components                                             */
/* ------------------------------------------------------------------ */

const DEMO_LIBRARY_FILES = [
  { id: 'demo-1', name: 'e52c8d9d-f19a-4e1b-9c6f-a93369f0b3fa.png', kind: 'image', size: 68.6 * 1024, updatedAt: '昨天' },
  { id: 'demo-2', name: '4ae72767-63f0-494f-8c19-8c4f38956bf3.png', kind: 'image', size: 154 * 1024, updatedAt: '9月1日' },
  { id: 'demo-3', name: '6dbed050-4833-4c55-b295-6feea8b32f5d.png', kind: 'image', size: 244 * 1024, updatedAt: '9月1日' },
  { id: 'demo-4', name: 'f19795ff-956d-42d2-a7d1-474e627afba5.png', kind: 'image', size: 268 * 1024, updatedAt: '9月1日' },
  { id: 'demo-5', name: 'f5b101c2-bbfd-48bd-a248-30dc7193aca8.png', kind: 'image', size: 138 * 1024, updatedAt: '9月1日' },
  { id: 'demo-6', name: 'a2105dc5-e024-4a89-ba54-b9533a253dc6.png', kind: 'image', size: 44.8 * 1024, updatedAt: '9月1日' },
  { id: 'demo-7', name: '8ba5db2b-a440-4f2d-91e8-f163ee588128.png', kind: 'image', size: 516 * 1024, updatedAt: '9月1日' },
  { id: 'demo-8', name: '482eedd1-f6f3-4512-8544-fddc83269da0.png', kind: 'image', size: 520 * 1024, updatedAt: '8月24日' },
  { id: 'demo-9', name: '抽象问号人脸微标.png', kind: 'image', size: 387 * 1024, updatedAt: '8月23日' },
];

function LibraryItemRow({ item, itemKey, tab, selection, renameItem, dispatch }: {
  item: { id: string; name?: string; title?: string; kind?: string; size?: number; uploadedAt?: string; updatedAt?: string };
  itemKey: string; tab: string; selection: Record<string, boolean>; renameItem: string | null;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const name = item.name || item.title || i18n('library.untitled', 'Untitled');
  const isSelected = !!selection[item.id];
  const isRenaming = renameItem === item.id;
  const isImage = item.kind === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(name);

  let nameEl: React.ReactNode;
  if (isRenaming) {
    nameEl = (
      <input className="library-rename-input" type="text" defaultValue={name} maxLength={255} autoFocus
        data-rename-id={item.id} data-rename-key={itemKey}
        onKeyDown={(e) => { if (e.key === 'Enter') dispatch.saveRename(e.currentTarget); if (e.key === 'Escape') dispatch.cancelRename(); }} />
    );
  } else {
    nameEl = (
      <strong className="library-name file-name" onClick={(e) => { e.stopPropagation(); dispatch.startRename(item.id, itemKey); }} title={i18n('library.clickToRename', 'Click to rename')}>{name}</strong>
    );
  }

  const actions = tab === 'files' ? (
    <button className="workspace-row-action" onClick={(e) => { e.stopPropagation(); dispatch.deleteFile(item.id); }}>{i18n('common.delete', 'Delete')}</button>
  ) : (
    <button className="workspace-row-action" onClick={(e) => { e.stopPropagation(); dispatch.renameArtifact(item.id); }}>{i18n('library.rename', 'Rename')}</button>
  );

  return (
    <div className={'workspace-row library-row library-file-row' + (isSelected ? ' library-row-selected' : '')}>
      <label className="library-checkbox-label" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="library-checkbox" checked={isSelected} onChange={(e) => dispatch.toggleSelect(item.id, e.target.checked)} aria-label={'Select ' + name} />
      </label>
      <span className={'workspace-row-icon library-file-icon file-thumb' + (isImage ? ' is-image' : '')} onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        {isImage ? (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
          </svg>
        )}
      </span>
      <div className="workspace-row-copy col-name" onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        {nameEl}
        <span className="library-mobile-meta">{item.uploadedAt || item.updatedAt || '—'} · {fileSize(item)}</span>
      </div>
      <span className="library-updated col-date">{item.uploadedAt || item.updatedAt || '—'}</span>
      <span className="library-size col-size">{fileSize(item)}</span>
      <span className="library-row-actions">{actions}</span>
    </div>
  );
}

function LibraryView({ data, dispatch }: {
  data: { tab: string; query: string; files: ReadonlyArray<any>; artifacts: ReadonlyArray<any>; selection: Readonly<Record<string, boolean>>; renameItem: string | null };
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [subFilter, setSubFilter] = useState<'all' | 'image' | 'file'>('all');
  const key = data.tab === 'artifacts' ? 'artifacts' : 'files';
  const rawItems = (data[key].length === 0 && !data.query && key === 'files')
    ? DEMO_LIBRARY_FILES
    : data[key];

  const items = rawItems.filter((item: any) => {
    const name = item.name || item.title || '';
    if (data.query && !name.toLowerCase().includes(data.query.toLowerCase())) return false;
    const isImg = item.kind === 'image' || /\.(png|jpe?g|webp|gif|svg)$/i.test(name);
    if (subFilter === 'image' && !isImg) return false;
    if (subFilter === 'file' && isImg) return false;
    return true;
  });

  const anySelected = items.some((item: any) => !!data.selection[item.id]);
  const allSelected = items.length > 0 && items.every((item: any) => !!data.selection[item.id]);

  return (
    <section className="workspace-surface library-directory" aria-labelledby="library-directory-title">
      <div className="workspace-page-head library-panel-head">
        <div>
          <h1 id="library-directory-title">{i18n('sidebar.library.title', '资料库')}</h1>
        </div>
        <div className="workspace-head-actions actions">
          <label className="workspace-search-field spaces-panel-search library-panel-search">
            <SearchIcon />
            <input type="search" value={data.query} onChange={(event) => dispatch.filter(event.target.value)} placeholder={i18n('library.filterPlaceholder', '搜索')} aria-label={i18n('library.filterPlaceholder', '搜索')} />
          </label>
          <button type="button" className="library-new-pill-btn library-panel-upload" onClick={() => document.getElementById('libraryUploadInput')?.click()}>
            <span>{i18n('common.new', '新建')}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
          </button>
        </div>
      </div>
      <div className="workspace-toolbar library-toolbar">
        <div className="workspace-tabs library-filter-pills" role="tablist" aria-label={i18n('sidebar.library.title', '资料库')}>
          <button type="button" role="tab" aria-selected={subFilter === 'all'} className={subFilter === 'all' ? 'active' : ''} onClick={() => setSubFilter('all')}>{i18n('common.all', '全部')}</button>
          <button type="button" role="tab" aria-selected={subFilter === 'image'} className={subFilter === 'image' ? 'active' : ''} onClick={() => setSubFilter('image')}>{i18n('library.images', '图片')}</button>
          <button type="button" role="tab" aria-selected={subFilter === 'file'} className={subFilter === 'file' ? 'active' : ''} onClick={() => setSubFilter('file')}>{i18n('library.files', '文件')}</button>
        </div>
        <div className="library-view-toggles">
          <button type="button" className="lib-view-btn" title="筛选" aria-label="筛选">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
          </button>
          <button type="button" className="lib-view-btn" title="网格" aria-label="网格">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
          </button>
          <button type="button" className="lib-view-btn active" title="列表" aria-label="列表">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
          </button>
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
        <div className="workspace-table library-table">
          <div className="workspace-table-head library-table-head">
            <span className="col-name">{i18n('library.columnName', '名称')}</span>
            <span className="col-date">{i18n('library.columnModified', '修改时间')}</span>
            <span className="col-size">{i18n('library.columnSize', '大小')}</span>
            <span />
          </div>
          <div className="library-table-body">
            {items.map((item: any) => (
              <LibraryItemRow key={item.id} item={item} itemKey={key} tab={key} selection={data.selection} renameItem={data.renameItem} dispatch={dispatch} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Projects sub-component                                             */
/* ------------------------------------------------------------------ */

function ProjectsView({ projects, dispatch }: {
  projects: ReadonlyArray<{ id: string; name: string; description?: string; color?: string }>;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [query, setQuery] = useState('');
  const visibleProjects = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return projects;
    return projects.filter((project) => [project.name, project.description].filter(Boolean).join(' ').toLowerCase().includes(needle));
  }, [projects, query]);

  if (projects.length === 0) {
    return (
      <section className="workspace-surface projects-directory" aria-labelledby="projects-directory-title">
        <WorkspacePageHeader title={i18n('sidebar.spaces.title', 'Projects')} description={i18n('projects.directoryDesc', 'Keep related chats, files, and instructions together.')} query={query} onQuery={setQuery} actionLabel={i18n('projects.create', 'Create project')} onAction={() => dispatch.createProject()} />
        <div className="workspace-empty"><strong>{i18n('projects.empty', 'Make space for ongoing work')}</strong><span>{i18n('projects.emptyDesc', 'Projects keep related chats, files, and instructions together.')}</span><button className="workspace-primary" onClick={() => dispatch.createProject()}>{i18n('projects.create', 'Create project')}</button></div>
      </section>
    );
  }
  return (
    <section className="workspace-surface projects-directory" aria-labelledby="projects-directory-title">
      <WorkspacePageHeader title={i18n('sidebar.spaces.title', 'Projects')} description={i18n('projects.directoryDesc', 'Keep related chats, files, and instructions together.')} query={query} onQuery={setQuery} actionLabel={i18n('projects.create', 'Create project')} onAction={() => dispatch.createProject()} />
      <div className="projects-list">
      {visibleProjects.map((project) => {
        const color = /^#[0-9a-f]{3,8}$/i.test(project.color || '') ? project.color! : 'hsl(var(--accent-000))';
        return (
          <div className="workspace-row project-row" key={project.id}>
            <button className="project-main" onClick={() => dispatch.openProject(project.id)}>
              <span className="project-icon" style={{ color }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 7.5h6l2-2h9v13h-17z" /></svg></span>
              <span className="workspace-row-copy">
                <strong>{project.name}</strong>
                <span>{project.description || ''}</span>
              </span>
            </button>
            <button className="workspace-row-action workspace-icon-action" aria-label={i18n('projects.edit', 'Edit')} title={i18n('projects.edit', 'Edit')} onClick={(e) => { e.stopPropagation(); dispatch.editProject(project.id); }}><MoreIcon /></button>
          </div>
        );
      })}
      {visibleProjects.length === 0 ? <div className="workspace-empty"><strong>{i18n('projects.noMatch', 'No matching projects')}</strong><span>{i18n('projects.noMatchDesc', 'Try a different search.')}</span></div> : null}
      </div>
    </section>
  );
}

function WorkspacePageHeader({ title, description, query, onQuery, actionLabel, onAction }: {
  title: string; description: string; query: string; onQuery: (value: string) => void; actionLabel: string; onAction: () => void;
}) {
  return (
    <div className="workspace-page-head">
      <div><h1 id="projects-directory-title">{title}</h1><p>{description}</p></div>
      <div className="workspace-head-actions">
        <label className="workspace-search-field"><SearchIcon /><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={i18n('common.search', 'Search')} aria-label={i18n('common.search', 'Search')} /></label>
        <button type="button" className="workspace-create-button" onClick={onAction}><PlusIcon /><span>{actionLabel}</span></button>
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
};

const SHOWCASE_INSTALLED_ICONS = [
  { id: 'browser', bg: '#2563eb', title: 'Browser', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="2" y1="7" x2="22" y2="7"/><circle cx="5" cy="5" r="1" fill="#fff"/></svg>' },
  { id: 'palette', bg: '#8b5cf6', title: 'Palette', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><circle cx="13.5" cy="6.5" r=".5" fill="#fff"/><circle cx="17.5" cy="10.5" r=".5" fill="#fff"/><circle cx="8.5" cy="7.5" r=".5" fill="#fff"/><circle cx="6.5" cy="12.5" r=".5" fill="#fff"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.04-.24-.3-.39-.65-.39-1.04 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.5-4.5-9.92-10-8.92z"/></svg>' },
  { id: 'analytics', bg: '#0284c7', title: 'Analytics', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
  { id: 'telescope', bg: '#3b82f6', title: 'Telescope', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="m10.065 12.493-6.18 1.318a.934.934 0 0 1-1.108-.702l-.537-2.15a1.07 1.07 0 0 1 .691-1.265l13.504-4.44"/><path d="m13.56 11.747 4.332-.924"/><path d="m16 21-3.105-6.21"/><path d="M16.485 5.94a2 2 0 0 1 1.455-2.425l1.09-.272a2 2 0 0 1 2.425 1.455l.272 1.09a2 2 0 0 1-1.455 2.425l-1.09.272a2 2 0 0 1-2.425-1.455z"/><path d="m6.158 8.633 1.114 4.456"/></svg>' },
  { id: 'doc', bg: '#1d4ed8', title: 'Doc', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
  { id: 'github', bg: '#18181b', title: 'GitHub', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.39.97.1-.76.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.2-3.09-.12-.3-.52-1.49.11-3.1 0 0 .98-.31 3.2 1.18a11.2 11.2 0 0 1 5.84 0c2.22-1.49 3.2-1.18 3.2-1.18.63 1.61.23 2.8.11 3.1.75.81 1.2 1.83 1.2 3.09 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>' },
  { id: 'ai', bg: '#4338ca', title: 'AI', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3z"/></svg>' },
  { id: 'notes', bg: '#ea580c', title: 'Notes', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
  { id: 'pdf', bg: '#dc2626', title: 'PDF', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15v-4h2a1.5 1.5 0 0 1 0 3H9"/></svg>' },
  { id: 'diagram', bg: '#0d9488', title: 'Diagram', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="5" r="3"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 8 3 8 3-8"/></svg>' },
  { id: 'sheets', bg: '#16a34a', title: 'Sheets', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>' },
  { id: 'apps', bg: '#334155', title: 'Apps', svg: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><rect x="4" y="4" width="6" height="6" rx="1.5"/><rect x="14" y="4" width="6" height="6" rx="1.5"/><rect x="4" y="14" width="6" height="6" rx="1.5"/><rect x="14" y="14" width="6" height="6" rx="1.5"/></svg>' },
];

const POPULAR_CARDS = [
  {
    id: 'pop-gmail',
    name: 'Gmail',
    desc: 'Read and manage Gmail',
    bg: 'linear-gradient(135deg,#ea4335,#fbbc05,#34a853,#4285f4)',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    action: 'add',
  },
  {
    id: 'pop-github',
    name: 'GitHub',
    desc: 'Triage PRs, issues, CI, and publish flows',
    bg: '#1d1d1d',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.16c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.39.97.1-.76.4-1.27.74-1.56-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.28 1.2-3.09-.12-.3-.52-1.49.11-3.1 0 0 .98-.31 3.2 1.18a11.2 11.2 0 0 1 5.84 0c2.22-1.49 3.2-1.18 3.2-1.18.63 1.61.23 2.8.11 3.1.75.81 1.2 1.83 1.2 3.09 0 4.43-2.7 5.4-5.26 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.55C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z"/></svg>',
    action: 'menu',
  },
  {
    id: 'pop-gdrive',
    name: 'Google Drive',
    desc: 'Drive, Docs, Sheets or Slides',
    bg: 'linear-gradient(135deg,#34a853,#fbbc05,#4285f4)',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="m8.5 3 6.5 11.25L11.5 20H4l7.5-13L8.5 3zm7 0 4.5 7.8-7 12.2H9l7-12.2L11.5 3h4z"/></svg>',
    action: 'add',
  },
  {
    id: 'pop-slack',
    name: 'Slack',
    desc: 'Read and manage Slack',
    bg: 'linear-gradient(135deg,#36c5f0,#e01e5b,#2eb67d,#ecb22e)',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M6 15a2 2 0 0 1-2 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2h2v2zm1 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-5zm2-7a2 2 0 0 1-2-2 2 2 0 0 1 2-2 2 2 0 0 1 2 2v2H9zm0 1a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5zm7 2a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2v-2zm-1 0a2 2 0 0 1-2 2 2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5zm-2 7a2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2h2zm0-1a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-5z"/></svg>',
    action: 'add',
  },
  {
    id: 'pop-outlook',
    name: 'Outlook Email',
    desc: 'Triage Outlook inboxes',
    bg: '#0078d4',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="#fff"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5z"/></svg>',
    action: 'add',
  },
  {
    id: 'pop-canva',
    name: 'Canva',
    desc: 'Create, review, edit designs',
    bg: 'linear-gradient(135deg,#00c4cc,#7d2ae8)',
    icon: '<span style="color:#fff;font-weight:700;font-size:18px;">C</span>',
    action: 'add',
  },
];

const NEW_RECOMMENDATION_CARDS = [
  {
    id: 'new-health',
    name: 'Healthcare Public Data',
    desc: 'Search official public healthcare sources',
    bg: '#0284c7',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
  },
  {
    id: 'new-datadog',
    name: 'Datadog (Preview)',
    desc: 'Search and act on your data',
    bg: '#6366f1',
    icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M10 8l4 4-4 4"/></svg>',
  },
];

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
  const connectedLabel = i18n('plugins.connected', 'Connected');
  const renderAction = (plugin: WorkspacePlugin) => {
    const status = plugin.connection?.status;
    if (status === 'connected') {
      return (
        <span className="plugin-directory-connected" role="status" aria-label={connectedLabel} title={connectedLabel}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
      );
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
    <section className="workspace-surface plugin-directory" aria-labelledby="plugin-directory-title">
      <div className="plugins-panel-tabs">
        <div className="pill" role="tablist" aria-label="插件视图">
          <button type="button" className="active" data-tab="plugins">{i18n('sidebar.plugins.title', '插件')}</button>
          <button type="button" data-tab="skills" onClick={() => (window as any).openPromptTemplatesModal?.()}>{i18n('sidebar.more.skills', '技能')}</button>
        </div>
      </div>

      <div className="plugin-directory-head plugins-panel-head">
        <div className="plugin-directory-heading">
          <h2 id="plugin-directory-title">{i18n('sidebar.plugins.title', '插件')}</h2>
          <p className="plugin-directory-desc">{i18n('plugins.directoryDesc', '在你常用的工具中与 Socrates 协作。')}</p>
        </div>
        <div className="actions">
          <label className="plugin-directory-search plugins-panel-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
          <button type="button" className="plugins-panel-add" aria-label="添加插件"><PlusIcon /></button>
        </div>
      </div>

      <section className="plugin-installed-strip plugins-installed" aria-label={i18n('plugins.installed', '已安装')}>
        <div className="plugin-installed-label plugins-installed-label">{i18n('plugins.installed', '已安装')} &gt;</div>
        <div className="plugin-installed-icons plugins-installed-icons">
          {SHOWCASE_INSTALLED_ICONS.map((item) => (
            <span className="installed-icon" style={{ background: item.bg }} key={item.id} title={item.title} dangerouslySetInnerHTML={{ __html: item.svg }} />
          ))}
          <span className="installed-icon add" aria-label="添加更多"><PlusIcon /></span>
        </div>
      </section>

      <div className="plugin-directory-tabs plugins-scope-tabs" role="tablist" aria-label={i18n('plugins.filter', 'Plugin filter')}>
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

      {!query.trim() && (
        <>
          <h2 className="plugins-section-title">{i18n('plugins.popular', '热门')}</h2>
          <div className="plugins-cards">
            {POPULAR_CARDS.map((card) => (
              <div className="plugins-card" key={card.id}>
                <span className="glyph" style={{ background: card.bg }} dangerouslySetInnerHTML={{ __html: card.icon }} />
                <span className="copy"><strong>{card.name}</strong><small>{card.desc}</small></span>
                {card.action === 'menu' ? (
                  <span className="menu"><MoreIcon /></span>
                ) : (
                  <span className="add"><PlusIcon /></span>
                )}
              </div>
            ))}
          </div>
          <div className="plugins-more-footer">
            <span className="more-icons-strip">❤️ 🎵 📅</span>
            <span className="more-text">{i18n('plugins.moreApps', '查看Health、Trello，以及更多')}</span>
          </div>
          <h2 className="plugins-section-title" style={{ marginTop: '28px' }}>{i18n('plugins.newRecommended', '新品推荐')}</h2>
          <div className="plugins-cards">
            {NEW_RECOMMENDATION_CARDS.map((card) => (
              <div className="plugins-card" key={card.id}>
                <span className="glyph" style={{ background: card.bg }} dangerouslySetInnerHTML={{ __html: card.icon }} />
                <span className="copy"><strong>{card.name}</strong><small>{card.desc}</small></span>
                <span className="add"><PlusIcon /></span>
              </div>
            ))}
          </div>
        </>
      )}

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
    <details className="codex-mcp-card">
      <summary className="codex-mcp-heading">
        <div>
          <span className="workspace-eyebrow">{i18n('plugins.codexWorkspace', 'Codex workspace')}</span>
          <h2 id="codex-mcp-title">{i18n('plugins.codexProjectTools', 'Project tools')}</h2>
        </div>
        <span className="codex-mcp-badge">{configured ? i18n('plugins.codexServerManaged', 'Server managed') : i18n('plugins.codexNotConfigured', 'Not configured')}</span>
      </summary>
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
    </details>
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
