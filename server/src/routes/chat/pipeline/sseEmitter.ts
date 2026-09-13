/**
 * sseEmitter — the write side of the chat stream pipeline.
 *
 * One place that knows how to turn a pipeline event into an SSE frame on
 * the response socket, with the abort guard and the `flush` compatibility
 * shim that used to be scattered through the route handler.
 */

import type { Response } from 'express';
import type { ToolCallDelta } from './types.js';

function flush(response: Response): void {
  try { (response as { flush?: () => void }).flush?.(); } catch {}
}

export class SseEmitter {
  private readonly response: Response;
  private readonly aborted: () => boolean;

  constructor(response: Response, isAborted: () => boolean) {
    this.response = response;
    this.aborted = isAborted;
  }

  /** Raw frame write — escapes the abort guard only for lifecycle frames. */
  writeRaw(payload: string): void {
    try {
      this.response.write(payload);
      flush(this.response);
    } catch { /* socket closed — abortController handles cleanup */ }
  }

  /** Guarded write: silently drops frames once the client is gone. */
  write(payload: string): void {
    if (this.aborted()) return;
    this.writeRaw(payload);
  }

  /** `event: <name>\ndata: {...}` frame from a JSON-serialisable bag. */
  event(name: string, data: unknown): void {
    this.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  /** Plain `data:` JSON frame (OpenAI-compatible chat delta). */
  data(value: unknown): void {
    this.write(`data: ${JSON.stringify(value)}\n\n`);
  }

  /** Assistant content delta. */
  content(chunk: string): void {
    this.data({ choices: [{ delta: { content: chunk } }] });
  }

  /** Reasoning delta (thinking pill). */
  reasoning(chunk: string): void {
    this.data({ choices: [{ delta: { reasoning_content: chunk } }] });
  }

  /** Partial tool_call delta (P_tool_stream). */
  toolCallDelta(delta: ToolCallDelta): void {
    this.event('tool_call_delta', {
      index: delta.index,
      id: delta.id || null,
      name: delta.name || null,
      arguments: delta.arguments || '',
      final: !!delta.final,
    });
  }

  /** Terminal `data: [DONE]` + socket end (unguarded: best effort). */
  finish(): void {
    try {
      this.response.write('data: [DONE]\n\n');
      this.response.end();
    } catch { /* ignore */ }
  }

  /** Error frame + terminal DONE + end (upstream error path). */
  fatal(error: Error): void {
    console.error('[chat/stream] LLM error:', error.message);
    // Never forward raw upstream bodies to the client — they may
    // contain provider-specific details. Map to a status-only message;
    // the full body stays in the server log above.
    const status = (error as Error & { status?: number }).status;
    const safeMessage = typeof status === 'number'
      ? `LLM request failed (upstream ${status}). Try again or switch model.`
      : error.message;
    try {
      this.writeRaw(`event: error\ndata: ${JSON.stringify({ error: safeMessage, message: safeMessage })}\n\n`);
      this.response.write('data: [DONE]\n\n');
      this.response.end();
    } catch { /* ignore */ }
  }
}
