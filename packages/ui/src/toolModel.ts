/* toolModel — DOM-free derivation of a tool card from a ToolCall: label,
 * one-line input preview, lifecycle state, duration, search results and
 * stored-file artifacts. Mirrors the web baseline's toolCards.js data model
 * without any DOM, so both the transcript card and its tests stay shared. */

import type { JsonValue, ToolCall } from '@socrates/contracts';
import { safeLink } from './urlSafety';

export type ToolState = 'running' | 'completed' | 'failed';
export type StoredArtifactKind = 'image' | 'html' | 'file';

export interface ToolSearchResult {
  title: string;
  rawUrl: string;
  /** Only set when the URL passes `safeLink` (http/https/mailto). */
  url: string | null;
  host: string;
  snippet: string;
  date: string;
  source: string;
}

export interface ToolArtifactRef {
  id: string;
  mimeType: string;
  name: string;
  kind: StoredArtifactKind;
}

const LABELS: Record<string, string> = {
  workspace_agent: 'Agent',
  initialize_workspace: 'Workspace',
  render_visualization: 'Visual',
  web_search: 'Search',
  web_fetch: 'Fetch',
  create_plan: 'Plan',
  create_spec: 'Spec',
  code_interpreter: 'Code',
  arxiv_search: 'arXiv',
  zotero_search: 'Zotero',
  notion_search_pages: 'Notion',
  github_list_repos: 'GitHub',
  gitee_list_repos: 'Gitee',
  read_attachment: 'Attachment',
  create_site: 'Site',
};

export function toolLabel(name: string): string {
  const raw = String(name || '').trim();
  if (!raw) return 'Tool';
  return LABELS[raw] || raw.replace(/[_-]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function field(record: Record<string, JsonValue>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Single-line header preview, matching the web baseline's toolFormatInput. */
export function toolInputPreview(name: string, input: JsonValue | undefined): string {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  const record = input as Record<string, JsonValue>;
  switch (name) {
    case 'web_search':
    case 'arxiv_search':
    case 'zotero_search':
      return field(record, 'query') || field(record, 'q');
    case 'web_fetch':
      return field(record, 'url');
    case 'create_plan':
    case 'create_spec':
      return field(record, 'title');
    case 'render_visualization':
      return [field(record, 'template'), field(record, 'title')].filter(Boolean).join(' · ');
    case 'code_interpreter': {
      const code = field(record, 'code');
      return [field(record, 'language') || 'python', (code.split('\n')[0] || '').slice(0, 80)].filter(Boolean).join(' · ');
    }
    case 'workspace_agent':
      return field(record, 'task');
    default: {
      const raw = JSON.stringify(record);
      return raw.length > 120 ? `${raw.slice(0, 119)}…` : raw;
    }
  }
}

export function toolState(tool: ToolCall): ToolState {
  if (tool.isError === true) return 'failed';
  const phase = String(tool.progressPhase || '').toLowerCase();
  if (['failed', 'error', 'cancelled', 'stopped', 'aborted', 'timeout'].includes(phase)) return 'failed';
  if (phase && !['completed', 'succeeded', 'done', 'success'].includes(phase)) return 'running';
  return tool.output != null || phase ? 'completed' : 'running';
}

export function toolDurationLabel(durationMs: number | null | undefined): string {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return '';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 100) / 10} s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function hostOf(url: string | null): string {
  if (!url) return '';
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

/** Normalized search/fetch result rows; entries without a url or title are
 * dropped, duplicates collapse, at most 10 survive. */
export function toolSearchResults(tool: ToolCall): ToolSearchResult[] {
  if (!Array.isArray(tool.results)) return [];
  const out: ToolSearchResult[] = [];
  const seen = new Set<string>();
  for (const raw of tool.results) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, JsonValue>;
    const rawUrl = field(record, 'url');
    const title = field(record, 'title') || rawUrl;
    if (!rawUrl && !title) continue;
    const key = `${rawUrl}\n${title.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const url = rawUrl ? safeLink(rawUrl) : null;
    out.push({
      title,
      rawUrl,
      url,
      host: hostOf(url),
      snippet: field(record, 'snippet') || field(record, 'description'),
      date: field(record, 'date') || field(record, 'published'),
      source: field(record, 'source') || field(record, 'engine'),
    });
    if (out.length >= 10) break;
  }
  return out;
}

function artifactKind(mimeType: string): StoredArtifactKind {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.includes('text/html')) return 'html';
  return 'file';
}

/** Stored-file artifacts. Live SSE frames send bare file-id strings while the
 * persisted rows carry `{id, mimeType, name}`, so both shapes normalize. */
export function toolArtifacts(tool: ToolCall): ToolArtifactRef[] {
  if (!Array.isArray(tool.artifacts)) return [];
  const out: ToolArtifactRef[] = [];
  for (const raw of tool.artifacts) {
    const record: Record<string, JsonValue> | null = typeof raw === 'string'
      ? { id: raw }
      : (raw && typeof raw === 'object' ? raw as Record<string, JsonValue> : null);
    if (!record) continue;
    const id = field(record, 'id');
    if (!id) continue;
    const mimeType = field(record, 'mimeType');
    out.push({ id, mimeType, name: field(record, 'name') || id, kind: artifactKind(mimeType) });
    if (out.length >= 12) break;
  }
  return out;
}

/** stdout plus a distinct stderr, in display order. */
export function toolOutputText(tool: ToolCall): string {
  const parts: string[] = [];
  if (tool.output) parts.push(tool.output);
  if (tool.stderr && tool.stderr !== tool.output) parts.push(tool.stderr);
  return parts.join('\n');
}

/** The user-facing failure line: a localized userMessage, else the raw error. */
export function toolFailureText(tool: ToolCall): string {
  return tool.userMessage || tool.errorText || tool.detail || '';
}

/** Raw argument snapshot shown when a card is expanded. */
export function toolInputText(tool: ToolCall): string {
  if (tool.argumentsText) return tool.argumentsText;
  if (tool.input === undefined || tool.input === null) return '';
  try { return JSON.stringify(tool.input, null, 2); } catch { return ''; }
}
