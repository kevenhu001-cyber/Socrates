import { sanitizeUrl } from '../util/safe.ts';

export interface LinkPreviewResult {
  ok?: boolean;
  title?: string;
  content?: string;
  truncated?: boolean;
  chars?: number;
  reason?: string;
}

export interface LinkPreviewItem {
  url: string;
  host: string;
  title: string;
  excerpt: string;
  status: string;
  failed: boolean;
}

function hostnameFor(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function previewStatusOf(fetched: LinkPreviewResult | null, content: string, ok: boolean): string {
  if (!ok) return fetched?.reason || 'fetch failed';
  const prefix = fetched?.truncated ? 'excerpt · ' : 'full · ';
  const count = fetched?.chars ?? content.length;
  return `${prefix}${count} chars`;
}

function linkPreviewItemOf(rawUrl: string, fetched: LinkPreviewResult | null): LinkPreviewItem {
  const url = sanitizeUrl(String(rawUrl || ''));
  const content = fetched?.content || '';
  const excerpt = content.length > 220 ? `${content.slice(0, 217)}…` : content;
  const ok = fetched?.ok === true;
  return {
    url,
    host: hostnameFor(url),
    title: fetched?.title || url,
    excerpt: ok ? excerpt : '',
    status: previewStatusOf(fetched, content, ok),
    failed: !ok,
  };
}

export function buildLinkPreviewItems(
  urls: readonly string[],
  results?: readonly (LinkPreviewResult | null | undefined)[] | null,
): LinkPreviewItem[] {
  return urls.map((rawUrl, index) => linkPreviewItemOf(rawUrl, results?.[index] || null));
}
