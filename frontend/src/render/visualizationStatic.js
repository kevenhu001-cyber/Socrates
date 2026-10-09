/* Built-in table and SVG structure renderers for native visualization cards. */

function dataRows(spec, translate) {
  var payload = spec.payload || {};
  if (spec.template === 'function') {
    var fns = payload.functions || [];
    if (!fns.length) return [];
    return [[translate('viz.table.function', 'Function'), translate('viz.table.expression', 'Expression'), translate('viz.table.domain', 'Domain')]]
      .concat(fns.map(function (fn) { return [fn.label || fn.expression, fn.expression, fn.domain ? fn.domain.join(' to ') : translate('viz.table.autoDomain', 'Automatic domain')]; }));
  }
  if (!payload.series) {
    var items = payload.items || payload.nodes || [];
    if (!items.length) return [];
    return [[translate('viz.table.item', 'Item'), translate('viz.table.value', 'Value'), translate('viz.table.detail', 'Detail')]]
      .concat(items.map(function (item) { return [item.label, item.value != null ? item.value : '', item.detail || '']; }));
  }
  var rows = [['Category'].concat(payload.series.map(function (series) { return series.name || 'Series'; }))];
  var max = Math.max.apply(null, payload.series.map(function (series) { return series.data.length; }));
  for (var index = 0; index < max; index++) rows.push([payload.categories && payload.categories[index] != null ? payload.categories[index] : index + 1].concat(payload.series.map(function (series) { var value = series.data[index]; return Array.isArray(value) ? value.join(', ') : (value && typeof value === 'object' ? JSON.stringify(value) : value); })));
  return rows;
}

export function renderVisualizationTable(spec, escapeHtml, translate) {
  var rows = dataRows(spec, translate);
  if (!rows.length) return '';
  var header = rows[0], body = rows.slice(1, 121);
  return '<div class="visualization-table-wrap" tabindex="0"><table class="visualization-table"><thead><tr>' + header.map(function (cell) { return '<th>' + escapeHtml(cell) + '</th>'; }).join('') + '</tr></thead><tbody>' + body.map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + escapeHtml(cell) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}

export function renderStructureVisualization(spec, markerId, escapeHtml, fontFamily, truncateLabel) {
  var payload = spec.payload || {}, nodes = payload.nodes || payload.items || [], edges = payload.edges || [];
  var width = 760, height = Math.max(260, 130 + Math.ceil(nodes.length / 3) * 95);
  var positions = {};
  nodes.forEach(function (node, index) { positions[node.id || String(index)] = { x: 110 + (index % 3) * 270, y: 70 + Math.floor(index / 3) * 100 }; });
  /* P_viz-per-instance-marker — every rendered structure diagram
     used to define `<marker id="visual-arrow">` at the SVG root.
     When two diagrams render in the same DOM, the second's
     `marker-end="url(#visual-arrow)"` resolves to the FIRST
     diagram's marker (collision on the global id). Give each
     diagram a per-instance marker id, derived from a monotonically
     increasing counter so re-renders don't collide either. */
  /* P_viz-svg-attrs — inline attributes guarantee the diagram renders
     correctly when exported as a standalone SVG (XMLSerializer) where
     the page's CSS classes are unavailable. text-anchor/dominant-baseline
     center labels inside nodes regardless of external styles. */
  var svg = '<svg class="visualization-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(spec.accessibilitySummary) + '" style="font-family:' + fontFamily + '"><defs><marker id="' + markerId + '" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs>';
  edges.forEach(function (edge) { var a = positions[edge.from], b = positions[edge.to]; if (!a || !b) return; svg += '<path class="visualization-edge" fill="none" stroke="currentColor" stroke-width="1.4" d="M' + (a.x + 75) + ' ' + a.y + ' C' + (a.x + 130) + ' ' + a.y + ', ' + (b.x - 130) + ' ' + b.y + ', ' + (b.x - 75) + ' ' + b.y + '" marker-end="url(#' + markerId + ')"/><text class="visualization-edge-label" text-anchor="middle" dominant-baseline="middle" x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 8) + '">' + escapeHtml(edge.label || '') + '</text>'; });
  nodes.forEach(function (node, index) { var point = positions[node.id || String(index)]; svg += '<g class="visualization-node"><title>' + escapeHtml([node.label, node.detail].filter(Boolean).join(' — ')) + '</title><rect x="' + (point.x - 78) + '" y="' + (point.y - 28) + '" width="156" height="56" rx="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.4"/><text text-anchor="middle" dominant-baseline="middle" x="' + point.x + '" y="' + (point.y - 4) + '">' + escapeHtml(truncateLabel(node.label, 22)) + '</text>' + (node.detail ? '<text class="visualization-node-detail" text-anchor="middle" dominant-baseline="middle" x="' + point.x + '" y="' + (point.y + 15) + '">' + escapeHtml(truncateLabel(node.detail, 28)) + '</text>' : '') + '</g>'; });
  return svg + '</svg>';
}
