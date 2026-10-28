export interface VisualizationCallLike {
  name?: unknown;
  input?: unknown;
  visualization?: unknown;
  isError?: unknown;
  status?: unknown;
  _run?: { phase?: unknown } | null;
}

/* ------------------------------------------------------------------ */
/* v1 visualization spec                                              */
/* ------------------------------------------------------------------ */
/* `render_visualization` input is model output, so every field below is
   untrusted until `asVisualizationSpec` has run. The interfaces describe
   what the renderers may rely on: a non-empty `template` and an object
   `payload`. Everything inside the payload stays optional and loosely
   typed because a template only reads the keys it understands — a chart
   ignores `nodes`, a tree ignores `series`. */

export interface VizFunction {
  expression: string;
  domain?: [number, number];
  label?: string;
  role?: string;
}

export interface VizSeries {
  name?: string;
  data: unknown[];
  kind?: string;
  role?: string;
}

export interface VizIndicator {
  name: string;
  max?: number;
}

export interface VizItem {
  label?: string;
  value?: number | string;
  detail?: string;
}

/** A structure node; `id` is what edges reference. */
export interface VizNode extends VizItem {
  id?: string;
}

export interface VizEdge {
  from: string;
  to: string;
  label?: string;
}

/** geometry template: one entry per point / segment / circle / polygon.
    Which fields are populated depends on `type`; the renderer reads them
    with `|| []` defaults because the shape comes from model output. */
export interface VizShape {
  type: string;
  at?: number[];
  from?: number[];
  to?: number[];
  center?: number[];
  radius?: number;
  points?: number[][];
  label?: string;
}

export interface VizPayload {
  functions?: VizFunction[];
  series?: VizSeries[];
  categories?: Array<string | number>;
  xCategories?: string[];
  yCategories?: string[];
  values?: number[][];
  indicators?: VizIndicator[];
  items?: VizItem[];
  nodes?: VizNode[];
  edges?: VizEdge[];
  shapes?: VizShape[];
  xLabel?: string;
  yLabel?: string;
  [key: string]: unknown;
}

export interface VizSpec {
  version?: number;
  template: string;
  title?: string;
  caption?: string;
  accessibilitySummary?: string;
  payload: VizPayload;
  [key: string]: unknown;
}

const FAILED_VISUALIZATION_STATUSES = new Set([
  'failed', 'error', 'timeout', 'timed_out', 'cancelled', 'stopped', 'aborted',
]);
const FAILED_VISUALIZATION_PHASES = new Set(['failed', 'timed_out', 'cancelled']);

function visualizationCallFailed(call: VisualizationCallLike): boolean {
  if (call.name !== 'render_visualization') return false;
  const status = String(call.status || '').toLowerCase();
  const phase = String(call._run?.phase || '').toLowerCase();
  return call.isError === true || FAILED_VISUALIZATION_STATUSES.has(status)
    || FAILED_VISUALIZATION_PHASES.has(phase);
}

function isVersionOneSpec(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && (value as { version?: unknown }).version === 1;
}

/**
 * Narrow untrusted input to a renderable spec.
 *
 * Rejects only what no renderer can survive: a missing/blank `template`.
 * A missing or non-object `payload` is normalised to `{}` rather than
 * rejected — several templates (svg_illustration, whiteboard) legitimately
 * read nothing out of it, and dropping the card entirely would hide a
 * model mistake that the renderer can still report in place.
 */
export function asVisualizationSpec(input: unknown): VizSpec | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  if (typeof raw.template !== 'string' || !raw.template.trim()) return null;
  const payload = raw.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return raw as VizSpec;
  }
  return { ...raw, template: raw.template, payload: {} } as VizSpec;
}

/**
 * The v1 visualization spec a call carries, from whichever field the writer
 * used: `visualization` (the runtime's normalized result) or, while the call
 * is still streaming, the `render_visualization` arguments themselves.
 *
 * Returns null for a failed call and for a payload that cannot be rendered,
 * so the caller never hands a malformed spec to mountVisualization.
 */
export function visualizationSpecOf(
  call: VisualizationCallLike | null | undefined,
): VizSpec | null {
  if (!call || visualizationCallFailed(call)) return null;
  const persisted = call.visualization;
  if (isVersionOneSpec(persisted)) return asVisualizationSpec(persisted);
  if (call.name === 'render_visualization' && isVersionOneSpec(call.input)) return asVisualizationSpec(call.input);
  return null;
}
