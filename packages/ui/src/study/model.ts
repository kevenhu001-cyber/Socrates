/**
 * RN-5 study panels (knowledge map, diagnostic results, mistake book):
 * DOM-free parsing and derivation. Hosts own storage and commands; the RN
 * components in this folder only read what these functions return.
 */
import { layoutKnowledgeGraph } from '../knowledgeGraph.ts';

export type KnowledgeStatus = 'internalized' | 'fuzzy' | 'blank';

export interface KnowledgeNodeInput {
  name?: string;
  status?: string;
  questions?: number;
  confidence_score?: number;
  system_note?: string;
  user_note?: string;
  verifiedCount?: number;
}

export function normalizeKnowledgeStatus(status: string | undefined | null): KnowledgeStatus {
  return status === 'internalized' || status === 'fuzzy' ? status : 'blank';
}

export function knowledgeNodeName(node: KnowledgeNodeInput, index: number): string {
  return node.name && node.name.trim() ? node.name : `Node ${index + 1}`;
}

/** Cut a label to `max` visible characters with an ellipsis (CJK-safe). */
export function truncateLabel(name: string, max = 10): string {
  const chars = Array.from(name);
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : name;
}

/** Rough pill width for a label: CJK glyphs are about a full em, Latin half. */
export function estimateLabelWidth(label: string, fontSize = 12, padX = 14): number {
  let width = 0;
  for (const char of Array.from(label)) {
    const code = char.codePointAt(0) ?? 0;
    width += code > 0x2e80 ? fontSize : code === 0x2026 ? fontSize * 0.8 : fontSize * 0.58;
  }
  return Math.ceil(width + padX * 2);
}

export const GRAPH_NODE_HEIGHT = 26;
const GRAPH_GAP = 10;
const GRAPH_MARGIN = 20;

export interface GraphNodeBox {
  index: number;
  name: string;
  label: string;
  status: KnowledgeStatus;
  questions: number;
  confidence: number;
  active: boolean;
  /** Top-left corner and size in canvas units. */
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GraphEdge {
  from: number;
  to: number;
  /** Segment between the two box centres, in canvas units. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  length: number;
  /** Degrees, for a rotated hairline. */
  angle: number;
}

export interface KnowledgeGraphModel {
  nodes: GraphNodeBox[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

function boxesOverlap(a: GraphNodeBox, b: GraphNodeBox): { dx: number; dy: number } | null {
  const dx = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) + GRAPH_GAP;
  const dy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) + GRAPH_GAP;
  return dx > 0 && dy > 0 ? { dx, dy } : null;
}

/** Push overlapping pills apart along the axis of least overlap. Deterministic. */
export function separateBoxes(boxes: GraphNodeBox[], rounds = 60): GraphNodeBox[] {
  const out = boxes.map((box) => ({ ...box }));
  for (let round = 0; round < rounds; round += 1) {
    let moved = false;
    for (let left = 0; left < out.length; left += 1) {
      for (let right = left + 1; right < out.length; right += 1) {
        const a = out[left]!;
        const b = out[right]!;
        const overlap = boxesOverlap(a, b);
        if (!overlap) continue;
        moved = true;
        const ax = a.x + a.width / 2;
        const bx = b.x + b.width / 2;
        const ay = a.y + a.height / 2;
        const by = b.y + b.height / 2;
        if (overlap.dy <= overlap.dx) {
          const shift = overlap.dy / 2;
          const sign = ay < by || (ay === by && left < right) ? -1 : 1;
          a.y += sign * shift;
          b.y -= sign * shift;
        } else {
          const shift = overlap.dx / 2;
          const sign = ax < bx || (ax === bx && left < right) ? -1 : 1;
          a.x += sign * shift;
          b.x -= sign * shift;
        }
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Pill-node graph: the legacy deterministic force layout (sequential
 * learning-path edges) on a canvas sized for the node count, then a
 * de-overlap pass for the label pills, then normalised to start at the margin.
 */
export function buildKnowledgeGraph(nodes: readonly KnowledgeNodeInput[], activeIndex = -1): KnowledgeGraphModel {
  if (!nodes.length) return { nodes: [], edges: [], width: 0, height: 0 };
  const count = nodes.length;
  const canvasWidth = Math.max(240, Math.round(80 * Math.sqrt(count) + 50));
  const canvasHeight = Math.max(240, Math.round(canvasWidth * 0.9));
  const points = layoutKnowledgeGraph(nodes, canvasWidth, canvasHeight);
  let boxes: GraphNodeBox[] = nodes.map((node, index) => {
    const name = knowledgeNodeName(node, index);
    const label = truncateLabel(name, 8);
    const width = estimateLabelWidth(label);
    const point = points[index]!;
    return {
      index,
      name,
      label,
      status: normalizeKnowledgeStatus(node.status),
      questions: typeof node.questions === 'number' && node.questions > 0 ? node.questions : 0,
      confidence: typeof node.confidence_score === 'number' ? Math.max(0, Math.min(5, node.confidence_score)) : 0,
      active: index === activeIndex,
      x: point.x - width / 2,
      y: point.y - GRAPH_NODE_HEIGHT / 2,
      width,
      height: GRAPH_NODE_HEIGHT,
    };
  });
  boxes = separateBoxes(boxes);
  const minX = Math.min(...boxes.map((box) => box.x));
  const minY = Math.min(...boxes.map((box) => box.y));
  boxes = boxes.map((box) => ({
    ...box,
    x: Math.round((box.x - minX + GRAPH_MARGIN) * 10) / 10,
    y: Math.round((box.y - minY + GRAPH_MARGIN) * 10) / 10,
  }));
  const width = Math.ceil(Math.max(...boxes.map((box) => box.x + box.width)) + GRAPH_MARGIN);
  const height = Math.ceil(Math.max(...boxes.map((box) => box.y + box.height)) + GRAPH_MARGIN);
  const edges: GraphEdge[] = [];
  for (let index = 0; index < boxes.length - 1; index += 1) {
    const a = boxes[index]!;
    const b = boxes[index + 1]!;
    const x1 = a.x + a.width / 2;
    const y1 = a.y + a.height / 2;
    const x2 = b.x + b.width / 2;
    const y2 = b.y + b.height / 2;
    const length = Math.hypot(x2 - x1, y2 - y1);
    edges.push({ from: index, to: index + 1, x1, y1, x2, y2, length, angle: (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI });
  }
  return { nodes: boxes, edges, width, height };
}

export const GRAPH_ZOOM_MIN = 0.5;
export const GRAPH_ZOOM_MAX = 2.5;
export const GRAPH_ZOOM_STEP = 1.25;
/** Fitting never shrinks labels below this; past it the learner pans. */
export const GRAPH_FIT_MIN = 0.75;

export function clampZoom(value: number): number {
  return Math.max(GRAPH_ZOOM_MIN, Math.min(GRAPH_ZOOM_MAX, Math.round(value * 1000) / 1000));
}

/** Scale that fits the whole canvas into the viewport, never enlarging past 1
 * and never shrinking labels below `floor` (large maps pan instead). */
export function fitZoom(canvas: { width: number; height: number }, viewport: { width: number; height: number }, floor = GRAPH_FIT_MIN): number {
  if (!canvas.width || !canvas.height || !viewport.width || !viewport.height) return 1;
  return clampZoom(Math.max(floor, Math.min(1, viewport.width / canvas.width, viewport.height / canvas.height)));
}

export interface KnowledgeRelation {
  index: number;
  name: string;
  status: KnowledgeStatus;
  /** `before`: the step right before this one on the learning path; `after`: right after. */
  role: 'before' | 'after';
}

/**
 * Neighbours on the learning path. The graph's edges are the sequential
 * learning order, so that order is the honest answer to "why connected".
 */
export function knowledgeRelations(nodes: readonly KnowledgeNodeInput[], index: number): KnowledgeRelation[] {
  const out: KnowledgeRelation[] = [];
  if (index > 0 && nodes[index - 1]) {
    out.push({ index: index - 1, name: knowledgeNodeName(nodes[index - 1]!, index - 1), status: normalizeKnowledgeStatus(nodes[index - 1]!.status), role: 'before' });
  }
  if (index >= 0 && index < nodes.length - 1 && nodes[index + 1]) {
    out.push({ index: index + 1, name: knowledgeNodeName(nodes[index + 1]!, index + 1), status: normalizeKnowledgeStatus(nodes[index + 1]!.status), role: 'after' });
  }
  return out;
}

export interface KnowledgeSection {
  status: KnowledgeStatus;
  entries: Array<{ index: number; node: KnowledgeNodeInput; name: string }>;
}

/** List groups in the legacy order: internalized, fuzzy, blank; empty groups dropped. */
export function knowledgeSections(nodes: readonly KnowledgeNodeInput[]): KnowledgeSection[] {
  const order: KnowledgeStatus[] = ['internalized', 'fuzzy', 'blank'];
  return order.flatMap((status) => {
    const entries = nodes.flatMap((node, index) => normalizeKnowledgeStatus(node.status) === status
      ? [{ index, node, name: knowledgeNodeName(node, index) }] : []);
    return entries.length ? [{ status, entries }] : [];
  });
}

export function knowledgeCounts(nodes: readonly KnowledgeNodeInput[]): Record<KnowledgeStatus, number> {
  const counts = { internalized: 0, fuzzy: 0, blank: 0 };
  nodes.forEach((node) => { counts[normalizeKnowledgeStatus(node.status)] += 1; });
  return counts;
}

export interface BoundarySnapshotInput {
  date?: string;
  at?: number;
  summary?: string;
}

export function formatSnapshotDate(item: BoundarySnapshotInput): string {
  if (item.date) return String(item.date);
  if (typeof item.at !== 'number' || !Number.isFinite(item.at)) return '';
  const date = new Date(item.at);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

/** Newest eight snapshots, newest first (legacy panel contract). */
export function snapshotHistory(history: readonly BoundarySnapshotInput[]): Array<{ date: string; summary: string }> {
  return history.slice(-8).reverse().map((item) => ({ date: formatSnapshotDate(item), summary: String(item.summary || '') }));
}

/** Toggling the same confidence step clears it (legacy detail contract). */
export function nextConfidence(current: number, pressed: number): number {
  return current === pressed ? 0 : pressed;
}

/* ---------------------------------------------------------------- Diagnostic */

export interface DiagnosticResultNode {
  name: string;
  status: 'fuzzy' | 'blank';
}

export interface DiagnosticReport {
  total: number;
  familiar: number;
  blank: number;
  /** Share of dimensions with some familiarity, 0–100. */
  coverage: number;
  /** Gaps first (blank before fuzzy), learning order kept inside each band. */
  ranked: Array<DiagnosticResultNode & { order: number; rank: number }>;
  /** Where systematic learning starts (the first dimension in learning order). */
  startsWith: string | null;
  /** Up to three untouched dimensions to give extra time. */
  focus: string[];
}

export function diagnosticReport(nodes: readonly DiagnosticResultNode[]): DiagnosticReport {
  const total = nodes.length;
  const familiar = nodes.filter((node) => node.status === 'fuzzy').length;
  const blank = total - familiar;
  const withOrder = nodes.map((node, order) => ({ ...node, order }));
  const ranked = [
    ...withOrder.filter((node) => node.status !== 'fuzzy'),
    ...withOrder.filter((node) => node.status === 'fuzzy'),
  ].map((node, rank) => ({ ...node, status: node.status === 'fuzzy' ? 'fuzzy' as const : 'blank' as const, rank: rank + 1 }));
  return {
    total,
    familiar,
    blank,
    coverage: total ? Math.round((familiar / total) * 100) : 0,
    ranked,
    startsWith: nodes[0]?.name ?? null,
    focus: ranked.filter((node) => node.status === 'blank').slice(0, 3).map((node) => node.name),
  };
}

/* -------------------------------------------------------------- Mistake book */

export interface MistakeRowInput {
  id: string;
  type?: string;
  topic?: string;
  q?: string;
  options?: Array<string | { letter?: string; text?: string }>;
  correct?: string | null;
  userAnswer?: string | null;
  judgedAnswer?: string | null;
  timestamp?: number;
  redoCount?: number;
  resolved?: boolean;
  isResolved?: boolean;
}

export interface MistakeOptionView {
  letter: string;
  text: string;
  tag: 'correct' | 'wrong' | null;
}

export interface MistakeView {
  id: string;
  type: 'quiz' | 'practice' | string;
  topic: string;
  question: string;
  resolved: boolean;
  redoCount: number;
  timestamp: number;
  options: MistakeOptionView[];
  /** What the learner answered, as shown text ("B · x" or the free answer). */
  yourAnswer: string | null;
  /** The keyed answer, as shown text. */
  correctAnswer: string | null;
}

export function mistakeOptionsOf(row: MistakeRowInput): Array<{ letter: string; text: string }> {
  return (Array.isArray(row.options) ? row.options : []).map((option, index) => {
    if (typeof option === 'string') return { letter: String.fromCharCode(65 + index), text: option };
    return {
      letter: typeof option?.letter === 'string' ? option.letter : String.fromCharCode(65 + index),
      text: typeof option?.text === 'string' ? option.text : '',
    };
  });
}

function answerText(options: Array<{ letter: string; text: string }>, value: string | null | undefined): string | null {
  if (!value) return null;
  const option = options.find((entry) => entry.letter === value);
  return option ? (option.text ? `${option.letter} · ${option.text}` : option.letter) : value;
}

export function mistakeView(row: MistakeRowInput): MistakeView {
  const options = mistakeOptionsOf(row);
  return {
    id: row.id,
    type: row.type || '',
    topic: row.topic || '',
    question: row.q || '',
    resolved: row.resolved === true || row.isResolved === true,
    redoCount: typeof row.redoCount === 'number' && row.redoCount > 0 ? Math.floor(row.redoCount) : 0,
    timestamp: typeof row.timestamp === 'number' ? row.timestamp : 0,
    options: options.map((option) => ({
      ...option,
      tag: option.letter === row.correct ? 'correct' : option.letter === row.userAnswer ? 'wrong' : null,
    })),
    yourAnswer: answerText(options, row.userAnswer),
    correctAnswer: answerText(options, row.correct ?? row.judgedAnswer ?? null),
  };
}

export interface MistakeGroup {
  topic: string;
  items: MistakeView[];
}

/** Topic groups in first-seen order (the list is newest first, so the
 * freshest topic leads). Rows without a topic share one trailing group. */
export function groupMistakesByTopic(rows: readonly MistakeView[]): MistakeGroup[] {
  const groups = new Map<string, MistakeView[]>();
  for (const row of rows) {
    const key = row.topic.trim();
    const list = groups.get(key);
    if (list) list.push(row);
    else groups.set(key, [row]);
  }
  const named = [...groups.entries()].filter(([topic]) => topic).map(([topic, items]) => ({ topic, items }));
  const loose = groups.get('');
  return loose ? [...named, { topic: '', items: loose }] : named;
}

export type MistakeFilterValue = 'all' | 'unresolved' | 'resolved';

export function normalizeMistakeFilter(value: string | null | undefined): MistakeFilterValue {
  return value === 'unresolved' || value === 'resolved' ? value : 'all';
}

export function filterMistakeViews(rows: readonly MistakeView[], filter: MistakeFilterValue): MistakeView[] {
  if (filter === 'unresolved') return rows.filter((row) => !row.resolved);
  if (filter === 'resolved') return rows.filter((row) => row.resolved);
  return rows.slice();
}

/** Which empty line to show, or null when rows are visible (legacy contract). */
export function mistakeEmptyKind(total: number, visible: number, filter: MistakeFilterValue): 'empty' | 'filterResolved' | 'filterOther' | null {
  if (!total) return 'empty';
  if (visible) return null;
  return filter === 'resolved' ? 'filterResolved' : 'filterOther';
}
