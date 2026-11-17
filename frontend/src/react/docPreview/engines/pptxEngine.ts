/* PPTX preview engine — slides are rebuilt as absolutely positioned text and
   picture boxes over the slide canvas. This is a reading preview, not a
   PowerPoint renderer: fills, transitions, smart art and charts are not
   drawn, but every slide's text, images and tables are placed at their
   authored coordinates. */

import {
  parsePptx,
  readArchive,
  type OoxmlArchive,
  type PptxDocument,
  type PptxParagraph,
  type PptxShape,
} from './ooxml.ts';
import type { PreviewEngine, PreviewEngineCallbacks } from '../types.ts';

/** EMU per CSS px at 96dpi — the natural scale a slide maps to. */
const EMU_PER_PX = 9525;

function scaleFor(slideWidthEmu: number): number {
  return slideWidthEmu / EMU_PER_PX;
}

function paragraphEl(paragraph: PptxParagraph): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'pptx-paragraph';
  if (paragraph.align) p.style.textAlign = paragraph.align;
  for (const run of paragraph.runs) {
    if (run.text === '\n') {
      p.appendChild(document.createElement('br'));
      continue;
    }
    const span = document.createElement('span');
    span.textContent = run.text;
    if (run.bold) span.style.fontWeight = '600';
    if (run.italic) span.style.fontStyle = 'italic';
    if (run.sizePt)
      span.style.fontSize = `calc(var(--pptx-scale) * ${((run.sizePt * 4) / 3).toFixed(2)}px)`;
    if (run.color) span.style.color = run.color;
    p.appendChild(span);
  }
  if (!paragraph.runs.length) p.appendChild(document.createElement('br'));
  return p;
}

function shapeEl(
  shape: PptxShape,
  slide: PptxDocument,
  archive: OoxmlArchive,
  objectUrls: string[],
): HTMLDivElement {
  const el = document.createElement('div');
  el.className = `pptx-shape pptx-shape--${shape.kind}`;
  const slideWidth = slide.slideWidth || 1;
  const slideHeight = slide.slideHeight || 1;
  el.style.left = `${(shape.x / slideWidth) * 100}%`;
  el.style.top = `${(shape.y / slideHeight) * 100}%`;
  el.style.width = `${(shape.w / slideWidth) * 100}%`;
  el.style.height = `${(shape.h / slideHeight) * 100}%`;

  if (shape.kind === 'image' && shape.imagePath) {
    const bytes = archive.get(shape.imagePath);
    if (bytes) {
      const blob = new Blob([bytes.slice()], { type: imageMimeOf(shape.imagePath) });
      const url = URL.createObjectURL(blob);
      objectUrls.push(url);
      const img = document.createElement('img');
      img.className = 'pptx-image';
      img.src = url;
      img.alt = '';
      img.loading = 'lazy';
      el.appendChild(img);
    }
    return el;
  }

  if (shape.kind === 'table' && shape.table) {
    const table = document.createElement('table');
    table.className = 'pptx-table';
    for (const row of shape.table) {
      const tr = document.createElement('tr');
      for (const cellText of row) {
        const td = document.createElement('td');
        td.textContent = cellText;
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }
    el.appendChild(table);
    return el;
  }

  for (const paragraph of shape.paragraphs ?? []) el.appendChild(paragraphEl(paragraph));
  return el;
}

function imageMimeOf(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  return 'image/png';
}

export async function loadPptxEngine(
  data: ArrayBuffer,
  container: HTMLElement,
  callbacks: PreviewEngineCallbacks,
): Promise<PreviewEngine> {
  const archive = readArchive(data);
  const parsed = parsePptx(archive);
  if (!parsed || !parsed.slides.length) {
    callbacks.onError('load', 'No slides found.');
    throw new Error('No slides found.');
  }

  const host = document.createElement('div');
  host.className = 'doc-preview-pptx';
  const objectUrls: string[] = [];
  const slideEls: HTMLDivElement[] = [];

  for (const slide of parsed.slides) {
    const el = document.createElement('div');
    el.className = 'pptx-slide';
    el.style.aspectRatio = `${parsed.slideWidth} / ${parsed.slideHeight}`;
    el.style.setProperty('--pptx-natural', String(scaleFor(parsed.slideWidth)));
    for (const shape of slide.shapes) el.appendChild(shapeEl(shape, parsed, archive, objectUrls));
    host.appendChild(el);
    slideEls.push(el);
  }
  container.replaceChildren(host);

  /* All slides share one natural width, so one factor drives every font:
     the CSS uses calc(var(--pptx-scale) * Npx) with the authored size. */
  const syncScale = () => {
    const width = slideEls[0]?.clientWidth ?? 0;
    if (width <= 0) return;
    const scale = width / scaleFor(parsed.slideWidth);
    for (const el of slideEls) el.style.setProperty('--pptx-scale', scale.toFixed(4));
  };
  const resizeObserver = new ResizeObserver(syncScale);
  resizeObserver.observe(container);
  syncScale();

  callbacks.onReady();
  return {
    destroy() {
      resizeObserver.disconnect();
      for (const url of objectUrls) URL.revokeObjectURL(url);
      container.replaceChildren();
    },
  };
}
