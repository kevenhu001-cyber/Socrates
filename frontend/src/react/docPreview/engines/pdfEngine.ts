/* PDF preview engine — pdf.js rendered page canvases in a continuous scroll.
   Pages render lazily as they approach the viewport, so a 500-page deck never
   paints off-screen pixels; zoom relayouts the placeholders and re-renders the
   visible range at the new scale. */

import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PreviewEngine, PreviewEngineCallbacks } from '../types.ts';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/* Non-embedded CJK fonts need the packed CMaps; standard-font metrics come
   from the package's font files. Both are copied into dist/assets/pdfjs/ by
   the vite plugin (see vite.config.js) and served same-origin, which is also
   what the CSP requires (no third-party host). */
const CMAP_BASE = '/assets/pdfjs/cmaps/';
const STANDARD_FONTS_BASE = '/assets/pdfjs/standard_fonts/';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_FACTOR = 1.25;
/** How far ahead of the viewport pages start rendering, in px. */
const RENDER_MARGIN = '900px 0px';
const MAX_DPR = 2;

interface PageSlot {
  el: HTMLDivElement;
  page: pdfjs.PDFPageProxy;
  /** Width at scale 1 — the CSS box derives from it times fit × zoom. */
  baseWidth: number;
  canvas: HTMLCanvasElement | null;
  renderedFor: string;
  task: pdfjs.RenderTask | null;
}

function spinnerEl(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'file-card-spinner';
  return el;
}

async function buildSlots(doc: pdfjs.PDFDocumentProxy, pagesEl: HTMLDivElement): Promise<PageSlot[]> {
  const slots: PageSlot[] = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const el = document.createElement('div');
    el.className = 'doc-preview-page';
    el.style.aspectRatio = `${viewport.width} / ${viewport.height}`;
    el.appendChild(spinnerEl());
    pagesEl.appendChild(el);
    slots.push({ el, page, baseWidth: viewport.width, canvas: null, renderedFor: '', task: null });
  }
  return slots;
}

/** Most-visible page drives the toolbar counter. */
function trackCurrentPage(container: HTMLElement, slots: PageSlot[], callbacks: PreviewEngineCallbacks): () => void {
  let scrollFrame = 0;
  const reportPage = () => {
    const box = container.getBoundingClientRect();
    const center = box.top + box.height / 2;
    let best = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    slots.forEach((slot, index) => {
      const rect = slot.el.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.height / 2) - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index + 1;
      }
    });
    callbacks.onState({ page: best });
  };
  const onScroll = () => {
    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(reportPage);
  };
  container.addEventListener('scroll', onScroll, { passive: true });
  return () => {
    container.removeEventListener('scroll', onScroll);
    cancelAnimationFrame(scrollFrame);
  };
}

/** Owns zoom/fit and the lazy render queue. */
function createLayoutController(
  container: HTMLElement,
  slots: PageSlot[],
  callbacks: PreviewEngineCallbacks,
) {
  let zoom = 1;
  let fit = 1;
  let stopPageTracking: () => void = () => undefined;
  let renderScheduled = false;
  const renderQueue = new Set<PageSlot>();

  const scaleKey = () => `${Math.round(fit * zoom * 1000)}`;
  const cssWidth = (slot: PageSlot) => slot.baseWidth * fit * zoom;

  const computeFit = () => {
    const available = container.clientWidth - 32; // .doc-preview-content--pdf padding
    const widest = slots.reduce((max, slot) => Math.max(max, slot.baseWidth), 1);
    fit = available > 0 ? available / widest : 1;
  };

  const relayout = () => {
    const key = scaleKey();
    for (const slot of slots) {
      slot.el.style.width = `${cssWidth(slot)}px`;
      if (slot.renderedFor && slot.renderedFor !== key) {
        /* Stale scale — drop the canvas so the intersection pass re-renders
           it; off-screen slots repaint for free as the user scrolls. */
        slot.task?.cancel();
        slot.canvas?.remove();
        slot.canvas = null;
        slot.renderedFor = '';
        if (!slot.el.querySelector('.file-card-spinner')) slot.el.appendChild(spinnerEl());
      }
    }
  };

  const renderSlot = async (slot: PageSlot): Promise<void> => {
    if (slot.canvas && slot.renderedFor === scaleKey()) return;
    slot.task?.cancel();
    const width = cssWidth(slot);
    if (width <= 0 || !slot.el.isConnected) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const viewport = slot.page.getViewport({ scale: (width * dpr) / slot.baseWidth });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    canvas.className = 'doc-preview-page-canvas';
    try {
      slot.task = slot.page.render({ canvas, viewport });
      await slot.task.promise;
    } catch (error) {
      canvas.remove();
      if (error instanceof pdfjs.RenderingCancelledException) return;
      callbacks.onError('load', error instanceof Error ? error.message : undefined);
      return;
    } finally {
      slot.task = null;
    }
    if (slot.renderedFor !== '' && slot.renderedFor !== scaleKey()) return; // zoomed again mid-render
    slot.canvas?.remove();
    slot.el.querySelector('.file-card-spinner')?.remove();
    slot.el.appendChild(canvas);
    slot.canvas = canvas;
    slot.renderedFor = scaleKey();
  };

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const slot = slots.find((candidate) => candidate.el === entry.target);
      if (!slot) continue;
      if (entry.isIntersecting) renderQueue.add(slot);
      else renderQueue.delete(slot);
    }
    if (renderScheduled || !renderQueue.size) return;
    renderScheduled = true;
    requestAnimationFrame(() => {
      renderScheduled = false;
      for (const slot of [...renderQueue]) void renderSlot(slot);
    });
  }, { root: container, rootMargin: RENDER_MARGIN });

    const resizeObserver = new ResizeObserver(() => {
    computeFit();
    relayout();
  });

  return {
    start() {
      for (const slot of slots) observer.observe(slot.el);
      stopPageTracking = trackCurrentPage(container, slots, callbacks);
      resizeObserver.observe(container);
      computeFit();
      relayout();
    },
    goToPage(page: number) {
      const slot = slots[Math.max(1, Math.min(slots.length, page)) - 1];
      slot?.el.scrollIntoView({ block: 'start' });
    },
    zoomStep(direction: 1 | -1) {
      zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom * (direction === 1 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR)));
      relayout();
      callbacks.onState({ zoomLabel: `${Math.round(zoom * 100)}%` });
    },
    destroy() {
      observer.disconnect();
      resizeObserver.disconnect();
      stopPageTracking();
      for (const slot of slots) slot.task?.cancel();
    },
  };
}

export async function loadPdfEngine(
  data: ArrayBuffer,
  container: HTMLElement,
  callbacks: PreviewEngineCallbacks,
): Promise<PreviewEngine> {
  const loadingTask = pdfjs.getDocument({
    data,
    cMapUrl: CMAP_BASE,
    cMapPacked: true,
    standardFontDataUrl: STANDARD_FONTS_BASE,
  });
  let doc: pdfjs.PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    if (error instanceof pdfjs.PasswordException) callbacks.onError('password');
    else callbacks.onError('load', error instanceof Error ? error.message : undefined);
    throw error;
  }

  const pagesEl = document.createElement('div');
  pagesEl.className = 'doc-preview-pages';
  const host = document.createElement('div');
  host.className = 'doc-preview-pdf';
  host.appendChild(pagesEl);
  container.replaceChildren(host);

  const slots = await buildSlots(doc, pagesEl);
  const layout = createLayoutController(container, slots, callbacks);
  layout.start();
  callbacks.onReady();
  callbacks.onState({ pages: doc.numPages, page: 1, zoomLabel: '100%' });

  return {
    goToPage: (page: number) => layout.goToPage(page),
    zoomStep: (direction: 1 | -1) => layout.zoomStep(direction),
    destroy() {
      layout.destroy();
      void loadingTask.destroy();
      container.replaceChildren();
    },
  };
}
