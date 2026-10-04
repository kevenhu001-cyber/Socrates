import { createRoot, type Root } from 'react-dom/client';
import React, { useMemo, useState } from 'react';

import { t as _t } from '../../legacy/gateway';
import { installWorkspaceBridge, useWorkspaceSnapshot, useWorkspaceDispatch } from './workspace.bridge';
import { getConnectorIconMarkup } from '../../../connector-icons';
import { PluginDetailView } from './PluginDetailView';
import { WorkspaceLoadingView } from './WorkspaceLoadingView';

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

function libraryDate(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const isZh = document.documentElement.lang.toLowerCase().startsWith('zh');
  const locale = isZh ? 'zh-CN' : 'en-US';
  const diffMs = Math.max(0, Date.now() - date.getTime());
  const elapsedDays = Math.floor(diffMs / (24 * 3600000));
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
  let rel = '';
  if (elapsedDays >= 1) {
    rel = rtf.format(-elapsedDays, 'day');
  } else {
    const elapsedHours = Math.max(1, Math.round(diffMs / 3600000));
    rel = rtf.format(-elapsedHours, 'hour');
  }
  return isZh ? `修改于 ${rel}` : `Modified ${rel}`;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="18" height="18">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" width="14" height="14">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

const PLUGIN_DIRECTORY_PRIORITY = ['gmail', 'health', 'googledrive', 'github', 'supabase', 'googlecalendar', 'notion'];
const INSTALLED_DISPLAY_PRIORITY = ['calendar', 'browser', 'window', 'palette', 'zapier', 'chart', 'thumbsup', 'github', 'workflow', 'microsoft', 'vercel'];

function pluginDirectoryRank(id: string): number {
  const normalized = id.toLowerCase().replace(/^oc/, '').replace(/[^a-z0-9]/g, '');
  const rank = PLUGIN_DIRECTORY_PRIORITY.indexOf(normalized);
  return rank < 0 ? PLUGIN_DIRECTORY_PRIORITY.length : rank;
}

function installedRank(id: string): number {
  const normalized = id.toLowerCase().replace(/^oc/, '').replace(/[^a-z0-9]/g, '');
  const rank = INSTALLED_DISPLAY_PRIORITY.indexOf(normalized);
  return rank < 0 ? INSTALLED_DISPLAY_PRIORITY.length : rank;
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

function getFileTypeCategory(item: { name?: string; title?: string; kind?: string }): string {
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || item.title || '');
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (kind === 'image' || IMAGE_EXTENSIONS.includes(ext)) return 'image';
  if (ext === 'html' || ext === 'htm' || ext === 'web') return 'html';
  if (kind === 'xlsx' || TABLE_EXTENSIONS.includes(ext)) return 'table';
  if (ext === 'json' || ext === 'js' || ext === 'ts' || ext === 'py' || ext === 'css') return 'code';
  if (kind === 'video' || VIDEO_EXTENSIONS.includes(ext)) return 'video';
  if (kind === 'audio' || AUDIO_EXTENSIONS.includes(ext)) return 'audio';
  if (DOC_EXTENSIONS.includes(ext) || kind === 'pdf' || kind === 'text' || kind === 'docx') return 'doc';
  return 'file';
}

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

  if (ext === 'html' || ext === 'htm' || ext === 'web') {
    return (
      <FileGlyph>
        <polyline points="16 18 22 12 16 6" />
        <polyline points="8 6 2 12 8 18" />
      </FileGlyph>
    );
  }
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
  const [menuOpen, setMenuOpen] = useState(false);
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
      <strong className="library-item-name" onClick={(e) => { e.stopPropagation(); dispatch.startRename(item.id, itemKey); }} title={i18n('library.clickToRename', 'Click to rename')}>{name}</strong>
    );
  }

  const actions = (
    <div className="library-row-menu-wrap">
      <button type="button" className="library-row-more-btn" aria-label={`${name}: ${i18n('sidebar.nav.more', 'More')}`} aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((open) => !open); }}><MoreIcon /></button>
      {menuOpen && <div className="library-row-menu" role="menu">
        <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); dispatch.startRename(item.id, itemKey); }}>{i18n('library.rename', 'Rename')}</button>
        {tab === 'files' && <button type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); dispatch.deleteFile(item.id); }}>{i18n('common.delete', 'Delete')}</button>}
      </div>}
    </div>
  );

  return (
    <div className={'workspace-row library-row' + (isSelected ? ' library-row-selected' : '')}>
      <label className="library-checkbox-label" onClick={(e) => e.stopPropagation()}>
        <input type="checkbox" className="library-checkbox" checked={isSelected} onChange={(e) => dispatch.toggleSelect(item.id, e.target.checked)} aria-label={'Select ' + name} />
      </label>
      <span className={'workspace-row-icon library-file-icon library-file-' + getFileTypeCategory(item) + (item.kind === 'image' ? ' is-image' : '')} onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        {fileTypeGlyph(item)}
      </span>
      <div className="workspace-row-copy" onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}>
        {nameEl}
        <span className="library-mobile-meta">{libraryDate(item.uploadedAt || item.updatedAt)}</span>
      </div>
      <span className="library-updated">{libraryDate(item.uploadedAt || item.updatedAt)}</span>
      <span className="library-size">{fileSize(item)}</span>
      <span className="library-row-actions">{actions}</span>
    </div>
  );
}

/* The Filter button narrows by the same category the row icons already
   use, so the filter can never disagree with what the user sees. */
const FILE_TYPE_FILTERS = [
  { id: 'all', labelKey: 'library.filter.all', fallback: 'All' },
  { id: 'image', labelKey: 'library.filter.images', fallback: 'Images' },
  { id: 'doc', labelKey: 'library.filter.docs', fallback: 'Documents' },
  { id: 'table', labelKey: 'library.filter.tables', fallback: 'Tables' },
  { id: 'code', labelKey: 'library.filter.code', fallback: 'Code' },
  { id: 'audio', labelKey: 'library.filter.audio', fallback: 'Audio' },
  { id: 'video', labelKey: 'library.filter.video', fallback: 'Video' },
] as const;

function LibraryView({ data, dispatch }: {
  data: { tab: string; query: string; files: ReadonlyArray<any>; artifacts: ReadonlyArray<any>; selection: Readonly<Record<string, boolean>>; renameItem: string | null };
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [chip, setChip] = useState<'recommend' | 'favorite' | 'folder' | 'images' | 'all'>('recommend');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  const allItems = useMemo(() => {
    const rawFiles = (data.files || []).map((f) => ({ ...f, itemType: 'files' }));
    const rawArtifacts = (data.artifacts || []).map((a) => ({ ...a, itemType: 'artifacts' }));
    if (chip === 'images') {
      return [...rawFiles, ...rawArtifacts].filter((item) => {
        const isImgKind = item.kind === 'image';
        const isImgExt = /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(item.name || item.title || '');
        return isImgKind || isImgExt;
      });
    }
    if (chip === 'folder') {
      return [...rawFiles, ...rawArtifacts].filter((item) => item.kind === 'folder');
    }
    if (chip === 'favorite') {
      return [...rawFiles, ...rawArtifacts].filter((item) => Boolean(item.pinned || item.favorite));
    }
    return [...rawFiles, ...rawArtifacts];
  }, [data.files, data.artifacts, chip]);

  const items = useMemo(() => {
    const byType = typeFilter === 'all'
      ? allItems
      : allItems.filter((item: any) => getFileTypeCategory(item) === typeFilter);
    if (!data.query) return byType;
    const q = data.query.toLowerCase();
    return byType.filter((item: any) => (item.name || item.title || '').toLowerCase().includes(q));
  }, [allItems, data.query, typeFilter]);

  const anySelected = items.some((item: any) => !!data.selection[item.id]);
  const allSelected = items.length > 0 && items.every((item: any) => !!data.selection[item.id]);
  const activeTypeLabel = (FILE_TYPE_FILTERS.find((f) => f.id === typeFilter) || FILE_TYPE_FILTERS[0]).fallback;

  return (
    <section className="workspace-surface library-directory" aria-labelledby="library-directory-title">
      <div className="library-head">
        <div className="library-head-left">
          <h1 id="library-directory-title">{i18n('sidebar.library.title', '资料库')}</h1>
          <p className="library-desktop-desc">{i18n('library.directoryDesc', 'Files and items you have added or created.')}</p>
        </div>
        <div className="library-head-actions">
          <div className="library-new-wrap">
            <button
              type="button"
              className="workspace-create-button library-new-pill"
              onClick={() => setNewMenuOpen((o) => !o)}
            >
              <span>{i18n('library.new', '新建')}</span>
              <ChevronDownIcon />
            </button>
            {newMenuOpen && (
              <div className="library-new-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNewMenuOpen(false);
                    document.getElementById('libraryUploadInput')?.click();
                  }}
                >
                  {i18n('library.upload', '上传文件')}
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            className="library-settings-btn"
            aria-label={i18n('profile.preferences', '偏好设置')}
            onClick={() => {
              const settingsBtn = document.getElementById('settingsBtn') || document.getElementById('openProfileBtn');
              settingsBtn?.click();
            }}
          >
            <GearIcon />
          </button>
        </div>
      </div>

      <div className="library-toolbar">
        <div className="library-toolbar-controls">
          <div className="library-tool-btn-wrap">
            <button
              type="button"
              className={'library-tool-btn' + (typeFilter !== 'all' ? ' is-active' : '')}
              aria-label={i18n('library.filterByType', 'Filter by file type')}
              aria-expanded={filterOpen}
              aria-haspopup="menu"
              title={typeFilter === 'all'
                ? i18n('library.filterByType', 'Filter by file type')
                : i18n('library.filterByType', 'Filter by file type') + ': ' + activeTypeLabel}
              onClick={() => setFilterOpen((o) => !o)}
            >
              <FilterIcon />
            </button>
            {filterOpen && (
              <div className="library-filter-menu" role="menu">
                {FILE_TYPE_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={typeFilter === f.id}
                    className={'library-filter-option' + (typeFilter === f.id ? ' is-active' : '')}
                    onClick={() => {
                      setTypeFilter(f.id);
                      setFilterOpen(false);
                    }}
                  >
                    {i18n(f.labelKey, f.fallback)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="library-toolbar-divider" />
          <div className="library-view-switcher">
            <button
              type="button"
              className={'library-view-btn' + (viewMode === 'grid' ? ' active' : '')}
              onClick={() => setViewMode('grid')}
              aria-label={_t('chrome.gridView')}
              data-i18n-aria="chrome.gridView"
            >
              <GridIcon />
            </button>
            <button
              type="button"
              className={'library-view-btn' + (viewMode === 'list' ? ' active' : '')}
              onClick={() => setViewMode('list')}
              aria-label={_t('chrome.listView')}
              data-i18n-aria="chrome.listView"
            >
              <ListIcon />
            </button>
          </div>
        </div>
        <label className="workspace-search-field library-search-pill">
          <SearchIcon />
          <input
            type="search"
            value={data.query}
            onChange={(event) => dispatch.filter(event.target.value)}
            placeholder={i18n('library.filterPlaceholder', '搜索资料库')}
            aria-label={i18n('library.filterPlaceholder', '搜索资料库')}
          />
        </label>
      </div>

      <div className="library-chips-bar" role="tablist" aria-label={i18n('sidebar.library.title', '资料库')}>
        {([
          { id: 'recommend', label: i18n('library.tabRecommend', '推荐') },
          { id: 'favorite', label: i18n('library.tabFavorite', '收藏') },
          { id: 'folder', label: i18n('library.tabFolder', '文件夹') },
          { id: 'images', label: i18n('library.filter.images', '图片') },
          { id: 'all', label: i18n('library.tabAll', '全部') },
        ] as const).map((c) => (
          <button
            key={c.id}
            type="button"
            role="tab"
            aria-selected={chip === c.id}
            className={'library-chip' + (chip === c.id ? ' active' : '')}
            onClick={() => {
              setChip(c.id);
              if (c.id === 'images') dispatch.switchTab('files');
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {anySelected && (
        <div className="library-selection-bar visible">
          <label className="library-select-all">
            <input type="checkbox" className="library-checkbox" checked={allSelected} onChange={(e) => {
              if (chip === 'images') items.forEach((item: any) => dispatch.toggleSelect(item.id, e.target.checked));
              else dispatch.toggleSelectAll(e.target.checked);
            }} aria-label={i18n('library.selectAll', 'Select all')} />
            <span>{i18n('library.selectedCount', '{n} selected').replace('{n}', String(items.filter((item: any) => !!data.selection[item.id]).length))}</span>
          </label>
          <button className="workspace-row-action library-bulk-delete" onClick={() => dispatch.deleteSelected()} disabled={!anySelected}>{i18n('library.deleteSelected', 'Delete selected')}</button>
        </div>
      )}

      {items.length === 0 ? (
        <div className="workspace-empty">
          {data.query ? (
            <><strong>{i18n('library.noMatch', 'No matching items')}</strong><span>{i18n('library.noMatchDesc', 'Try a different search.')}</span></>
          ) : chip === 'images' ? (
            <><strong>{i18n('library.emptyImages', 'No images yet')}</strong><span>{i18n('library.emptyImagesDesc', 'Images you add will appear here.')}</span></>
          ) : (
            <><strong>{i18n('library.emptyFiles', '你的资料库已就绪')}</strong><span>{i18n('library.emptyFilesDesc', '上传文件，或在对话中添加附件。')}</span></>
          )}
        </div>
      ) : (
        <div className={`workspace-table library-list view-${viewMode}`}>
          <div className="workspace-table-head library-desktop-table-head">
            <span>{i18n('library.columnName', 'Name')}</span>
            <span>{i18n('library.columnModified', 'Modified')}</span>
            <span>{i18n('library.columnSize', 'Size')}</span>
            <span />
          </div>
          {items.map((item: any) => (
            <LibraryItemRow key={item.id} item={item} itemKey={item.itemType || 'files'} tab={item.itemType || 'files'} selection={data.selection} renameItem={data.renameItem} dispatch={dispatch} />
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
export function ConnectorMark({ id, name }: { id: string; name: string }) {
  const markup = getConnectorIconMarkup(id) || getConnectorIconMarkup(name);
  if (markup) {
    return (
      <span className="connector-mark-wrap">
        <span dangerouslySetInnerHTML={{ __html: markup }} />
      </span>
    );
  }
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
  /* OpenConnector apps the OOMOL-hosted runtime is not serving yet come
     back with available: false and stay disabled until they do. */
  available?: boolean;
};

function dedupePlugins(plugins: ReadonlyArray<WorkspacePlugin>): WorkspacePlugin[] {
  const seen = new Set<string>();
  const deduped: WorkspacePlugin[] = [];
  const sorted = [...plugins].sort((a, b) => pluginDirectoryRank(a.id) - pluginDirectoryRank(b.id));
  for (const plugin of sorted) {
    const serviceKey = (plugin.id || '').toLowerCase().replace(/^oc_?/, '').replace(/[^a-z0-9]/g, '');
    const nameKey = (plugin.name || '').toLowerCase().replace(/\s+/g, '');
    const canonicalKey = serviceKey || nameKey;
    if (seen.has(canonicalKey) || seen.has(nameKey)) {
      const existing = deduped.find((p) => {
        const pService = (p.id || '').toLowerCase().replace(/^oc_?/, '').replace(/[^a-z0-9]/g, '');
        const pName = (p.name || '').toLowerCase().replace(/\s+/g, '');
        return pService === canonicalKey || pName === nameKey;
      });
      if (existing && !existing.connection?.status && plugin.connection?.status) {
        existing.connection = plugin.connection;
      }
      continue;
    }
    seen.add(canonicalKey);
    seen.add(nameKey);
    deduped.push({ ...plugin });
  }
  return deduped;
}

function PluginDirectory({ plugins, configured, openConnectorAvailable, dispatch, onSelectPlugin }: {
  plugins: ReadonlyArray<WorkspacePlugin>;
  configured: boolean;
  openConnectorAvailable: boolean;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  onSelectPlugin: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'public' | 'personal'>('public');
  const catalog = useMemo(() => dedupePlugins(plugins), [plugins]);
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
    () =>
      catalog
        .filter((plugin) => plugin.connection?.status === 'connected' || plugin.connection?.status === 'initiated')
        .sort((a, b) => installedRank(a.id) - installedRank(b.id)),
    [catalog],
  );

  const searchLabel = i18n('plugins.search', 'Search plugins');
  const connectedLabel = i18n('plugins.connected', 'Connected');
  const manageLabel = i18n('plugins.manage', 'Manage');
  const refreshLabel = i18n('plugins.refreshStatus', 'Refresh status');
  const connectLabel = i18n('plugins.connect', 'Connect');

  /* One action per app, mirroring the connection state. The visible label
     carries the meaning; title/aria-label keep the same contract the dialogs
     and the smoke specs assert on. */
  const renderAction = (plugin: WorkspacePlugin) => {
    const status = plugin.connection?.status;
    if (status === 'connected') {
      return (
        <button type="button" className="plugin-directory-icon-action" aria-label={manageLabel + ' ' + plugin.name} title={manageLabel} onClick={() => dispatch.openPluginForm(plugin.id)}>
          <MoreIcon />
          <span className="plugin-directory-action-label">{manageLabel}</span>
        </button>
      );
    }
    if (status === 'initiated') {
      return (
        <button type="button" className="plugin-directory-icon-action" aria-label={refreshLabel + ' ' + plugin.name} title={refreshLabel} onClick={() => dispatch.refreshPlugin(plugin.id)}>
          <PlusIcon />
          <span className="plugin-directory-action-label">{refreshLabel}</span>
        </button>
      );
    }
    /* Legacy OOMOL apps need the gateway configured; OpenConnector apps
       need the hosted runtime actually serving them (available: true).
       Stub catalog entries (available: false) stay disabled until the
       gateway snapshot covers the app. */
    const isOc = plugin.id.startsWith('oc_');
    const connectable = plugin.available !== false && (isOc || configured);
    const connectTitle = connectable ? connectLabel : i18n('plugins.serverSetupNeeded', 'Unavailable');
    const openForm = () => dispatch.openPluginForm(plugin.id);
    const connect = () => dispatch.connectPlugin(plugin.id);
    const onClick = plugin.authType === 'api_key' || plugin.authType === 'custom_credential' ? openForm : connect;
    return (
      <button type="button" className="plugin-directory-icon-action" disabled={!connectable} aria-label={connectTitle + ' ' + plugin.name} title={connectTitle} onClick={onClick}>
        <PlusIcon />
        <span className="plugin-directory-action-label">{connectable ? connectLabel : i18n('plugins.unavailable', 'Unavailable')}</span>
      </button>
    );
  };

  const popularPlugins = visiblePlugins.slice(0, 5);
  const newPlugins = visiblePlugins.slice(5);

  const renderCard = (plugin: WorkspacePlugin) => (
    <article
      className="connector-row plugin-directory-row"
      data-connector-id={plugin.id}
      key={plugin.id}
      onClick={() => onSelectPlugin(plugin.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelectPlugin(plugin.id);
        }
      }}
    >
      <span className={'workspace-row-icon connector-icon connector-' + plugin.id}><ConnectorMark id={plugin.id} name={plugin.name} /></span>
      <div className="workspace-row-copy">
        <div className="plugin-directory-card-title-row">
          <strong>{plugin.name}</strong>
          {plugin.connection?.status === 'connected' ? <span className="plugin-directory-card-status">{connectedLabel}</span> : null}
        </div>
        <p className="plugin-directory-card-desc">{plugin.description || i18n('plugins.noDescription', 'Use this app in chat')}</p>
      </div>
      <div className="plugin-directory-row-action" onClick={(e) => e.stopPropagation()}>{renderAction(plugin)}</div>
    </article>
  );

  return (
    <section className="workspace-surface plugin-directory" aria-labelledby="plugin-directory-title">
      <div className="plugin-directory-head">
        <div className="plugin-directory-heading">
          <h2 id="plugin-directory-title">{i18n('sidebar.plugins.title', 'Plugins')}</h2>
          <p className="plugin-directory-desc">{i18n('plugins.directoryDesc', 'Connect apps so Socrates can use them in chat.')}</p>
        </div>
        <div className="plugin-directory-tools">
          <label className="plugin-directory-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchLabel} aria-label={searchLabel} /></label>
        </div>
      </div>

      {installedPlugins.length > 0 ? (
        <div className="plugin-installed-strip" aria-label={i18n('plugins.installed', 'Installed')}>
          <button type="button" className="plugin-installed-label" onClick={() => setScope('personal')}>
            {i18n('plugins.installed', 'Installed')}
            <span className="plugin-installed-caret" aria-hidden="true">›</span>
          </button>
          <div className="plugin-installed-icons">
            {installedPlugins.map((plugin) => (
              <button
                type="button"
                className={'workspace-row-icon connector-icon connector-' + plugin.id}
                key={plugin.id}
                title={plugin.name}
                onClick={() => onSelectPlugin(plugin.id)}
              >
                <ConnectorMark id={plugin.id} name={plugin.name} />
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="plugin-directory-tabs" role="tablist" aria-label={i18n('plugins.allPlugins', 'All plugins')}>
        <button type="button" role="tab" aria-selected={scope === 'public'} className={scope === 'public' ? 'active' : ''} onClick={() => setScope('public')}>
          {i18n('plugins.public', 'Public')}
        </button>
        <button type="button" role="tab" aria-selected={scope === 'personal'} className={scope === 'personal' ? 'active' : ''} onClick={() => setScope('personal')}>
          {i18n('plugins.personal', 'Personal')}
        </button>
      </div>

      <div className="plugin-directory-body">
        {visiblePlugins.length === 0 ? <div className="plugin-directory-empty"><strong>{i18n('plugins.noMatch', 'No matching plugins')}</strong><span>{i18n('plugins.tryDifferent', 'Try a different search.')}</span></div> : null}
        {popularPlugins.length > 0 ? <section className="plugin-directory-section"><h3>{i18n('plugins.popular', 'Popular')}</h3><div className="plugin-directory-list">{popularPlugins.map(renderCard)}</div></section> : null}
        {newPlugins.length > 0 ? <section className="plugin-directory-section"><h3>{i18n('plugins.new', 'New and notable')}</h3><div className="plugin-directory-list">{newPlugins.map(renderCard)}</div></section> : null}
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
  const [selectedPluginId, setSelectedPluginId] = useState<string | null>(null);
  const catalog = useMemo(() => dedupePlugins(plugins), [plugins]);

  const selectedPlugin = useMemo(() => {
    if (!selectedPluginId) return null;
    return catalog.find((p) => p.id === selectedPluginId) || null;
  }, [catalog, selectedPluginId]);

  if (selectedPlugin) {
    return (
      <PluginDetailView
        plugin={selectedPlugin}
        configured={configured}
        openConnectorAvailable={openConnectorAvailable}
        dispatch={dispatch}
        onBack={() => setSelectedPluginId(null)}
        renderMark={(id, name) => <ConnectorMark id={id} name={name} />}
      />
    );
  }

  return (
    <PluginDirectory
      plugins={plugins}
      configured={configured}
      openConnectorAvailable={openConnectorAvailable}
      dispatch={dispatch}
      onSelectPlugin={(id) => setSelectedPluginId(id)}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Page component                                                     */
/* ------------------------------------------------------------------ */

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

  installWorkspaceBridge();

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
