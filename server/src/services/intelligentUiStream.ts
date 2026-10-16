/** Extract only complete direct children of the top-level nodes array.
 * Scans each new character once, including quoted/escaped braces and nested
 * arrays. No speculative JSON repair or execution of incomplete nodes. */
export function createIntelligentUiNodeStream() {
  let previous = '';
  let depth = 0;
  let inString = false;
  let escaped = false;
  let stringStart = 0;
  let topKey = '';
  let keyExpected = true;
  let nodesDepth = 0;
  let nodeStart = -1;
  let closed = false;
  let failed = false;
  const nodes: unknown[] = [];
  return {
    push(text: string): { nodes: unknown[]; failed: boolean } {
      if (failed) return { nodes: [], failed: true };
      if (text.length > 64000 || !text.startsWith(previous)) {
        failed = true;
        return { nodes: [], failed };
      }
      const added: unknown[] = [];
      for (let i = previous.length; i < text.length; i++) {
        const c = text[i];
        if (inString) {
          if (escaped) { escaped = false; continue; }
          if (c === '\\') { escaped = true; continue; }
          if (c === '"') {
            inString = false;
            if (depth === 1 && keyExpected) {
              try { topKey = JSON.parse(text.slice(stringStart, i + 1)); } catch { failed = true; break; }
              keyExpected = false;
            }
          }
          continue;
        }
        if (c === '"') { inString = true; stringStart = i; continue; }
        if (c === ',' && depth === 1) { keyExpected = true; topKey = ''; }
        if (c === '{' || c === '[') {
          if (!closed && c === '[' && depth === 1 && topKey === 'nodes') nodesDepth = depth + 1;
          if (nodesDepth && depth === nodesDepth) {
            if (c !== '{') { failed = true; break; }
            nodeStart = i;
          }
          depth++;
        } else if (c === '}' || c === ']') {
          if (nodeStart >= 0 && c === '}' && depth === nodesDepth + 1) {
            try {
              const node: unknown = JSON.parse(text.slice(nodeStart, i + 1));
              nodes.push(node); added.push(node);
              if (nodes.length > 80) { failed = true; break; }
            } catch { failed = true; break; }
            nodeStart = -1;
          }
          if (c === ']' && depth === nodesDepth) { closed = true; nodesDepth = 0; }
          depth--;
          if (depth < 0) { failed = true; break; }
        } else if (nodesDepth && depth === nodesDepth && !/[\s,]/.test(c)) { failed = true; break; }
      }
      previous = text;
      return { nodes: failed ? [] : added, failed };
    },
  };
}
