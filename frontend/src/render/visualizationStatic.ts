/* Built-in table and SVG structure renderers for native visualization cards. */
import type { VizItem, VizNode, VizShape, VizSpec } from './visualizationSpec.ts';

type EscapeHtml = (value: unknown) => string;
type Translate = (key: string, fallback?: string) => string;
type TruncateLabel = (value: unknown, maxChars: number) => string;

interface Point {
  x: number;
  y: number;
}

/** A node without an explicit id still needs a stable key for positions. */
function nodeIdOf(node: VizNode, index: number): string {
  return node.id || String(index);
}

/** The coordinates a shape renders at, whatever its kind. */
function shapeCoordinates(shape: VizShape): unknown {
  if (shape.type === 'point') return shape.at;
  if (shape.type === 'segment') return shape.from;
  if (shape.type === 'circle') return shape.center;
  return shape.points;
}

function dataRows(spec: VizSpec, translate: Translate): unknown[][] {
  const payload = spec.payload || {};
  if (spec.template === 'function') {
    const fns = payload.functions || [];
    if (!fns.length) return [];
    return [
      [translate('viz.table.function', 'Function'), translate('viz.table.expression', 'Expression'), translate('viz.table.domain', 'Domain')],
      ...fns.map(function (fn): unknown[] {
        return [fn.label || fn.expression, fn.expression, fn.domain ? fn.domain.join(' to ') : translate('viz.table.autoDomain', 'Automatic domain')];
      }),
    ];
  }
  if (spec.template === 'heatmap') {
    return [
      [translate('viz.table.category', 'Category'), ...(payload.xCategories || [])],
      ...(payload.yCategories || []).map(function (label, index): unknown[] {
        return [label, ...((payload.values || [])[index] || [])];
      }),
    ];
  }
  if (spec.template === 'radar') {
    return [
      [translate('viz.table.indicator', 'Indicator'), ...(payload.series || []).map(function (series) { return series.name || translate('viz.table.series', 'Series'); })],
      ...(payload.indicators || []).map(function (indicator, index): unknown[] {
        return [indicator.name, ...(payload.series || []).map(function (series) { return series.data[index]; })];
      }),
    ];
  }
  if (spec.template === 'geometry') {
    return [
      [translate('viz.table.shape', 'Shape'), translate('viz.table.label', 'Label'), translate('viz.table.coordinates', 'Coordinates')],
      ...(payload.shapes || []).map(function (shape): unknown[] {
        return [shape.type, shape.label || '', JSON.stringify(shapeCoordinates(shape) || [])];
      }),
    ];
  }
  if (!payload.series) {
    const items = payload.items || payload.nodes || [];
    if (!items.length) return [];
    return [
      [translate('viz.table.item', 'Item'), translate('viz.table.value', 'Value'), translate('viz.table.detail', 'Detail')],
      ...items.map(function (item): unknown[] {
        return [item.label, item.value != null ? item.value : '', item.detail || ''];
      }),
    ];
  }
  const series = payload.series;
  const rows: unknown[][] = [['Category', ...series.map(function (entry) { return entry.name || 'Series'; })]];
  const max = Math.max.apply(null, series.map(function (entry) { return entry.data.length; }));
  for (let index = 0; index < max; index++) {
    rows.push([
      payload.categories && payload.categories[index] != null ? payload.categories[index] : index + 1,
      ...series.map(function (entry) {
        const value = entry.data[index];
        return Array.isArray(value) ? value.join(', ') : (value && typeof value === 'object' ? JSON.stringify(value) : value);
      }),
    ]);
  }
  return rows;
}

export function renderVisualizationTable(spec: VizSpec, escapeHtml: EscapeHtml, translate: Translate): string {
  const rows = dataRows(spec, translate);
  if (!rows.length) return '';
  const header = rows[0], body = rows.slice(1, 121);
  return '<div class="visualization-table-wrap" tabindex="0"><table class="visualization-table"><thead><tr>' + header.map(function (cell) { return '<th>' + escapeHtml(cell) + '</th>'; }).join('') + '</tr></thead><tbody>' + body.map(function (row) { return '<tr>' + row.map(function (cell) { return '<td>' + escapeHtml(cell) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
}

export function renderStructureVisualization(
  spec: VizSpec,
  markerId: string,
  escapeHtml: EscapeHtml,
  fontFamily: string,
  truncateLabel: TruncateLabel,
): string {
  const payload = spec.payload || {};
  const nodes: VizNode[] = payload.nodes || payload.items || [];
  const edges = payload.edges || [];
  const isHierarchy = spec.template === 'tree' || spec.template === 'mindmap';
  const width = 760;
  let height = Math.max(260, 130 + Math.ceil(nodes.length / 3) * 95);
  const positions: Record<string, Point> = {};
  if (isHierarchy) {
    const children = new Map<string, string[]>();
    nodes.forEach(function (node, index) { children.set(nodeIdOf(node, index), []); });
    const childIds = new Set<string>();
    edges.forEach(function (edge) {
      if (children.has(edge.from) && children.has(edge.to)) {
        children.get(edge.from)?.push(edge.to);
        childIds.add(edge.to);
      }
    });
    const levels: string[][] = [];
    let current = nodes
      .filter(function (node, index) { return !childIds.has(nodeIdOf(node, index)); })
      .map(function (node, index) { return nodeIdOf(node, index); });
    const visited = new Set<string>();
    while (current.length) {
      levels.push(current);
      current.forEach(function (id) { visited.add(id); });
      current = current.flatMap(function (id) { return children.get(id) || []; }).filter(function (id) { return !visited.has(id); });
    }
    nodes.forEach(function (node, index) {
      const id = nodeIdOf(node, index);
      if (!visited.has(id)) {
        if (!levels.length) levels.push([]);
        levels[levels.length - 1].push(id);
      }
    });
    height = Math.max(260, 105 + levels.length * 112);
    levels.forEach(function (level, depth) {
      level.forEach(function (id, index) {
        positions[id] = { x: (index + 1) * width / (level.length + 1), y: 62 + depth * 112 };
      });
    });
  } else {
    nodes.forEach(function (node, index) { positions[nodeIdOf(node, index)] = { x: 110 + (index % 3) * 270, y: 70 + Math.floor(index / 3) * 100 }; });
  }
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
  let svg = '<svg class="visualization-diagram" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(spec.accessibilitySummary) + '" style="font-family:' + fontFamily + '"><defs><marker id="' + markerId + '" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs>';
  edges.forEach(function (edge) {
    const a = positions[edge.from], b = positions[edge.to];
    if (!a || !b) return;
    const startX = isHierarchy ? a.x : a.x + 75, endX = isHierarchy ? b.x : b.x - 75;
    const d = isHierarchy
      ? 'M' + startX + ' ' + (a.y + 28) + ' C' + startX + ' ' + ((a.y + b.y) / 2) + ', ' + endX + ' ' + ((a.y + b.y) / 2) + ', ' + endX + ' ' + (b.y - 28)
      : 'M' + startX + ' ' + a.y + ' C' + (a.x + 130) + ' ' + a.y + ', ' + (b.x - 130) + ' ' + b.y + ', ' + endX + ' ' + b.y;
    svg += '<path class="visualization-edge" fill="none" stroke="currentColor" stroke-width="1.4" d="' + d + '" marker-end="url(#' + markerId + ')"/><text class="visualization-edge-label" text-anchor="middle" dominant-baseline="middle" x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 8) + '">' + escapeHtml(edge.label || '') + '</text>';
  });
  nodes.forEach(function (node, index) {
    const point = positions[nodeIdOf(node, index)];
    svg += '<g class="visualization-node"><title>' + escapeHtml([node.label, node.detail].filter(Boolean).join(' — ')) + '</title><rect x="' + (point.x - 78) + '" y="' + (point.y - 28) + '" width="156" height="56" rx="10" fill="currentColor" fill-opacity="0.06" stroke="currentColor" stroke-opacity="0.22" stroke-width="1.4"/><text text-anchor="middle" dominant-baseline="middle" x="' + point.x + '" y="' + (point.y - 4) + '">' + escapeHtml(truncateLabel(node.label, 22)) + '</text>' + (node.detail ? '<text class="visualization-node-detail" text-anchor="middle" dominant-baseline="middle" x="' + point.x + '" y="' + (point.y + 15) + '">' + escapeHtml(truncateLabel(node.detail, 28)) + '</text>' : '') + '</g>';
  });
  return svg + '</svg>';
}

function svgStart(spec: VizSpec, width: number, height: number, escapeHtml: EscapeHtml, fontFamily: string, className: string): string {
  return '<svg class="visualization-diagram ' + className + '" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + escapeHtml(spec.accessibilitySummary) + '" style="font-family:' + fontFamily + '">';
}

export function renderTimelineVisualization(spec: VizSpec, escapeHtml: EscapeHtml, fontFamily: string, truncateLabel: TruncateLabel): string {
  const items: VizItem[] = spec.payload.items || [];
  const width = 760, height = 260, axisY = 130;
  const left = 48, right = width - 48, gap = items.length > 1 ? (right - left) / (items.length - 1) : 0;
  let svg = svgStart(spec, width, height, escapeHtml, fontFamily, 'visualization-timeline');
  svg += '<path class="visualization-edge" d="M' + left + ' ' + axisY + ' H' + right + '"/>';
  items.forEach(function (item, index) {
    const x = items.length === 1 ? width / 2 : left + index * gap;
    const top = index % 2 === 0, markerY = top ? axisY - 23 : axisY + 23;
    const textY = top ? 48 : 204;
    const title = [item.value, item.label, item.detail].filter(Boolean).join(' — ');
    svg += '<g class="visualization-node"><title>' + escapeHtml(title) + '</title><circle cx="' + x + '" cy="' + markerY + '" r="7" fill="currentColor"/><path class="visualization-edge" d="M' + x + ' ' + markerY + ' V' + axisY + '"/><text text-anchor="middle" x="' + x + '" y="' + textY + '">' + escapeHtml(truncateLabel(item.label, items.length > 6 ? 14 : 22)) + '</text>';
    if (item.value != null) svg += '<text class="visualization-node-detail" text-anchor="middle" x="' + x + '" y="' + (textY + 18) + '">' + escapeHtml(truncateLabel(item.value, 18)) + '</text>';
    svg += '</g>';
  });
  return svg + '</svg>';
}

export function renderProcessVisualization(spec: VizSpec, markerId: string, escapeHtml: EscapeHtml, fontFamily: string, truncateLabel: TruncateLabel): string {
  const items: VizItem[] = spec.payload.items || [];
  const columns = Math.min(4, Math.ceil(Math.sqrt(items.length * 1.5)));
  const rows = Math.ceil(items.length / columns), width = 760, cellW = width / columns, cellH = 112, height = rows * cellH + 24;
  const positions: Point[] = items.map(function (_, index) {
    const row = Math.floor(index / columns);
    let col = index % columns;
    if (row % 2 === 1) col = columns - col - 1;
    return { x: col * cellW + cellW / 2, y: row * cellH + 60 };
  });
  let svg = svgStart(spec, width, height, escapeHtml, fontFamily, 'visualization-process')
    + '<defs><marker id="' + markerId + '" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="currentColor"/></marker></defs>';
  items.slice(0, -1).forEach(function (_, index) {
    const from = positions[index], to = positions[index + 1];
    const sameRow = Math.floor(index / columns) === Math.floor((index + 1) / columns);
    const x1 = sameRow ? from.x + (to.x > from.x ? 76 : -76) : from.x;
    const y1 = sameRow ? from.y : from.y + 30;
    const x2 = sameRow ? to.x - (to.x > from.x ? 76 : -76) : to.x;
    const y2 = sameRow ? to.y : to.y - 30;
    const path = sameRow
      ? 'M' + x1 + ' ' + y1 + ' L' + x2 + ' ' + y2
      : 'M' + x1 + ' ' + y1 + ' C' + (x1 + 36) + ' ' + ((y1 + y2) / 2) + ', ' + (x2 - 36) + ' ' + ((y1 + y2) / 2) + ', ' + x2 + ' ' + y2;
    svg += '<path class="visualization-edge" d="' + path + '" marker-end="url(#' + markerId + ')"/>';
  });
  items.forEach(function (item, index) {
    const point = positions[index], title = [item.label, item.detail].filter(Boolean).join(' — ');
    svg += '<g class="visualization-node"><title>' + escapeHtml(title) + '</title><rect x="' + (point.x - 76) + '" y="' + (point.y - 29) + '" width="152" height="58" rx="11" fill="currentColor" fill-opacity=".06" stroke="currentColor" stroke-opacity=".24"/><circle cx="' + (point.x - 60) + '" cy="' + (point.y - 14) + '" r="10" fill="currentColor"/><text style="fill:white" font-size="10" x="' + (point.x - 60) + '" y="' + (point.y - 10) + '" text-anchor="middle">' + (index + 1) + '</text><text dominant-baseline="middle" x="' + (point.x + 4) + '" y="' + (point.y - 5) + '">' + escapeHtml(truncateLabel(item.label, 18)) + '</text>' + (item.detail ? '<text class="visualization-node-detail" text-anchor="middle" x="' + point.x + '" y="' + (point.y + 18) + '">' + escapeHtml(truncateLabel(item.detail, 22)) + '</text>' : '') + '</g>';
  });
  return svg + '</svg>';
}

export function renderComparisonVisualization(spec: VizSpec, escapeHtml: EscapeHtml, fontFamily: string, truncateLabel: TruncateLabel): string {
  const items: VizItem[] = spec.payload.items || [];
  const width = 760, columns = Math.min(4, items.length), rows = Math.ceil(items.length / columns);
  const cellW = width / columns, cellH = 154, height = rows * cellH + 12;
  let svg = svgStart(spec, width, height, escapeHtml, fontFamily, 'visualization-comparison');
  items.forEach(function (item, index) {
    const x = index % columns * cellW + 8, y = Math.floor(index / columns) * cellH + 8;
    const title = [item.label, item.value, item.detail].filter(Boolean).join(' — ');
    svg += '<g class="visualization-node"><title>' + escapeHtml(title) + '</title><rect x="' + x + '" y="' + y + '" width="' + (cellW - 16) + '" height="138" rx="12" fill="currentColor" fill-opacity=".045" stroke="currentColor" stroke-opacity=".2"/><text text-anchor="middle" x="' + (x + (cellW - 16) / 2) + '" y="' + (y + 31) + '">' + escapeHtml(truncateLabel(item.label, columns > 2 ? 16 : 24)) + '</text>' + (item.value != null ? '<text text-anchor="middle" x="' + (x + (cellW - 16) / 2) + '" y="' + (y + 68) + '" font-size="16" font-weight="700" fill="currentColor">' + escapeHtml(truncateLabel(item.value, 20)) + '</text>' : '') + (item.detail ? '<text class="visualization-node-detail" text-anchor="middle" x="' + (x + (cellW - 16) / 2) + '" y="' + (y + 103) + '">' + escapeHtml(truncateLabel(item.detail, columns > 2 ? 22 : 34)) + '</text>' : '') + '</g>';
  });
  return svg + '</svg>';
}

export function renderNumberLineVisualization(spec: VizSpec, escapeHtml: EscapeHtml, fontFamily: string, truncateLabel: TruncateLabel): string {
  const items: VizItem[] = (spec.payload.items || []).slice().sort(function (a, b) { return Number(a.value) - Number(b.value); });
  const values = items.map(function (item) { return Number(item.value); });
  let min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  const spread = max - min || 2;
  min -= spread * .12; max += spread * .12;
  const width = 760, height = 260, left = 52, right = width - 52, axisY = 128;
  const xAt = function (value: number): number { return left + (value - min) / (max - min) * (right - left); };
  let svg = svgStart(spec, width, height, escapeHtml, fontFamily, 'visualization-number-line') + '<path class="visualization-edge" d="M' + left + ' ' + axisY + ' H' + right + '"/>';
  interface LaneEntry { item: VizItem; pointX: number; labelX: number }
  const laneItems: LaneEntry[][] = [[], [], [], []];
  items.forEach(function (item, index) { laneItems[index % 4].push({ item: item, pointX: xAt(Number(item.value)), labelX: xAt(Number(item.value)) }); });
  laneItems.forEach(function (lane) {
    lane.sort(function (a, b) { return a.labelX - b.labelX; });
    for (let i = 1; i < lane.length; i++) lane[i].labelX = Math.max(lane[i].labelX, lane[i - 1].labelX + 112);
    for (let j = lane.length - 1; j >= 0; j--) {
      const maxX = right - 20 - (lane.length - 1 - j) * 112;
      lane[j].labelX = Math.min(lane[j].labelX, maxX);
    }
    for (let k = 1; k < lane.length; k++) lane[k].labelX = Math.max(lane[k].labelX, lane[k - 1].labelX + 112);
  });
  const layout = new Map<VizItem, { pointX: number; labelX: number; lane: number }>();
  laneItems.forEach(function (lane, laneIndex) {
    lane.forEach(function (entry) { layout.set(entry.item, { pointX: entry.pointX, labelX: entry.labelX, lane: laneIndex }); });
  });
  items.forEach(function (item) {
    const point = layout.get(item);
    if (!point) return;
    const top = point.lane < 2;
    const labelY = [42, 78, 184, 220][point.lane];
    const lineY = top ? labelY + 26 : labelY - 12;
    svg += '<g class="visualization-node"><title>' + escapeHtml(item.label + ': ' + item.value) + '</title><path d="M' + point.pointX + ' ' + (axisY - 8) + ' V' + (axisY + 8) + '" stroke="currentColor" stroke-width="2"/><circle cx="' + point.pointX + '" cy="' + axisY + '" r="5" fill="currentColor"/><text text-anchor="middle" x="' + point.labelX + '" y="' + labelY + '">' + escapeHtml(truncateLabel(item.label, 14)) + '</text><text class="visualization-node-detail" text-anchor="middle" x="' + point.labelX + '" y="' + (top ? labelY + 18 : labelY + 17) + '">' + escapeHtml(Number(item.value).toPrecision(5).replace(/\.?(?:0+)$/, '')) + '</text><path class="visualization-edge" d="M' + point.pointX + ' ' + (top ? axisY - 8 : axisY + 8) + ' L' + point.labelX + ' ' + lineY + '"/></g>';
  });
  return svg + '</svg>';
}

export function renderGeometryVisualization(spec: VizSpec, escapeHtml: EscapeHtml, fontFamily: string, truncateLabel: TruncateLabel): string {
  const shapes: VizShape[] = spec.payload.shapes || [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  function include(x: number, y: number): void { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
  shapes.forEach(function (shape) {
    const at = shape.at || [], from = shape.from || [], to = shape.to || [];
    const center = shape.center || [], points = shape.points || [];
    const radius = shape.radius || 0;
    if (shape.type === 'point') include(at[0], at[1]);
    else if (shape.type === 'segment') { include(from[0], from[1]); include(to[0], to[1]); }
    else if (shape.type === 'circle') { include(center[0] - radius, center[1] - radius); include(center[0] + radius, center[1] + radius); }
    else points.forEach(function (point) { include(point[0], point[1]); });
  });
  const width = 760, height = 360, plotW = width - 90, plotH = height - 70;
  const spanX = maxX - minX || 2, spanY = maxY - minY || 2;
  const scale = Math.min(plotW / spanX, plotH / spanY);
  const centerX = (minX + maxX) / 2, centerY = (minY + maxY) / 2;
  const px = function (x: number): number { return width / 2 + (x - centerX) * scale; };
  const py = function (y: number): number { return height / 2 - (y - centerY) * scale; };
  let svg = svgStart(spec, width, height, escapeHtml, fontFamily, 'visualization-geometry');
  const zeroX = px(0), zeroY = py(0);
  if (zeroY >= 24 && zeroY <= height - 24) svg += '<path class="visualization-edge" d="M36 ' + zeroY + ' H' + (width - 26) + '"/>';
  if (zeroX >= 36 && zeroX <= width - 26) svg += '<path class="visualization-edge" d="M' + zeroX + ' ' + (height - 28) + ' V24"/>';
  shapes.forEach(function (shape) {
    const at = shape.at || [], from = shape.from || [], to = shape.to || [];
    const center = shape.center || [], points = shape.points || [];
    const radius = shape.radius || 0;
    const centroidX = points.length ? points.reduce(function (sum, point) { return sum + point[0]; }, 0) / points.length : 0;
    const centroidY = points.length ? points.reduce(function (sum, point) { return sum + point[1]; }, 0) / points.length : 0;
    const labelX = shape.type === 'point' ? px(at[0])
      : shape.type === 'circle' ? px(center[0])
        : shape.type === 'segment' ? (px(from[0]) + px(to[0])) / 2
          : px(centroidX);
    const labelY = shape.type === 'point' ? py(at[1]) - 12
      : shape.type === 'circle' ? py(center[1]) - radius * scale - 8
        : shape.type === 'segment' ? (py(from[1]) + py(to[1])) / 2 - 8
          : py(centroidY) - 8;
    const label = shape.label
      ? '<text class="visualization-node-detail" text-anchor="middle" x="' + labelX + '" y="' + labelY + '">' + escapeHtml(truncateLabel(shape.label, 20)) + '</text>'
      : '';
    if (shape.type === 'point') svg += '<g class="visualization-node"><circle cx="' + px(at[0]) + '" cy="' + py(at[1]) + '" r="5" fill="currentColor"/>' + label + '</g>';
    else if (shape.type === 'segment') svg += '<g class="visualization-node"><path class="visualization-edge" d="M' + px(from[0]) + ' ' + py(from[1]) + ' L' + px(to[0]) + ' ' + py(to[1]) + '" stroke-width="2"/>' + label + '</g>';
    else if (shape.type === 'circle') svg += '<g class="visualization-node"><circle cx="' + px(center[0]) + '" cy="' + py(center[1]) + '" r="' + (radius * scale) + '" fill="currentColor" fill-opacity=".05" stroke="currentColor" stroke-width="2"/>' + label + '</g>';
    else svg += '<g class="visualization-node"><polygon points="' + points.map(function (point) { return px(point[0]) + ',' + py(point[1]); }).join(' ') + '" fill="currentColor" fill-opacity=".07" stroke="currentColor" stroke-width="2"/>' + label + '</g>';
  });
  return svg + '</svg>';
}

export function renderSemanticVisualization(
  spec: VizSpec,
  markerId: string,
  escapeHtml: EscapeHtml,
  fontFamily: string,
  truncateLabel: TruncateLabel,
): string | null {
  if (spec.template === 'timeline') return renderTimelineVisualization(spec, escapeHtml, fontFamily, truncateLabel);
  if (spec.template === 'process') return renderProcessVisualization(spec, markerId, escapeHtml, fontFamily, truncateLabel);
  if (spec.template === 'comparison') return renderComparisonVisualization(spec, escapeHtml, fontFamily, truncateLabel);
  if (spec.template === 'number_line') return renderNumberLineVisualization(spec, escapeHtml, fontFamily, truncateLabel);
  if (spec.template === 'geometry') return renderGeometryVisualization(spec, escapeHtml, fontFamily, truncateLabel);
  if (spec.template === 'tree' || spec.template === 'mindmap') return renderStructureVisualization(spec, markerId, escapeHtml, fontFamily, truncateLabel);
  return null;
}
