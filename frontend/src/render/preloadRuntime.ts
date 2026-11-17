/**
 * render/preloadRuntime.ts — warm the chart engine from real intent.
 *
 * Charts (ECharts) are vendored classic scripts injected on first use. That
 * kept them out of the entry graph, but the first visualization in a
 * conversation then paid a 1 MB download *and* the parse cost while the
 * turn was already finished, which read as "the chart is slow". The loader
 * caches its script tag, so starting it when the tool call appears makes the
 * first card render immediately.
 *
 * This module used to also warm KaTeX on every idle boot. That undid the
 * demand-loading split measured in docs/audits/2026-10-18-demand-loading-
 * pass-2.md: a plain chat page downloaded the KaTeX script and stylesheet
 * (~80 KB gzip) even when it never rendered a formula, and the parse work
 * landed in the idle window that fills the transcript. Formula content now
 * warms KaTeX through its own render paths (`render/markdownMath.ts`,
 * `render/assistantHtml.ts`), so a home page visit pays nothing for it.
 *
 * This is a warm-up, not a dependency: failures stay silent (the normal
 * loader retries on demand) and reduced-data users are skipped.
 */
import { ensureEcharts } from '../vendor/lazy.ts';
import { sessionStore } from '../store/index.ts';

let installed = false;

function saveData(): boolean {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

let chartsWarmed = false;

/**
 * Start the chart engine when a visualization tool call appears, not when
 * its card mounts. The tool call runs for a while (search, planning, data),
 * so the ~1 MB script is usually ready by the time the result lands. This is
 * deliberately NOT an idle-boot preload: most turns never draw a chart, and
 * parsing it during an answer delayed the pinned scroll.
 */
function warmChartsOnToolUse(event: Event): void {
  if (chartsWarmed) return;
  const detail = (event as CustomEvent<{ type?: string; messageId?: string }>).detail;
  if (!detail || detail.type !== 'tool-run-updated') return;
  const { messages } = sessionStore.getState();
  const message = detail.messageId
    ? messages.find((entry) => entry.clientId === detail.messageId)
    : messages[messages.length - 1];
  const calls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  if (
    !calls.some(
      (call) => call.name === 'render_intelligent_ui' || call.name === 'render_visualization',
    )
  )
    return;
  chartsWarmed = true;
  void ensureEcharts().catch(() => {
    /* the card retries on demand */
  });
}

/** Idempotent; call once the app shell is interactive. */
export function preloadRenderRuntime(): void {
  if (installed || typeof window === 'undefined' || saveData()) return;
  installed = true;
  window.addEventListener('socrates:chat-runtime-publish', warmChartsOnToolUse);
}
