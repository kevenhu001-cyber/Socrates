/* Document preview drawer — shared contracts.
   The panel reuses the detail-surface drawer shell (src/legacy/detailSurface.ts);
   every renderer is a lazily imported engine so pdfjs/mammoth never enter the
   entry chunk. */

/** What the message attachment needs to resolve its bytes and title. */
export interface DocumentPreviewSource {
  /** Durable files-table id — resolves against /api/v2/files/:id/raw. */
  fileId: string;
  name: string;
  mime?: string;
  size?: number;
  /** Kind label already carried by the attachment part, when present. */
  docKind?: string;
}

/** pdf/docx/pptx/xlsx render locally; text falls back to the server reader;
   everything else keeps the download/new-tab behavior. */
export type PreviewKind = 'pdf' | 'docx' | 'pptx' | 'xlsx' | 'text' | 'unsupported';

/** Progressive state an engine reports while the drawer is open. */
export interface PreviewEngineState {
  page?: number;
  pages?: number;
  zoomLabel?: string;
}

export interface PreviewEngineCallbacks {
  /** First paint is on screen — swap the loading spinner for content. */
  onReady(): void;
  onState(patch: PreviewEngineState): void;
  /** 'password' maps to its own notice; anything else is a generic failure. */
  onError(code: 'password' | 'load', message?: string): void;
}

/** Imperative handle the React view drives with the toolbar buttons. */
export interface PreviewEngine {
  goToPage?(page: number): void;
  zoomStep?(direction: 1 | -1): void;
  destroy(): void;
}
