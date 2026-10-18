import { consumeSseBuffer } from '@socrates/core';
import type { ResearchJobEvent } from '@socrates/contracts';

export async function consumeResearchStream(response: Response, onEvent: (event: ResearchJobEvent) => Promise<void>, signal: AbortSignal) {
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Invalid research stream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const consume = async (final = false) => {
    const frames: string[] = [];
    buffer = consumeSseBuffer(buffer, (frame) => frames.push(frame));
    if (final && buffer.trim()) { frames.push(buffer); buffer = ''; }
    if (buffer.length > 64_000) throw new Error('Research stream frame too large');
    for (const frame of frames) {
      if (signal.aborted) return;
      if (!/^event:\s*research_event\s*$/m.test(frame)) continue;
      const data = frame.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
      const event = JSON.parse(data) as ResearchJobEvent;
      if (typeof event.jobId !== 'string' || !Number.isSafeInteger(event.sequence) || event.sequence < 1 || typeof event.stage !== 'string') throw new Error('Invalid research event');
      await onEvent(event);
    }
  };
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      await consume(done);
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => { /* Stream may already be closed. */ });
    reader.releaseLock();
  }
}

