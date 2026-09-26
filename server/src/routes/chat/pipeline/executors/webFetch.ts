/**
 * web_fetch executor.
 */

import { fetchBatch } from '../../../../services/fetchBatch.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

const MAX_PAGE_CHARS = 30_000;
const DEFAULT_PAGE_CHARS = 20_000;
const SOURCE_MAX_BYTES = 1_000_000;
const PAGE_CACHE_TTL_MS = 15 * 60_000;
const PAGE_CACHE_ENTRIES = 8;
type FetchedPage = { ok?: boolean; url?: string; title?: string; content?: string; pageDate?: string; truncated?: boolean; reason?: string; code?: string };
const pageCache = new Map<string, { page: FetchedPage; fetchedAt: number }>();

export const executeWebFetch: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter } = ctx;
  let result: ToolResult;

  const targetUrl = String(args.url || '').trim();
  if (!targetUrl) {
    result = { status: 'failed', error: 'missing_url', errorCode: 'missing_url', retryable: false };
    emitter.event('tool_result', {
      id: call.id, ok: false, status: 'failed', output: '',
      error: 'missing_url', errorCode: 'missing_url', retryable: false,
      userMessage: '缺少要抓取的网址。', detail: 'Provide one absolute http(s) URL.',
    });
    return { result };
  }

  const offset = Number(args.offset ?? 0);
  const maxChars = Number(args.max_chars ?? DEFAULT_PAGE_CHARS);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > SOURCE_MAX_BYTES || !Number.isSafeInteger(maxChars) || maxChars < 1 || maxChars > MAX_PAGE_CHARS) {
    result = { status: 'failed', error: 'invalid_paging_arguments', errorCode: 'invalid_paging_arguments', retryable: false };
    emitter.event('tool_result', { id: call.id, ok: false, status: 'failed', output: '', error: 'invalid_paging_arguments', errorCode: 'invalid_paging_arguments', retryable: false });
    return { result };
  }

  const cached = pageCache.get(targetUrl);
  let page: FetchedPage | undefined;
  if (offset > 0) {
    if (!cached || Date.now() - cached.fetchedAt >= PAGE_CACHE_TTL_MS) {
      pageCache.delete(targetUrl);
      result = { status: 'failed', error: 'page_cache_miss', errorCode: 'page_cache_miss', retryable: false, detail: 'The earlier page snapshot is unavailable. Fetch this URL again with offset 0 before continuing.' };
      emitter.event('tool_result', { id: call.id, ok: false, status: 'failed', output: '', error: 'page_cache_miss', errorCode: 'page_cache_miss', retryable: false, detail: result.detail });
      return { result };
    }
    pageCache.delete(targetUrl);
    pageCache.set(targetUrl, cached);
    page = cached.page;
  } else {
    const fetched = await fetchBatch([targetUrl], { maxBytes: SOURCE_MAX_BYTES });
    page = fetched.results?.[0] as FetchedPage | undefined;
    if (page?.ok) {
      pageCache.delete(targetUrl);
      pageCache.set(targetUrl, { page, fetchedAt: Date.now() });
      if (pageCache.size > PAGE_CACHE_ENTRIES) pageCache.delete(pageCache.keys().next().value!);
    }
  }
  if (page && page.ok) {
    const rawContent = String(page.content || '');
    if (offset > 0 && offset >= rawContent.length) {
      result = { status: 'failed', error: 'offset_out_of_range', errorCode: 'offset_out_of_range', retryable: false, detail: `Available text has ${rawContent.length} characters. Restart at offset 0 if you need a fresh page.` };
      emitter.event('tool_result', { id: call.id, ok: false, status: 'failed', output: '', error: 'offset_out_of_range', errorCode: 'offset_out_of_range', retryable: false, detail: result.detail });
      return { result };
    }
    const end = Math.min(rawContent.length, offset + maxChars);
    const hasMore = end < rawContent.length;
    const sourceTruncated = Boolean(page.truncated);
    const body = rawContent.slice(offset, end);
    const header = `[title: ${page.title || '(untitled)'}]\n[url: ${page.url || targetUrl}]`
      + (page.pageDate ? `\n[date: ${page.pageDate}]` : '')
      + `\n[range: ${offset}-${end} of ${rawContent.length} available chars]`
      + `\n[has_more: ${hasMore ? 'yes' : 'no'}]`
      + (hasMore ? `\n[next_offset: ${end}]` : '')
      + (hasMore || sourceTruncated ? `\n[truncated: showing ${offset}-${end} of ${rawContent.length} available chars]` : '')
      + (sourceTruncated ? '\n[source_truncated: yes — text beyond the fetch limit is unavailable]' : '');
    const output = `${header}\n\n${body || '(no extractable text)'}`;
    result = { status: 'completed', output, retryable: false };
    emitter.event('tool_result', {
      id: call.id, ok: true, status: 'completed', output,
      url: page.url || targetUrl, title: page.title || '',
      offset, totalChars: rawContent.length, returnedChars: end - offset,
      hasMore, nextOffset: hasMore ? end : undefined, sourceTruncated,
      truncated: hasMore || sourceTruncated, retryable: false,
    });
  } else {
    const reason = (page && page.reason) || 'fetch_failed';
    const errorCode = (page && (page as { code?: string }).code) || 'web_fetch_failed';
    result = { status: 'failed', error: reason, errorCode, retryable: true };
    emitter.event('tool_result', {
      id: call.id, ok: false, status: 'failed', output: '',
      error: reason, errorCode, retryable: true,
      userMessage: '无法抓取该网页。', detail: reason,
    });
  }
  return { result };
};
