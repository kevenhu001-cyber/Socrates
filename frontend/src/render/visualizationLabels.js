/* Locale-aware, bounded category label formatting for chart axes. */

function labelLength(value) {
  return Array.from(String(value == null ? '' : value)).length;
}

export function truncateLabel(value, maxChars) {
  var chars = Array.from(String(value == null ? '' : value));
  if (chars.length <= maxChars) return chars.join('');
  return chars.slice(0, Math.max(1, maxChars - 1)).join('') + '…';
}

/* Axis labels need a deterministic text fallback in addition to ECharts'
 * hideOverlap flag—hideOverlap alone can erase most categories when a model
 * submits verbose prose as labels. Short sets wrap to two lines; dense sets
 * rotate and truncate so every remaining tick stays legible. */
export function formatCategoryLabel(value, options) {
  options = options || {};
  var maxChars = options.maxChars || 20;
  var lineChars = options.lineChars || 10;
  var maxLines = options.maxLines || 2;
  var compact = truncateLabel(value, maxChars);
  if (options.rotate || labelLength(compact) <= lineChars) return compact;
  var chars = Array.from(compact);
  var lines = [];
  for (var index = 0; index < chars.length && lines.length < maxLines; index += lineChars) {
    lines.push(chars.slice(index, index + lineChars).join(''));
  }
  return lines.join('\n');
}

export function categoryAxisLayout(categories) {
  categories = Array.isArray(categories) ? categories : [];
  var longest = categories.reduce(function (max, item) { return Math.max(max, labelLength(item)); }, 0);
  var dense = categories.length > 10;
  var rotate = dense ? 35 : (categories.length > 6 && longest > 18 ? 25 : 0);
  return {
    rotate: rotate,
    bottom: rotate ? 84 : (longest > 10 ? 68 : 46),
    maxChars: dense ? 16 : 24,
    lineChars: dense ? 16 : 12,
  };
}

