import { renderMathLabelHtml } from './inlineMath.ts';
import { MATH_LABEL_TRIGGER } from './latex.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { onKatexReady } from '../vendor/lazy.ts';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';

const SKIP_HTML = 'svg, .katex, [data-viz-math], script, style, textarea, pre, code, option';
/* SVG renderers that draw their labels as HTML (Mermaid puts every node and
   edge label in a <foreignObject>) would be excluded by the `svg` above, so
   their labels are checked against the text-only exclusions instead. */
const SKIP_FOREIGN = '.katex, [data-viz-math], script, style, textarea, pre, code, option';

/** True when this element's text must stay literal. */
function skipsText(element: Element | null): boolean {
  if (!element) return false;
  return element.closest(element.closest('foreignObject') ? SKIP_FOREIGN : SKIP_HTML) !== null;
}

type Typeset = (source: string) => string | null;

function elementFor(node: Node): Element | null {
  return node.nodeType === 1 ? (node as Element) : node.parentElement;
}

function attributeChangesText(record: MutationRecord, element: Element | null): boolean {
  if (record.attributeName === 'transform' && !element?.closest('text')) return false;
  return !!(element?.closest('text') || element?.querySelector('text'));
}

function typesetSvgText(
  text: SVGTextElement,
  labels: Map<SVGTextElement, SVGForeignObjectElement>,
  render: Typeset,
): void {
  const source = (text.textContent || '').trim();
  const html = render(source);
  if (!html) return;
  let box: DOMRect | SVGRect | null = null;
  try {
    box = text.getBBox();
  } catch {
    /* empty-catch: intentional — getBBox can throw in headless or detached SVG contexts */
  }
  if (!box || !box.width || !box.height) return;
  const style = getComputedStyle(text);
  const overlay = document.createElementNS(SVG, 'foreignObject');
  const width = Math.max(box.width, 80);
  const anchor = style.textAnchor || text.getAttribute('text-anchor');
  const alignment = anchor === 'end' ? 1 : anchor === 'middle' ? 0.5 : 0;
  overlay.setAttribute('x', String(box.x + (box.width - width) * alignment));
  overlay.setAttribute('y', String(box.y + box.height / 2 - 40));
  overlay.setAttribute('width', String(width));
  overlay.setAttribute('height', '80');
  if (text.hasAttribute('transform'))
    overlay.setAttribute('transform', text.getAttribute('transform')!);
  overlay.style.pointerEvents = 'none';
  overlay.style.overflow = 'visible';
  overlay.setAttribute('aria-hidden', 'true');
  const content = document.createElementNS(HTML, 'div');
  content.style.cssText = 'display:flex;align-items:center;height:100%;white-space:nowrap;';
  content.style.justifyContent = alignment === 1 ? 'flex-end' : alignment ? 'center' : 'flex-start';
  content.style.color = style.fill;
  content.style.fontSize = style.fontSize;
  content.innerHTML = html;
  overlay.append(content);
  text.after(overlay);
  text.style.opacity = '0';
  labels.set(text, overlay);
}

function typesetTextLeaves(host: Node, render: Typeset): void {
  const walker = host.ownerDocument!.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const leaves: Text[] = [];
  let leaf: Text | null;
  if (host.nodeType === 3) leaves.push(host as Text);
  while ((leaf = walker.nextNode() as Text | null)) {
    if (skipsText(leaf.parentElement)) continue;
    if (MATH_LABEL_TRIGGER.test(leaf.data)) leaves.push(leaf);
  }
  for (const item of leaves) {
    if (skipsText(item.parentElement) || !MATH_LABEL_TRIGGER.test(item.data)) continue;
    const html = render(item.data);
    if (!html) continue;
    const span = host.ownerDocument!.createElement('span');
    span.dataset.vizMath = '';
    span.innerHTML = html;
    item.replaceWith(span);
  }
}

function collectSvgTexts(roots: Node[], texts: Set<SVGTextElement>) {
  for (const root of roots) {
    const element = elementFor(root);
    const label = element?.closest<SVGTextElement>('text');
    if (label?.namespaceURI === SVG) texts.add(label);
    if (root.nodeType === 1) {
      for (const text of (root as Element).querySelectorAll<SVGTextElement>('text'))
        if (text.namespaceURI === SVG) texts.add(text);
    }
  }
}

/** Typeset renderer-owned SVG labels without rebuilding the plot or its state.
 * Keep the original text as the engine's layout and pointer-event target.
 * The overlay uses SVG coordinates, so zoom and responsive transforms apply.
 */
export function installVisualizationMath(host: HTMLElement): () => void {
  if (typeof requestAnimationFrame !== 'function') return () => undefined;
  const Observer = host.ownerDocument.defaultView!.MutationObserver;
  const labels = new Map<SVGTextElement, SVGForeignObjectElement>();
  const cache = new Map<string, string>();
  const render: Typeset = (source) => {
    const cached = cache.get(source);
    if (cached) return cached;
    const html = renderMathLabelHtml(source);
    if (html) {
      if (cache.size >= 256) cache.delete(cache.keys().next().value!);
      cache.set(source, html);
    }
    return html;
  };
  let frame = 0;
  let disposed = false;
  let visible = true;
  // A moving path/cursor must not invalidate every formula in the chart.
  // Retain unchanged overlays and examine only changed text/subtrees.
  const dirty = new Set<Node>([host]);
  const observe = () =>
    observer.observe(host, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'transform',
        'x',
        'y',
        'dx',
        'dy',
        'style',
        'fill',
        'font-size',
        'text-anchor',
        'class',
      ],
    });
  function pruneStaleLabels(texts: Set<SVGTextElement>) {
    for (const [text, overlay] of labels) {
      if (!host.contains(text) || texts.has(text)) {
        overlay.remove();
        text.style.removeProperty('opacity');
        labels.delete(text);
      }
    }
  }
  const paint = () => {
    frame = 0;
    if (!visible || disposed) return;
    observer.disconnect();
    const roots = [...dirty].filter((node) => host.contains(node));
    dirty.clear();
    const texts = new Set<SVGTextElement>();
    collectSvgTexts(roots, texts);
    pruneStaleLabels(texts);
    try {
      for (const text of texts) typesetSvgText(text, labels, render);
      for (const root of roots) typesetTextLeaves(root, render);
    } catch (error) {
      reportSwallow(error, 'visualization.renderMath');
    }
    observe();
  };
  const schedule = () => {
    if (!disposed && visible && !frame && dirty.size) frame = requestAnimationFrame(paint);
  };
  const observer = new Observer((records) => {
    for (const record of records) {
      const element = elementFor(record.target);
      /* Our own overlays carry [data-viz-math] and KaTeX carries .katex, so
         both are inert. `foreignObject` is deliberately not excluded: that is
         where Mermaid keeps its labels, and those must be typeset too. */
      if (element?.closest('.katex, [data-viz-math]')) continue;
      if (record.type === 'attributes') {
        // Ancestor transforms move labels and overlays together.
        // Geometry/colour on a text or its ancestor can affect formulas;
        // attributes on paths, circles and animated shapes cannot.
        if (attributeChangesText(record, element)) dirty.add(record.target);
      } else if (record.type === 'characterData' || element?.closest('text')) {
        dirty.add(record.target);
      } else {
        for (const node of record.addedNodes) dirty.add(node);
        if (labels.size) for (const node of record.removedNodes) dirty.add(node);
      }
    }
    schedule();
  });
  const visibility =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          ([entry]) => {
            visible = !!entry?.isIntersecting;
            if (visible) schedule();
          },
          { rootMargin: '320px' },
        )
      : null;
  visibility?.observe(host);
  const unsubscribe = onKatexReady(() => {
    dirty.add(host);
    schedule();
  });
  observe();
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    visibility?.disconnect();
    unsubscribe();
    for (const [text, overlay] of labels) {
      text.style.removeProperty('opacity');
      overlay.remove();
    }
    labels.clear();
    dirty.clear();
    cache.clear();
  };
}
