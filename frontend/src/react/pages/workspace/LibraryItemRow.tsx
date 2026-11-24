import { Input as ShadcnInput } from '../../ui/shadcn/input';
import { Label as ShadcnLabel } from '../../ui/shadcn/label';
import { Checkbox } from '../../ui/shadcn/checkbox';
import { Button as UiButton } from '../../ui/Button';
import { Download, Pencil, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLink,
  DropdownMenuTrigger,
} from '../../ui/shadcn/dropdown-menu';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { LibraryDisplayItem } from './library.types';
import { getFileTypeCategory, fileTypeGlyph } from './libraryFileTypes';
import { fileSize, i18n, libraryDate, MoreIcon } from './workspaceUi';

function LibraryItemName({
  isRenaming,
  name,
  item,
  itemKey,
  dispatch,
}: {
  isRenaming: boolean;
  name: string;
  item: LibraryDisplayItem;
  itemKey: string;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  if (isRenaming) {
    return (
      <ShadcnInput
        className="library-rename-input"
        type="text"
        defaultValue={name}
        maxLength={255}
        autoFocus
        data-rename-id={item.id}
        data-rename-key={itemKey}
        onKeyDown={(e) => {
          if (e.key === 'Enter') dispatch.saveRename(e.currentTarget);
          if (e.key === 'Escape') dispatch.cancelRename();
        }}
      />
    );
  }
  return (
    <strong
      className="library-item-name"
      onClick={(e) => {
        e.stopPropagation();
        dispatch.startRename(item.id, itemKey);
      }}
      title={i18n('library.clickToRename', 'Click to rename')}
    >
      {name}
    </strong>
  );
}

function LibraryRowActions({
  name,
  item,
  itemKey,
  tab,
  dispatch,
}: {
  name: string;
  item: LibraryDisplayItem;
  itemKey: string;
  tab: string;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const label = `${name}: ${i18n('sidebar.nav.more', 'More')}`;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={<UiButton type="button" className="library-row-more-btn" />}
        aria-label={label}
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="library-row-menu w-auto min-w-44">
        <DropdownMenuItem
          className="min-h-(--ui-control-touch)"
          onClick={() => dispatch.startRename(item.id, itemKey)}
        >
          <Pencil aria-hidden="true" />
          {i18n('library.rename', 'Rename')}
        </DropdownMenuItem>
        {tab === 'files' && (
          <>
            <DropdownMenuLink
              className="library-row-menu-link flex min-h-(--ui-control-touch) items-center gap-2 rounded-md px-2 text-sm"
              href={'/api/v2/files/' + encodeURIComponent(item.id) + '/raw'}
              download={name}
            >
              <Download size={16} aria-hidden="true" />
              {i18n('library.download', 'Download original')}
            </DropdownMenuLink>
            <DropdownMenuItem
              className="min-h-(--ui-control-touch)"
              variant="destructive"
              onClick={() => dispatch.deleteFile(item.id)}
            >
              <Trash2 aria-hidden="true" />
              {i18n('common.delete', 'Delete')}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LibraryItemRow({
  item,
  itemKey,
  tab,
  selection,
  renameItem,
  dispatch,
}: {
  item: LibraryDisplayItem;
  itemKey: string;
  tab: string;
  selection: Record<string, boolean>;
  renameItem: string | null;
  dispatch: ReturnType<typeof useWorkspaceDispatch>;
}) {
  const name = item.name || item.title || i18n('library.untitled', 'Untitled');
  const isSelected = !!selection[item.id];
  const isRenaming = renameItem === item.id;

  return (
    <div className={'workspace-row library-row' + (isSelected ? ' library-row-selected' : '')}>
      <ShadcnLabel className="library-checkbox-label" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          className="library-checkbox"
          checked={isSelected}
          onCheckedChange={(checked) => dispatch.toggleSelect(item.id, checked)}
          aria-label={'Select ' + name}
        />
      </ShadcnLabel>
      <span
        className={
          'workspace-row-icon library-file-icon library-file-' +
          getFileTypeCategory(item) +
          (item.kind === 'image' ? ' is-image' : '')
        }
        onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}
      >
        {fileTypeGlyph(item)}
      </span>
      <div
        className="workspace-row-copy"
        onClick={() => dispatch.openItem(item.id, item.kind || 'file', itemKey)}
      >
        <LibraryItemName
          isRenaming={isRenaming}
          name={name}
          item={item}
          itemKey={itemKey}
          dispatch={dispatch}
        />
        <span className="library-mobile-meta">
          {libraryDate(item.uploadedAt || item.updatedAt)}
        </span>
      </div>
      <span className="library-updated">{libraryDate(item.uploadedAt || item.updatedAt)}</span>
      <span className="library-size">{fileSize(item)}</span>
      <span className="library-row-actions">
        <LibraryRowActions
          name={name}
          item={item}
          itemKey={itemKey}
          tab={tab}
          dispatch={dispatch}
        />
      </span>
    </div>
  );
}

export { LibraryItemRow };
