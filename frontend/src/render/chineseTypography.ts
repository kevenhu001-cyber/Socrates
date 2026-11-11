/**
 * Direct punctuation rewriting has been removed in favor of model-level
 * typography prompt constraints. The DOM tree is left intact.
 */
export function normalizeChineseFragment(_fragment: DocumentFragment): void {
  // Pass-through: DOM text nodes are preserved verbatim without forceful replacement.
}

