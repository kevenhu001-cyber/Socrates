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

export function buildLinkPreviewItems(
  urls: readonly string[],
  results?: readonly (LinkPreviewResult | null | undefined)[] | null,
): LinkPreviewItem[] {
  return urls.map((rawUrl, index) => {
    const url = sanitizeUrl(String(rawUrl || ''));
    const fetched = results?.[index] || null;
    const content = fetched?.content || '';
    const excerpt = content.length > 220 ? `${content.slice(0, 217)}…` : content;
    const ok = fetched?.ok === true;
    return {
      url,
      host: hostnameFor(url),
      title: fetched?.title || url,
      excerpt: ok ? excerpt : '',
      status: ok
        ? `${fetched?.truncated ? 'excerpt · ' : 'full · '}${fetched?.chars ?? content.length} chars`
        : fetched?.reason || 'fetch failed',
      failed: !ok,
    };
  });
}
