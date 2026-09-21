import { z } from 'zod';

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
const pointSchema = z.array(finiteNumber).min(2).max(3);
const seriesSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  role: z.enum(['primary', 'secondary', 'comparison', 'highlight', 'baseline']).optional(),
  data: z.array(z.union([finiteNumber, pointSchema, z.object({ x: finiteNumber, y: finiteNumber })])).max(5000),
}).passthrough();
const nodeSchema = z.object({
  id: z.string().min(1).max(80),
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
  mode: z.enum(['cartesian', 'parametric', 'polar']).default('cartesian'),
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

const chartPayload = z.object({
  categories: z.array(z.union([z.string().max(120), finiteNumber])).max(5000).optional(),
  series: z.array(seriesSchema).min(1).max(20),
  xLabel: z.string().max(80).optional(),
  yLabel: z.string().max(80).optional(),
  description: z.string().max(800).optional(),
}).passthrough();

const graphPayload = z.object({
  nodes: z.array(nodeSchema).max(200),
  edges: z.array(edgeSchema).max(400),
  direction: z.enum(['horizontal', 'vertical', 'radial']).optional(),
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

const extensionPayload = z.object({
  source: z.string().min(1).max(100000),
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
  if (['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot', 'paper_chart'].includes(template)) return chartPayload;
  if (['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'].includes(template)) return graphPayload;
  if (template === 'math_construction') return mathConstructionPayload;
  if (template === 'geometry_3d') return geometry3dPayload;
  if (template === 'whiteboard') return teachingPayload;
  if (['svg_illustration', 'interactive_simulation'].includes(template)) return extensionPayload;
  return teachingPayload;
}

function compactIssues(error: z.ZodError) {
  return error.issues.slice(0, 8).map((issue) => ({
    path: issue.path.join('.') || 'spec',
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

  if (['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot', 'paper_chart'].includes(normalized.template)) {
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
  if (!parsed.success) return { ok: false, issues: compactIssues(parsed.error) };
  const byteLength = Buffer.byteLength(JSON.stringify(normalized), 'utf8');
  if (byteLength > 256 * 1024) return { ok: false, issues: [{ path: 'spec', message: '规格不能超过 256 KB。' }] };
  const payload = schemaFor(parsed.data.template).safeParse(parsed.data.payload);
  if (!payload.success) return { ok: false, issues: compactIssues(payload.error) };
  if (['svg_illustration', 'interactive_simulation'].includes(parsed.data.template)) {
    const source = payload.data.source;
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
       object / embed / form tags, network-request APIs (the CSP
       would kill them anyway — the explicit check gives the model
       a readable error instead of a silent runtime failure), and
       dangerous URL schemes on src/href-style attributes. */
    const isInteractive = parsed.data.template === 'interactive_simulation';
    const tagBan = isInteractive
      ? /<(?:iframe|object|embed|form)\b/i
      : /<(?:script|iframe|object|embed|form)\b/i;
    if (tagBan.test(source)) {
      return { ok: false, issues: [{ path: 'payload.source', message: isInteractive
        ? '扩展源不能包含 iframe、object、embed 或 form 标签。'
        : '扩展源不能包含脚本、iframe、object、embed 或 form 标签。' }] };
    }
    if (!isInteractive && /\son\w+\s*=/i.test(source)) {
      return { ok: false, issues: [{ path: 'payload.source', message: '扩展源不能包含内联事件处理函数。' }] };
    }
    if (/\b(?:fetch|xmlhttprequest|websocket|sendbeacon|eventsource)\b/i.test(source)) {
      return { ok: false, issues: [{ path: 'payload.source', message: '扩展源不能包含网络请求 API（沙箱已关闭网络访问，请把数据内联进源码）。' }] };
    }
    // Check for dangerous URL schemes on src/href attributes
    const attrRe = /\b(?:src|href|action|formaction|xlink:href)\s*=\s*["']?\s*([^\s"'>]+)/gi;
    let match;
    while ((match = attrRe.exec(source)) !== null) {
      const value = String(match[1] || '').trim();
      if (/^(?:javascript|vbscript|livescript|mocha|data\s*:\s*text\/html)/i.test(value)) {
        return { ok: false, issues: [{ path: 'payload.source', message: '扩展源包含危险 URL 协议。' }] };
      }
    }
  }
  return { ok: true, spec: { ...parsed.data, payload: payload.data } };
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
    description: 'Create a native Socrates visual card backed by mature renderers: ECharts for ordinary statistics, Plotly for function/paper charts, Mermaid for flows, GeoGebra for math constructions, Three.js for 3D geometry, and tldraw for editable whiteboards. Submit semantic content only. Keep category, node, edge, and series labels concise (normally at most 24 characters); put explanation in caption, detail, or accessibilitySummary so labels do not overlap. Prefer fewer categories, a horizontal bar, or a table when long text would make a dense chart unreadable. Never submit CSS, fonts, colors, dimensions, raw renderer options, or Mermaid source. For svg_illustration submit static self-contained SVG/HTML — no scripts. For interactive_simulation submit a self-contained HTML document; inline <script> and event handlers ARE allowed and run in a sandbox, but network access (fetch/XHR/WebSocket) is disabled — inline all data. Use code_interpreter only when data must first be calculated, analysed from files, or exported.',
    parameters: {
      type: 'object',
      required: ['version', 'template', 'title', 'accessibilitySummary', 'payload'],
      properties: {
        version: { type: 'integer', enum: [1] },
        template: { type: 'string', enum: VISUALIZATION_TEMPLATES },
        title: { type: 'string', maxLength: 120 },
        caption: { type: 'string', maxLength: 500 },
        accessibilitySummary: { type: 'string', maxLength: 800 },
        payload: { type: 'object', description: 'Template-specific semantic content. function: {functions:[{expression,label?,domain?,role?}],xLabel?,yLabel?}. line/area/bar/scatter/pie/histogram/heatmap/radar/boxplot/paper_chart: {categories?,series:[{name?,role?,data:[numbers]}],xLabel?,yLabel?}. flowchart/sequence/state/tree/mindmap/network/concept_map: {nodes:[{id,label,detail?}],edges:[{from,to,label?}],direction?}. math_construction: {appName?,commands:[GeoGebra commands]}. geometry_3d: {objects:[{type:box|sphere|cylinder|cone,position?,size?,label?}]}. whiteboard: {items? or nodes?}. timeline/comparison/process/number_line/geometry: {items:[{label,detail?,value?,role?}]}. svg_illustration/interactive_simulation: {source}.' },
      },
      additionalProperties: false,
    },
  },
};

export function executeVisualization(input: unknown) {
  const startedAt = Date.now();
  const validation = validateVisualizationSpec(input);
  if (!validation.ok) return visualizationError(validation.issues!, Date.now() - startedAt);
  const spec = validation.spec!;
  return {
    status: 'completed',
    visualization: spec,
    output: `Visualization ready: ${spec.template} / ${spec.title}`,
    errorCode: null,
    retryable: false,
    userMessage: null,
    detail: null,
    durationMs: Date.now() - startedAt,
  };
}
