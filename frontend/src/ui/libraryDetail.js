import { openDetailSurface } from './detailSurface.ts';

/** Markup is escaped by the library renderer; only the shared shell owns layout. */
export function openLibraryDetail(title, meta, markup, closeLabel) {
  const content = document.createElement('div');
  content.className = 'artifact-preview-body library-detail-content';
  content.innerHTML = markup;
  openDetailSurface({ owner: 'library', title, meta, closeLabel, content });
}
