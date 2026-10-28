import { Label as ShadcnLabel } from '../../ui/shadcn/label';
import { NativeControl as ShadcnNativeControl } from '../../ui/NativeControl';
import { Button as UiButton } from '../../ui/Button';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { LibraryDisplayItem } from './library.types';
import { i18n } from './workspaceUi';

interface LibrarySelectionBarProps {
  items: ReadonlyArray<LibraryDisplayItem>;
  chip: 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
  selection: Record<string, boolean>;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}

export function LibrarySelectionBar({ items, chip, selection, dispatch }: LibrarySelectionBarProps) {
  const allSelected = items.length > 0 && items.every((item) => !!selection[item.id]);
  const selectedCount = items.filter((item) => !!selection[item.id]).length;

  return (
    <div className="library-selection-bar visible">
      <ShadcnLabel className="library-select-all">
        <ShadcnNativeControl
          type="checkbox"
          className="library-checkbox"
          checked={allSelected}
          onChange={(event) => {
            if (chip === 'images') items.forEach((item) => dispatch.toggleSelect(item.id, event.target.checked));
            else dispatch.toggleSelectAll(event.target.checked);
          }}
          aria-label={i18n('library.selectAll', 'Select all')}
        />
        <span>{i18n('library.selectedCount', '{n} selected').replace('{n}', String(selectedCount))}</span>
      </ShadcnLabel>
      <UiButton type="submit" className="workspace-row-action library-bulk-delete" onClick={() => dispatch.deleteSelected()} disabled={selectedCount === 0}>
        {i18n('library.deleteSelected', 'Delete selected')}
      </UiButton>
    </div>
  );
}
