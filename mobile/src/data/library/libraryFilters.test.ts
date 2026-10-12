import { filterLibraryItems, getLibraryFileTypeCategory } from './libraryFilters';

const items = [
  { id: 'image', name: 'Portrait.webp', kind: 'image' },
  { id: 'doc', name: 'Notes.md', kind: 'text' },
  { id: 'table', name: 'Costs.csv' },
  { id: 'code', name: 'app.ts' },
  { id: 'audio', name: 'Voice.wav' },
  { id: 'video', name: 'Clip.mp4' },
  { id: 'folder', name: 'Archive', kind: 'folder' },
  { id: 'favorite', name: 'Pinned.txt', pinned: true },
];

describe('library web-parity filters', () => {
  it('uses the same seven type categories as WorkspacePage', () => {
    expect(items.map(getLibraryFileTypeCategory)).toEqual([
      'image', 'doc', 'table', 'code', 'audio', 'video', 'file', 'doc',
    ]);
  });

  it('applies collection, type, and case-insensitive search filters together', () => {
    expect(filterLibraryItems(items, { collection: 'images', type: 'all', query: '' }).map((x) => x.id)).toEqual(['image']);
    expect(filterLibraryItems(items, { collection: 'favorite', type: 'doc', query: 'pinned' }).map((x) => x.id)).toEqual(['favorite']);
    expect(filterLibraryItems(items, { collection: 'folder', type: 'all', query: '' }).map((x) => x.id)).toEqual(['folder']);
    expect(filterLibraryItems(items, { collection: 'all', type: 'table', query: 'COSTS' }).map((x) => x.id)).toEqual(['table']);
  });
});
