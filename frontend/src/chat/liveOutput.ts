/**
 * chat/liveOutput.ts — bounded live output for running tool streams.
 *
 * Each running tool's streamed chunks flow through a bounded buffer backed
 * by the Rust mechanism library (socrates-format::LiveBuffer, compiled to
 * WASM) when loaded: head + tail windows with byte/line caps, counting
 * everything dropped as omitted. The TS fallback below mirrors the Rust
 * semantics exactly so both paths render identically (verified in
 * test/wasmParity.test.mjs).
 */

import { getSocratesWasm } from '../lib/socratesWasm.js';

export interface LivePreview {
  head: string[];
  tail: string[];
  /** Line still being assembled (no trailing newline yet). */
  pending: string;
  /** Complete lines dropped from the middle. */
  omittedLines: number;
  /** Bytes dropped from the middle. */
  omittedBytes: number;
  totalBytes: number;
  totalLines: number;
}

export interface LiveOutputBufferHandle {
  push(chunk: string): void;
  preview(): LivePreview;
}

/* Codex LiveCommandOutput defaults: 50 preview lines, 1 MiB cap. */
export const DEFAULT_MAX_LINES = 50;
export const DEFAULT_MAX_BYTES = 1024 * 1024;

function byteLength(text: string): number {
  try {
    return new TextEncoder().encode(text).length;
  } catch (_) {
    return text.length;
  }
}

/**
 * TS fallback with the same semantics as socrates-format::LiveBuffer:
 * chunks split on '\n' (CRLF normalized), head fills first, then a rolling
 * tail ring; when the tail ring is full its oldest line is evicted to
 * omitted; lines that would exceed the byte cap are omitted wholesale.
 */
function createTsLiveOutputBuffer(maxLines: number, maxBytes: number): LiveOutputBufferHandle {
  const head: string[] = [];
  const tail: string[] = [];
  let pending = '';
  let omittedLines = 0;
  let omittedBytes = 0;
  let storedBytes = 0;
  let totalBytes = 0;
  let totalLines = 0;
  const linesCap = Math.max(1, maxLines);
  const bytesCap = Math.max(1, maxBytes);

  function completeLine(line: string): void {
    totalLines++;
    const len = byteLength(line);
    if (storedBytes + len > bytesCap) {
      omittedLines++;
      omittedBytes += len;
      return;
    }
    if (head.length < linesCap) {
      storedBytes += len;
      head.push(line);
      return;
    }
    if (tail.length < linesCap) {
      storedBytes += len;
      tail.push(line);
      return;
    }
    const evicted = tail.shift() as string;
    tail.push(line);
    omittedLines++;
    omittedBytes += byteLength(evicted);
  }

  return {
    push(chunk: string): void {
      totalBytes += byteLength(chunk);
      pending += chunk;
      let nl = pending.indexOf('\n');
      while (nl !== -1) {
        let line = pending.slice(0, nl);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        pending = pending.slice(nl + 1);
        completeLine(line);
        nl = pending.indexOf('\n');
      }
    },
    preview(): LivePreview {
      return {
        head: [...head],
        tail: [...tail],
        pending,
        omittedLines,
        omittedBytes,
        totalBytes,
        totalLines,
      };
    },
  };
}

/** Bounded buffer for one running tool's streamed output. */
export function createLiveOutputBuffer(
  maxLines: number = DEFAULT_MAX_LINES,
  maxBytes: number = DEFAULT_MAX_BYTES,
): LiveOutputBufferHandle {
  const w = getSocratesWasm();
  if (w) return new w.LiveOutputBuffer(maxLines, maxBytes);
  return createTsLiveOutputBuffer(maxLines, maxBytes);
}

/**
 * Renders a preview into display text: head, an omission marker when lines
 * were dropped, tail, then the pending partial line.
 */
export function renderLivePreview(preview: LivePreview): string {
  const parts = [...preview.head];
  if (preview.omittedLines > 0) {
    const bytes = preview.omittedBytes > 0 ? ` (${preview.omittedBytes} B)` : '';
    parts.push(`… +${preview.omittedLines} lines${bytes} omitted`);
  }
  parts.push(...preview.tail);
  if (preview.pending !== '') parts.push(preview.pending);
  return parts.join('\n');
}
