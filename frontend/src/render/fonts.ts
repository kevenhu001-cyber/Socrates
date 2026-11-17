/**
 * Font readiness for layout-measuring renderers.
 */
import { reportSwallow as reportEmptyCatch } from '../util/reportSwallow.ts';

/* P_viz-font-ready — wait for the document fonts (Inter, Noto Sans SC,
   KaTeX…) to actually load before a renderer measures text. Without
   this, ECharts/Plotly/Mermaid/sandboxed iframes compute their first
   layout with the fallback font, so CJK characters render at the
   wrong width and titles clip on the very first paint. When `family`
   is given, force-load that face so the resolved Promise guarantees
   it is usable (otherwise the browser can keep it unloaded). */
export function whenFontsReady(family?: string): Promise<void> {
  const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
  if (!fonts || typeof fonts.ready !== 'object') return Promise.resolve();
  let ready: Promise<unknown> = fonts.ready;
  if (family) {
    try {
      const force: Promise<unknown> = fonts.load(`12px "${family}"`);
      ready = Promise.all([ready, force]).then(() => undefined);
    } catch (_) {
      reportEmptyCatch(_, 'empty catch: render/fonts.ts');
      /* family unknown to the platform — fall through */
    }
  }
  return ready.then(
    () => undefined,
    () => undefined,
  );
}
