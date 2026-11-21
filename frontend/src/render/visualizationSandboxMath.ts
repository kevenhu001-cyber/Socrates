type Request = { node: Text | SVGTextElement; source: string };
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function applySpanMath(node: Text, html: string) {
  const span = document.createElement('span');
  span.dataset.vizMath = '';
  span.innerHTML = html;
  node.replaceWith(span);
}

function applySvgMathOverlay(
  svgText: SVGTextElement,
  html: string,
  entry: Request,
  requested: WeakMap<Node, Request>,
) {
  const box = svgText.getBBox();
  if (!box.width || !box.height) return;
  const overlay = document.createElementNS(SVG_NAMESPACE, 'foreignObject');
  overlay.setAttribute('data-viz-math', '');
  overlay.setAttribute('x', String(box.x));
  overlay.setAttribute('y', String(box.y - box.height));
  overlay.setAttribute('width', String(Math.max(80, box.width)));
  overlay.setAttribute('height', String(Math.max(40, box.height * 3)));
  if (svgText.hasAttribute('transform'))
    overlay.setAttribute('transform', svgText.getAttribute('transform')!);
  overlay.style.cssText = 'overflow:visible;pointer-events:none';
  const content = document.createElement('div');
  content.style.color = getComputedStyle(svgText).fill;
  content.style.fontSize = getComputedStyle(svgText).fontSize;
  content.innerHTML = html;
  overlay.append(content);
  svgText.after(overlay);
  svgText.style.opacity = '0';
  const watch = new MutationObserver(() => {
    if (requested.get(svgText) === entry) requested.delete(svgText);
    overlay.remove();
    svgText.style.removeProperty('opacity');
    watch.disconnect();
  });
  watch.observe(svgText, { childList: true, characterData: true, subtree: true });
}

/** Runs inside the opaque extension frame. Only typesetting crosses the bridge;
 * simulation state and event handlers remain owned by the original document. */
export function visualizationSandboxMath(cardId: string, nonce: string, mathPattern: string): void {
  const pending = new Map<number, Request>();
  const requested = new WeakMap<Node, Request>();
  const mathTrigger = new RegExp(mathPattern);
  const skip = 'script,style,textarea,pre,code,option,title,desc,math,[data-viz-math]';
  const svgNamespace = SVG_NAMESPACE;
  let sequence = 0;
  let queued = false;
  const dirty = new Set<Node>();
  const elementFor = (node: Node) =>
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  function processLabel(label: Text | SVGTextElement, root: Node): boolean {
    const source = label.textContent || '';
    if (!mathTrigger.test(source) || requested.get(label)?.source === source) return false;
    // Retain unprocessed roots when the bridge is saturated. A response
    // frees a slot and resumes work; no formula is silently abandoned.
    if (pending.size >= 200) {
      dirty.add(root);
      return true;
    }
    const id = ++sequence;
    const entry = { node: label, source };
    requested.set(label, entry);
    pending.set(id, entry);
    window.parent.postMessage(
      { type: 'socrates-viz-math', cardId, nonce, id, source: source.slice(0, 8000) },
      '*',
    );
    return false;
  }
  function scan() {
    queued = false;
    const roots = [...dirty];
    dirty.clear();
    for (const root of roots) {
      if (!root.isConnected || elementFor(root)?.closest(skip)) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Text | null =
        root.nodeType === Node.TEXT_NODE ? (root as Text) : (walker.nextNode() as Text | null);
      for (; node; node = walker.nextNode() as Text | null) {
        if (node.parentElement?.closest(skip)) continue;
        const svgText = node.parentElement?.closest<SVGTextElement>('text');
        const label = svgText?.namespaceURI === svgNamespace ? svgText : node;
        if (processLabel(label, root)) break;
      }
    }
  }
  function schedule() {
    if (!queued && dirty.size && pending.size < 200) {
      queued = true;
      requestAnimationFrame(scan);
    }
  }
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'characterData') dirty.add(record.target);
      else for (const node of record.addedNodes) dirty.add(node);
    }
    schedule();
  });

  window.addEventListener('message', (event) => {
    const data = event.data;
    if (
      event.source !== window.parent ||
      data?.type !== 'socrates-viz-math-result' ||
      data.cardId !== cardId ||
      data.nonce !== nonce
    )
      return;
    const entry = pending.get(data.id);
    pending.delete(data.id);
    schedule();
    if (
      !entry ||
      requested.get(entry.node) !== entry ||
      !entry.node.isConnected ||
      entry.node.textContent !== entry.source
    )
      return;
    if (typeof data.html !== 'string' || !data.html) return;
    if (entry.node instanceof SVGElement)
      applySvgMathOverlay(entry.node, data.html, entry, requested);
    else applySpanMath(entry.node, data.html);
  });
  function start() {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    dirty.add(document.body);
    scan();
  }
  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
