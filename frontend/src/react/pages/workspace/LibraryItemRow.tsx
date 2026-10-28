import { Input as ShadcnInput } from '../../ui/shadcn/input';
import { Label as ShadcnLabel } from '../../ui/shadcn/label';
import { Checkbox } from '../../ui/shadcn/checkbox';
import { Button as UiButton } from '../../ui/Button';
import React, { useState } from 'react';
import type { useWorkspaceDispatch } from './workspace.hooks';
import type { LibraryDisplayItem } from './library.types';
import { getFileTypeCategory, fileTypeGlyph } from './libraryFileTypes';
import { fileSize, i18n, libraryDate, MoreIcon } from './workspaceUi';

function LibraryItemRow({ item, itemKey, tab, selection, renameItem, dispatch }: {
  item: LibraryDisplayItem;
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
      <ShadcnInput className="library-rename-input" type="text" defaultValue={name} maxLength={255} autoFocus
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
      <UiButton type="button" className="library-row-more-btn" aria-label={`${name}: ${i18n('sidebar.nav.more', 'More')}`} aria-expanded={menuOpen} onClick={(e) => { e.stopPropagation(); setMenuOpen((open) => !open); }}><MoreIcon /></UiButton>
      {menuOpen && <div className="library-row-menu" role="menu">
        <UiButton type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); dispatch.startRename(item.id, itemKey); }}>{i18n('library.rename', 'Rename')}</UiButton>
        {tab === 'files' && <a role="menuitem" className="library-row-menu-link" href={'/api/v2/files/' + encodeURIComponent(item.id) + '/raw'} download={name} onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}>{i18n('library.download', 'Download original')}</a>}
        {tab === 'files' && <UiButton type="button" role="menuitem" onClick={(e) => { e.stopPropagation(); setMenuOpen(false); dispatch.deleteFile(item.id); }}>{i18n('common.delete', 'Delete')}</UiButton>}
      </div>}
    </div>
  );

  return (
    <div className={'workspace-row library-row' + (isSelected ? ' library-row-selected' : '')}>
      <ShadcnLabel className="library-checkbox-label" onClick={(e) => e.stopPropagation()}>
        <Checkbox className="library-checkbox" checked={isSelected} onCheckedChange={(checked) => dispatch.toggleSelect(item.id, checked)} aria-label={'Select ' + name} />
      </ShadcnLabel>
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

export { LibraryItemRow };
