import type { IntelligentUiNode } from '@socrates/core';
import { i18n } from '../../ui/legacyI18n.ts';
import { asProse, isRecord, resolve, type RenderContext } from './renderRuntime';

export interface SurfaceMeta {
  eyebrow?: string;
  title?: string;
  description?: string;
}

const CONTAINER_TYPES = new Set(['panel', 'stack', 'grid', 'tabs']);

const TYPE_LABELS: Partial<Record<IntelligentUiNode['type'], string>> = {
  panel: 'intui.kind.content',
  stack: 'intui.kind.content',
  grid: 'intui.kind.content',
  tabs: 'intui.kind.content',
  metric: 'intui.kind.metrics',
  progress: 'intui.kind.metrics',
  table: 'intui.kind.table',
  chart: 'intui.kind.chart',
  visualization: 'intui.kind.chart',
  learning: 'intui.kind.learning',
  demonstration: 'intui.kind.demonstration',
  physics: 'intui.kind.demonstration',
  openui: 'intui.kind.interactive',
  image: 'intui.kind.media',
  'image-gallery': 'intui.kind.media',
  entity: 'intui.kind.reference',
  callout: 'intui.kind.note',
};

const LEARNING_LABELS: Record<string, string> = {
  quiz: 'intui.learning.quiz',
  practice: 'intui.learning.practice',
  definition: 'intui.learning.definition',
  flashcard: 'intui.learning.flashcard',
  example: 'intui.learning.example',
  theorem: 'intui.learning.theorem',
  proof: 'intui.learning.proof',
  derivation: 'intui.learning.derivation',
  'key-point': 'intui.learning.keyPoint',
  step: 'intui.learning.step',
};

function text(value: unknown, context: RenderContext): string {
  return asProse(resolve(value, context)).trim();
}

function firstText(
  node: IntelligentUiNode,
  fields: ReadonlyArray<string>,
  context: RenderContext,
): string {
  for (const field of fields) {
    const value = text(node[field], context);
    if (value) return value;
  }
  return '';
}

/**
 * The one line a reader would use as this node's title. Only nodes whose own
 * renderer can stay quiet about it are promotable; an entity or a practice
 * scaffold already paints its heading, and repeating it above the card reads
 * like a rendering bug.
 */
function titleOf(node: IntelligentUiNode, context: RenderContext): string {
  switch (node.type) {
    case 'table':
      return firstText(node, ['caption', 'title'], context);
    case 'learning':
      return node.kind === 'quiz' || node.kind === 'flashcard'
        ? firstText(node, ['title'], context)
        : '';
    case 'chart':
    case 'visualization':
      return firstText(node, ['title'], context);
    case 'panel':
      return firstText(node, ['title'], context);
    default:
      return '';
  }
}

function descriptionOf(node: IntelligentUiNode, context: RenderContext): string {
  const title = titleOf(node, context);
  for (const field of ['description', 'caption', 'subtitle']) {
    const value = text(node[field], context);
    if (value && value !== title) return value;
  }
  return '';
}

function kindLabel(node: IntelligentUiNode | undefined): string {
  if (!node) return '';
  if (node.type === 'learning' && typeof node.kind === 'string') {
    const key = LEARNING_LABELS[node.kind];
    if (key) return i18n(key, 'Learning');
  }
  const key = TYPE_LABELS[node.type];
  return key ? i18n(key, 'Content') : '';
}

/** Breadth-first, because the first visual the reader meets should name the card. */
function firstLeaf(roots: ReadonlyArray<IntelligentUiNode>, children: RenderContext['children']) {
  const queue = [...roots];
  while (queue.length) {
    const node = queue.shift()!;
    if (!CONTAINER_TYPES.has(node.type)) return node;
    queue.push(...(children.get(node.id) || []));
  }
  return undefined;
}

function firstTitledDescendant(
  root: IntelligentUiNode,
  children: RenderContext['children'],
  context: RenderContext,
): IntelligentUiNode | undefined {
  const queue = [...(children.get(root.id) || [])];
  while (queue.length) {
    const node = queue.shift()!;
    if (node.type !== 'panel' && titleOf(node, context)) return node;
    if (CONTAINER_TYPES.has(node.type)) queue.push(...(children.get(node.id) || []));
  }
  return undefined;
}

/**
 * Header copy is inferred, never invented by the renderer. A panel title is the
 * card's quiet eyebrow; the first titled visual is the headline. Without either,
 * the card simply starts with its content.
 */
export function inferSurfaceMeta(
  roots: ReadonlyArray<IntelligentUiNode>,
  context: RenderContext,
): SurfaceMeta {
  const root = roots.length === 1 ? roots[0] : undefined;
  const rootTitle = root ? titleOf(root, context) : '';
  const rootIsContainer = Boolean(root && CONTAINER_TYPES.has(root.type));
  const content =
    root && rootIsContainer ? firstTitledDescendant(root, context.children, context) : root;
  const leaf = firstLeaf(roots, context.children);
  const contentTitle = content ? titleOf(content, context) : '';
  const title = contentTitle || rootTitle;
  if (!title) return {};

  const promotedRootTitle = Boolean(rootIsContainer && rootTitle && rootTitle !== title);
  const eyebrow = promotedRootTitle ? rootTitle : kindLabel(content || leaf || root);
  const description = content
    ? descriptionOf(content, context)
    : root
      ? text(root.description, context) || text(root.subtitle, context)
      : '';

  return {
    eyebrow: eyebrow || undefined,
    title,
    description: description && description !== title ? description : undefined,
  };
}

function pushLine(lines: string[], seen: Set<string>, value: string): void {
  const line = value.trim();
  if (!line || seen.has(line)) return;
  seen.add(line);
  lines.push(line);
}

function appendNode(
  node: IntelligentUiNode,
  context: RenderContext,
  lines: string[],
  seen: Set<string>,
): void {
  for (const field of [
    'title',
    'label',
    'value',
    'text',
    'caption',
    'description',
    'term',
    'q',
    'problem',
    'front',
    'body',
    'statement',
    'subtitle',
  ]) {
    pushLine(lines, seen, text(node[field], context));
  }

  if (node.type === 'table' && Array.isArray(node.columns) && Array.isArray(node.rows)) {
    const columns = node.columns.slice(0, 8);
    const keys = columns.map((column, index) => {
      if (typeof column === 'string') return column;
      if (isRecord(column) && typeof column.key === 'string') return column.key;
      return `col-${index}`;
    });
    const labels = columns.map((column, index) => {
      if (isRecord(column)) {
        const label = text(column.label, context);
        if (label) return label;
      }
      return keys[index];
    });
    pushLine(lines, seen, labels.join('\t'));
    for (const row of node.rows.slice(0, 24)) {
      if (!isRecord(row)) continue;
      pushLine(lines, seen, keys.map((key) => text(row[key], context)).join('\t'));
    }
  }

  if (node.type === 'chart' && Array.isArray(node.points)) {
    for (const point of node.points.slice(0, 50)) {
      if (!isRecord(point)) continue;
      const label = text(point.label, context);
      const value = text(point.value, context);
      if (label || value) pushLine(lines, seen, `${label}: ${value}`);
    }
  }

  if (node.type === 'learning' && Array.isArray(node.options)) {
    for (const option of node.options.slice(0, 8)) {
      if (!isRecord(option)) continue;
      const letter = text(option.letter, context);
      const label = text(option.text, context);
      if (label) pushLine(lines, seen, `${letter ? `${letter}. ` : ''}${label}`);
    }
  }

  for (const child of context.children.get(node.id) || []) {
    appendNode(child, context, lines, seen);
  }
}

/** Plain text for the card's copy action; the UI itself stays the source of truth. */
export function surfacePlainText(
  roots: ReadonlyArray<IntelligentUiNode>,
  context: RenderContext,
  meta: SurfaceMeta,
): string {
  const lines: string[] = [];
  const seen = new Set<string>();
  if (meta.title) pushLine(lines, seen, meta.title);
  if (meta.description) pushLine(lines, seen, meta.description);
  if (meta.eyebrow) seen.add(meta.eyebrow);
  for (const root of roots) appendNode(root, context, lines, seen);
  return lines.join('\n\n').slice(0, 6000);
}
