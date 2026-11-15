/* DOCX preview engine — mammoth converts the document to semantic HTML,
   then it passes the shared sanitizer before reaching the DOM. */

import mammoth from 'mammoth';
import { sanitizeHtml } from '../../../render/sanitizeHtml.ts';
import type { PreviewEngine, PreviewEngineCallbacks } from '../types.ts';

export async function loadDocxEngine(
  data: ArrayBuffer,
  container: HTMLElement,
  callbacks: PreviewEngineCallbacks,
): Promise<PreviewEngine> {
  const { value } = await mammoth.convertToHtml({ arrayBuffer: data });
  const host = document.createElement('div');
  host.className = 'doc-preview-docx';
  host.innerHTML = `<div class="docx-body">${sanitizeHtml(value)}</div>`;
  container.replaceChildren(host);
  callbacks.onReady();
  return {
    destroy() {
      container.replaceChildren();
    },
  };
}
