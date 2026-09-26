/**
 * web_fetch executor.
 *
 * Two modes share one page cache:
 *   - single: `url` + `offset`/`max_chars` — paged re-reads of one page.
 *   - batch:  `urls` (1-4) — one fetchBatch call reads several pages at
 *     once, which is how the model triages search results without
 *     spending one tool iteration per page.
 */

import {fetchBatch} from '../../../../services/fetchBatch.js';
import type {ToolExecutionResult, ToolExecutor, ToolExecutorContext} from './types.js';
import type {ToolCall, ToolResult} from '../types.js';

const MAX_PAGE_CHARS = 30_000;
const DEFAULT_PAGE_CHARS = 20_000;
const SOURCE_MAX_BYTES = 1_000_000;
const PAGE_CACHE_TTL_MS = 15 * 60_000;
const PAGE_CACHE_ENTRIES = 8;
const MAX_BATCH_URLS = 4;
type FetchedPage = { ok?: boolean; url?: string; title?: string; content?: string; pageDate?: string; truncated?: boolean; reason?: string; code?: string; pageCount?: number };
const pageCache = new Map<string, { page: FetchedPage; fetchedAt: number }>();

function cachePage(url: string, page: FetchedPage) {
  if (!page?.ok) return;
  pageCache.delete(url);
  pageCache.set(url, { page, fetchedAt: Date.now() });
  if (pageCache.size > PAGE_CACHE_ENTRIES) pageCache.delete(pageCache.keys().next().value!);
}

function cachedPage(url: string): FetchedPage | undefined {
  const cached = pageCache.get(url);
  if (!cached) return undefined;
  if (Date.now() - cached.fetchedAt >= PAGE_CACHE_TTL_MS) {
    pageCache.delete(url);
    return undefined;
  }
  pageCache.delete(url);
  pageCache.set(url, cached);
  return cached.page;
}

function failEmit(ctx: ToolExecutorContext, call: ToolCall, errorCode: string, retryable: boolean, detail?: string, userMessage?: string): ToolExecutionResult {
  const result: ToolResult = { status: 'failed', error: errorCode, errorCode, retryable, detail };
  ctx.emitter.event('tool_result', {
    id: call.id, ok: false, status: 'failed', output: '',
    error: errorCode, errorCode, retryable,
    userMessage, detail,
  });
  return { result };
}

/** Model-facing body for one fetched page (shared by both modes). */
function formatPageBlock(page: FetchedPage, requestedUrl: string, offset: number, maxChars: number): { block: string; end: number; hasMore: boolean } {
  const rawContent = String(page.content || '');
  const end = Math.min(rawContent.length, offset + maxChars);
  const hasMore = end < rawContent.length;
  const sourceTruncated = Boolean(page.truncated);
  const body = rawContent.slice(offset, end);
  const header = `[title: ${page.title || '(untitled)'}]\n[url: ${page.url || requestedUrl}]`
    + (page.pageDate ? `\n[date: ${page.pageDate}]` : '')
    + (page.pageCount ? `\n[pdf_pages: ${page.pageCount}]` : '')
    + `\n[range: ${offset}-${end} of ${rawContent.length} available chars]`
    + `\n[has_more: ${hasMore ? 'yes' : 'no'}]`
    + (hasMore ? `\n[next_offset: ${end}]` : '')
    + (hasMore || sourceTruncated ? `\n[truncated: showing ${offset}-${end} of ${rawContent.length} available chars]` : '')
    + (sourceTruncated ? '\n[source_truncated: yes — text beyond the fetch limit is unavailable]' : '');
  return { block: `${header}\n\n${body || '(no extractable text)'}`, end, hasMore };
}

export const executeWebFetch: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter } = ctx;

  const rawList: unknown[] = Array.isArray(args.urls) && args.urls.length
    ? args.urls
    : (args.url != null ? [args.url] : []);
  const urls = rawList
    .map((u) => String(u || '').trim())
    .filter((u) => u.length > 0)
    .slice(0, MAX_BATCH_URLS);
  if (!urls.length) {
    return failEmit(ctx, call, 'missing_url', false, 'Provide one absolute http(s) URL via `url`, or up to 4 via `urls`.', '缺少要抓取的网址。');
  }

  const offset = Number(args.offset ?? 0);
  const maxChars = Number(args.max_chars ?? DEFAULT_PAGE_CHARS);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > SOURCE_MAX_BYTES || !Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > MAX_PAGE_CHARS) {
    return failEmit(ctx, call, 'invalid_paging_arguments', false);
  }
  const batch = urls.length > 1;
  if (batch && offset > 0) {
    return failEmit(ctx, call, 'invalid_paging_arguments', false, 'offset paging requires a single `url`; batch fetches always start each page at 0.');
  }

  /* Continuation reads (offset > 0) must hit the cached snapshot so the
     slice lines up with what the model already saw. A single-URL fetch
     at offset 0 always re-downloads (the caller asked for a fresh page);
     batch mode consults the cache per URL so a page read moments ago is
     replayed instead of re-downloaded. */
  const pages = new Map<string, FetchedPage | undefined>();
  const missing: string[] = [];
  for (const url of urls) {
    const hit = (batch || offset > 0) ? cachedPage(url) : undefined;
    if (hit) pages.set(url, hit);
    else missing.push(url);
  }

  if (offset > 0 && !batch && missing.length) {
    return failEmit(ctx, call, 'page_cache_miss', false, 'The earlier page snapshot is unavailable. Fetch this URL again with offset 0 before continuing.');
  }

  if (missing.length) {
    const fetched = await fetchBatch(missing, { maxBytes: SOURCE_MAX_BYTES });
    const results = (fetched.results || []) as FetchedPage[];
    /* fetchBatch preserves input order, so results align by index. */
    missing.forEach((url, i) => {
      const page = results[i] || { ok: false, url, code: 'fetch_failed', reason: 'Fetch failed' };
      pages.set(url, page);
      if (page?.ok) cachePage(url, page);
    });
  }

  if (!batch) {
    const targetUrl = urls[0];
    const page = pages.get(targetUrl);
    if (page && page.ok) {
      const rawContent = String(page.content || '');
      if (offset > 0 && offset >= rawContent.length) {
        return failEmit(ctx, call, 'offset_out_of_range', false, `Available text has ${rawContent.length} characters. Restart at offset 0 if you need a fresh page.`);
      }
      const { block, end, hasMore } = formatPageBlock(page, targetUrl, offset, maxChars);
      const sourceTruncated = Boolean(page.truncated);
      const result: ToolResult = { status: 'completed', output: block, retryable: false };
      emitter.event('tool_result', {
        id: call.id, ok: true, status: 'completed', output: block,
        url: page.url || targetUrl, title: page.title || '',
        offset, totalChars: rawContent.length, returnedChars: end - offset,
        hasMore, nextOffset: hasMore ? end : undefined, sourceTruncated,
        truncated: hasMore || sourceTruncated, retryable: false,
        ...(page.pageCount ? { pageCount: page.pageCount } : {}),
      });
      return { result };
    }
    const reason = (page && page.reason) || 'fetch_failed';
    const errorCode = (page && page.code) || 'web_fetch_failed';
    return failEmit(ctx, call, errorCode, true, reason, '无法抓取该网页。');
  }

  /* Batch mode: one block per requested URL, in request order. Failed
     pages stay inline as an [error] block so the model can see exactly
     which sources to drop without burning another iteration. */
  const blocks: string[] = [];
  const summary: Array<Record<string, unknown>> = [];
  let anyOk = false;
  urls.forEach((url, i) => {
    const page = pages.get(url);
    const prefix = urls.length > 1 ? `[page ${i + 1}/${urls.length}]\n` : '';
    if (page && page.ok) {
      anyOk = true;
      const { block } = formatPageBlock(page, url, 0, maxChars);
      blocks.push(prefix + block);
      summary.push({ url: page.url || url, title: page.title || '', ok: true, chars: String(page.content || '').length, ...(page.pageCount ? { pageCount: page.pageCount } : {}) });
    } else {
      const reason = (page && page.reason) || 'fetch_failed';
      const code = (page && page.code) || 'web_fetch_failed';
      blocks.push(`${prefix}[url: ${url}]\n[error: ${code} — ${reason}]`);
      summary.push({ url, ok: false, error: code, reason });
    }
  });

  if (!anyOk) {
    const first = summary[0] || {};
    return failEmit(ctx, call, String(first.error || 'web_fetch_failed'), true, String(first.reason || 'fetch_failed'), '无法抓取这些网页。');
  }

  const output = blocks.join('\n\n---\n\n');
  const result: ToolResult = { status: 'completed', output, retryable: false };
  emitter.event('tool_result', {
    id: call.id, ok: true, status: 'completed', output,
    pages: summary, retryable: false,
    truncated: summary.some((p) => p.ok === false),
  });
  return { result };
};
