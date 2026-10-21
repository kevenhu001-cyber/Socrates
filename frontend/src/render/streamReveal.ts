/** Bounded, time-anchored opacity reveals for newly published live prose.
 * Never measure layout or walk the completed prefix/full tail DOM per token. */
const MAX_CHARS = 256;
const MAX_NODES = 64;
const MAX_RUNS = 12;
const MAX_SPANS = 24;
export const STREAM_REVEAL_MS = 180;
const OPAQUE = 'pre,code,button,script,style,svg,math,.katex,.viz,.mermaid,.code-block-header';
interface Run { length: number; at: number }
interface Leaf { node: Text; start: number; end: number }

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

export function createStreamReveal() {
  let source = '';
  let suffix = '';
  let runs: Run[] = [];
  return (root: Element, nextSource: string, now = performance.now()): number => {
    const view = root.ownerDocument.defaultView as (Window & { __socratesSmoothStream?: boolean }) | null;
    if (view?.__socratesSmoothStream === false || view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      source = nextSource;
      suffix = '';
      runs = [];
      return 0;
    }
    const next = suffixOf(root);
    let added = Math.min(next.text.length, MAX_CHARS);
    if (source && nextSource.startsWith(source)) {
      // Markdown syntax may add fewer visible characters than source bytes.
      // Compare only a bounded suffix, preferring the source-sized append.
      const overlap = Math.min(suffix.length, next.text.length, 32);
      added = Math.min(added, nextSource.length - source.length, next.text.length - overlap);
      while (added > 0 && !suffix.endsWith(next.text.slice(0, next.text.length - added))) added--;
      if (!added && next.text !== suffix) runs = [];
    } else {
      runs = [];
    }
    source = nextSource;
    suffix = next.text;
    runs = runs.filter((run) => now - run.at < STREAM_REVEAL_MS);
    if (added) runs.push({ length: added, at: now });
    runs = runs.slice(-MAX_RUNS);

    let spans = 0;
    let distance = 0;
    // Leaves and runs are processed from the end. Rebuilding HTML resumes
    // each chunk's original animation age instead of re-fading older text.
    for (let i = runs.length - 1; i >= 0; i--) {
      const run = runs[i];
      for (const leaf of next.leaves) {
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
        span.className = 'stream-append-reveal';
        span.style.animationDelay = `-${Math.max(0, Math.round(now - run.at))}ms`;
        part.replaceWith(span);
        span.appendChild(part);
        // Splits shorten the original node, so adjust its end-distance for
        // subsequent (older) runs while retaining the original offset base.
        leaf.start += value.length - from;
        spans++;
        if (spans >= MAX_SPANS) return spans;
      }
      distance += run.length;
    }
    return spans;
  };
}
