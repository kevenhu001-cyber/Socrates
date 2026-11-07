import { renderInlineMathHtml } from './inlineMath.ts';
import { reportSwallow } from '../util/reportSwallow.ts';
import { onKatexReady } from '../vendor/lazy.ts';

const SVG = 'http://www.w3.org/2000/svg';
const HTML = 'http://www.w3.org/1999/xhtml';

/** Typeset renderer-owned SVG labels without rebuilding the plot or its state.
 * Keep the original text as the engine's layout and pointer-event target.
 * The overlay uses SVG coordinates, so zoom and responsive transforms apply.
 */
export function installVisualizationMath(host: HTMLElement): () => void {
  if (typeof requestAnimationFrame !== 'function') return () => undefined;
  const Observer = host.ownerDocument.defaultView!.MutationObserver;
  const labels = new Map<SVGTextElement, SVGForeignObjectElement>();
  let frame = 0;
  let disposed = false;
  const paint = () => {
    frame = 0;
    observer.disconnect();
    for (const [text, overlay] of labels) {
      overlay.remove();
      text.style.removeProperty('opacity');
      labels.delete(text);
    }
    try {
      for (const text of host.querySelectorAll<SVGTextElement>('svg text')) {
        const source = text.textContent || '';
        if (!/\$|\\[([]/.test(source)) continue;
        const html = renderInlineMathHtml(source);
        if (!html || !html.includes('katex')) continue;
        const box = text.getBBox();
        if (!box.width || !box.height) continue;
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
      for (const el of host.querySelectorAll<HTMLElement>('h3, figcaption, th, td')) {
        if (el.querySelector('.katex')) continue;
        const html = renderInlineMathHtml(el.textContent || '');
        if (html) el.innerHTML = html;
      }
    } catch (error) { reportSwallow(error, 'visualization.renderMath'); }
    observer.observe(host, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['transform', 'x', 'y', 'style', 'fill'] });
  };
  const schedule = () => { if (!disposed && !frame) frame = requestAnimationFrame(paint); };
  const observer = new Observer(schedule);
  const unsubscribe = onKatexReady(schedule);
  schedule();
  return () => {
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    unsubscribe();
    for (const [text, overlay] of labels) { text.style.removeProperty('opacity'); overlay.remove(); }
    labels.clear();
  };
}
