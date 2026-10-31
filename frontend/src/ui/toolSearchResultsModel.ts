import { sanitizeUrl } from '../util/safe.ts';

export interface NormalizedSearchResult {
  title: string;
  rawUrl: string;
  url: string;
  host: string;
  snippet: string;
  date: string;
  source: string;
  matchedQuery: string;
}

function hostFromUrl(url: string): string {
  try {
    if (!url || url === '#') return '';
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function normalizeWebSearchResults(results: unknown[]): NormalizedSearchResult[] {
  const seen = new Set<string>();
  const normalized: NormalizedSearchResult[] = [];
  for (const raw of results) {
    const source = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const rawUrl = String(source.url || '').trim();
    const url = sanitizeUrl(rawUrl);
    const result: NormalizedSearchResult = {
      title: String(source.title || rawUrl || 'Untitled result').trim(),
      rawUrl,
      url,
      host: hostFromUrl(url),
      snippet: String(source.snippet || source.description || '').trim(),
      date: String(source.date || source.published || '').trim(),
      source: String(source.source || source.engine || '').trim(),
      matchedQuery: String(source.matchedQuery || '').trim(),
    };
    const key = (result.url || '#') + '\n' + result.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(result);
  }
  return normalized;
}
