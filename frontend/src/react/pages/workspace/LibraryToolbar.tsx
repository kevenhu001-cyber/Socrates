import { Button } from '../../ui/shadcn/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '../../ui/shadcn/dropdown-menu';
import { PageViewToggle } from '../../ui/page/PageTabs';
import { t as translate } from '../../../ui/legacyI18n.ts';
import type { useWorkspaceDispatch } from './workspace.hooks';
import { ChevronDownIcon, FilterIcon, i18n } from './workspaceUi';
import { triggerLibraryUpload } from './LibraryUploadInput';
import { PageHeader } from '../../ui/page/PageHeader';
import { PageSearchField } from '../../ui/page/PageSearchField';
import { PageToolbar } from '../../ui/page/PageToolbar';

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
  readonly query: string;
  readonly dispatch: ReturnType<typeof useWorkspaceDispatch>;
  readonly viewMode: 'list' | 'grid';
  readonly onViewModeChange: (mode: 'list' | 'grid') => void;
  readonly typeFilter: string;
  readonly onTypeFilterChange: (filter: string) => void;
}

function LibraryNewAction() {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger render={<Button className="library-new-pill" />}>
        <span>{i18n('library.new', '新建')}</span>
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="library-new-menu">
        <DropdownMenuItem className="min-h-(--ui-control-sm)" onClick={triggerLibraryUpload}>
          {i18n('library.upload', '上传文件')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LibraryTypeFilter({
  typeFilter,
  onTypeFilterChange,
}: Readonly<{
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
}>) {
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
      <PageHeader
        titleId="library-directory-title"
        title={i18n('sidebar.library.title', '资料库')}
        description={i18n('library.directoryDesc', 'Files and items you have added or created.')}
        actions={<LibraryNewAction />}
      />

      <PageToolbar className="library-toolbar">
        <PageSearchField
          className="library-search-pill"
          label={i18n('library.filterPlaceholder', '搜索资料库')}
          query={query}
          onQuery={dispatch.filter}
        />
        <div className="ui-page-toolbar-end library-toolbar-controls">
          <LibraryTypeFilter typeFilter={typeFilter} onTypeFilterChange={onTypeFilterChange} />
          <div className="library-toolbar-divider" />
          <PageViewToggle
            className="library-view-switcher"
            itemClassName="library-view-btn"
            value={viewMode}
            onChange={onViewModeChange}
            ariaLabel={i18n('library.viewMode', 'View mode')}
            gridLabel={translate('chrome.gridView')}
            listLabel={translate('chrome.listView')}
            gridI18nKey="chrome.gridView"
            listI18nKey="chrome.listView"
          />
        </div>
      </PageToolbar>
    </>
  );
}
