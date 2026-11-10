/**
 * thinkingModel — DOM-free view model for the thinking line (RN-2).
 *
 * Privacy rule: the only text this module ever shows is a provider's PUBLIC
 * reasoning summary (`TurnActivityEntry.kind === 'reasoning_summary'`).
 * Raw reasoning (`kind: 'reasoning'`, `<think>` ranges, `reasoningContent`)
 * is never an input here — `publicSummariesOf` filters by kind, so a caller
 * that hands in the whole activity list still cannot leak it.
 */

export interface ActivityLike {
  id: string;
  kind: string;
  phase?: string;
  startedAt?: number;
  endedAt?: number;
  text?: string;
}

export interface ThinkingStep {
  id: string;
  title: string;
  summary: string;
  phase?: string;
  startedAt?: number;
}

export interface TimedTool<T> {
  id: string;
  startedAt?: number;
  item: T;
}

export type ActivityTimelineEntry<T> =
  | { kind: 'step'; step: ThinkingStep }
  | { kind: 'tools'; id: string; tools: T[] };

const MAX_STEPS = 12;
const TITLE_MAX = 40;

function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Split one public summary into a short title and its body. Providers send
 * either `**Title**\n\nbody`, a heading line plus body, or one sentence.
 */
export function splitSummary(raw: string): { title: string; summary: string } {
  const text = String(raw || '').trim();
  if (!text) return { title: '', summary: '' };
  const bold = /^\*\*([^*\n]{1,80})\*\*\s*([\s\S]*)$/.exec(text);
  if (bold) return { title: bold[1].trim(), summary: stripInlineMarkdown(bold[2]) };
  const heading = /^#{1,6}\s+([^\n]{1,80})\n+([\s\S]*)$/.exec(text);
  if (heading) return { title: heading[1].trim(), summary: stripInlineMarkdown(heading[2]) };
  const plain = stripInlineMarkdown(text);
  const newline = plain.indexOf('\n');
  if (newline > 0 && newline <= TITLE_MAX) {
    return { title: plain.slice(0, newline).trim(), summary: plain.slice(newline + 1).trim() };
  }
  if (plain.length <= 24) return { title: plain, summary: '' };
  const sentence = /^(.{2,40}?[。！？.!?])\s*([\s\S]+)$/.exec(plain);
  if (sentence) return { title: sentence[1].replace(/[。.]$/, '').trim(), summary: sentence[2].trim() };
  if (plain.length <= TITLE_MAX) return { title: plain, summary: '' };
  return { title: '', summary: plain };
}

/** Public summaries only, de-duplicated by text, oldest first. */
export function publicSummariesOf(activities: ReadonlyArray<ActivityLike> | null | undefined): ThinkingStep[] {
  const seen = new Set<string>();
  const steps: ThinkingStep[] = [];
  for (const entry of activities || []) {
    if (!entry || entry.kind !== 'reasoning_summary') continue;
    const text = typeof entry.text === 'string' ? entry.text.trim() : '';
    if (!text || seen.has(text)) continue;
    seen.add(text);
    const { title, summary } = splitSummary(text);
    steps.push({ id: entry.id, title, summary, phase: entry.phase, startedAt: entry.startedAt });
  }
  return steps.slice(-MAX_STEPS);
}

/** Fallback when only the transport's latest public summary is known. */
export function stepsWithFallback(steps: ThinkingStep[], publicSummary: string | undefined): ThinkingStep[] {
  if (steps.length) return steps;
  const text = String(publicSummary || '').trim();
  if (!text) return [];
  const { title, summary } = splitSummary(text);
  return [{ id: 'public-summary', title, summary, phase: 'done' }];
}

/**
 * Interleave summary steps with tool calls by start time. Consecutive tools
 * (no summary between them) merge into one `tools` entry — the
 * 「使用了 N 个工具」 group. Entries without a time keep their input order
 * after the timed ones, so history (which often lacks tool start times)
 * still reads summary-first.
 */
export function activityTimeline<T>(steps: ThinkingStep[], tools: ReadonlyArray<TimedTool<T>>): ActivityTimelineEntry<T>[] {
  type Raw = { at: number; order: number; step?: ThinkingStep; tool?: TimedTool<T> };
  const raw: Raw[] = [];
  steps.forEach((step, order) => raw.push({ at: finiteOr(step.startedAt), order, step }));
  tools.forEach((tool, index) => raw.push({ at: finiteOr(tool.startedAt), order: steps.length + index, tool }));
  raw.sort((a, b) => (a.at - b.at) || (a.order - b.order));
  const out: ActivityTimelineEntry<T>[] = [];
  for (const entry of raw) {
    if (entry.step) {
      out.push({ kind: 'step', step: entry.step });
      continue;
    }
    const last = out[out.length - 1];
    if (last && last.kind === 'tools') last.tools.push(entry.tool!.item);
    else out.push({ kind: 'tools', id: 'tools-' + entry.tool!.id, tools: [entry.tool!.item] });
  }
  return out;
}

function finiteOr(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

export interface ThinkingHeader {
  live: boolean;
  /** Whole seconds, at least 1, or null when the run duration is unknown. */
  durationSec: number | null;
  /** Actual tool calls, never an inferred reasoning-step count. */
  toolCount: number;
  statusLabel: string;
}

/** The current action is the headline; elapsed time is separate metadata.
 * Keeping the ticking duration out of the label also keeps a live region
 * from announcing a new status every second. */
export function thinkingHeaderOf(input: {
  live: boolean;
  durationSec?: number | null;
  toolCount?: number;
  statusLabel?: string;
}): ThinkingHeader {
  const duration = typeof input.durationSec === 'number' && Number.isFinite(input.durationSec) && input.durationSec > 0
    ? Math.max(1, Math.round(input.durationSec)) : null;
  const toolCount = typeof input.toolCount === 'number' && Number.isFinite(input.toolCount)
    ? Math.max(0, Math.floor(input.toolCount)) : 0;
  return { live: Boolean(input.live), durationSec: duration, toolCount, statusLabel: input.statusLabel?.trim() || '' };
}

export interface ThinkingLabels {
  runningNoTime: string;
  doneNoTime: string;
  usedTool: string;
  usedTools: string;
}

function fill(template: string, values: Record<string, number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => key in values ? String(values[key]) : match);
}

export function thinkingLabelOf(header: ThinkingHeader, labels: ThinkingLabels): string {
  if (header.live) return header.statusLabel || labels.runningNoTime;
  if (header.toolCount > 0) return fill(header.toolCount === 1 ? labels.usedTool : labels.usedTools, { n: header.toolCount });
  return labels.doneNoTime;
}
