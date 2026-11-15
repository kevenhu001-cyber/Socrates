/* Engine routing — one dynamic import per kind so each vendor library stays
   in its own lazily fetched chunk and never enters the entry payload. */

import type { PreviewEngine, PreviewEngineCallbacks, PreviewKind } from '../types.ts';

export async function loadEngine(
  kind: PreviewKind,
  data: ArrayBuffer,
  container: HTMLElement,
  callbacks: PreviewEngineCallbacks,
): Promise<PreviewEngine> {
  switch (kind) {
    case 'pdf': {
      const engine = await import('./pdfEngine');
      return engine.loadPdfEngine(data, container, callbacks);
    }
    case 'docx': {
      const engine = await import('./docxEngine');
      return engine.loadDocxEngine(data, container, callbacks);
    }
    case 'pptx': {
      const engine = await import('./pptxEngine');
      return engine.loadPptxEngine(data, container, callbacks);
    }
    case 'xlsx': {
      const engine = await import('./xlsxEngine');
      return engine.loadXlsxEngine(data, container, callbacks);
    }
    default:
      throw new Error(`No preview engine for ${kind}.`);
  }
}
