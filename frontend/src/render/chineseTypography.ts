import { normalizeChineseProse } from '../util/chineseTypography.ts';

const BLOCKS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'SECTION']);
const VERBATIM = new Set(['PRE', 'CODE', 'KBD', 'SAMP', 'SVG', 'MATH', 'ANNOTATION', 'TEXTAREA']);

/** Work on the already-sanitized fragment. Inline markup shares a paragraph
 * context, so quotes around <strong> and punctuation after code stay paired.
 * Code/math and all attributes are untouched; no extra HTML parse is needed. */
export function normalizeChineseFragment(fragment: DocumentFragment): void {
  let text = '';
  let nodes: Array<{ node: Text; start: number; length: number }> = [];
  function flush(): void {
    const normalized = normalizeChineseProse(text);
    if (normalized !== text) {
      for (const entry of nodes) entry.node.data = normalized.slice(entry.start, entry.start + entry.length);
    }
    text = '';
    nodes = [];
  }
  function visit(node: Node): void {
    if (node.nodeType === 3) {
      const value = (node as Text).data;
      nodes.push({ node: node as Text, start: text.length, length: value.length });
      text += value;
      return;
    }
    if (node.nodeType === 1) {
      const element = node as Element;
      const tag = element.tagName.toUpperCase();
      if (VERBATIM.has(tag) || element.classList.contains('katex') || element.classList.contains('katex-display')) {
        text += '\ufffc';
        return;
      }
      if (tag === 'BR') { text += '\n'; return; }
      if (BLOCKS.has(tag)) {
        flush();
        for (const child of element.childNodes) visit(child);
        flush();
        return;
      }
    }
    for (const child of node.childNodes) visit(child);
  }
  visit(fragment);
  flush();
}
