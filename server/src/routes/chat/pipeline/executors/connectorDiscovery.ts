/**
 * Connector discovery executors.
 *
 * `search_connectors` ranks the connected catalog; `get_connector_spec`
 * returns one tool's exact schema and activates it for the next hop. The
 * actual connector executors are unchanged and still verify the connection
 * and arguments server-side.
 */

import { searchConnectorCatalog } from '../../../../services/integrations/connectorCatalog.js';
import {
  formatConnectorSearchResult,
  formatConnectorSpec,
} from '../../../../services/integrations/connectorDiscovery.js';
import { recordConnectorSearch } from '../../../../lib/telemetry.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

function complete(ctx: Parameters<ToolExecutor>[2], call: Parameters<ToolExecutor>[1], output: string): ToolExecutionResult {
  const result: ToolResult = { status: 'completed', output, retryable: false };
  ctx.emitter.event('tool_result', {
    id: call.id, ok: true, status: 'completed', output, retryable: false,
  });
  return { result };
}

function fail(
  ctx: Parameters<ToolExecutor>[2],
  call: Parameters<ToolExecutor>[1],
  code: string,
  detail: string,
  userMessage: string,
): ToolExecutionResult {
  const result: ToolResult = { status: 'failed', error: code, errorCode: code, retryable: true, detail };
  ctx.emitter.event('tool_result', {
    id: call.id, ok: false, status: 'failed', output: '',
    error: code, errorCode: code, retryable: true, userMessage, detail,
  });
  return { result };
}

export const executeSearchConnectors: ToolExecutor = async (args, call, ctx) => {
  const query = String(args.query || '').trim();
  if (!query) {
    return fail(ctx, call, 'missing_query', 'Provide a non-empty `query` string.', '请提供要查找的连接器用途。');
  }
  const requestedLimit = Number(args.limit);
  const limit = Number.isFinite(requestedLimit) ? requestedLimit : 8;
  const matches = searchConnectorCatalog(ctx.connectorCatalog, query, limit);
  recordConnectorSearch({
    matches: matches.length,
    topFamily: matches[0]?.family || null,
    topService: matches[0]?.service || null,
  });
  /* Never log the raw query: it is user text. The hit count and the top
     tool names are enough to measure retrieval quality. */
  console.info('[connector-search]', JSON.stringify({
    queryChars: query.length,
    matches: matches.length,
    top: matches.slice(0, 3).map((match) => match.tool),
  }));
  return complete(ctx, call, formatConnectorSearchResult(ctx.connectorCatalog, query, matches));
};

export const executeGetConnectorSpec: ToolExecutor = async (args, call, ctx) => {
  const tool = String(args.tool || '').trim();
  const entry = ctx.connectorCatalog.byTool.get(tool);
  if (!entry) {
    return fail(
      ctx,
      call,
      'unknown_connector_tool',
      `No connected connector named "${tool}". Call search_connectors first and use one of its exact tool names.`,
      '未找到该连接器，请先检索可用连接器。',
    );
  }
  ctx.connectorActivation.activate(tool);
  return complete(ctx, call, formatConnectorSpec(entry));
};
