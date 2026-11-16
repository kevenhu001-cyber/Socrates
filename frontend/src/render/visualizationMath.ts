import { renderInlineMathHtml } from './inlineMath.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { onKatexReady } from '../vendor/lazy.ts';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';

const MATH_TRIGGER = /\$|\\[([]|\\(?:frac|sqrt|sin|cos|tan|log|ln|pi|theta|alpha|beta|gamma|lambda|sigma|omega|mu|Delta|sum|int|cdot|times|pm|approx|leq|geq|neq|partial|nabla)\b/;

function ensureMathDelimiters(text: string): string {
  if (/\$|\\[([]/.test(text)) return text;
  return `$${text.trim()}$`;
}

type Typeset = (source: string) => string | null;

function elementFor(node: Node): Element | null {
  return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
}

function attributeChangesText(record: MutationRecord, element: Element | null): boolean {
  if (record.attributeName === 'transform' && !element?.closest('text')) return false;
  return !!(element?.closest('text') || element?.querySelector('text'));
}


function typesetSvgText(text: SVGTextElement, labels: Map<SVGTextElement, SVGForeignObjectElement>, render: Typeset): void {
  const source = (text.textContent || '').trim();
  if (!MATH_TRIGGER.test(source)) return;
  const html = render(source);
  if (!html || !html.includes('katex')) return;
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
  overlay.setAttribute('x', String(box.x + (box.width - width) / 2));
  overlay.setAttribute('y', String(box.y + box.height / 2 - 40));
  overlay.setAttribute('width', String(width));
  overlay.setAttribute('height', '80');
  if (text.hasAttribute('transform')) overlay.setAttribute('transform', text.getAttribute('transform')!);
  overlay.style.pointerEvents = 'none';
  overlay.style.overflow = 'visible';
  overlay.setAttribute('aria-hidden', 'true');
  const content = document.createElementNS(HTML, 'div');
  content.style.cssText = 'display:flex;align-items:center;justify-content:center;height:100%;white-space:nowrap;';
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
  if (host.nodeType === Node.TEXT_NODE) leaves.push(host as Text);
  while ((leaf = walker.nextNode() as Text | null)) {
    if (leaf.parentElement?.closest('svg, .katex, script, style, textarea, pre, code')) continue;
    if (MATH_TRIGGER.test(leaf.data)) leaves.push(leaf);
  }
  for (const item of leaves) {
    if (item.parentElement?.closest('svg, .katex, script, style, textarea, pre, code') || !MATH_TRIGGER.test(item.data)) continue;
    const html = render(item.data);
    if (!html) continue;
    const span = host.ownerDocument!.createElement('span');
    span.innerHTML = html;
    item.replaceWith(span);
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
  const render: Typeset = source => {
    const cached = cache.get(source);
    if (cached) return cached;
    const html = renderInlineMathHtml(ensureMathDelimiters(source));
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
  const observe = () => observer.observe(host, {
    childList: true, subtree: true, characterData: true, attributes: true,
    attributeFilter: ['transform', 'x', 'y', 'dx', 'dy', 'style', 'fill', 'font-size', 'text-anchor', 'class'],
  });
  const paint = () => {
    frame = 0;
    if (!visible || disposed) return;
    observer.disconnect();
    const roots = [...dirty].filter(node => host.contains(node));
    dirty.clear();
    const texts = new Set<SVGTextElement>();
    for (const root of roots) {
      const element = elementFor(root);
      const label = element?.closest<SVGTextElement>('text');
      if (label?.namespaceURI === SVG) texts.add(label);
      if (root.nodeType === Node.ELEMENT_NODE) {
        for (const text of (root as Element).querySelectorAll<SVGTextElement>('svg text, text')) texts.add(text);
      }
    }
    for (const [text, overlay] of labels) {
      if (!host.contains(text) || texts.has(text)) {
        overlay.remove();
        text.style.removeProperty('opacity');
        labels.delete(text);
      }
    }
    try {
      for (const text of texts) typesetSvgText(text, labels, render);
      for (const root of roots) typesetTextLeaves(root, render);
    } catch (error) { reportSwallow(error, 'visualization.renderMath'); }
    observe();
  };
  const schedule = () => {
    if (!disposed && visible && !frame && dirty.size) frame = requestAnimationFrame(paint);
  };
  const observer = new Observer(records => {
    for (const record of records) {
      const element = elementFor(record.target);
      if (element?.closest('.katex, foreignObject')) continue;
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
  const visibility = typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    if (visible) schedule();
  }, { rootMargin: '320px' }) : null;
  visibility?.observe(host);
  const unsubscribe = onKatexReady(() => { dirty.add(host); schedule(); });
  observe();
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    visibility?.disconnect();
    unsubscribe();
    for (const [text, overlay] of labels) { text.style.removeProperty('opacity'); overlay.remove(); }
    labels.clear();
    dirty.clear();
    cache.clear();
  };
}
