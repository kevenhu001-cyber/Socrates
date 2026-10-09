import { useMemo, useState } from 'react';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { LibraryDisplayItem, LibraryViewData } from './library.types';
import { getFileTypeCategory } from './libraryFileTypes';
import { LibraryItemRow } from './LibraryItemRow';
import { i18n } from './workspaceUi';
import { LibraryCategoryTabs } from './LibraryCategoryTabs';
import { LibraryEmptyState } from './LibraryEmptyState';
import { LibrarySelectionBar } from './LibrarySelectionBar';
import { LibraryToolbar } from './LibraryToolbar';

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

  return (
    <section className="workspace-surface library-directory" aria-labelledby="library-directory-title">
      <LibraryToolbar
        query={data.query}
        dispatch={dispatch}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        typeFilter={typeFilter}
        onTypeFilterChange={setTypeFilter}
        filterOpen={filterOpen}
        onFilterOpenChange={setFilterOpen}
        newMenuOpen={newMenuOpen}
        onNewMenuOpenChange={setNewMenuOpen}
      />
      <LibraryCategoryTabs chip={chip} onChipChange={setChip} dispatch={dispatch} />

      {anySelected && (
        <LibrarySelectionBar items={items} chip={chip} selection={data.selection} dispatch={dispatch} />
      )}

      {items.length === 0 ? (
        <LibraryEmptyState query={data.query} chip={chip} />
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
