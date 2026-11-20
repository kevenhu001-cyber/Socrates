/**
 * image_search executor.
 *
 * Searches for real-world images from the web via Wikimedia Commons and
 * Bing Image search. Returns a structured list of images with direct URLs,
 * thumbnail previews, and source page attributions.
 */

import { imageSearch } from '../../../../services/webSearch.js';
import { searchUiImages } from '../../../../services/intelligentUiMedia.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export interface ImageSearchResult {
  title: string;
  url: string;
  thumbnailUrl?: string;
  sourceUrl: string;
  author?: string;
  license?: string;
}

export const executeImageSearch: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter } = ctx;
  let result: ToolResult;

  const searchQuery = String(
    args.query || args.q || args.search_query || args.keyword || '',
  ).trim();

  if (!searchQuery) {
    result = {
      status: 'failed',
      error: 'missing_query',
      errorCode: 'invalid_query',
      retryable: true,
    };
    emitter.event('tool_result', {
      id: call.id,
      ok: false,
      status: 'failed',
      output: '',
      error: 'missing_query',
      errorCode: 'invalid_query',
      retryable: true,
      userMessage: '图片搜索关键词为空。',
      detail: 'Provide a non-empty `query` string.',
    });
    return { result };
  }

  const requestedCount = Number(args.count);
  const searchCount = Number.isFinite(requestedCount)
    ? Math.min(8, Math.max(1, Math.trunc(requestedCount)))
    : 4;

  emitter.event('tool_progress', { id: call.id, phase: 'searching', elapsedMs: 0 });

  let results: ImageSearchResult[] = [];

  // Try media search first (Wikimedia + proxy cache)
  try {
    const uiImages = await searchUiImages(searchQuery);
    if (Array.isArray(uiImages) && uiImages.length > 0) {
      results = uiImages.slice(0, searchCount).map((item) => ({
        title: item.title || searchQuery,
        url: item.url,
        thumbnailUrl: item.url,
        sourceUrl: item.sourceUrl,
        author: item.author,
        license: item.license,
      }));
    }
  } catch {
    // Media service unavailable, fall through to direct image search
  }

  // If media search didn't yield enough, fall back or complement with direct Bing image search
  if (results.length < searchCount) {
    try {
      const bingResults = await imageSearch(searchQuery, searchCount);
      if (Array.isArray(bingResults) && bingResults.length > 0) {
        for (const r of bingResults) {
          if (
            results.some((existing) => existing.url === r.url || existing.sourceUrl === r.sourceUrl)
          ) {
            continue;
          }
          results.push({
            title: r.title || searchQuery,
            url: r.url,
            thumbnailUrl: r.thumbnailUrl || r.url,
            sourceUrl: r.sourceUrl || r.url,
          });
          if (results.length >= searchCount) break;
        }
      }
    } catch {
      // Bing fallback failed
    }
  }

  if (results.length > 0) {
    const blocks = results.map((img, i) => {
      const idx = i + 1;
      const title = String(img.title || '').slice(0, 200);
      const url = String(img.url || '');
      const source = img.sourceUrl ? `    Source: ${img.sourceUrl}\n` : '';
      const author = img.author ? `    Author: ${img.author}\n` : '';
      const license = img.license ? `    License: ${img.license}\n` : '';
      return `[${idx}] ${title}\n    Image URL: ${url}\n${source}${author}${license}`;
    });

    const footer =
      '\n\nYou can render these images directly on the page using render_intelligent_ui with an "image" or "image-gallery" node, or with Markdown image syntax ![title](url).';
    const output = blocks.join('\n\n') + footer;

    result = {
      status: 'completed',
      output,
      results,
      retryable: false,
    };

    emitter.event('tool_result', {
      id: call.id,
      ok: true,
      status: 'completed',
      output,
      retryable: false,
      results,
    });

    return { result };
  }

  result = {
    status: 'completed',
    output: 'No images found for this query. Try different or broader search keywords.',
    results: [],
    retryable: false,
  };

  emitter.event('tool_result', {
    id: call.id,
    ok: true,
    status: 'completed',
    output: result.output,
    results: [],
    retryable: false,
  });

  return { result };
};
