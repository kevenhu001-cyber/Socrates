import { Button } from '../../ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../ui/shadcn/dropdown-menu';
import { ToggleGroup, ToggleGroupItem } from '../../ui/shadcn/toggle-group';
import { t as translate } from '../../../ui/legacyI18n.ts';
import type { useWorkspaceDispatch } from './workspace.hooks';
import {
  ChevronDownIcon,
  FilterIcon,
  GridIcon,
  i18n,
  ListIcon,
  WorkspaceSearchField,
} from './workspaceUi';
import { triggerLibraryUpload } from './LibraryUploadInput';

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
}

function LibraryHead() {
  return (
    <div className="library-head">
      <div className="library-head-left">
        <h1 id="library-directory-title">{i18n('sidebar.library.title', '资料库')}</h1>
        <p className="library-desktop-desc">
          {i18n('library.directoryDesc', 'Files and items you have added or created.')}
        </p>
      </div>
      <div className="library-head-actions">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger
            render={<Button className="workspace-create-button library-new-pill" />}
          >
            <span>{i18n('library.new', '新建')}</span>
            <ChevronDownIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="library-new-menu">
            <DropdownMenuItem className="min-h-(--ui-control-sm)" onClick={triggerLibraryUpload}>
              {i18n('library.upload', '上传文件')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function LibraryTypeFilter({
  typeFilter,
  onTypeFilterChange,
}: {
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
}) {
  const activeFilter =
    FILE_TYPE_FILTERS.find((filter) => filter.id === typeFilter) || FILE_TYPE_FILTERS[0];
  const filterLabel = i18n('library.filterByType', 'Filter by file type');
  const triggerLabel =
    typeFilter === 'all'
      ? filterLabel
      : `${filterLabel} · ${i18n(activeFilter.labelKey, activeFilter.fallback)}`;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant={typeFilter === 'all' ? 'ghost' : 'secondary'}
            size="icon-lg"
            className="library-tool-btn"
          />
        }
        aria-label={triggerLabel}
        title={triggerLabel}
      >
        <FilterIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent aria-label={filterLabel} className="w-auto min-w-36">
        <DropdownMenuRadioGroup value={typeFilter} onValueChange={onTypeFilterChange}>
          {FILE_TYPE_FILTERS.map((filter) => (
            <DropdownMenuRadioItem
              key={filter.id}
              value={filter.id}
              closeOnClick
              className="min-h-(--ui-control-sm)"
            >
              {i18n(filter.labelKey, filter.fallback)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function LibraryToolbar({
  query,
  dispatch,
  viewMode,
  onViewModeChange,
  typeFilter,
  onTypeFilterChange,
}: LibraryToolbarProps) {
  return (
    <>
      <LibraryHead />

      <div className="library-toolbar">
        <div className="library-toolbar-controls">
          <LibraryTypeFilter typeFilter={typeFilter} onTypeFilterChange={onTypeFilterChange} />
          <div className="library-toolbar-divider" />
          <ToggleGroup
            className="library-view-switcher"
            value={[viewMode]}
            aria-label={i18n('library.viewMode', 'View mode')}
            onValueChange={(values) => {
              if (values[0] === 'grid' || values[0] === 'list') onViewModeChange(values[0]);
            }}
          >
            <ToggleGroupItem
              type="button"
              value="grid"
              className="library-view-btn p-0"
              aria-label={translate('chrome.gridView')}
              data-i18n-aria="chrome.gridView"
            >
              <GridIcon />
            </ToggleGroupItem>
            <ToggleGroupItem
              type="button"
              value="list"
              className="library-view-btn p-0"
              aria-label={translate('chrome.listView')}
              data-i18n-aria="chrome.listView"
            >
              <ListIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <WorkspaceSearchField
          className="workspace-search-field library-search-pill"
          label={i18n('library.filterPlaceholder', '搜索资料库')}
          query={query}
          onQuery={dispatch.filter}
        />
      </div>
    </>
  );
}
