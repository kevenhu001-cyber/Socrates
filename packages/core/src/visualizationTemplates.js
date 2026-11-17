/* visualizationTemplates.js — the template vocabulary, and nothing else.
 *
 * `intelligentUiValidation.js` needs exactly one thing from the visualization
 * layer: the list of template names a `visualization` node may carry. It used
 * to import `VISUALIZATION_TEMPLATES` from `visualizationNormalize.js`, which
 * statically pulls the whole 40 KB normalizer plus `visualizationMath.js` into
 * whatever chunk imports the validator — including the boot chunk, because
 * `turnRuntime.js` → `intelligentUiValidation.js` runs on the save path.
 *
 * Keeping the name list in its own leaf module lets the validator stay cheap
 * while the normalizer keeps re-exporting the same array for its own callers,
 * so there is still one source of truth for the vocabulary.
 */

export const VISUALIZATION_TEMPLATES = [
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

export const CATEGORY_TEMPLATES = [
  'line',
  'area',
  'bar',
  'pie',
  'histogram',
  'radar',
  'boxplot',
  'paper_chart',
];
export const GRAPH_TEMPLATES = [
  'flowchart',
  'sequence',
  'state',
  'tree',
  'mindmap',
  'network',
  'concept_map',
];
