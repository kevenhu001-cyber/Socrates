/* Locale-aware, bounded category label formatting for chart axes. */

export interface CategoryAxisOptions {
  maxChars?: number;
  lineChars?: number;
  maxLines?: number;
  rotate?: boolean;
}

export interface CategoryAxisLayout {
  rotate: number;
  bottom: number;
  maxChars: number;
  lineChars: number;
}

function labelLength(value: unknown): number {
  return Array.from(String(value == null ? '' : value)).length;
}

export function truncateLabel(value: unknown, maxChars: number): string {
  const chars = Array.from(String(value == null ? '' : value));
  if (chars.length <= maxChars) return chars.join('');
  return chars.slice(0, Math.max(1, maxChars - 1)).join('') + '…';
}

/* Axis labels need a deterministic text fallback in addition to ECharts'
 * hideOverlap flag—hideOverlap alone can erase most categories when a model
 * submits verbose prose as labels. Short sets wrap to two lines; dense sets
 * rotate and truncate so every remaining tick stays legible. */
export function formatCategoryLabel(value: unknown, options?: CategoryAxisOptions): string {
  const opts = options || {};
  const maxChars = opts.maxChars || 20;
  const lineChars = opts.lineChars || 10;
  const maxLines = opts.maxLines || 2;
  const compact = truncateLabel(value, maxChars);
  if (opts.rotate || labelLength(compact) <= lineChars) return compact;
  const chars = Array.from(compact);
  const lines: string[] = [];
  for (let index = 0; index < chars.length && lines.length < maxLines; index += lineChars) {
    lines.push(chars.slice(index, index + lineChars).join(''));
  }
  return lines.join('\n');
}

export function categoryAxisLayout(categories: unknown): CategoryAxisLayout {
  const list: unknown[] = Array.isArray(categories) ? categories : [];
  const longest = list.reduce(function (max: number, item) { return Math.max(max, labelLength(item)); }, 0);
  const dense = list.length > 10;
  const rotate = dense ? 35 : (list.length > 6 && longest > 18 ? 25 : 0);
  return {
    rotate: rotate,
    bottom: rotate ? 84 : (longest > 10 ? 68 : 46),
    maxChars: dense ? 16 : 24,
    lineChars: dense ? 16 : 12,
  };
}
