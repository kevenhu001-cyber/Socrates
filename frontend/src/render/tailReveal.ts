/* render/tailReveal.ts — time-anchored fade for the live streaming tail.
 *
 * The live tail's HTML is rebuilt by React whenever its text grows, so any
 * CSS animation placed on freshly revealed glyphs restarts on every commit —
 * the old per-character wrapper therefore re-faded the same 18 glyphs each
 * frame and the tail shimmered. This module anchors each reveal to the
 * wall-clock moment it happened instead:
 *
 *   recordReveal()        — after each commit, note "the visible text is now
 *                           N chars long, as of time t";
 *   computeFadeSegments() — turn that history into the ranges still inside
 *                           the fade window, each with its age in ms;
 *   applyTailFade()       — wrap those ranges in plain inline spans whose
 *                           `animation-delay` is the NEGATIVE age, so a span
 *                           re-created by a rebuild resumes its fade at the
 *                           same point rather than starting over.
 *
 * Offsets are measured in the rendered text (`root.textContent`), not the
 * markdown source: that is what the reader sees grow. Only opacity animates
 * (see `.stream-fade` in styles) — no transform/blur, and the spans are
 * `display: inline`, so line breaking (CJK included) is unchanged.
 */

export interface RevealEntry {
  /** Visible text length after this reveal. */
  end: number;
  /** When it became visible (ms). -Infinity marks the non-fading baseline. */
  t: number;
}

export interface FadeSegment {
  start: number;
  end: number;
  /** ms since this range was revealed. */
  age: number;
}

export const TAIL_FADE_MS = 250;

/** Record the visible length after a commit. Returns a new (or the same) history. */
export function recordReveal(
  history: RevealEntry[],
  len: number,
  now: number,
  windowMs: number = TAIL_FADE_MS,
): RevealEntry[] {
  const last = history.length ? history[history.length - 1] : null;
  /* First observation, or the tail shrank (a block settled out of it, a retry,
     a markdown construct collapsing its syntax): whatever is visible now is
     the baseline and is shown as-is. */
  if (!last || len < last.end) return [{ end: len, t: -Infinity }];
  if (len === last.end) return history;
  const next = history.concat({ end: len, t: now });
  /* Prune: keep the entry just before the first still-fading one as the start
     marker, so history stays O(window / frame). */
  let firstLive = -1;
  for (let i = 1; i < next.length; i++) {
    if (now - next[i].t < windowMs) { firstLive = i; break; }
  }
  if (firstLive === -1) return [{ end: len, t: -Infinity }];
  return firstLive > 1 ? next.slice(firstLive - 1) : next;
}

/** Ranges still inside the fade window at `now`. Entry 0 is a start marker only. */
export function computeFadeSegments(
  history: RevealEntry[],
  now: number,
  windowMs: number = TAIL_FADE_MS,
): FadeSegment[] {
  const out: FadeSegment[] = [];
  for (let i = 1; i < history.length; i++) {
    const age = now - history[i].t;
    if (!(age < windowMs)) continue;
    const start = history[i - 1].end;
    const end = history[i].end;
    if (end > start) out.push({ start, end, age: Math.max(0, age) });
  }
  return out;
}

/* Text inside these is never wrapped: code highlighting, KaTeX and diagram
   markup must keep their exact DOM. */
const OPAQUE = 'code,pre,.katex,.katex-display,math,svg,.viz,.mermaid,.stream-fade';

function isOpaque(node: Node, root: Element): boolean {
  const parent = node.parentElement;
  if (!parent) return true;
  const hit = parent.closest(OPAQUE);
  return !!hit && root.contains(hit);
}

/**
 * Wrap the fading ranges of the LAST non-blank text node under `root`.
 * `segments` offsets index into `root.textContent`. Returns spans created.
 */
export function applyTailFade(
  root: Element,
  segments: FadeSegment[],
  doc: Document = document,
): number {
  if (!segments.length) return 0;
  const walker = doc.createTreeWalker(root, 4 /* NodeFilter.SHOW_TEXT */);
  let offset = 0;
  let lastNode: Text | null = null;
  let lastStart = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const value = n.nodeValue || '';
    if (value.trim().length > 0) { lastNode = n as Text; lastStart = offset; }
    offset += value.length;
  }
  if (!lastNode || !lastNode.parentNode || isOpaque(lastNode, root)) return 0;

  const value = lastNode.nodeValue || '';
  const nodeEnd = lastStart + value.length;
  const cuts: Array<{ from: number; to: number; age: number }> = [];
  for (const seg of segments) {
    const from = Math.max(seg.start, lastStart) - lastStart;
    const to = Math.min(seg.end, nodeEnd) - lastStart;
    if (to > from) cuts.push({ from, to, age: seg.age });
  }
  if (!cuts.length) return 0;
  cuts.sort((a, b) => a.from - b.from);

  const frag = doc.createDocumentFragment();
  let cursor = 0;
  for (const cut of cuts) {
    const from = Math.max(cut.from, cursor);
    if (cut.to <= from) continue;
    if (from > cursor) frag.appendChild(doc.createTextNode(value.slice(cursor, from)));
    const span = doc.createElement('span');
    span.className = 'stream-fade';
    span.style.animationDelay = `-${Math.round(cut.age)}ms`;
    span.textContent = value.slice(from, cut.to);
    frag.appendChild(span);
    cursor = cut.to;
  }
  if (cursor < value.length) frag.appendChild(doc.createTextNode(value.slice(cursor)));
  lastNode.parentNode.replaceChild(frag, lastNode);
  return cuts.length;
}
