import { getLegacyActions, t as translate } from '../../legacy/gateway.ts';
import type { useWorkspaceDispatch } from './workspace.hooks';
import { ChevronDownIcon, FilterIcon, GearIcon, GridIcon, i18n, ListIcon, SearchIcon } from './workspaceUi';

const FILE_TYPE_FILTERS = [
  { id: 'all', labelKey: 'library.filter.all', fallback: 'All' },
  { id: 'image', labelKey: 'library.filter.images', fallback: 'Images' },
  { id: 'doc', labelKey: 'library.filter.docs', fallback: 'Documents' },
  { id: 'table', labelKey: 'library.filter.tables', fallback: 'Tables' },
  { id: 'code', labelKey: 'library.filter.code', fallback: 'Code' },
  { id: 'audio', labelKey: 'library.filter.audio', fallback: 'Audio' },
  { id: 'video', labelKey: 'library.filter.video', fallback: 'Video' },
] as const;

export interface LibraryToolbarProps {
  query: string;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
  viewMode: 'list' | 'grid';
  onViewModeChange: (mode: 'list' | 'grid') => void;
  typeFilter: string;
  onTypeFilterChange: (filter: string) => void;
  filterOpen: boolean;
  onFilterOpenChange: (open: boolean) => void;
  newMenuOpen: boolean;
  onNewMenuOpenChange: (open: boolean) => void;
}

export function LibraryToolbar({
  query,
  dispatch,
  viewMode,
  onViewModeChange,
  typeFilter,
  onTypeFilterChange,
  filterOpen,
  onFilterOpenChange,
  newMenuOpen,
  onNewMenuOpenChange,
}: LibraryToolbarProps) {
  const activeTypeLabel = (FILE_TYPE_FILTERS.find((filter) => filter.id === typeFilter) || FILE_TYPE_FILTERS[0]).fallback;
  const filterLabel = i18n('library.filterByType', 'Filter by file type');

  return (
    <>
      <div className="library-head">
        <div className="library-head-left">
          <h1 id="library-directory-title">{i18n('sidebar.library.title', '资料库')}</h1>
          <p className="library-desktop-desc">{i18n('library.directoryDesc', 'Files and items you have added or created.')}</p>
        </div>
        <div className="library-head-actions">
          <div className="library-new-wrap">
            <button type="button" className="workspace-create-button library-new-pill" onClick={() => onNewMenuOpenChange(!newMenuOpen)}>
              <span>{i18n('library.new', '新建')}</span>
              <ChevronDownIcon />
            </button>
            {newMenuOpen ? (
              <div className="library-new-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => {
                  onNewMenuOpenChange(false);
                  document.getElementById('libraryUploadInput')?.click();
                }}>
                  {i18n('library.upload', '上传文件')}
                </button>
              </div>
            ) : null}
          </div>
          <button type="button" className="library-settings-btn" aria-label={i18n('profile.preferences', '偏好设置')} onClick={() => getLegacyActions().navigation.openSettings()}>
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
              aria-label={filterLabel}
              aria-expanded={filterOpen}
              aria-haspopup="menu"
              title={typeFilter === 'all' ? filterLabel : filterLabel + ': ' + activeTypeLabel}
              onClick={() => onFilterOpenChange(!filterOpen)}
            >
              <FilterIcon />
            </button>
            {filterOpen ? (
              <div className="library-filter-menu" role="menu">
                {FILE_TYPE_FILTERS.map((filter) => (
                  <button
                    key={filter.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={typeFilter === filter.id}
                    className={'library-filter-option' + (typeFilter === filter.id ? ' is-active' : '')}
                    onClick={() => {
                      onTypeFilterChange(filter.id);
                      onFilterOpenChange(false);
                    }}
                  >
                    {i18n(filter.labelKey, filter.fallback)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="library-toolbar-divider" />
          <div className="library-view-switcher">
            <button type="button" className={'library-view-btn' + (viewMode === 'grid' ? ' active' : '')} onClick={() => onViewModeChange('grid')} aria-label={translate('chrome.gridView')} data-i18n-aria="chrome.gridView">
              <GridIcon />
            </button>
            <button type="button" className={'library-view-btn' + (viewMode === 'list' ? ' active' : '')} onClick={() => onViewModeChange('list')} aria-label={translate('chrome.listView')} data-i18n-aria="chrome.listView">
              <ListIcon />
            </button>
          </div>
        </div>
        <label className="workspace-search-field library-search-pill">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => dispatch.filter(event.target.value)}
            placeholder={i18n('library.filterPlaceholder', '搜索资料库')}
            aria-label={i18n('library.filterPlaceholder', '搜索资料库')}
          />
        </label>
      </div>
    </>
  );
}
