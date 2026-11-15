/* Pure OOXML readers for the xlsx/pptx preview engines.
   No DOM rendering and no globals beyond DOMParser, so the parsers run in the
   unit-test environment (jsdom supplies DOMParser) as well as in the app.
   Element/attribute lookup is namespace-agnostic by local name because each
   OOXML part uses different prefix conventions. */

import { unzipSync } from 'fflate';

/** A zip archive (xlsx/pptx bytes) with text decoding helpers. */
export interface OoxmlArchive {
  get(name: string): Uint8Array | undefined;
  text(name: string): string | undefined;
}

export function readArchive(data: ArrayBuffer): OoxmlArchive {
  const files = unzipSync(new Uint8Array(data));
  const decoder = new TextDecoder('utf-8');
  return {
    get: (name) => files[name],
    text: (name) => {
      const bytes = files[name];
      return bytes ? decoder.decode(bytes) : undefined;
    },
  };
}

export function parseXml(markup: string): Document {
  const doc = new DOMParser().parseFromString(markup, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Malformed OOXML part.');
  }
  return doc;
}

function childrenByLocal(node: Element | Document, local: string): Element[] {
  const out: Element[] = [];
  for (let child = node.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === local) out.push(child);
  }
  return out;
}

function firstChildByLocal(node: Element | Document, local: string): Element | null {
  return childrenByLocal(node, local)[0] ?? null;
}

function descendantsByLocal(node: Element | Document, local: string): Element[] {
  return Array.from(node.getElementsByTagName('*')).filter((el) => el.localName === local);
}

function textOf(node: Element | null): string {
  return node?.textContent ?? '';
}

/** The `r:` relationship attribute (`r:id`, `r:embed`) of an element. */
function relAttribute(node: Element, local: string): string {
  for (let at = 0; at < node.attributes.length; at++) {
    const attr = node.attributes[at];
    if (attr.localName === local && attr.prefix === 'r') return attr.value;
  }
  return '';
}

/** Resolve an OPC package part target (`../media/a.png`) against its base dir. */
function resolvePart(baseDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = baseDir.split('/').filter(Boolean);
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function parseRelationships(archive: OoxmlArchive, partPath: string): Map<string, string> {
  const rels: Map<string, string> = new Map();
  const dir = partPath.includes('/') ? partPath.slice(0, partPath.lastIndexOf('/')) : '';
  const relsPath = `${dir}/_rels/${dir ? partPath.slice(dir.length + 1) : partPath}.rels`;
  const markup = archive.text(relsPath);
  if (!markup) return rels;
  for (const rel of descendantsByLocal(parseXml(markup), 'Relationship')) {
    const id = rel.getAttribute('Id');
    const target = rel.getAttribute('Target');
    if (id && target) rels.set(id, resolvePart(dir, target));
  }
  return rels;
}

/* ── XLSX ──────────────────────────────────────────────────────────────── */

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

function columnIndex(cellRef: string): number {
  let index = 0;
  for (const char of cellRef) {
    if (char >= 'A' && char <= 'Z') index = index * 26 + (char.charCodeAt(0) - 64);
    else break;
  }
  return Math.max(0, index - 1);
}

function parseSharedStrings(markup: string | undefined): string[] {
  if (!markup) return [];
  const strings: string[] = [];
  for (const si of descendantsByLocal(parseXml(markup), 'si')) {
    const pieces: string[] = [];
    for (const t of descendantsByLocal(si, 't')) pieces.push(textOf(t));
    strings.push(pieces.join(''));
  }
  return strings;
}

function parseSheetRows(markup: string, sharedStrings: string[]): string[][] {
  const sheet = parseXml(markup);
  const rows: string[][] = [];
  for (const rowEl of descendantsByLocal(sheet, 'row')) {
    const cells: string[] = [];
    for (const cell of childrenByLocal(rowEl, 'c')) {
      const ref = cell.getAttribute('r') ?? '';
      const index = ref ? columnIndex(ref) : cells.length;
      const type = cell.getAttribute('t') ?? '';
      let value: string;
      if (type === 's') {
        const v = firstChildByLocal(cell, 'v');
        value = sharedStrings[Number(textOf(v))] ?? '';
      } else if (type === 'inlineStr') {
        const is = firstChildByLocal(cell, 'is');
        value = is ? descendantsByLocal(is, 't').map(textOf).join('') : '';
      } else {
        const v = firstChildByLocal(cell, 'v');
        value = textOf(v);
        if (type === 'b') value = value === '1' ? 'TRUE' : 'FALSE';
      }
      cells[index] = value;
    }
    for (let at = 0; at < cells.length; at++) cells[at] ??= '';
    rows.push(cells);
  }
  return rows;
}

/** Every sheet of the workbook, in workbook order. */
export function parseXlsx(archive: OoxmlArchive): { sheets: XlsxSheet[] } | null {
  const workbookMarkup = archive.text('xl/workbook.xml');
  if (!workbookMarkup) return null;
  const workbook = parseXml(workbookMarkup);
  const rels = parseRelationships(archive, 'xl/workbook.xml');
  const sharedStrings = parseSharedStrings(archive.text('xl/sharedStrings.xml'));
  const sheets: XlsxSheet[] = [];
  for (const sheetEl of descendantsByLocal(workbook, 'sheet')) {
    const name = sheetEl.getAttribute('name') ?? 'Sheet';
    const relId = relAttribute(sheetEl, 'id');
    const target = rels.get(relId);
    if (!target) continue;
    const markup = archive.text(target);
    if (!markup) continue;
    sheets.push({ name, rows: parseSheetRows(markup, sharedStrings) });
  }
  return sheets.length ? { sheets } : null;
}

/* ── PPTX ──────────────────────────────────────────────────────────────── */

export interface PptxTextRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Font size in points, from the run's `sz` centipoint attribute. */
  sizePt?: number;
  /** `#rrggbb` from a solid srgbClr fill, when the run declares one. */
  color?: string;
}

export interface PptxParagraph {
  align?: 'left' | 'center' | 'right' | 'justify';
  runs: PptxTextRun[];
}

export interface PptxShape {
  kind: 'text' | 'image' | 'table';
  /** Shape box in EMU, already mapped through any enclosing group transform. */
  x: number;
  y: number;
  w: number;
  h: number;
  paragraphs?: PptxParagraph[];
  table?: string[][];
  /** Archive path of an embedded picture; the engine turns bytes into a URL. */
  imagePath?: string;
}

export interface PptxSlide {
  shapes: PptxShape[];
}

export interface PptxDocument {
  /** Slide canvas size in EMU (914400 per inch). */
  slideWidth: number;
  slideHeight: number;
  slides: PptxSlide[];
}

interface EmuBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function numberAttr(node: Element | null, name: string): number {
  const raw = node?.getAttribute(name) ?? '';
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function xfrmOf(shapeEl: Element): EmuBox | null {
  /* Shapes keep their transform in p:spPr/p:grpSpPr; a graphicFrame (table)
     carries p:xfrm directly on the frame element. */
  const spPr = firstChildByLocal(shapeEl, 'spPr') ?? firstChildByLocal(shapeEl, 'grpSpPr');
  const xfrm = (spPr ? firstChildByLocal(spPr, 'xfrm') : null) ?? firstChildByLocal(shapeEl, 'xfrm');
  if (!xfrm) return null;
  const off = firstChildByLocal(xfrm, 'off');
  const ext = firstChildByLocal(xfrm, 'ext');
  if (!off || !ext) return null;
  return {
    x: numberAttr(off, 'x'),
    y: numberAttr(off, 'y'),
    w: numberAttr(ext, 'cx'),
    h: numberAttr(ext, 'cy'),
  };
}

function parseRunProperties(runPr: Element | null): Pick<PptxTextRun, 'bold' | 'italic' | 'sizePt' | 'color'> {
  if (!runPr) return {};
  const sizePt = Number(runPr.getAttribute('sz')) / 100;
  const solidFill = firstChildByLocal(runPr, 'solidFill');
  const colorEl = solidFill ? firstChildByLocal(solidFill, 'srgbClr') : null;
  return {
    bold: runPr.getAttribute('b') === '1' || undefined,
    italic: runPr.getAttribute('i') === '1' || undefined,
    sizePt: Number.isFinite(sizePt) && sizePt > 0 ? sizePt : undefined,
    color: colorEl?.getAttribute('val') ? '#' + colorEl.getAttribute('val') : undefined,
  };
}

function parseParagraphs(txBody: Element): PptxParagraph[] {
  const paragraphs: PptxParagraph[] = [];
  for (const p of childrenByLocal(txBody, 'p')) {
    const pPr = firstChildByLocal(p, 'pPr');
    const alignRaw = pPr?.getAttribute('algn');
    const paragraph: PptxParagraph = {
      align: alignRaw === 'ctr' ? 'center' : alignRaw === 'r' ? 'right' : alignRaw === 'just' ? 'justify' : undefined,
      runs: [],
    };
    for (let child = p.firstElementChild; child; child = child.nextElementSibling) {
      const local = child.localName;
      if (local === 'r') {
        const t = firstChildByLocal(child, 't');
        if (!t) continue;
        paragraph.runs.push({ text: textOf(t), ...parseRunProperties(firstChildByLocal(child, 'rPr')) });
      } else if (local === 'br') {
        paragraph.runs.push({ text: '\n' });
      } else if (local === 'fld') {
        const t = firstChildByLocal(child, 't');
        if (t) paragraph.runs.push({ text: textOf(t), ...parseRunProperties(firstChildByLocal(child, 'rPr')) });
      }
    }
    paragraphs.push(paragraph);
  }
  return paragraphs;
}

function parseTableCells(tbl: Element): string[][] {
  const grid: string[][] = [];
  for (const tr of childrenByLocal(tbl, 'tr')) {
    const row: string[] = [];
    for (const tc of childrenByLocal(tr, 'tc')) {
      const pieces: string[] = [];
      for (const t of descendantsByLocal(tc, 't')) pieces.push(textOf(t));
      row.push(pieces.join(' '));
    }
    grid.push(row);
  }
  return grid;
}

/** A group's parent-space mapping for its children. */
interface GroupTransform {
  off: EmuBox;
  chOff: EmuBox;
  scaleW: number;
  scaleH: number;
}

/** Map a child-space box into the group's parent space. */
function mapThroughGroup(box: EmuBox, group: GroupTransform): EmuBox {
  return {
    x: group.off.x + (box.x - group.chOff.x) * group.scaleW,
    y: group.off.y + (box.y - group.chOff.y) * group.scaleH,
    w: box.w * group.scaleW,
    h: box.h * group.scaleH,
  };
}

function shapeFromText(child: Element, group: GroupTransform | null): PptxShape | null {
  const rawBox = xfrmOf(child);
  if (!rawBox) return null;
  const txBody = firstChildByLocal(child, 'txBody');
  const paragraphs = txBody ? parseParagraphs(txBody) : [];
  if (!paragraphs.length) return null;
  return { kind: 'text', ...(group ? mapThroughGroup(rawBox, group) : rawBox), paragraphs };
}

function shapeFromPicture(child: Element, rels: Map<string, string>, group: GroupTransform | null): PptxShape | null {
  const rawBox = xfrmOf(child);
  if (!rawBox) return null;
  const blipFill = firstChildByLocal(child, 'blipFill');
  const blip = blipFill ? firstChildByLocal(blipFill, 'blip') : null;
  const target = blip ? rels.get(relAttribute(blip, 'embed')) : undefined;
  if (!target) return null;
  return { kind: 'image', ...(group ? mapThroughGroup(rawBox, group) : rawBox), imagePath: target };
}

function shapeFromTable(child: Element, group: GroupTransform | null): PptxShape | null {
  const rawBox = xfrmOf(child);
  if (!rawBox) return null;
  const graphic = firstChildByLocal(child, 'graphic');
  const graphicData = graphic ? firstChildByLocal(graphic, 'graphicData') : null;
  const tbl = graphicData ? firstChildByLocal(graphicData, 'tbl') : null;
  if (!tbl) return null;
  return { kind: 'table', ...(group ? mapThroughGroup(rawBox, group) : rawBox), table: parseTableCells(tbl) };
}

function groupTransformOf(grpSp: Element): GroupTransform | null {
  const box = xfrmOf(grpSp);
  if (!box) return null;
  const grpSpPr = firstChildByLocal(grpSp, 'grpSpPr');
  const xfrmEl = grpSpPr ? firstChildByLocal(grpSpPr, 'xfrm') : null;
  const chOffEl = xfrmEl ? firstChildByLocal(xfrmEl, 'chOff') : null;
  const chExtEl = xfrmEl ? firstChildByLocal(xfrmEl, 'chExt') : null;
  if (!chOffEl || !chExtEl) return null;
  const scaleW = box.w > 0 && numberAttr(chExtEl, 'cx') > 0 ? box.w / numberAttr(chExtEl, 'cx') : 1;
  const scaleH = box.h > 0 && numberAttr(chExtEl, 'cy') > 0 ? box.h / numberAttr(chExtEl, 'cy') : 1;
  return {
    off: box,
    chOff: { x: numberAttr(chOffEl, 'x'), y: numberAttr(chOffEl, 'y'), w: 0, h: 0 },
    scaleW,
    scaleH,
  };
}

function collectShapes(container: Element, rels: Map<string, string>, group: GroupTransform | null, out: PptxShape[]): void {
  for (let child = container.firstElementChild; child; child = child.nextElementSibling) {
    if (child.localName === 'sp') {
      const shape = shapeFromText(child, group);
      if (shape) out.push(shape);
    } else if (child.localName === 'pic') {
      const shape = shapeFromPicture(child, rels, group);
      if (shape) out.push(shape);
    } else if (child.localName === 'graphicFrame') {
      const shape = shapeFromTable(child, group);
      if (shape) out.push(shape);
    } else if (child.localName === 'grpSp') {
      const transform = groupTransformOf(child);
      if (transform) collectShapes(child, rels, transform, out);
    }
  }
}

/** Slides in presentation order, with shapes flattened per slide. */
export function parsePptx(archive: OoxmlArchive): PptxDocument | null {
  const presentationMarkup = archive.text('ppt/presentation.xml');
  if (!presentationMarkup) return null;
  const presentation = parseXml(presentationMarkup);
  const rels = parseRelationships(archive, 'ppt/presentation.xml');
  /* The parse result is a Document, so direct-child lookups must start from
     the documentElement — firstElementChild of the Document is the root
     itself, one level above these parts. */
  const presentationEl = presentation.documentElement;
  const sldSz = firstChildByLocal(presentationEl, 'sldSz');
  const slideWidth = numberAttr(sldSz, 'cx') || 12192000;
  const slideHeight = numberAttr(sldSz, 'cy') || 6858000;

  const slides: PptxSlide[] = [];
  for (const sldId of descendantsByLocal(presentation, 'sldId')) {
    const target = rels.get(relAttribute(sldId, 'id'));
    const markup = target ? archive.text(target) : undefined;
    if (!markup) continue;
    const slide = parseXml(markup);
    const slideRels = parseRelationships(archive, target as string);
    const spTree = descendantsByLocal(slide, 'spTree')[0] ?? null;
    const shapes: PptxShape[] = [];
    if (spTree) collectShapes(spTree, slideRels, null, shapes);
    slides.push({ shapes });
  }
  return { slideWidth, slideHeight, slides };
}
