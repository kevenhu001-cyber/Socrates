/** Runs inside the opaque extension frame. Only typesetting crosses the bridge;
 * simulation state and event handlers remain owned by the original document. */
export function visualizationSandboxMath(cardId: string, nonce: string): void {
  const pending = new Map<number, { node: Text; source: string }>();
  const requested = new WeakMap<Text, string>();
  let sequence = 0;
  let queued = false;
  const dirty = new Set<Node>();
  const elementFor = (node: Node) => node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  function scan() {
    queued = false;
    const roots = [...dirty];
    dirty.clear();
    for (const root of roots) {
      if (!root.isConnected || elementFor(root)?.closest('script,style,textarea,pre,code,math,[data-viz-math]')) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let node: Text | null = root.nodeType === Node.TEXT_NODE ? root as Text : walker.nextNode() as Text | null;
      for (; node; node = walker.nextNode() as Text | null) {
        const source = node.data;
        if (!/\$|\\[([]/.test(source) || node.parentElement?.closest('script,style,textarea,pre,code,math,[data-viz-math]')) continue;
        if (requested.get(node) === source) continue;
        // Retain unprocessed roots when the bridge is saturated. A response
        // frees a slot and resumes work; no formula is silently abandoned.
        if (pending.size >= 200) { dirty.add(root); break; }
        const id = ++sequence;
        requested.set(node, source);
        pending.set(id, { node, source });
        window.parent.postMessage({ type: 'socrates-viz-math', cardId, nonce, id, source: source.slice(0, 8000) }, '*');
      }
    }
  }
  function schedule() {
    if (!queued && dirty.size && pending.size < 200) { queued = true; requestAnimationFrame(scan); }
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') dirty.add(record.target);
      else for (const node of record.addedNodes) dirty.add(node);
    }
    schedule();
  });
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.source !== window.parent || data?.type !== 'socrates-viz-math-result' || data.cardId !== cardId || data.nonce !== nonce) return;
    const entry = pending.get(data.id);
    pending.delete(data.id);
    schedule();
    if (!entry || !entry.node.isConnected || entry.node.data !== entry.source) return;
    if (typeof data.html !== 'string' || !data.html) return;
    const text = entry.node.parentElement;
    const svgText = text?.closest('text');
    if (svgText && svgText.namespaceURI === 'http://www.w3.org/2000/svg') {
      // One complete SVG label per request. Preserve the renderer's text node
      // as its layout anchor; only the visible formula becomes MathML.
      if (svgText.textContent !== entry.source) return;
      const box = (svgText as unknown as SVGTextElement).getBBox();
      const overlay = document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
      overlay.setAttribute('data-viz-math', '');
      overlay.setAttribute('x', String(box.x)); overlay.setAttribute('y', String(box.y - box.height));
      overlay.setAttribute('width', String(Math.max(80, box.width))); overlay.setAttribute('height', String(Math.max(40, box.height * 3)));
      if (svgText.hasAttribute('transform')) overlay.setAttribute('transform', svgText.getAttribute('transform')!);
      overlay.style.cssText = 'overflow:visible;pointer-events:none';
      const content = document.createElement('div');
      content.style.color = getComputedStyle(svgText).fill;
      content.style.fontSize = getComputedStyle(svgText).fontSize;
      content.innerHTML = data.html;
      overlay.append(content); svgText.after(overlay);
      svgText.style.opacity = '0';
      // Remove the old overlay when a simulation changes its label.
      const watch = new MutationObserver(() => { overlay.remove(); svgText.style.removeProperty('opacity'); watch.disconnect(); });
      watch.observe(svgText, { childList: true, characterData: true, subtree: true });
    } else {
      const span = document.createElement('span');
      span.dataset.vizMath = '';
      span.innerHTML = data.html;
      entry.node.replaceWith(span);
    }
  });
  function start() { observer.observe(document.body, { childList: true, subtree: true, characterData: true }); dirty.add(document.body); scan(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
