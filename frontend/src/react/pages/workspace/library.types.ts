import type { LibraryItem, WorkspaceSnapshot } from './types';

export type LibraryItemRecord = LibraryItem & { pinned?: boolean; favorite?: boolean };
export type LibraryDisplayItem = LibraryItemRecord & { itemType: 'files' | 'artifacts' };
export type LibraryViewData = Pick<WorkspaceSnapshot['libraryData'], 'tab' | 'query' | 'selection' | 'renameItem'> & {
  files: ReadonlyArray<LibraryItemRecord>;
  artifacts: ReadonlyArray<LibraryItemRecord>;
};
