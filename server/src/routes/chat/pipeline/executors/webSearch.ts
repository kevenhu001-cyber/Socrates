/**
 * web_search executor.
 *
 * P_search-numbered — results are formatted as a numbered list with
 * [1], [2], … markers that match the system prompt's citation convention.
 * Searches are idempotent and provider/network failures are often
 * transient, so it retries once; code execution deliberately does not
 * use this path because repeating it may have side effects.
 */

import { webSearch } from '../../../../services/webSearch.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { SearchResult, ToolResult, WebSearchError } from '../types.js';

export const executeWebSearch: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req } = ctx;
  let result: ToolResult;

  const searchQuery = String(args.query || '').trim();
  /* Schema declares minimum:1, but argument validation is best-effort —
     don't fan out an empty query across every engine. */
  if (!searchQuery) {
    result = { status: 'failed', error: 'missing_query', errorCode: 'invalid_query', retryable: true };
    emitter.event('tool_result', {
      id: call.id, ok: false, status: 'failed', output: '',
      error: 'missing_query', errorCode: 'invalid_query', retryable: true,
      userMessage: '搜索关键词为空。', detail: 'Provide a non-empty `query` string.',
    });
    return { result };
  }
  const requestedCount = Number(args.count);
  const searchCount = Number.isFinite(requestedCount)
    ? Math.min(12, Math.max(1, Math.trunc(requestedCount)))
    : 10;
  let searchResults: SearchResult[] | null = null;
  let searchError: WebSearchError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      searchResults = (await webSearch(searchQuery, searchCount, {
        userId: req.userId ?? undefined,
        locale: ((req.headers['accept-language'] || '') as string).split(',')[0].trim() || undefined,
      })) as SearchResult[];
      searchError = null;
      break;
    } catch (err) {
      searchError = err as WebSearchError;
      /* Retry only a first-attempt error the engine marked transient.
         Falling through without `break` used to retry `retryable:false`
         failures too — doubling the cost of hard failures. */
      if (attempt === 0 && err && (err as WebSearchError).retryable !== false) continue;
      break;
    }
  }

  if (searchError) {
    const detail = searchError.diagnostics || String(searchError && searchError.message || searchError);
    result = {
      status: 'failed',
      error: searchError.code || String(searchError && searchError.message || searchError),
      errorCode: searchError.code || 'web_search_failed',
      retryable: searchError.retryable !== false,
      userMessage: '暂时无法连接搜索服务，请稍后重试。',
      detail,
    };
    emitter.event('tool_result', {
      id: call.id, ok: false, status: 'failed', output: '', results: [],
      error: result.error, errorCode: result.errorCode,
      retryable: result.retryable, userMessage: result.userMessage, detail,
    });
    return { result };
  }

  if (searchResults && searchResults.length > 0) {
    const blocks = searchResults.map((r, i) => {
      const idx = i + 1;
      const title = String(r.title || '').slice(0, 240);
      const url = String(r.url || '');
      const snippet = String(r.snippet || '').slice(0, 400);
      const date = r.date ? `    Date: ${String(r.date).slice(0, 30)}\n` : '';
      const source = r.source ? `    Source: ${r.source}\n` : '';
      return `[${idx}] ${title}\n    URL: ${url}\n${date}${source}    Snippet: ${snippet}`;
    });
    const footer = '\n\nCite inline using the [1]/[2] markers so the UI can link each claim back to its source. Do NOT append a "Sources:"/"References:" list or paste URLs into your reply — the UI renders the Source Card automatically.';
    const output = blocks.join('\n\n') + footer;
    result = { status: 'completed', output, results: searchResults, retryable: false };
    emitter.event('tool_result', {
      id: call.id, ok: true, status: 'completed',
      output,
      retryable: false,
      results: searchResults.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
        date: r.date,
        source: r.source || null,
        matchedQuery: r.matchedQuery || searchQuery,
      })),
    });
    return { result };
  }

  result = {
    status: 'completed',
    output: 'No search results found. Try a shorter, more specific query, or wait a few minutes if you just queried the same topic.',
    results: [], retryable: false,
  };
  emitter.event('tool_result', {
    id: call.id, ok: true, status: 'completed',
    output: result.output, results: [], retryable: false,
  });
  return { result };
};
