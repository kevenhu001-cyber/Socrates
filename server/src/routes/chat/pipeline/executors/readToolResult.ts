import type { ToolExecutor } from './types.js';

export const executeReadToolResult: ToolExecutor = async (args, call, ctx) => {
  const id = typeof args.call_id === 'string' ? args.call_id : '';
  const page = ctx.toolResultArchive?.read(
    id,
    Number(args.offset ?? 0),
    Number(args.limit ?? 4000),
  );
  if (!page) {
    const result = {
      status: 'failed',
      errorCode: 'result_page_unavailable',
      retryable: false,
      detail: 'Use a call ID and character offset from a result preview in this turn.',
    };
    ctx.emitter.event('tool_result', { id: call.id, ok: false, ...result });
    return { result };
  }
  const output =
    '[Original tool result range: ' +
    page.offset +
    '-' +
    page.end +
    ' of ' +
    page.total +
    ' chars; has_more: ' +
    (page.hasMore ? 'yes; next_offset: ' + page.end : 'no') +
    ']\n' +
    page.text;
  const result = { status: 'completed', output, retryable: false };
  ctx.emitter.event('tool_result', { id: call.id, ok: true, ...result });
  return { result };
};
