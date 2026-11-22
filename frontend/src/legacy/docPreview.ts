import { createElement } from 'react';
import { openDetailSurface } from './detailSurface.ts';
import { i18n } from '../ui/legacyI18n.ts';
import { getFileExtension, formatFileSize } from '../react/attachments/FileCard.tsx';
import { previewKindFor } from '../react/docPreview/kinds.ts';
import type { DocumentPreviewSource, PreviewKind } from '../react/docPreview/types.ts';

/** Nothing to preview (no engine and no server text) — callers keep the
    plain download link. Exported so the message list gates with the same
    predicate the drawer applies. */
export function canPreviewDocument(source: DocumentPreviewSource): boolean {
  return (
    Boolean(source.fileId) &&
    previewKindFor(source.name, source.mime, source.docKind) !== 'unsupported'
  );
}

function previewMeta(source: DocumentPreviewSource, kind: PreviewKind): string {
  const engineLabel: Partial<Record<PreviewKind, string>> = {
    pdf: 'PDF',
    docx: 'DOCX',
    pptx: 'PPTX',
    xlsx: 'XLSX',
  };
  const parts = [engineLabel[kind] ?? getFileExtension(source.name), formatFileSize(source.size)];
  return parts.filter(Boolean).join(' · ');
}

/**
 * Open the document preview drawer for a chat attachment. The heavy view and
 * its vendor engines load on demand; the shell is the shared detail surface.
 */
export function openDocumentPreview(source: DocumentPreviewSource): Promise<boolean> {
  const kind = previewKindFor(source.name, source.mime, source.docKind);
  if (kind === 'unsupported' || !source.fileId) return Promise.resolve(false);
  return import('../react/docPreview/DocumentPreviewView')
    .then(({ DocumentPreviewView }) =>
      openDetailSurface({
        owner: 'doc-preview',
        title: source.name,
        meta: previewMeta(source, kind),
        closeLabel: i18n('dialog.close', 'Close'),
        content: createElement(DocumentPreviewView, { source, kind }),
      }),
    )
    .catch(() => false);
}
