import { apiRequest } from '../api/client';

export interface LinkFetchResult {
  ok?: boolean;
  url?: string;
  title?: string;
  content?: string;
  truncated?: boolean;
  chars?: number;
  reason?: string;
}

export interface LinkPreviewState {
  urls: string[];
  results: LinkFetchResult[];
  noUrlHint?: boolean;
}

const FILE_EXTENSIONS = new Set(
  'pdf doc docx xls xlsx ppt pptx zip rar 7z tar gz jpg jpeg png gif webp svg mp3 mp4 mov avi mkv exe dmg iso txt md rtf csv json xml html htm'.split(' '),
);

/** Exact mobile port of frontend/src/chat/webLinks.js URL extraction. */
export function extractHttpUrls(input: string): string[] {
  if (!input) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (raw: string) => {
    const url = raw.replace(/[.,;:!?\]）】」』)]+$/, '');
    if (!url || url === '#' || seen.has(url)) return;
    seen.add(url);
    out.push(url);
  };

  const full = /https?:\/\/[^\s一-鿿　-〿＀-￯"'<>\)\]】」』]+/gi;
  let match: RegExpExecArray | null;
  while ((match = full.exec(input)) !== null) {
    add(match[0]);
    if (out.length >= 3) return out;
  }

  const bare = /(?:^|[^\w一-鿿＠@])([a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[^\s一-鿿　-〿＀-￯"'<>\)\]】」』]*)?)/gi;
  while ((match = bare.exec(input)) !== null) {
    const domain = match[1];
    if (!domain || !domain.includes('.')) continue;
    const host = domain.split('/')[0];
    const tld = host.slice(host.lastIndexOf('.') + 1);
    if (!/^[a-z]{2,}$/i.test(tld) || /^\d+(\.\d+)+$/.test(domain)) continue;
    const hasPath = domain.includes('/');
    const hasWww = /^www\./i.test(domain);
    if (!hasPath && !hasWww && FILE_EXTENSIONS.has(tld.toLowerCase())) continue;
    add(`https://${domain}`);
    if (out.length >= 3) break;
  }
  return out;
}

/** Exact heuristic used by the SPA when no clean URL was extracted. */
export function looksLikeUserMentionedSite(input: string): boolean {
  if (!input) return false;
  if (/网站|网址|网页|主页|站点|官网|链接|URL|url/i.test(input)) return true;
  if (/\b(visit|open|check|go to|browse|look at|see|read|fetch)\b/i.test(input)
    && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(input)) return true;
  return /(看看|看一下|了解下|了解|查阅|访问|打开|浏览|读一读|读一下)/.test(input)
    && /\b[a-z0-9-]+\.[a-z]{2,}\b/i.test(input);
}

export async function fetchPagesForContext(urls: string[]) {
  if (!urls.length) return { blocks: [] as string[], results: [] as LinkFetchResult[] };
  try {
    const response = await apiRequest<{ results?: LinkFetchResult[] }>('/fetch-batch', {
      method: 'POST',
      body: JSON.stringify({ urls }),
    });
    const results = Array.isArray(response?.results) ? response.results : [];
    const blocks = urls.map((url, index) => {
      const fetched = results[index];
      if (fetched?.ok && fetched.content) {
        return [
          `[Referenced page] ${url}`,
          fetched.title ? `Title: ${fetched.title}` : '',
          fetched.truncated ? '(truncated excerpt)' : '',
          fetched.content,
        ].filter(Boolean).join('\n');
      }
      return `[Referenced page] ${url}\n(could not retrieve: ${fetched?.reason || 'fetch failed'})`;
    });
    return { blocks, results };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      blocks: urls.map((url) => `[Referenced page] ${url}\n(could not retrieve: ${reason})`),
      results: urls.map(() => ({ ok: false, reason })),
    };
  }
}
