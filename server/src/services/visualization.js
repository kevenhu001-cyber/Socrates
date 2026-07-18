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
];

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
}).strict();

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
}).strict();

const envelope = z.object({
  version: z.literal(1),
  template: z.enum(VISUALIZATION_TEMPLATES),
  title: z.string().min(1).max(120),
  caption: z.string().max(500).optional(),
  accessibilitySummary: z.string().min(1).max(800),
  payload: z.unknown(),
}).strict();

function schemaFor(template) {
  if (template === 'function') return functionPayload;
  if (['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot'].includes(template)) return chartPayload;
  if (['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map'].includes(template)) return graphPayload;
  if (['svg_illustration', 'interactive_simulation'].includes(template)) return extensionPayload;
  return teachingPayload;
}

function compactIssues(error) {
  return error.issues.slice(0, 8).map((issue) => ({
    path: issue.path.join('.') || 'spec',
    message: issue.message,
  }));
}

export function validateVisualizationSpec(input) {
  const parsed = envelope.safeParse(input);
  if (!parsed.success) return { ok: false, issues: compactIssues(parsed.error) };
  const byteLength = Buffer.byteLength(JSON.stringify(input), 'utf8');
  if (byteLength > 256 * 1024) return { ok: false, issues: [{ path: 'spec', message: '规格不能超过 256 KB。' }] };
  const payload = schemaFor(parsed.data.template).safeParse(parsed.data.payload);
  if (!payload.success) return { ok: false, issues: compactIssues(payload.error) };
  if (['svg_illustration', 'interactive_simulation'].includes(parsed.data.template)) {
    const source = payload.data.source;
    if (/<(?:iframe|object|embed|form)\b|\son\w+\s*=|\b(?:fetch|xmlhttprequest|websocket)\b|(?:src|href)\s*=\s*["']?https?:/i.test(source)) {
      return { ok: false, issues: [{ path: 'payload.source', message: '扩展源不能包含网络、表单、嵌套页面或事件属性。' }] };
    }
  }
  return { ok: true, spec: { ...parsed.data, payload: payload.data } };
}

export function visualizationError(issues, durationMs = 0, retryable = true) {
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
    description: 'Create a native Socrates visual card. Use for requested function graphs, ordinary data charts, teaching diagrams, timelines, comparisons, flow/state/tree/network diagrams, illustrations, and interactive simulations. Submit semantic content only. Never submit CSS, fonts, colors, dimensions, ECharts options, Mermaid, raw SVG/HTML unless using the restricted extension templates. Use code_interpreter only when data must first be calculated, analysed from files, or exported.',
    parameters: {
      type: 'object',
      required: ['version', 'template', 'title', 'accessibilitySummary', 'payload'],
      properties: {
        version: { type: 'integer', enum: [1] },
        template: { type: 'string', enum: VISUALIZATION_TEMPLATES },
        title: { type: 'string', maxLength: 120 },
        caption: { type: 'string', maxLength: 500 },
        accessibilitySummary: { type: 'string', maxLength: 800 },
        payload: { type: 'object', description: 'Template-specific semantic content, data, expressions, nodes, edges, or restricted extension source.' },
      },
      additionalProperties: false,
    },
  },
};

export function executeVisualization(input) {
  const startedAt = Date.now();
  const validation = validateVisualizationSpec(input);
  if (!validation.ok) return visualizationError(validation.issues, Date.now() - startedAt);
  const spec = validation.spec;
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
