/**
 * sseEmitter — the write side of the chat stream pipeline.
 *
 * One place that knows how to turn a pipeline event into an SSE frame on the
 * response socket, with the abort guard and the `flush` compatibility shim.
 * Adjacent model content/reasoning frames are coalesced for a tiny bounded
 * window so compression/socket writes do not run once per provider token;
 * semantic tool and lifecycle events force the text buffer out first.
 */

import type { Response } from 'express';
import type { ToolCallDelta } from './types.js';

const DATA_BATCH_WINDOW_MS = 12;

function flush(response: Response): void {
  try { (response as { flush?: () => void }).flush?.(); } catch {}
}

export class SseEmitter {
  private readonly response: Response;
  private readonly aborted: () => boolean;
  private pendingData = '';
  private dataTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(response: Response, isAborted: () => boolean) {
    this.response = response;
    this.aborted = isAborted;
  }

  private canWrite(): boolean {
    return !this.aborted() && !this.response.writableEnded && !this.response.destroyed;
  }

  private clearDataTimer(): void {
    if (this.dataTimer !== null) {
      clearTimeout(this.dataTimer);
      this.dataTimer = null;
    }
  }

  /** Flush coalesced frames before a semantic event or terminal frame. */
  private flushPendingData(): void {
    this.clearDataTimer();
    const payload = this.pendingData;
    this.pendingData = '';
    if (payload) this.write(payload);
  }

  private queueData(payload: string): void {
    if (!this.canWrite()) return;
    this.pendingData += payload;
    if (this.dataTimer !== null) return;
    this.dataTimer = setTimeout(() => this.flushPendingData(), DATA_BATCH_WINDOW_MS);
    this.dataTimer.unref?.();
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
    if (!this.canWrite()) return;
    this.writeRaw(payload);
  }

  /** `event: <name>\ndata: {...}` frame from a JSON-serialisable bag. */
  event(name: string, data: unknown): void {
    this.flushPendingData();
    this.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  /** Plain `data:` JSON frame (OpenAI-compatible chat delta). */
  data(value: unknown): void {
    this.queueData(`data: ${JSON.stringify(value)}\n\n`);
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
    this.flushPendingData();
    try {
      this.response.write('data: [DONE]\n\n');
      this.response.end();
    } catch { /* ignore */ }
  }

  /** Error frame + terminal DONE + end (upstream error path). */
  fatal(error: Error): void {
    this.flushPendingData();
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
