import { z } from 'zod';

import { MAX_TOOL_STRING_FIELD_CHARS } from './tools/toolCallSafety.js';
import { parseFunctionExpression, sampleFunction } from '@socrates/core/visualizationMath';

/**
 * The visual tool deliberately accepts content, not presentation.  Palette,
 * typography, layout and renderer selection are owned by the client so every
 * generated card remains recognisably Socrates.
 */
export const VISUALIZATION_TEMPLATES = [
  'function', 'line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap',
  'radar', 'boxplot', 'flowchart', 'sequence', 'state', 'tree', 'mindmap',
  'network', 'timeline', 'comparison', 'process', 'number_line', 'geometry',
  'concept_map', 'svg_illustration', 'interactive_simulation',
  'paper_chart', 'math_construction', 'geometry_3d', 'whiteboard',
] as const;

const finiteNumber = z.number().finite();
const categorySchema = z.union([z.string().min(1).max(120), finiteNumber]);
const seriesHeader = {
  name: z.string().min(1).max(80).optional(),
  role: z.enum(['primary', 'secondary', 'comparison', 'highlight', 'baseline']).optional(),
};
const numericSeriesSchema = z.object({
  ...seriesHeader,
  data: z.array(finiteNumber).min(1).max(5000),
}).passthrough();
const scatterPointSchema = z.union([
  z.tuple([finiteNumber, finiteNumber]),
  z.object({ x: finiteNumber, y: finiteNumber }).passthrough(),
]);
const scatterSeriesSchema = z.object({
  ...seriesHeader,
  data: z.array(scatterPointSchema).min(1).max(5000),
}).passthrough();
const nodeSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_]{1,80}$/),
  label: z.string().min(1).max(160),
  role: z.string().max(40).optional(),
  detail: z.string().max(500).optional(),
}).passthrough();
const edgeSchema = z.object({
  from: z.string().min(1).max(80),
  to: z.string().min(1).max(80),
  label: z.string().max(120).optional(),
  role: z.string().max(40).optional(),
}).passthrough();

const functionPayload = z.object({
  mode: z.enum(['cartesian']).default('cartesian'),
  functions: z.array(z.object({
    expression: z.string().min(1).max(300),
    label: z.string().min(1).max(80).optional(),
    domain: z.tuple([finiteNumber, finiteNumber]).optional(),
    role: z.enum(['primary', 'secondary', 'comparison', 'highlight', 'baseline']).optional(),
  })).min(1).max(20),
  xLabel: z.string().max(80).optional(),
  yLabel: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const categoryChartPayload = z.object({
  categories: z.array(categorySchema).min(1).max(5000).optional(),
  series: z.array(numericSeriesSchema).min(1).max(20),
  xLabel: z.string().max(80).optional(),
  yLabel: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const piePayload = z.object({
  categories: z.array(categorySchema).min(1).max(100),
  series: z.array(numericSeriesSchema).length(1),
  description: z.string().max(800).optional(),
}).passthrough();

const scatterPayload = z.object({
  series: z.array(scatterSeriesSchema).min(1).max(20),
  xLabel: z.string().max(80).optional(),
  yLabel: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const heatmapPayload = z.object({
  xCategories: z.array(categorySchema).min(1).max(200),
  yCategories: z.array(categorySchema).min(1).max(200),
  values: z.array(z.array(finiteNumber).min(1).max(200)).min(1).max(200),
  description: z.string().max(800).optional(),
}).passthrough();

const radarPayload = z.object({
  indicators: z.array(z.object({ name: z.string().min(1).max(80), max: finiteNumber.positive().optional() })).min(3).max(24),
  series: z.array(numericSeriesSchema).min(1).max(8),
  description: z.string().max(800).optional(),
}).passthrough();

const boxplotSeriesSchema = z.object({
  ...seriesHeader,
  data: z.array(z.tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber, finiteNumber])).min(1).max(5000),
}).passthrough();
const boxplotPayload = z.object({
  categories: z.array(categorySchema).min(1).max(5000),
  series: z.array(boxplotSeriesSchema).min(1).max(20),
  description: z.string().max(800).optional(),
}).passthrough();

const paperChartSeriesSchema = numericSeriesSchema.extend({
  kind: z.enum(['line', 'bar', 'scatter']).optional(),
});
const paperChartPayload = z.object({
  categories: z.array(categorySchema).min(1).max(5000).optional(),
  series: z.array(paperChartSeriesSchema).min(1).max(20),
  xLabel: z.string().max(80).optional(),
  yLabel: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const graphPayload = z.object({
  nodes: z.array(nodeSchema).min(1).max(200),
  edges: z.array(edgeSchema).max(400),
  direction: z.enum(['horizontal', 'vertical']).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const teachingPayload = z.object({
  items: z.array(z.object({
    label: z.string().min(1).max(160),
    detail: z.string().max(500).optional(),
    value: z.union([finiteNumber, z.string().max(120)]).optional(),
    role: z.string().max(40).optional(),
  }).passthrough()).max(200).optional(),
  nodes: z.array(nodeSchema).max(200).optional(),
  edges: z.array(edgeSchema).max(400).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const coordinateSchema = z.tuple([finiteNumber, finiteNumber]);
const geometryShapeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('point'), at: coordinateSchema, label: z.string().max(120).optional() }),
  z.object({ type: z.literal('segment'), from: coordinateSchema, to: coordinateSchema, label: z.string().max(120).optional() }),
  z.object({ type: z.literal('circle'), center: coordinateSchema, radius: finiteNumber.positive(), label: z.string().max(120).optional() }),
  z.object({ type: z.literal('polygon'), points: z.array(coordinateSchema).min(3).max(32), label: z.string().max(120).optional() }),
]);
const geometryPayload = z.object({
  shapes: z.array(geometryShapeSchema).min(1).max(80),
  description: z.string().max(800).optional(),
}).passthrough();

const extensionPayload = z.object({
  /* Capped by the transport, not by taste: an argument object larger than
     MAX_TOOL_ARGUMENT_CHARS is truncated before it reaches this validator,
     so promising 100 KB here guaranteed an unparseable call. */
  source: z.string().min(1).max(MAX_TOOL_STRING_FIELD_CHARS),
  description: z.string().max(800).optional(),
}).passthrough();

const mathConstructionPayload = z.object({
  appName: z.enum(['geometry', 'graphing', '3d']).optional(),
  commands: z.array(z.string().min(1).max(500)).min(1).max(80),
  description: z.string().max(800).optional(),
}).passthrough();

const geometry3dPayload = z.object({
  objects: z.array(z.object({
    type: z.enum(['box', 'sphere', 'cylinder', 'cone']),
    position: z.tuple([finiteNumber, finiteNumber, finiteNumber]).optional(),
    size: z.tuple([finiteNumber, finiteNumber, finiteNumber]).optional(),
    label: z.string().max(120).optional(),
  }).passthrough()).min(1).max(80),
  description: z.string().max(800).optional(),
}).passthrough();

const envelope = z.object({
  version: z.literal(1),
  template: z.enum(VISUALIZATION_TEMPLATES),
  title: z.string().min(1).max(120),
  caption: z.string().max(500).optional(),
  accessibilitySummary: z.string().min(1).max(800),
  payload: z.unknown(),
}).strict();

function schemaFor(template: string): z.ZodTypeAny {
  if (template === 'function') return functionPayload;
  if (['line', 'area', 'bar', 'histogram'].includes(template)) return categoryChartPayload;
  if (template === 'pie') return piePayload;
  if (template === 'scatter') return scatterPayload;
  if (template === 'heatmap') return heatmapPayload;
  if (template === 'radar') return radarPayload;
  if (template === 'boxplot') return boxplotPayload;
  if (template === 'paper_chart') return paperChartPayload;
  if (['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'].includes(template)) return graphPayload;
  if (template === 'math_construction') return mathConstructionPayload;
  if (template === 'geometry_3d') return geometry3dPayload;
  if (template === 'geometry') return geometryPayload;
  if (template === 'whiteboard') return teachingPayload;
  if (['svg_illustration', 'interactive_simulation'].includes(template)) return extensionPayload;
  return teachingPayload;
}

const COMMON_GRAPH_PAYLOAD = { nodes: [{ id: 'start', label: 'Start' }, { id: 'finish', label: 'Finish' }], edges: [{ from: 'start', to: 'finish', label: 'next' }] };
const COMMON_NUMERIC_PAYLOAD = { categories: ['A', 'B', 'C'], series: [{ name: 'Value', data: [3, 5, 4] }] };

/**
 * The prompt guide and correction examples derive from this per-template
 * contract; schemaFor() applies the matching executable Zod validator.
 * Keep each payload example executable by validateVisualizationSpec().
 */
export const VISUALIZATION_TEMPLATE_CONTRACTS = {
  function: {
    guidance: 'payload.functions is an array of {expression,label?,domain?}. Use Cartesian y=f(x) only. Expressions use x, pi, e, + - * / ^, parentheses, and named functions such as sin(x), ln(x), sqrt(x); always write multiplication explicitly (2*x), and function calls with parentheses. domain, when supplied, is [min,max] with min < max.',
    payload: { functions: [{ expression: 'sin(x)', label: 'sin(x)', domain: [-6.28, 6.28] }], xLabel: 'x', yLabel: 'y' },
  },
  line: { guidance: 'payload is {categories?,series:[{name?,role?,data:[numbers]}],xLabel?,yLabel?}. If categories is present, every series.data has exactly the same length.', payload: COMMON_NUMERIC_PAYLOAD },
  area: { guidance: 'Use the line-chart payload: categories? plus numeric series. If categories is present, every series.data has exactly the same length.', payload: COMMON_NUMERIC_PAYLOAD },
  bar: { guidance: 'Use categories plus one or more numeric series. If categories is present, every series.data has exactly the same length. Keep labels short.', payload: COMMON_NUMERIC_PAYLOAD },
  scatter: { guidance: 'payload.series is an array of {name?,data:[[x,y],...]}; every data item is one numeric [x,y] pair or {x,y}. Do not send categories.', payload: { series: [{ name: 'Samples', data: [[1, 2], [2, 4], [3, 3]] }], xLabel: 'x', yLabel: 'y' } },
  pie: { guidance: 'Use exactly one series and provide categories plus the same number of non-negative numeric values. Pie data represents parts of one whole.', payload: { categories: ['A', 'B', 'C'], series: [{ name: 'Share', data: [45, 35, 20] }] } },
  histogram: { guidance: 'Use categories as precomputed bin labels and numeric series as non-negative bin counts. If categories is present, every series.data has exactly the same length. Do not ask this renderer to calculate raw observations into bins.', payload: { categories: ['0–10', '10–20', '20–30'], series: [{ name: 'Count', data: [4, 9, 3] }] } },
  heatmap: { guidance: 'payload is {xCategories:[...],yCategories:[...],values:[[...],...]}. values has one row per yCategory and one number per xCategory.', payload: { xCategories: ['Mon', 'Tue'], yCategories: ['AM', 'PM'], values: [[2, 4], [3, 1]] } },
  radar: { guidance: 'payload is {indicators:[{name,max?}],series:[{name?,data:[numbers]}]}. Each series.data has one value per indicator; use 3–12 indicators.', payload: { indicators: [{ name: 'Speed', max: 10 }, { name: 'Power', max: 10 }, { name: 'Focus', max: 10 }], series: [{ name: 'A', data: [8, 6, 9] }, { name: 'B', data: [6, 9, 7] }] } },
  boxplot: { guidance: 'Use categories plus numeric five-number summaries. Each series.data item is [min,q1,median,q3,max], ordered from smallest to largest. If categories is present, the number of summaries matches it.', payload: { categories: ['Group A'], series: [{ name: 'Scores', data: [[2, 4, 5, 7, 9]] }] } },
  flowchart: { guidance: 'payload is {nodes:[{id,label,detail?}],edges:[{from,to,label?}],direction?}. direction may be horizontal or vertical. Use unique ASCII ids containing only letters, digits, and underscores. Every edge endpoint must name a node.', payload: COMMON_GRAPH_PAYLOAD },
  sequence: { guidance: 'Use the graph payload: nodes are participants and edges are messages. Every edge endpoint must name a participant; put message text in edge.label.', payload: COMMON_GRAPH_PAYLOAD },
  state: { guidance: 'Use the graph payload: nodes are states and edges are transitions. Every transition endpoint must name a state; put the transition name in edge.label.', payload: COMMON_GRAPH_PAYLOAD },
  tree: { guidance: 'Use the graph payload as one directed tree: one root, every other node has one parent, and there are no cycles. Every edge endpoint must name a node.', payload: { nodes: [{ id: 'root', label: 'Root' }, { id: 'child', label: 'Child' }], edges: [{ from: 'root', to: 'child' }] } },
  mindmap: { guidance: 'Use the graph payload as one directed hierarchy: one root, every other node has one parent, and there are no cycles. Keep each label concise.', payload: { nodes: [{ id: 'root', label: 'Topic' }, { id: 'branch', label: 'Branch' }], edges: [{ from: 'root', to: 'branch' }] } },
  network: { guidance: 'Use the graph payload for nodes and links; ids must be unique ASCII letters, digits, or underscores, and every edge endpoint must name a node.', payload: COMMON_GRAPH_PAYLOAD },
  timeline: { guidance: 'payload.items is an array of 2–12 events ordered from earliest to latest. Use {label,value?,detail?}; value is a concise date or time label.', payload: { items: [{ label: 'Start', value: '2020' }, { label: 'Launch', value: '2024' }] } },
  comparison: { guidance: 'payload.items contains 2–8 alternatives as {label,value?,detail?}. Use a short value and a concise detail for each alternative.', payload: { items: [{ label: 'Option A', value: 'Low cost', detail: 'Fewer features' }, { label: 'Option B', value: 'Flexible', detail: 'More setup' }] } },
  process: { guidance: 'payload.items is an ordered list of 2–12 steps as {label,detail?}. Put explanations in detail.', payload: { items: [{ label: 'Collect data' }, { label: 'Compare results' }, { label: 'Decide' }] } },
  number_line: { guidance: 'payload.items contains 2–12 {label,value:number} points. Values must be finite, distinct, and within ±1,000,000,000; put the point label in label.', payload: { items: [{ label: 'A', value: -2 }, { label: 'Zero', value: 0 }, { label: 'B', value: 3 }] } },
  geometry: { guidance: 'payload.shapes supports point {type:"point",at:[x,y]}, segment {type:"segment",from:[x,y],to:[x,y]}, circle {type:"circle",center:[x,y],radius}, and polygon {type:"polygon",points:[[x,y],...]}; coordinates are numeric and labels are optional.', payload: { shapes: [{ type: 'point', at: [0, 0], label: 'O' }, { type: 'segment', from: [0, 0], to: [3, 2], label: 'AB' }, { type: 'circle', center: [0, 0], radius: 2 }] } },
  concept_map: { guidance: 'Use the graph payload for concepts and labeled relationships. Ids must be unique ASCII letters, digits, or underscores, and every edge endpoint must name a node.', payload: COMMON_GRAPH_PAYLOAD },
  svg_illustration: { guidance: 'payload.source must be one complete standalone SVG document rooted at <svg>. Keep it static: no scripts, event handlers, forms, iframes, network calls, CSS imports, or external URLs. Put image/font assets inline as data URLs.', payload: { source: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120"><circle cx="120" cy="60" r="35" fill="#4f78dd"/></svg>' } },
  interactive_simulation: { guidance: 'payload.source is a self-contained HTML fragment or document with inline CSS/JavaScript. Inline scripts and handlers are allowed in the sandbox; network APIs, CSS imports, external URLs, nested frames, and forms are unavailable. Put image/font assets inline as data URLs.', payload: { source: '<button id="toggle">Start</button><script>document.getElementById("toggle").onclick=function(){this.textContent="Running"}</script>' } },
  paper_chart: { guidance: 'Use categories? and numeric series; each series may set kind to line, bar, or scatter. If categories is present, each data array must match its length.', payload: { categories: ['A', 'B', 'C'], series: [{ name: 'Result', kind: 'line', data: [3, 5, 4] }] } },
  math_construction: { guidance: 'payload.commands is an array of GeoGebra commands, one command per string. Use standard GeoGebra syntax such as A=(0,0) or Circle(A,4); this template requires the GeoGebra runtime.', payload: { appName: 'geometry', commands: ['A=(0,0)', 'Circle(A,4)'] } },
  geometry_3d: { guidance: 'payload.objects contains {type,position?,size?,label?}. size is [radius,unused,unused] for spheres, [radius,height,unused] for cylinders/cones, and [width,height,depth] for boxes; all supplied sizes must be positive.', payload: { objects: [{ type: 'sphere', position: [0, 1, 0], size: [1, 1, 1], label: 'Ball' }] } },
  whiteboard: { guidance: 'payload.items or payload.nodes contains labeled notes. Each item becomes a movable note on the board; use at most 30 concise items.', payload: { items: [{ label: 'Question' }, { label: 'Evidence' }, { label: 'Conclusion' }] } },
} satisfies Record<(typeof VISUALIZATION_TEMPLATES)[number], { guidance: string; payload: Record<string, unknown> }>;

export function visualizationTemplateGuide(template?: string): string {
  const selected = template && template in VISUALIZATION_TEMPLATE_CONTRACTS
    ? [template as keyof typeof VISUALIZATION_TEMPLATE_CONTRACTS]
    : VISUALIZATION_TEMPLATES;
  return selected.map((name) => {
    const contract = VISUALIZATION_TEMPLATE_CONTRACTS[name];
    return `- \`${name}\`: ${contract.guidance} Example payload: \`${JSON.stringify(contract.payload)}\``;
  }).join('\n');
}

export function visualizationTemplateCorrectionHint(template?: string | null): string {
  if (!template || !(template in VISUALIZATION_TEMPLATE_CONTRACTS)) return '';
  return VISUALIZATION_TEMPLATE_CONTRACTS[template as keyof typeof VISUALIZATION_TEMPLATE_CONTRACTS].guidance;
}

export function visualizationTemplateExample(template?: string | null): Record<string, unknown> {
  const selected = template && template in VISUALIZATION_TEMPLATE_CONTRACTS ? template : 'bar';
  const contract = VISUALIZATION_TEMPLATE_CONTRACTS[selected as keyof typeof VISUALIZATION_TEMPLATE_CONTRACTS];
  return {
    version: 1,
    template: selected,
    title: selected === 'function' ? 'Sine curve' : selected === 'bar' ? 'Values' : `${selected.replaceAll('_', ' ')} example`,
    accessibilitySummary: `A valid ${selected.replaceAll('_', ' ')} visualization example.`,
    payload: contract.payload,
  };
}

function compactIssues(error: z.ZodError, prefix = '') {
  return error.issues.slice(0, 8).map((issue) => ({
    path: [prefix, issue.path.join('.')].filter(Boolean).join('.') || 'spec',
    message: issue.message,
  }));
}

const ENVELOPE_KEYS = new Set(['version', 'template', 'title', 'caption', 'accessibilitySummary', 'payload']);

/**
 * Normalize a possibly-malformed spec before validation.
 * LLMs often place template-specific keys (e.g. functions, expressions,
 * xAxis, yAxis, grid, xRange, yRange) at the top level instead of
 * nesting them under `payload`. This step silently moves them into
 * payload so the strict envelope schema does not reject them.
 */
function firstDefined(record: Record<string, any>, keys: string[]) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null) return record[key];
  }
  return undefined;
}

function normalizeSpec(input: any) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  /* Unwrap only a single, recognizable provider-added envelope. Arbitrary
     recursive unwrapping would make malformed calls ambiguous and harder to
     audit. */
  const inputKeys = Object.keys(input);
  if (inputKeys.length === 1 && ['spec', 'input', 'arguments'].includes(inputKeys[0])
      && input[inputKeys[0]] && typeof input[inputKeys[0]] === 'object') {
    input = input[inputKeys[0]];
  }

  const normalized: Record<string, any> = { ...input };
  normalized.payload = normalized.payload && typeof normalized.payload === 'object' && !Array.isArray(normalized.payload)
    ? { ...normalized.payload }
    : {};
  if (normalized.version === '1') normalized.version = 1;
  if (!normalized.template) normalized.template = firstDefined(normalized, ['type', 'chartType', 'chart_type']);
  if (!normalized.accessibilitySummary) {
    normalized.accessibilitySummary = firstDefined(normalized, [
      'accessibility_summary', 'summary', 'description',
    ]);
  }
  if (!normalized.accessibilitySummary && typeof normalized.title === 'string' && normalized.title.trim()) {
    normalized.accessibilitySummary = `Visualization of ${normalized.title.trim()}.`;
  }

  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(normalized)) {
    if (!ENVELOPE_KEYS.has(key)) {
      /* Envelope aliases have already been consumed above; do not leak them
         into the semantic payload where a permissive schema might retain
         contradictory copies. */
      if (!['type', 'chartType', 'chart_type', 'accessibility_summary', 'summary', 'description'].includes(key)) {
        extra[key] = normalized[key];
      }
      delete normalized[key];
    }
  }
  normalized.payload = { ...extra, ...normalized.payload };
  const payload = normalized.payload as Record<string, any>;

  if (normalized.template === 'function') {
    if (!Array.isArray(payload.functions)) {
      const expression = firstDefined(payload, ['expression', 'expr', 'formula', 'equation', 'eq']);
      if (typeof expression === 'string') payload.functions = [{ expression }];
    }
    if (Array.isArray(payload.functions)) {
      payload.functions = payload.functions.map((item: any) => {
        if (typeof item === 'string') return { expression: item };
        if (!item || typeof item !== 'object') return item;
        const fn = { ...item };
        if (!fn.expression) fn.expression = firstDefined(fn, ['expr', 'formula', 'equation', 'eq']);
        delete fn.expr; delete fn.formula; delete fn.equation; delete fn.eq;
        return fn;
      });
    }
  }

  if (['line', 'area', 'bar', 'pie', 'histogram', 'radar', 'boxplot', 'paper_chart'].includes(normalized.template)) {
    if (!payload.categories) payload.categories = firstDefined(payload, ['labels', 'xValues', 'x_values']);
    if (!payload.series) {
      const values = firstDefined(payload, ['values', 'yValues', 'y_values', 'data']);
      if (Array.isArray(values)) payload.series = [{ data: values }];
    }
    if (Array.isArray(payload.series)) {
      if (payload.series.every((item: any) => typeof item === 'number')) {
        payload.series = [{ data: payload.series }];
      } else {
        payload.series = payload.series.map((item: any) => {
          if (Array.isArray(item)) return { data: item };
          if (!item || typeof item !== 'object') return item;
          const series = { ...item };
          if (!series.name) series.name = firstDefined(series, ['title', 'label']);
          if (!series.data) series.data = firstDefined(series, ['values', 'points', 'yValues', 'y_values']);
          delete series.title; delete series.label; delete series.values;
          delete series.points; delete series.yValues; delete series.y_values;
          return series;
        });
      }
    }
    delete payload.labels; delete payload.xValues; delete payload.x_values;
    delete payload.values; delete payload.yValues; delete payload.y_values;
    /* `data` is a common alias only when it was promoted into series. */
    if (payload.series && payload.data) delete payload.data;
  }

  if (['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'].includes(normalized.template)) {
    if (Array.isArray(payload.nodes)) {
      payload.nodes = payload.nodes.map((item: any) => {
        if (!item || typeof item !== 'object') return item;
        const node = { ...item };
        if (!node.label) node.label = firstDefined(node, ['name', 'title', 'text']);
        delete node.name; delete node.title; delete node.text;
        return node;
      });
    }
    if (Array.isArray(payload.edges)) {
      payload.edges = payload.edges.map((item: any) => {
        if (!item || typeof item !== 'object') return item;
        const edge = { ...item };
        if (!edge.from) edge.from = edge.source;
        if (!edge.to) edge.to = edge.target;
        delete edge.source; delete edge.target;
        return edge;
      });
    }
  }

  if (Array.isArray(payload.items)) {
    payload.items = payload.items.map((item: any) => {
      if (typeof item === 'string') return { label: item };
      if (!item || typeof item !== 'object') return item;
      const entry = { ...item };
      if (!entry.label) entry.label = firstDefined(entry, ['name', 'title', 'text']);
      delete entry.name; delete entry.title; delete entry.text;
      return entry;
    });
  }
  return normalized;
}

export function validateVisualizationSpec(input: unknown) {
  const normalized = normalizeSpec(input);
  const parsed = envelope.safeParse(normalized);
  const rawTemplate = normalized && typeof normalized === 'object' && !Array.isArray(normalized)
    ? (normalized as Record<string, unknown>).template
    : null;
  if (!parsed.success) return { ok: false as const, stage: 'envelope', template: typeof rawTemplate === 'string' ? rawTemplate : null, issues: compactIssues(parsed.error) };
  const byteLength = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
  if (byteLength > 256 * 1024) return { ok: false as const, stage: 'size', template: parsed.data.template, issues: [{ path: 'spec', message: '规格不能超过 256 KB。' }] };
  const payload = schemaFor(parsed.data.template).safeParse(parsed.data.payload);
  if (!payload.success) return { ok: false as const, stage: 'payload_shape', template: parsed.data.template, issues: compactIssues(payload.error, 'payload') };
  const semanticIssues: Array<{ path: string; message: string }> = [];
  const addIssue = (path: string, message: string) => semanticIssues.push({ path, message });
  const data = payload.data as Record<string, any>;

  if (parsed.data.template === 'function') {
    (data.functions || []).forEach((fn: Record<string, any>, index: number) => {
      if (fn.domain && fn.domain[0] >= fn.domain[1]) {
        addIssue(`payload.functions.${index}.domain`, 'domain must be an increasing [min,max] pair.');
        return;
      }
      try {
        parseFunctionExpression(fn.expression);
        const sample = sampleFunction(fn.expression, fn.domain, 760);
        if (!sample.points.some((point) => Number.isFinite(point[1]))) {
          addIssue(`payload.functions.${index}.expression`, 'expression has no finite values in the selected domain.');
        }
      } catch (error) {
        addIssue(`payload.functions.${index}.expression`, `unsupported function expression: ${(error as Error).message}`);
      }
    });
  }

  const checkSeriesLengths = (series: Array<{ data: unknown[] }>, count: number, path: string) => {
    series.forEach((entry, index) => {
      if (entry.data.length !== count) addIssue(`${path}.${index}.data`, `must contain exactly ${count} values to match the categories.`);
    });
  };
  if (['line', 'area', 'bar', 'histogram', 'paper_chart'].includes(parsed.data.template) && Array.isArray(data.categories)) {
    checkSeriesLengths(data.series, data.categories.length, 'payload.series');
  }
  if (parsed.data.template === 'histogram') {
    data.series.forEach((series: { data: number[] }, seriesIndex: number) => series.data.forEach((value, index) => {
      if (value < 0) addIssue(`payload.series.${seriesIndex}.data.${index}`, 'histogram bin counts must be non-negative.');
    }));
  }
  if (parsed.data.template === 'pie') {
    const values = data.series[0]?.data || [];
    if (values.length !== data.categories.length) addIssue('payload.series.0.data', 'must contain one value for each category.');
    if (!values.some((value: number) => value > 0)) addIssue('payload.series.0.data', 'at least one pie value must be greater than zero.');
    values.forEach((value: number, index: number) => {
      if (value < 0) addIssue(`payload.series.0.data.${index}`, 'pie values must be non-negative.');
    });
  }
  if (parsed.data.template === 'scatter' && Object.hasOwn(data, 'categories')) {
    addIssue('payload.categories', 'scatter uses explicit [x,y] points and does not accept categories.');
  }
  if (parsed.data.template === 'heatmap') {
    if (data.values.length !== data.yCategories.length) addIssue('payload.values', 'must contain one row for each yCategory.');
    data.values.forEach((row: unknown[], index: number) => {
      if (row.length !== data.xCategories.length) addIssue(`payload.values.${index}`, 'must contain one value for each xCategory.');
    });
  }
  if (parsed.data.template === 'radar') {
    data.series.forEach((series: { data: number[] }, seriesIndex: number) => {
      if (series.data.length !== data.indicators.length) addIssue(`payload.series.${seriesIndex}.data`, 'must contain one value for each indicator.');
      series.data.forEach((value, index) => {
        const max = data.indicators[index]?.max;
        if (max !== undefined && value > max) addIssue(`payload.series.${seriesIndex}.data.${index}`, `must not exceed indicator max ${max}.`);
      });
    });
  }
  if (parsed.data.template === 'boxplot') {
    checkSeriesLengths(data.series, data.categories.length, 'payload.series');
    data.series.forEach((series: { data: number[][] }, seriesIndex: number) => series.data.forEach((summary, index) => {
      if (!(summary[0] <= summary[1] && summary[1] <= summary[2] && summary[2] <= summary[3] && summary[3] <= summary[4])) {
        addIssue(`payload.series.${seriesIndex}.data.${index}`, 'five-number summary must be ordered min ≤ q1 ≤ median ≤ q3 ≤ max.');
      }
    }));
  }

  const graphTemplates = ['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'];
  if (graphTemplates.includes(parsed.data.template)) {
    const ids = new Set<string>();
    data.nodes.forEach((node: { id: string }, index: number) => {
      if (ids.has(node.id)) addIssue(`payload.nodes.${index}.id`, 'node ids must be unique.');
      ids.add(node.id);
    });
    data.edges.forEach((edge: { from: string; to: string }, index: number) => {
      if (!ids.has(edge.from)) addIssue(`payload.edges.${index}.from`, 'must refer to an existing node id.');
      if (!ids.has(edge.to)) addIssue(`payload.edges.${index}.to`, 'must refer to an existing node id.');
    });
    if (['tree', 'mindmap'].includes(parsed.data.template)) {
      const parents = new Map<string, number>();
      const children = new Map<string, string[]>();
      for (const node of data.nodes as Array<{ id: string }>) children.set(node.id, []);
      for (const edge of data.edges as Array<{ from: string; to: string }>) {
        parents.set(edge.to, (parents.get(edge.to) || 0) + 1);
        children.get(edge.from)?.push(edge.to);
      }
      const roots = data.nodes.filter((node: { id: string }) => !parents.has(node.id));
      if (roots.length !== 1 || data.edges.length !== data.nodes.length - 1 || [...parents.values()].some((count) => count !== 1)) {
        addIssue('payload.edges', 'tree and mindmap require one connected root with exactly one parent per other node.');
      } else {
        const visited = new Set<string>();
        const visit = (id: string) => {
          if (visited.has(id)) return;
          visited.add(id);
          for (const child of children.get(id) || []) visit(child);
        };
        visit(roots[0].id);
        if (visited.size !== data.nodes.length) addIssue('payload.edges', 'tree and mindmap must not contain cycles or disconnected nodes.');
      }
    }
  }

  if (['timeline', 'comparison', 'process', 'number_line'].includes(parsed.data.template)) {
    const items = Array.isArray(data.items) ? data.items : [];
    const minimum = ['comparison', 'number_line', 'timeline', 'process'].includes(parsed.data.template) ? 2 : 1;
    const maximum = parsed.data.template === 'comparison' ? 8 : ['number_line', 'timeline', 'process'].includes(parsed.data.template) ? 12 : 40;
    if (items.length < minimum || items.length > maximum) addIssue('payload.items', `must contain ${minimum}–${maximum} items for ${parsed.data.template}.`);
    if (parsed.data.template === 'number_line') {
      const values = items.map((item: { value?: unknown }) => item.value);
      if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value))) addIssue('payload.items.value', 'each number-line item requires a finite numeric value.');
      if (new Set(values).size !== values.length) addIssue('payload.items.value', 'number-line values must be distinct.');
      if (values.some((value) => typeof value === 'number' && Math.abs(value) > 1_000_000_000)) addIssue('payload.items.value', 'number-line values must stay within ±1,000,000,000.');
    }
  }

  if (parsed.data.template === 'geometry') {
    data.shapes.forEach((shape: Record<string, any>, index: number) => {
      const coordinates: number[] = shape.type === 'point' ? shape.at
        : shape.type === 'segment' ? [...shape.from, ...shape.to]
          : shape.type === 'circle' ? [...shape.center, shape.radius]
            : shape.points.flat();
      if (coordinates.some((value) => Math.abs(value) > 10000)) addIssue(`payload.shapes.${index}`, 'coordinates and radii must stay within ±10000.');
    });
  }
  if (parsed.data.template === 'geometry_3d') {
    data.objects.forEach((object: Record<string, any>, index: number) => {
      if (object.size && object.size.some((value: number) => value <= 0 || value > 100)) addIssue(`payload.objects.${index}.size`, 'size values must be greater than zero and at most 100.');
      if (object.position && object.position.some((value: number) => Math.abs(value) > 100)) addIssue(`payload.objects.${index}.position`, 'position values must stay within ±100.');
    });
  }

  if (parsed.data.template === 'svg_illustration') {
    const source = String(data.source || '').replace(/^\uFEFF?\s*<\?xml[^?]*\?>\s*/i, '').trim();
    if (!/^<svg\b/i.test(source) || !/<\/svg>\s*$/i.test(source) && !/^<svg\b[^>]*\/>$/i.test(source)) {
      addIssue('payload.source', 'must be one complete standalone SVG document rooted at <svg>.');
    }
  }

  if (semanticIssues.length) return { ok: false as const, stage: 'semantic', template: parsed.data.template, issues: semanticIssues.slice(0, 8) };
  if (['svg_illustration', 'interactive_simulation'].includes(parsed.data.template)) {
    const source = data.source;
    /* P_interactive-sim-scripts — match the frontend's
       extensionIsSafe() split exactly. `interactive_simulation`
       allows inline <script> and event handlers: the extension
       iframe runs opaque-origin under CSP `connect-src 'none'`
       with no popup permission, so a script cannot reach the
       parent page, the network, or cookies — the same containment
       a fenced ```viz block already gets. Banning scripts there
       made the "interactive" template fail validation on every
       genuinely interactive submission and burn the retry budget.
       `svg_illustration` stays script-free — it is static art.
       What remains banned for BOTH templates: nested iframe /
       object / embed / form tags, network-request APIs, CSS imports,
       and references other than local fragments or inline data URLs.
       The iframe CSP enforces the same closed-network contract. */
    const isInteractive = parsed.data.template === 'interactive_simulation';
    const tagBan = isInteractive
      ? /<(?:iframe|object|embed|form)\b/i
      : /<(?:script|iframe|object|embed|form)\b/i;
    if (tagBan.test(source)) {
      return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: isInteractive
        ? '扩展源不能包含 iframe、object、embed 或 form 标签。'
        : '扩展源不能包含脚本、iframe、object、embed 或 form 标签。' }] };
    }
    if (!isInteractive && /\son\w+\s*=/i.test(source)) {
      return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: '扩展源不能包含内联事件处理函数。' }] };
    }
    if (/\b(?:fetch|xmlhttprequest|websocket|sendbeacon|eventsource)\b/i.test(source)) {
      return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: '扩展源不能包含网络请求 API（沙箱已关闭网络访问，请把数据内联进源码）。' }] };
    }
    if (/@import\b/i.test(source)) {
      return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: '扩展源不能包含 CSS import；请将样式内联。' }] };
    }
    // Only local fragments and inline assets can render under this sandbox's CSP.
    const attrRe = /\b(?:src|href|action|formaction|xlink:href)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi;
    let match;
    while ((match = attrRe.exec(source)) !== null) {
      const value = String(match[1] || match[2] || match[3] || '').trim();
      if (/^(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\/html)/i.test(value)) {
      return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: '扩展源包含危险 URL 协议。' }] };
      }
      if (!/^(?:#|data:(?:image\/|font\/)|blob:)/i.test(value)) {
        return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: '扩展源引用了外部资源；请改用片段引用或内联 data URL。' }] };
      }
    }
    const cssUrlRe = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi;
    while ((match = cssUrlRe.exec(source)) !== null) {
      const value = String(match[1] || match[2] || match[3] || '').trim();
      if (!/^(?:#|data:(?:image\/|font\/)|blob:)/i.test(value)) {
        return { ok: false, stage: 'extension_safety', template: parsed.data.template, issues: [{ path: 'payload.source', message: '扩展源包含外部 CSS 资源；请改为内联 data URL。' }] };
      }
    }
  }
  return { ok: true as const, stage: 'accepted', template: parsed.data.template, spec: { ...parsed.data, payload: payload.data } };
}

export function visualizationError(issues: Array<{ path: string; message: string }>, durationMs = 0, retryable = true) {
  return {
    status: 'failed',
    errorCode: 'visual_spec_invalid',
    retryable,
    userMessage: '可视化规格有一个字段不符合要求，正在请求修正。',
    detail: issues,
    durationMs,
  };
}

export const VISUALIZATION_TOOL = {
  type: 'function',
  function: {
    name: 'render_visualization',
    description: 'Create a native Socrates visual card. Follow the exact payload contract for the selected template in the system guidance. Submit semantic data, never raw renderer options, CSS, fonts, dimensions, or Mermaid source. Keep titles and labels concise. Use code_interpreter first only when data must be calculated, read from files, transformed, or exported.',
    parameters: {
      type: 'object',
      required: ['version', 'template', 'title', 'accessibilitySummary', 'payload'],
      properties: {
        version: { type: 'integer', enum: [1] },
        template: { type: 'string', enum: VISUALIZATION_TEMPLATES },
        title: { type: 'string', maxLength: 120 },
        caption: { type: 'string', maxLength: 500, description: 'Optional note displayed beneath the visualization, separate from the title.' },
        accessibilitySummary: { type: 'string', maxLength: 800 },
        payload: { type: 'object', description: `Template-specific payload. Follow the selected template's field rules and example in the system guidance. Extension source must be at most ${Math.floor(MAX_TOOL_STRING_FIELD_CHARS / 1024)} KB so the call fits in one request.` },
      },
      additionalProperties: false,
    },
  },
};

export function executeVisualization(input: unknown) {
  const startedAt = Date.now();
  const validation = validateVisualizationSpec(input);
  if (!validation.ok) {
    const result = visualizationError(validation.issues!, Date.now() - startedAt);
    return {
      ...result,
      diagnostics: {
        stage: validation.stage,
        template: validation.template,
        issuePaths: validation.issues!.map((issue) => issue.path),
      },
    };
  }
  const spec = validation.spec!;
  return {
    status: 'completed',
    visualization: spec,
    output: `Visualization ready: ${spec.template} / ${spec.title}`,
    errorCode: null,
    retryable: false,
    userMessage: null,
    detail: null,
    diagnostics: { stage: 'accepted', template: spec.template, issuePaths: [] },
    durationMs: Date.now() - startedAt,
  };
}
