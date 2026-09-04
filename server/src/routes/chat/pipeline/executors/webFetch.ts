/**
 * web_fetch executor.
 */

import { fetchBatch } from '../../../../services/fetchBatch.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

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

  const fetched = await fetchBatch([targetUrl]);
  const page = (fetched.results && fetched.results[0]) as
    | { ok?: boolean; url?: string; title?: string; content?: string; pageDate?: string; truncated?: boolean; reason?: string }
    | undefined;
  if (page && page.ok) {
    const MAX_FETCH_CHARS = 20000;
    const rawContent = String(page.content || '');
    const truncated = Boolean(page.truncated) || rawContent.length > MAX_FETCH_CHARS;
    const body = rawContent.length > MAX_FETCH_CHARS ? rawContent.slice(0, MAX_FETCH_CHARS) : rawContent;
    const header = `[title: ${page.title || '(untitled)'}]\n[url: ${page.url || targetUrl}]`
      + (page.pageDate ? `\n[date: ${page.pageDate}]` : '')
      + (truncated ? '\n[truncated: yes]' : '');
    const output = `${header}\n\n${body || '(no extractable text)'}`;
    result = { status: 'completed', output, retryable: false };
    emitter.event('tool_result', {
      id: call.id, ok: true, status: 'completed', output,
      url: page.url || targetUrl, title: page.title || '',
      truncated, retryable: false,
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
