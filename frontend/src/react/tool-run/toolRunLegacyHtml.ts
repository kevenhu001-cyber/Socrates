/* ── back-compat for HTML baked before this renderer existed ────────────── */

const LEGACY_TOOL_SELECTORS = [
  'details.tool-inline',
  '.tool-run-group',
  '.agent-tool-card',
  '.tool-inline-attachments',
  '.tool-inline-live-slot',
  '.think-tools',
  '.rn-tool-row',
  '.rn-turn-activity',
  '.tool-run-detail-body',
  '.agent-run-host',
];

/**
 * Remove tool-row markup from a stored message.html.
 *
 * Sessions saved before the declarative renderer baked the settled rows'
 * outerHTML straight into html. The new renderer draws those rows from
 * toolCalls[], so the baked copies have to go or every old turn shows its
 * tools twice. Content written after this change carries no tool markup at
 * all. Call this only for stored HTML, never for raw Markdown or code fences.
 *
 * Returns the input untouched when no DOM parser is available: a silently
 * mangled transcript is worse than a duplicated row, and only the browser
 * renders this path.
 */
export function stripLegacyToolHtml(html: string): string {
  const source = String(html || '');
  if (!source || !/tool-inline|tool-run-group|agent-tool-card|think-tools|rn-tool-row|rn-turn-activity|tool-run-detail-body|agent-run-host/.test(source))
    return source;
  return stripStoredMarkup(source, LEGACY_TOOL_SELECTORS);
}

/** The declarative terminal status owns Retry/Resend; stored copies are inert. */
export function stripLegacyTerminalHtml(html: string): string {
  if (!html || !html.includes('msg-error')) return html;
  return stripStoredMarkup(html, ['.msg-error']);
}

function stripStoredMarkup(source: string, selectors: readonly string[]): string {
  const parser = (globalThis as unknown as { DOMParser?: typeof DOMParser }).DOMParser;
  if (typeof parser !== 'function') return source;
  try {
    const doc = new parser().parseFromString(`<body>${source}</body>`, 'text/html');
    const body = doc.body;
    if (!body) return source;
    for (const selector of selectors) {
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

