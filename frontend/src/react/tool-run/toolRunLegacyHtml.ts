import {sortableToolCalls} from './toolRunLayout.ts';
import type {ToolCallRecord} from './toolRunModel.types.ts';

/* ── back-compat for HTML baked before this renderer existed ────────────── */

const LEGACY_TOOL_SELECTORS = [
  'details.tool-inline',
  'section.tool-run-group',
  '.tool-run-group',
  '.agent-tool-card',
  '.tool-inline-attachments',
  '.tool-inline-live-slot',
  '.think-tools',
];

/**
 * Remove tool-row markup from a stored message.html.
 *
 * Sessions saved before the declarative renderer baked the settled rows'
 * outerHTML straight into html. The new renderer draws those rows from
 * toolCalls[], so the baked copies have to go or every old turn shows its
 * tools twice. Content written after this change carries no tool markup at
 * all, so the pass is a no-op on it — that is why it is safe to run on every
 * render rather than gating on a migration flag.
 *
 * Returns the input untouched when no DOM parser is available: a silently
 * mangled transcript is worse than a duplicated row, and only the browser
 * renders this path.
 */
export function stripLegacyToolHtml(html: string): string {
  const source = String(html || '');
  if (!source || !/tool-inline|tool-run-group|agent-tool-card|think-tools/.test(source)) return source;
  const parser = (globalThis as unknown as { DOMParser?: typeof DOMParser }).DOMParser;
  if (typeof parser !== 'function') return source;
  try {
    const doc = new parser().parseFromString(
      `<body>${source}</body>`,
      'text/html',
    );
    const body = doc.body;
    if (!body) return source;
    for (const selector of LEGACY_TOOL_SELECTORS) {
      const nodes = body.querySelectorAll(selector);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    }
    return body.innerHTML;
  } catch (_) {
    return source;
  }
}

/**
 * True when a message needs the declarative turn renderer at all.
 *
 * Only tool rows route: a turn whose sole structure is thinking keeps the
 * legacy `message.html` path, because provider scratch work is never rendered
 * in the finalized answer (renderAssistantHTML strips it) and the live
 * thinking pill owns that surface. Anything else would mean re-rendering prose
 * through a second code path for no visible gain.
 */
export function hasTurnStructure(
  rawText: string,
  toolCalls: ReadonlyArray<ToolCallRecord> | null | undefined,
): boolean {
  return sortableToolCalls(rawText, toolCalls).length > 0;
}
