/**
 * read_attachment executor.
 *
 * Lets the model actively read a file the user attached to the
 * conversation (P_file-attachments). The user message carries
 * `[Attached file: "name" (mime, size) — fileId: <uuid>]` pointers; this
 * executor resolves that id against the caller's own uploads (ownership
 * enforced inside attachmentReader) and returns one page of extracted
 * text, a vision description for images, or metadata for media files.
 */

import {
  AttachmentReadError,
  formatAttachmentReadOutput,
  readAttachmentForUser,
} from '../../../../services/attachmentReader.js';
import { isUuid } from '../../../../lib/validate.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executeReadAttachment: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req } = ctx;
  let result: ToolResult;

  const fail = (code: string, retryable: boolean, detail: string, userMessage = '无法读取该附件。'): ToolExecutionResult => {
    result = { status: 'failed', error: code, errorCode: code, retryable };
    emitter.event('tool_result', {
      id: call.id, ok: false, status: 'failed', output: '',
      error: code, errorCode: code, retryable,
      userMessage, detail,
    });
    return { result };
  };

  const fileId = String(args.fileId || args.file_id || '').trim();
  if (!isUuid(fileId)) {
    return fail('invalid_file_id', false,
      'Pass the fileId uuid exactly as shown in the [Attached file: …] pointer.');
  }
  if (!req.userId) {
    return fail('unauthenticated', false, 'No authenticated user on this request.');
  }

  try {
    const page = await readAttachmentForUser({
      fileId,
      userId: req.userId,
      offset: Number(args.offset) || 0,
      limit: Number(args.limit) || 0,
      question: typeof args.question === 'string' ? args.question : undefined,
    });
    const output = formatAttachmentReadOutput(page);
    result = { status: 'completed', output, retryable: false };
    emitter.event('tool_result', {
      id: call.id, ok: true, status: 'completed', output,
      fileId: page.fileId, fileName: page.name, mimeType: page.mimeType,
      offset: page.offset, returnedChars: page.returnedChars,
      totalChars: page.totalChars, hasMore: page.hasMore,
      retryable: false,
      userMessage: `已读取附件 ${page.name}`,
    });
  } catch (err) {
    if (err instanceof AttachmentReadError) {
      return fail(err.code, err.retryable, err.message,
        err.code === 'file_not_found' ? '附件不存在或已被删除。' : '无法读取该附件。');
    }
    const message = (err as Error)?.message || String(err);
    return fail('read_failed', true, message);
  }
  return { result };
};
