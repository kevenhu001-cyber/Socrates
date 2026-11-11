/* Which engine draws a visualization template. Kept DOM-free and tiny so the
 * OpenUI streaming skeleton can reserve the same stage height as the card the
 * engine will mount, without loading the engine module itself. */

export type VisualizationRendererKind =
  | 'echarts'
  | 'plotly'
  | 'three'
  | 'geogebra'
  | 'tldraw'
  | 'mermaid'
  | 'semantic'
  | 'extension';

export const CHART_TEMPLATES: readonly string[] = ['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot'];
export const EXTENSION_TEMPLATES: readonly string[] = ['svg_illustration', 'interactive_simulation'];
export const STRUCTURE_TEMPLATES: ReadonlySet<string> = new Set(['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map']);

export function visualizationRendererKind(template: unknown): VisualizationRendererKind {
  const name = typeof template === 'string' ? template : '';
  if (name === 'function' || name === 'paper_chart') return 'plotly';
  if (name === 'geometry_3d') return 'three';
  if (name === 'math_construction') return 'geogebra';
  if (name === 'whiteboard') return 'tldraw';
  if (STRUCTURE_TEMPLATES.has(name)) return 'mermaid';
  if (CHART_TEMPLATES.includes(name)) return 'echarts';
  if (EXTENSION_TEMPLATES.includes(name)) return 'extension';
  return 'semantic';
}

/* ECharts draws with SVG, which stays sharp at every zoom and pixel ratio.
 * Canvas is kept only where SVG node counts would hurt: long series, and
 * heatmaps with more cells than a reader can tell apart anyway. */
export const SVG_SERIES_POINT_LIMIT = 1200;
export const SVG_HEATMAP_CELL_LIMIT = 2500;

export function chartPrefersCanvas(template: string, payload: Record<string, unknown> | null | undefined): boolean {
  // Formula labels need SVG DOM anchors for the shared LaTeX overlay.
  // Canvas has no text nodes to typeset, even when a series is large.
  if (/\$|\\[([]/.test(JSON.stringify(payload ?? {}))) return false;
  if (template === 'heatmap') {
    const values = payload?.values;
    const cells = Array.isArray(values)
      ? values.reduce((sum: number, row) => sum + (Array.isArray(row) ? row.length : 1), 0)
      : 0;
    return cells > SVG_HEATMAP_CELL_LIMIT;
  }
  const series = payload?.series;
  return Array.isArray(series) && series.some((entry) => {
    const data = (entry as { data?: unknown } | null)?.data;
    return Array.isArray(data) && data.length > SVG_SERIES_POINT_LIMIT;
  });
}
