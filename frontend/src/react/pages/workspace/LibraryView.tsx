import { useMemo, useState } from 'react';
import { t as _t, getLegacyActions } from '../../legacy/gateway.ts';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { LibraryDisplayItem, LibraryViewData } from './library.types';
import { getFileTypeCategory } from './libraryFileTypes';
import { LibraryItemRow } from './LibraryItemRow';
import { ChevronDownIcon, FilterIcon, GearIcon, GridIcon, i18n, ListIcon, SearchIcon } from './workspaceUi';

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
  data: LibraryViewData;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const [chip, setChip] = useState<'recommend' | 'favorite' | 'folder' | 'images' | 'all'>('recommend');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  const allItems = useMemo<LibraryDisplayItem[]>(() => {
    const rawFiles: LibraryDisplayItem[] = (data.files || []).map((f) => ({ ...f, itemType: 'files' as const }));
    const rawArtifacts: LibraryDisplayItem[] = (data.artifacts || []).map((a) => ({ ...a, itemType: 'artifacts' as const }));
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
      : allItems.filter((item) => getFileTypeCategory(item) === typeFilter);
    if (!data.query) return byType;
    const q = data.query.toLowerCase();
    return byType.filter((item) => (item.name || item.title || '').toLowerCase().includes(q));
  }, [allItems, data.query, typeFilter]);

  const anySelected = items.some((item) => !!data.selection[item.id]);
  const allSelected = items.length > 0 && items.every((item) => !!data.selection[item.id]);
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
              getLegacyActions().navigation.openSettings();
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
              if (chip === 'images') items.forEach((item) => dispatch.toggleSelect(item.id, e.target.checked));
              else dispatch.toggleSelectAll(e.target.checked);
            }} aria-label={i18n('library.selectAll', 'Select all')} />
            <span>{i18n('library.selectedCount', '{n} selected').replace('{n}', String(items.filter((item) => !!data.selection[item.id]).length))}</span>
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
          {items.map((item) => (
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

export { LibraryView };
