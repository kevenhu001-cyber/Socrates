import { createElement } from 'react';
import { openDetailSurface } from './detailSurface.ts';

/** Markup is escaped by the library renderer; only the shared shell owns layout. */
export function openLibraryDetail(title: string, meta: string, markup: string, closeLabel: string) {
  const content = createElement('div', {
    className: 'artifact-preview-body library-detail-content',
    dangerouslySetInnerHTML: { __html: markup },
  });
  return openDetailSurface({ owner: 'library', title, meta, closeLabel, content });
}
