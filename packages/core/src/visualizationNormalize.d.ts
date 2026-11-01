export declare const VISUALIZATION_TEMPLATES: readonly [
  'function', 'line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap',
  'radar', 'boxplot', 'flowchart', 'sequence', 'state', 'tree', 'mindmap',
  'network', 'timeline', 'comparison', 'process', 'number_line', 'geometry',
  'concept_map', 'svg_illustration', 'interactive_simulation',
  'paper_chart', 'math_construction', 'geometry_3d', 'whiteboard',
];
export type VisualizationTemplate = (typeof VISUALIZATION_TEMPLATES)[number];

/** One point limit for the direct tool, OpenUI programs and prompt text. */
export declare const MAX_VISUALIZATION_POINTS: 5000;
export declare const VISUALIZATION_ITEM_LIMITS: Readonly<Record<'timeline' | 'process' | 'number_line' | 'comparison', readonly [number, number]>>;
export declare const CATEGORY_TEMPLATES: readonly string[];
export declare const GRAPH_TEMPLATES: readonly string[];

/** A finite number, `null` for an explicit gap, or `undefined` when not numeric. */
export declare function coerceNumber(value: unknown): number | null | undefined;

/** Rewrite hand-written expressions (`y = 2x²`, `3sin(x)`) to the parser's syntax. */
export declare function normalizeFunctionExpression(source: unknown): string;

export interface NormalizedVisualization {
  /** The canonical spec; a non-object input is returned unchanged. */
  spec: unknown;
  /** Short English notes about every lossy repair. */
  warnings: string[];
}

/** Normalize an untrusted visualization spec without mutating it. Never throws. */
export declare function normalizeVisualizationSpec(input: unknown): NormalizedVisualization;

/** Header row plus data rows for the "view as table" fallback; [] when none. */
export declare function visualizationTableRows(input: unknown): Array<Array<string | number | null>>;
