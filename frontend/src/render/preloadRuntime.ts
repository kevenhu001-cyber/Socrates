/**
 * render/preloadRuntime.ts — warm the heavy render engines after the shell
 * is interactive.
 *
 * Charts (ECharts), formulas (KaTeX) and diagrams (Mermaid) are vendored
 * classic scripts injected on first use. That kept them out of the entry
 * graph, but the first visualization in a conversation therefore paid a
 * 1 MB download *and* the parse cost while the turn was already finished,
 * which read as "the chart is slow". The loaders cache their script tag, so
 * warming them once on idle makes the first card render immediately.
 *
 * This is a warm-up, not a dependency: failures stay silent (the normal
 * loader retries on demand), reduced-data users are skipped, and nothing
 * runs before the page has painted and the browser is idle.
 */
import { ensureEcharts, ensureKatex } from '../vendor/lazy.ts';

let scheduled = false;

function schedule(callback: () => void): void {
  const idle = (window as Window & {
    requestIdleCallback?: (handler: () => void, options?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof idle === 'function') idle.call(window, callback, { timeout: 3000 });
  else window.setTimeout(callback, 2200);
}

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
  const store = (window as Window & {
    stateStore?: { read(key: string): unknown };
  }).stateStore;
  const messages = store?.read('messages') as Array<{
    clientId?: string;
    toolCalls?: Array<{ name?: string }>;
  }> | undefined;
  if (!Array.isArray(messages)) return;
  const message = detail.messageId
    ? messages.find((entry) => entry.clientId === detail.messageId)
    : messages[messages.length - 1];
  const calls = message?.toolCalls || [];
  if (!calls.some((call) => call.name === 'render_intelligent_ui' || call.name === 'render_visualization')) return;
  chartsWarmed = true;
  void ensureEcharts().catch(() => { /* the card retries on demand */ });
}

/** Idempotent; call once the app shell is interactive. */
export function preloadRenderRuntime(): void {
  if (scheduled || typeof window === 'undefined' || saveData()) return;
  scheduled = true;
  schedule(() => {
    /* KaTeX is small and every math answer needs it. */
    void ensureKatex().catch(() => { /* lazy retry on the first formula */ });
  });
  window.addEventListener('socrates:chat-runtime-publish', warmChartsOnToolUse);
}
