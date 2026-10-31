import { renderWebSearchResults as renderReactSearchResults } from '../react/toolCards/webSearchResultsHost.tsx';
import { normalizeWebSearchResults } from './toolSearchResultsModel.ts';

/** Mount search result cards into the imperative tool runtime's owned slot. */
export function renderWebSearchResults(out: HTMLElement, results: unknown[], query: string): boolean {
  if (!out || !Array.isArray(results) || !results.length) return false;
  const sources = normalizeWebSearchResults(results);
  if (!sources.length) return false;

  const host = out.ownerDocument.createElement('div');
  host.className = 'web-search-results-host';
  renderReactSearchResults(host, sources, query);
  out.replaceChildren(host);
  out.classList.remove('error');
  return true;
}
