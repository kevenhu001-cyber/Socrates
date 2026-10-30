/** Bounded, time-anchored opacity reveals for newly published live prose.
 * Never measure layout or walk the completed prefix/full tail DOM per token. */
const MAX_CHARS = 256;
const MAX_NODES = 64;
const MAX_RUNS = 12;
const MAX_SPANS = 24;
/** How long a run stays in flight — a margin over the 120ms reveal. */
export const STREAM_REVEAL_MS = 180;
/** Segments that arrive together are spread this far apart. */
export const REVEAL_STAGGER_MS = 30;
/** Two arrivals closer together than this happened in the same tick. */
const SAME_TICK_MS = 8;
const OPAQUE = 'pre,code,button,script,style,svg,math,.katex,.viz,.mermaid,.code-block-header';
interface Run { length: number; at: number; tier: number }
interface Leaf { node: Text; start: number; end: number }

/**
 * The index a segment takes inside the group of segments that arrived in
 * the same tick.
 *
 * Segments that land together would otherwise fade in as one flat flash.
 * The tier spreads them apart in reading order, so a burst reads as a wave
 * travelling through the text rather than as a single blink.
 */
export function revealTier(arrivals: number[], now: number): number {
  let tier = 0;
  for (let i = arrivals.length - 1; i >= 0; i -= 1) {
    if (now - arrivals[i] > SAME_TICK_MS) break;
    tier += 1;
  }
  return tier;
}

/**
 * The animation delay for a revealed segment, in milliseconds.
 *
 * `age` is how long ago the segment arrived: the animation resumes from
 * there, so already-revealed text never re-fades. `tier` is the segment's
 * index inside its arrival group, which pushes it 30ms later than the one
 * before it.
 */
export function revealDelay(age: number, tier: number): number {
  return tier * REVEAL_STAGGER_MS - Math.max(0, Math.round(age));
}

function previous(node: Node, root: Element): Node | null {
  while (node !== root) {
    if (node.previousSibling) return node.previousSibling;
    if (!node.parentNode) break;
    node = node.parentNode;
  }
  return null;
}

function suffixOf(root: Element): { text: string; leaves: Leaf[] } {
  const leaves: Leaf[] = [];
  let text = '';
  let node: Node | null = root.lastChild;
  for (let visited = 0; node && visited < MAX_NODES && text.length < MAX_CHARS; visited++) {
    if (node.nodeType === 1) {
      const element = node as Element;
      if (!element.matches(OPAQUE) && node.lastChild) { node = node.lastChild; continue; }
    } else if (node.nodeType === 3) {
      const value = node.nodeValue || '';
      // marked adds formatting newlines between block elements. They move on
      // every append but are not revealed prose; keep them out of the suffix.
      if (value.length <= 16 && !value.trim() && /^(DIV|UL|OL|TABLE|THEAD|TBODY|TR|BLOCKQUOTE)$/.test(node.parentElement?.tagName || '')) {
        node = previous(node, root);
        continue;
      }
      const take = Math.min(value.length, MAX_CHARS - text.length);
      if (take) {
        leaves.push({ node: node as Text, start: text.length, end: text.length + take });
        text = value.slice(-take) + text;
      }
    }
    node = previous(node, root);
  }
  return { text, leaves };
}

interface AppendMeasure {
  length: number;
  resetRuns: boolean;
}

function measureAppend(source: string, nextSource: string, suffix: string, nextText: string): AppendMeasure {
  let length = Math.min(nextText.length, MAX_CHARS);
  if (!source || !nextSource.startsWith(source)) return { length, resetRuns: true };

  // Markdown syntax may add fewer visible characters than source bytes.
  // Compare only a bounded suffix, preferring the source-sized append.
  const overlap = Math.min(suffix.length, nextText.length, 32);
  length = Math.min(length, nextSource.length - source.length, nextText.length - overlap);
  while (length > 0 && !suffix.endsWith(nextText.slice(0, nextText.length - length))) length--;
  return { length, resetRuns: !length && nextText !== suffix };
}

function updateRevealRuns(runs: Run[], added: number, now: number): Run[] {
  const active = runs.filter((run) => now - run.at < STREAM_REVEAL_MS);
  if (added) {
    active.push({
      length: added,
      at: now,
      tier: revealTier(active.map((run) => run.at), now),
    });
  }
  return active.slice(-MAX_RUNS);
}

function renderRevealRange(
  root: Element,
  leaves: Leaf[],
  distance: number,
  run: Run,
  isNewest: boolean,
  now: number,
  alreadyRendered: number,
): { spans: number; limitReached: boolean } {
  let spans = alreadyRendered;
  for (const leaf of leaves) {
    const near = Math.max(distance, leaf.start);
    const far = Math.min(distance + run.length, leaf.end);
    if (near >= far) continue;
    const value = leaf.node.data;
    let from = value.length - (far - leaf.start);
    const to = value.length - (near - leaf.start);
    // Avoid splitting a UTF-16 surrogate pair at a chunk boundary.
    if (from > 0 && /[\uDC00-\uDFFF]/.test(value[from])) from--;
    const part = leaf.node.splitText(from);
    part.splitText(to - from);
    const span = root.ownerDocument.createElement('span');
    /* Only the newest run carries the blur: a filter forces an offscreen
       pass, and the older runs are already on their way out. */
    span.className = isNewest
      ? 'stream-append-reveal'
      : 'stream-append-reveal stream-append-aged';
    span.style.animationDelay = `${revealDelay(now - run.at, run.tier)}ms`;
    part.replaceWith(span);
    span.appendChild(part);
    // Splits shorten the original node, so adjust its end-distance for
    // subsequent (older) runs while retaining the original offset base.
    leaf.start += value.length - from;
    spans++;
    if (spans >= MAX_SPANS) return { spans, limitReached: true };
  }
  return { spans, limitReached: false };
}

function renderRevealRuns(root: Element, leaves: Leaf[], runs: Run[], now: number): number {
  let spans = 0;
  let distance = 0;
  // Leaves and runs are processed from the end. Rebuilding HTML resumes
  // each chunk's original animation age instead of re-fading older text.
  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    const rendered = renderRevealRange(
      root,
      leaves,
      distance,
      run,
      i === runs.length - 1,
      now,
      spans,
    );
    spans = rendered.spans;
    if (rendered.limitReached) return spans;
    distance += run.length;
  }
  return spans;
}

export function createStreamReveal() {
  let source = '';
  let suffix = '';
  let runs: Run[] = [];
  return (root: Element, nextSource: string, now = performance.now()): number => {
    const view = root.ownerDocument.defaultView;
    let smoothStreamDisabled = false;
    try { smoothStreamDisabled = view?.localStorage.getItem('socrates:smoothStream') === 'off'; }
    catch { /* empty-catch: intentional — localStorage may be unavailable in an opaque document. */ }
    if (smoothStreamDisabled || view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      source = nextSource;
      suffix = '';
      runs = [];
      return 0;
    }
    const next = suffixOf(root);
    const addition = measureAppend(source, nextSource, suffix, next.text);
    if (addition.resetRuns) runs = [];
    source = nextSource;
    suffix = next.text;
    runs = updateRevealRuns(runs, addition.length, now);
    return renderRevealRuns(root, next.leaves, runs, now);
  };
}
