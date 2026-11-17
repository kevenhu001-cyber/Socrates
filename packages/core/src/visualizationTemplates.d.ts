/** The visualization template vocabulary. Kept as a leaf module so the
 * intelligent-UI validator can read the names without pulling the whole
 * normalizer (and `visualizationMath`) into the boot chunk. */
export declare const VISUALIZATION_TEMPLATES: readonly [
  'function',
  'line',
  'area',
  'bar',
  'scatter',
  'pie',
  'histogram',
  'heatmap',
  'radar',
  'boxplot',
  'flowchart',
  'sequence',
  'state',
  'tree',
  'mindmap',
  'network',
  'timeline',
  'comparison',
  'process',
  'number_line',
  'geometry',
  'concept_map',
  'svg_illustration',
  'interactive_simulation',
  'paper_chart',
  'math_construction',
  'geometry_3d',
  'whiteboard',
];
export type VisualizationTemplate = (typeof VISUALIZATION_TEMPLATES)[number];

export declare const CATEGORY_TEMPLATES: readonly string[];
export declare const GRAPH_TEMPLATES: readonly string[];
