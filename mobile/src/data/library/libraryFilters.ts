export type LibraryCollectionFilter = 'recommend' | 'favorite' | 'folder' | 'images' | 'all';
export type LibraryTypeFilter = 'all' | 'image' | 'doc' | 'table' | 'code' | 'audio' | 'video';

export interface LibraryFilterItem {
  [key: string]: unknown;
  id?: string;
  name?: string;
  title?: string;
  kind?: string;
  pinned?: boolean;
  favorite?: boolean;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'svg']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac']);
const TABLE_EXTENSIONS = new Set(['csv', 'tsv', 'xls', 'xlsx']);
const DOC_EXTENSIONS = new Set(['doc', 'docx', 'rtf', 'odt', 'md', 'markdown', 'txt']);

export const LIBRARY_TYPE_FILTERS: ReadonlyArray<{ id: LibraryTypeFilter; label: string }> = [
  { id: 'all', label: 'library.filter.all' },
  { id: 'image', label: 'library.filter.images' },
  { id: 'doc', label: 'library.filter.docs' },
  { id: 'table', label: 'library.filter.tables' },
  { id: 'code', label: 'library.filter.code' },
  { id: 'audio', label: 'library.filter.audio' },
  { id: 'video', label: 'library.filter.video' },
];

export const LIBRARY_COLLECTION_FILTERS: ReadonlyArray<{ id: LibraryCollectionFilter; label: string }> = [
  { id: 'recommend', label: 'library.tabRecommend' },
  { id: 'favorite', label: 'library.tabFavorite' },
  { id: 'folder', label: 'library.tabFolder' },
  { id: 'images', label: 'library.filter.images' },
  { id: 'all', label: 'library.tabAll' },
];

/** Mirrors `getFileTypeCategory` in frontend/src/react/pages/workspace/WorkspacePage.tsx. */
export function getLibraryFileTypeCategory(item: LibraryFilterItem): string {
  const kind = String(item.kind || '').toLowerCase();
  const name = String(item.name || item.title || '');
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  if (kind === 'image' || IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === 'html' || ext === 'htm' || ext === 'web') return 'html';
  if (kind === 'xlsx' || TABLE_EXTENSIONS.has(ext)) return 'table';
  if (ext === 'json' || ext === 'js' || ext === 'ts' || ext === 'py' || ext === 'css') return 'code';
  if (kind === 'video' || VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (kind === 'audio' || AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (DOC_EXTENSIONS.has(ext) || kind === 'pdf' || kind === 'text' || kind === 'docx') return 'doc';
  return 'file';
}

export function filterLibraryItems<T extends LibraryFilterItem>(
  items: readonly T[],
  filters: { collection: LibraryCollectionFilter; type: LibraryTypeFilter; query: string },
): T[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return items.filter((item) => {
    const kind = String(item.kind || '').toLowerCase();
    const name = String(item.name || item.title || '');
    const collectionMatches = filters.collection === 'favorite'
      ? Boolean(item.pinned || item.favorite)
      : filters.collection === 'folder'
        ? kind === 'folder'
        : filters.collection === 'images'
          ? getLibraryFileTypeCategory(item) === 'image'
          : true;
    if (!collectionMatches) return false;
    if (filters.type !== 'all' && getLibraryFileTypeCategory(item) !== filters.type) return false;
    return !query || name.toLocaleLowerCase().includes(query);
  });
}
