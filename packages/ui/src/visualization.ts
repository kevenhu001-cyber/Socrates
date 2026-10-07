/* visualization — the v1 visualization spec contract plus a DOM-free,
 * dependency-free renderer that turns a spec into the isolated island
 * document.
 *
 * The web baseline renders specs with ECharts / Mermaid / Plotly / GeoGebra
 * / Three.js in the shared document. The Universal App must not pull those
 * into shared core, so ordinary charts and structured templates are rendered
 * as self-contained inline SVG / HTML here and the whole document runs inside
 * the sandboxed `ArtifactIsland`. `svg_illustration` and
 * `interactive_simulation` carry their own source and are embedded as-is.
 *
 * Server contract: `server/src/services/visualization.ts` validates the
 * envelope `{ version: 1, template, title, caption?, accessibilitySummary,
 * payload }` before it is ever persisted, so `payload` is only re-checked
 * defensively here. */

import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import type { ToolCall } from '@socrates/contracts';
import { buildArtifactDocument, buildEmbeddedDocument, escapeHtml, type ArtifactDocumentPalette } from './artifactDocument';

export interface VisualizationSpec {
  version: 1;
  template: string;
  title: string;
  caption?: string;
  accessibilitySummary: string;
  payload: Record<string, unknown>;
}

export function paletteForDocument(mode: ThemeMode = 'light'): ArtifactDocumentPalette {
  const p = getThemePaletteHex(mode);
  return { page: p.bg.page, raised: p.bg.raised, text: p.text.primary, muted: p.text.muted, border: p.border.default, accent: p.accent.strong };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function isVisualizationSpec(value: unknown): value is VisualizationSpec {
  if (!isRecord(value)) return false;
  return value.version === 1
    && typeof value.template === 'string'
    && typeof value.title === 'string'
    && typeof value.accessibilitySummary === 'string'
    && isRecord(value.payload);
}

type VisualizationCallLike = Pick<ToolCall, 'name'> & Partial<Pick<ToolCall, 'visualization' | 'input' | 'isError' | 'progressPhase'>>;

/** The v1 spec a tool call carries, mirroring the web baseline's
 * `visualizationSpecOf` (persisted result first, then live arguments). */
export function visualizationSpecOf(call: VisualizationCallLike | null | undefined): VisualizationSpec | null {
  if (!call) return null;
  const phase = String(call.progressPhase || '').toLowerCase();
  if (call.isError === true || ['failed', 'cancelled', 'stopped', 'aborted'].includes(phase)) return null;
  if (isVisualizationSpec(call.visualization)) return call.visualization;
  if (call.name === 'render_visualization' && isVisualizationSpec(call.input)) return call.input;
  return null;
}

export function visualizationSummary(spec: VisualizationSpec): string {
  return spec.caption || spec.accessibilitySummary || spec.title;
}

const CHART_TEMPLATES = new Set(['line', 'area', 'bar', 'scatter', 'pie', 'histogram', 'heatmap', 'radar', 'boxplot', 'paper_chart']);
const GRAPH_TEMPLATES = new Set(['flowchart', 'sequence', 'state', 'tree', 'mindmap', 'network', 'concept_map']);
const EMBEDDED_TEMPLATES = new Set(['svg_illustration', 'interactive_simulation']);
export const FUNCTION_TEMPLATES = new Set(['function']);

const SERIES_COLORS = ['#4c8dff', '#f2a33c', '#e0577b', '#39b58a', '#9b6ef3', '#e0673f', '#3fb6cf', '#c9a227'];

export function islandKindForTemplate(template: string): string {
  if (EMBEDDED_TEMPLATES.has(template)) return 'html';
  if (CHART_TEMPLATES.has(template)) return 'chart';
  return 'viz';
}

function asFinite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function pointValue(point: unknown): number | null {
  if (Array.isArray(point)) {
    for (let i = point.length - 1; i >= 0; i -= 1) { const n = asFinite(point[i]); if (n !== null) return n; }
    return null;
  }
  if (isRecord(point)) return asFinite(point.y) ?? asFinite(point.value);
  return asFinite(point);
}

interface ChartSeries { name: string; values: number[] }

function chartSeries(payload: Record<string, unknown>): ChartSeries[] {
  if (!Array.isArray(payload.series)) return [];
  return payload.series.filter(isRecord).map((raw, index) => ({
    name: typeof raw.name === 'string' && raw.name ? raw.name : `Series ${index + 1}`,
    values: Array.isArray(raw.data) ? raw.data.map(pointValue).filter((v): v is number => v !== null) : [],
  })).filter((series) => series.values.length > 0).slice(0, 8);
}

function categoryLabels(payload: Record<string, unknown>, count: number): string[] {
  const categories = Array.isArray(payload.categories) ? payload.categories : [];
  return Array.from({ length: count }, (_, i) => {
    const value = categories[i];
    if (value === undefined || value === null) return String(i + 1);
    return String(value).slice(0, 14);
  });
}

function truncateTick(label: string): string {
  return label.length > 12 ? `${label.slice(0, 11)}…` : label;
}

function seriesSvg(kind: 'bar' | 'line' | 'area' | 'scatter', series: ChartSeries[], categories: string[], spec: VisualizationSpec): string {
  const W = 640, H = 260, padL = 52, padR = 16, padT = 14, padB = 46;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const all = series.flatMap((s) => s.values);
  if (!all.length) return '';
  let max = Math.max(...all, 0);
  let min = Math.min(...all, 0);
  if (max === min) max = min + 1;
  const y = (v: number) => padT + plotH * (1 - (v - min) / (max - min));
  const n = Math.max(...series.map((s) => s.values.length), categories.length, 1);
  const xAt = (i: number) => (n <= 1 ? padL + plotW / 2 : padL + (plotW * i) / (n - 1));
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = min + (max - min) * (1 - t);
    const gy = padT + plotH * t;
    return `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${W - padR}" y2="${gy.toFixed(1)}" stroke="currentColor" stroke-opacity="0.14" stroke-width="1"/>`
      + `<text x="${padL - 8}" y="${(gy + 4).toFixed(1)}" text-anchor="end" font-size="11" fill="currentColor" fill-opacity="0.6">${escapeHtml(formatNumber(value))}</text>`;
  }).join('');
  const step = Math.max(1, Math.ceil(n / 10));
  const xLabels = Array.from({ length: n }, (_, i) => i).filter((i) => i % step === 0).map((i) => (
    `<text x="${xAt(i).toFixed(1)}" y="${H - padB + 18}" text-anchor="middle" font-size="11" fill="currentColor" fill-opacity="0.6">${escapeHtml(truncateTick(categories[i] ?? String(i + 1)))}</text>`
  )).join('');

  let marks = '';
  if (kind === 'bar') {
    const groupW = plotW / n;
    const barW = Math.max(2, (groupW * 0.72) / series.length);
    marks = series.map((s, si) => s.values.map((value, i) => {
      const x = padL + groupW * i + (groupW - barW * series.length) / 2 + si * barW;
      const top = y(Math.max(value, 0));
      const bottom = y(Math.min(value, 0));
      return `<rect x="${x.toFixed(1)}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1, bottom - top).toFixed(1)}" fill="${SERIES_COLORS[si % SERIES_COLORS.length]}" rx="2"/>`;
    }).join('')).join('');
  } else {
    marks = series.map((s, si) => {
      const color = SERIES_COLORS[si % SERIES_COLORS.length];
      const points = s.values.map((value, i) => `${xAt(i).toFixed(1)},${y(value).toFixed(1)}`);
      if (kind === 'scatter') return s.values.map((value, i) => `<circle cx="${xAt(i).toFixed(1)}" cy="${y(value).toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
      const line = `<polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      if (kind === 'area') {
        const base = y(Math.max(min, 0));
        const area = `<polygon points="${padL},${base.toFixed(1)} ${points.join(' ')} ${xAt(s.values.length - 1).toFixed(1)},${base.toFixed(1)}" fill="${color}" fill-opacity="0.16"/>`;
        return area + line;
      }
      return line;
    }).join('');
  }
  const legend = series.length > 1
    ? `<div class="artifact-legend">${series.map((s, i) => `<span><i style="background:${SERIES_COLORS[i % SERIES_COLORS.length]}"></i>${escapeHtml(s.name)}</span>`).join('')}</div>`
    : '';
  const axes = `<line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + plotH}" stroke="currentColor" stroke-opacity="0.3" stroke-width="1"/>`
    + `<line x1="${padL}" y1="${y(Math.max(min, 0)).toFixed(1)}" x2="${W - padR}" y2="${y(Math.max(min, 0)).toFixed(1)}" stroke="currentColor" stroke-opacity="0.35" stroke-width="1"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" preserveAspectRatio="xMidYMid meet" style="color:inherit">
    <title>${escapeHtml(spec.title)}</title><desc>${escapeHtml(spec.accessibilitySummary)}</desc>
    ${gridLines}${axes}${marks}${xLabels}</svg>${legend}`;
}

function pieSvg(series: ChartSeries[], categories: string[], spec: VisualizationSpec): string {
  const values = series[0]?.values ?? [];
  const positives = values.map((v) => Math.max(v, 0));
  const total = positives.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return '';
  const W = 480, H = 260, cx = 150, cy = 130, r = 100;
  let angle = -Math.PI / 2;
  const arcs = positives.map((value, i) => {
    const sweep = (value / total) * Math.PI * 2;
    const end = angle + sweep;
    const x1 = cx + r * Math.cos(angle), y1 = cy + r * Math.sin(angle);
    const x2 = cx + r * Math.cos(end), y2 = cy + r * Math.sin(end);
    const large = sweep > Math.PI ? 1 : 0;
    const path = `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${SERIES_COLORS[i % SERIES_COLORS.length]}" stroke="none"/>`;
    angle = end;
    return path;
  }).join('');
  const legend = positives.map((value, i) => {
    const pct = Math.round((value / total) * 100);
    return `<span><i style="background:${SERIES_COLORS[i % SERIES_COLORS.length]}"></i>${escapeHtml(categories[i] ?? `#${i + 1}`)} ${pct}%</span>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" role="img" style="color:inherit"><title>${escapeHtml(spec.title)}</title><desc>${escapeHtml(spec.accessibilitySummary)}</desc>${arcs}</svg><div class="artifact-legend">${legend}</div>`;
}

function listBody(entries: Array<{ label: string; detail?: string; value?: string }>): string {
  if (!entries.length) return '';
  return `<ul class="artifact-list">${entries.map((entry) => `<li><b>${escapeHtml(entry.label)}${entry.value ? ` — ${escapeHtml(entry.value)}` : ''}</b>${entry.detail ? `<small>${escapeHtml(entry.detail)}</small>` : ''}</li>`).join('')}</ul>`;
}

function itemsOf(payload: Record<string, unknown>): Array<{ label: string; detail?: string; value?: string }> {
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map((raw, i) => {
    if (typeof raw === 'string') return { label: raw };
    if (!isRecord(raw)) return { label: `Item ${i + 1}` };
    const label = String(raw.label ?? raw.name ?? raw.title ?? `Item ${i + 1}`);
    const detail = typeof raw.detail === 'string' ? raw.detail : undefined;
    const value = raw.value === undefined || raw.value === null ? undefined : String(raw.value);
    return { label, ...(detail ? { detail } : {}), ...(value ? { value } : {}) };
  });
}

function graphBody(payload: Record<string, unknown>): string {
  const nodes = Array.isArray(payload.nodes) ? payload.nodes.filter(isRecord).map((node, i) => ({
    label: String(node.label ?? node.id ?? `Node ${i + 1}`),
    detail: typeof node.detail === 'string' ? node.detail : undefined,
  })) : [];
  const edges = Array.isArray(payload.edges) ? payload.edges.filter(isRecord) : [];
  if (!nodes.length && !edges.length) return '';
  const edgeText = edges.slice(0, 20).map((edge) => {
    const label = edge.label ? ` (${String(edge.label)})` : '';
    return `${String(edge.from ?? '?')} → ${String(edge.to ?? '?')}${label}`;
  }).join('\n');
  return listBody(nodes) + (edgeText ? `<pre class="artifact-source">${escapeHtml(edgeText)}</pre>` : '');
}

function functionBody(payload: Record<string, unknown>): string {
  const functions = Array.isArray(payload.functions) ? payload.functions : [];
  const entries = functions.map((raw, i) => {
    if (typeof raw === 'string') return { label: raw };
    if (!isRecord(raw)) return { label: `f${i + 1}` };
    const domain = Array.isArray(raw.domain) && raw.domain.length === 2 ? `domain [${raw.domain[0]}, ${raw.domain[1]}]` : undefined;
    return { label: `y = ${String(raw.expression ?? '')}`, ...(raw.label ? { value: String(raw.label) } : {}), ...(domain ? { detail: domain } : {}) };
  });
  return listBody(entries);
}

function geometryBody(payload: Record<string, unknown>): string {
  const objects = Array.isArray(payload.objects) ? payload.objects : [];
  return listBody(objects.filter(isRecord).map((object, i) => ({
    label: String(object.label ?? `${object.type ?? 'object'} ${i + 1}`),
    detail: [object.type, object.position ? `pos ${JSON.stringify(object.position)}` : '', object.size ? `size ${JSON.stringify(object.size)}` : ''].filter(Boolean).join(' · '),
  })));
}

function sourceBody(payload: Record<string, unknown>): string {
  const source = typeof payload.source === 'string' ? payload.source : '';
  if (!source) return '';
  return `<pre class="artifact-source">${escapeHtml(source)}</pre>`;
}

function visualizationBody(spec: VisualizationSpec): string {
  const payload = spec.payload;
  if (EMBEDDED_TEMPLATES.has(spec.template)) return sourceBody(payload);
  if (CHART_TEMPLATES.has(spec.template)) {
    const series = chartSeries(payload);
    const count = Math.max(...series.map((s) => s.values.length), Array.isArray(payload.categories) ? payload.categories.length : 0);
    const categories = categoryLabels(payload, count);
    if (spec.template === 'pie') return pieSvg(series, categories, spec);
    if (spec.template === 'heatmap' || spec.template === 'radar' || spec.template === 'boxplot') {
      return seriesSvg('bar', series, categories, spec) || listBody(itemsOf(payload));
    }
    if (spec.template === 'bar' || spec.template === 'histogram') return seriesSvg('bar', series, categories, spec);
    if (spec.template === 'scatter') return seriesSvg('scatter', series, categories, spec);
    if (spec.template === 'area') return seriesSvg('area', series, categories, spec);
    return seriesSvg('line', series, categories, spec);
  }
  if (GRAPH_TEMPLATES.has(spec.template)) return graphBody(payload);
  if (spec.template === 'function') return functionBody(payload);
  if (spec.template === 'geometry_3d') return geometryBody(payload);
  if (spec.template === 'math_construction') {
    const commands = Array.isArray(payload.commands) ? payload.commands : [];
    return `<pre class="artifact-source">${escapeHtml(commands.map((command, i) => `${i + 1}. ${String(command)}`).join('\n'))}</pre>`;
  }
  if (Array.isArray(payload.nodes) && payload.nodes.length) return graphBody(payload);
  return listBody(itemsOf(payload));
}

export function buildVisualizationDocument(spec: VisualizationSpec, options: { artifactId: string; mode?: ThemeMode }): string {
  const palette = paletteForDocument(options.mode);
  const kind = islandKindForTemplate(spec.template);
  const title = escapeHtml(spec.title);
  if (EMBEDDED_TEMPLATES.has(spec.template) && typeof spec.payload.source === 'string') {
    return buildEmbeddedDocument({ artifactId: options.artifactId, kind, title: spec.title, source: spec.payload.source, palette });
  }
  const body = visualizationBody(spec);
  const header = `<div class="artifact-head"><h1 class="artifact-title">${title}</h1><span class="artifact-kind">${escapeHtml(spec.template)}</span></div>`
    + `<p class="artifact-summary">${escapeHtml(spec.accessibilitySummary)}</p>`;
  const caption = spec.caption ? `<p class="artifact-caption">${escapeHtml(spec.caption)}</p>` : '';
  const content = body || `<p class="artifact-note">${escapeHtml(spec.accessibilitySummary)}</p>`;
  return buildArtifactDocument({
    artifactId: options.artifactId,
    kind,
    title: spec.title,
    palette,
    bodyHtml: `${header}<div class="artifact-body">${content}</div>${caption}`,
  });
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  // Avoid Intl: this runs on the Hermes RN thread for native islands, where
  // toLocaleString options are not reliably supported.
  const rounded = Math.abs(value) >= 1000 ? Math.round(value) : Math.round(value * 100) / 100;
  const [integer, fraction] = String(rounded).split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction ? `${grouped}.${fraction}` : grouped;
}
