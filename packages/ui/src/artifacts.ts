/* artifacts — descriptor collection + bridge message parsing for the
 * Universal App's isolated artifact islands.
 *
 * A message can carry heavy content two ways:
 *   - a native `render_visualization` tool result (`tool.visualization`,
 *     the v1 spec), and
 *   - a fenced code block whose language is an island kind (```html /
 *     ```mermaid / ```three / ```viz), which the model is told not to emit
 *     but which still appears in older history.
 *
 * Both become an `ArtifactDescriptor`: a small card is rendered inline and
 * the real document renders in the sandboxed island. All builders are pure
 * string functions (DOM-free). */

import type { ArtifactBridgeMessage, ToolCall } from '@socrates/contracts';
import { getThemePaletteHex, type ThemeMode } from '@socrates/theme';
import { buildArtifactDocument, buildEmbeddedDocument, escapeHtml } from './artifactDocument';
import { safeLink } from './urlSafety';
import {
  buildVisualizationDocument,
  isVisualizationSpec,
  islandKindForTemplate,
  visualizationSpecOf,
  type VisualizationSpec,
} from './visualization';

export interface ArtifactDescriptor {
  id: string;
  /** Island kind passed to the platform container. */
  kind: string;
  /** Short label shown on the inline card. */
  title: string;
  /** Text summary shown before the island opens. */
  summary: string;
  /** Builds the self-contained island document on demand (kept lazy so a
   * long transcript never renders HTML it does not open). */
  document(): string;
  /** Async alternative for artifacts whose bytes live on the server (e.g. an
   * HTML tool artifact): resolves the final island document. */
  loadDocument?(): Promise<string>;
}

const FENCE_KINDS: Record<string, string> = {
  html: 'html',
  svg: 'html',
  mermaid: 'mermaid',
  mmd: 'mermaid',
  three: 'three',
  threejs: 'three',
  viz: 'viz',
  chart: 'viz',
};

export function islandKindForLang(lang: string | undefined | null): string | null {
  if (!lang) return null;
  const normalized = String(lang).trim().toLowerCase().split(/[\s:]/)[0];
  return FENCE_KINDS[normalized] ?? null;
}

function truncate(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function documentPalette(mode: ThemeMode) {
  const p = getThemePaletteHex(mode);
  return { page: p.bg.page, raised: p.bg.raised, text: p.text.primary, muted: p.text.muted, border: p.border.default, accent: p.accent.strong };
}

function sourceDescriptor(input: { id: string; kind: string; title: string; source: string; mode: ThemeMode }): ArtifactDescriptor {
  const { id, kind, title, source, mode } = input;
  return {
    id,
    kind,
    title,
    summary: truncate(source, 160),
    document: () => {
      const palette = documentPalette(mode);
      return kind === 'html'
        ? buildEmbeddedDocument({ artifactId: id, kind, title, source, palette })
        : buildArtifactDocument({
          artifactId: id,
          kind,
          title,
          palette,
          bodyHtml: `<div class="artifact-head"><h1 class="artifact-title">${escapeHtml(title)}</h1><span class="artifact-kind">${escapeHtml(kind)}</span></div>`
            + `<pre class="artifact-source">${escapeHtml(source)}</pre>`,
        });
    },
  };
}

export function descriptorFromVisualization(spec: VisualizationSpec, mode: ThemeMode, id: string): ArtifactDescriptor {
  return {
    id,
    kind: islandKindForTemplate(spec.template),
    title: spec.title,
    summary: spec.caption || spec.accessibilitySummary,
    document: () => buildVisualizationDocument(spec, { artifactId: id, mode }),
  };
}

/** Visualization cards for a message's tool calls (deduped by call id). */
export function artifactsFromToolCalls(toolCalls: ToolCall[] | undefined, mode: ThemeMode): ArtifactDescriptor[] {
  return (toolCalls || [])
    .map((tool, index) => {
      const spec = visualizationSpecOf(tool);
      return spec ? descriptorFromVisualization(spec, mode, `artifact-${tool.id || index}`) : null;
    })
    .filter((descriptor): descriptor is ArtifactDescriptor => descriptor !== null);
}

/** Build a descriptor from a fenced island block; returns null for plain code. */
export function artifactFromFence(input: { lang?: string | null; text: string; mode: ThemeMode; index: number }): ArtifactDescriptor | null {
  const kind = islandKindForLang(input.lang);
  if (!kind) return null;
  const id = `artifact-fence-${input.index}`;
  if (kind === 'viz') {
    try {
      const parsed: unknown = JSON.parse(input.text);
      if (isVisualizationSpec(parsed)) return descriptorFromVisualization(parsed, input.mode, id);
    } catch { /* not JSON — fall through to a source preview */ }
  }
  const firstLine = input.text.split('\n').find((line) => line.trim()) || kind;
  return sourceDescriptor({ id, kind, title: truncate(firstLine, 80), source: input.text, mode: input.mode });
}

/** Validate an untrusted island message before it reaches the host. Accepts
 * the native WebView JSON-string payload and the web `postMessage` object. */
export function parseArtifactBridgeMessage(data: unknown): ArtifactBridgeMessage | null {
  let value: unknown = data;
  if (typeof data === 'string') {
    try { value = JSON.parse(data); } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  switch (record.type) {
    case 'ready':
      return typeof record.artifactId === 'string' && record.artifactId ? { type: 'ready', artifactId: record.artifactId } : null;
    case 'resize': {
      const height = record.height;
      return typeof height === 'number' && Number.isFinite(height) && height > 0 ? { type: 'resize', height } : null;
    }
    case 'openLink': {
      const url = typeof record.url === 'string' ? safeLink(record.url) : null;
      return url ? { type: 'openLink', url } : null;
    }
    case 'copy':
      return typeof record.text === 'string' ? { type: 'copy', text: record.text } : null;
    case 'share':
      return typeof record.title === 'string' && typeof record.content === 'string'
        ? { type: 'share', title: record.title, content: record.content } : null;
    case 'error':
      return typeof record.message === 'string' ? { type: 'error', message: record.message } : null;
    default:
      return null;
  }
}
