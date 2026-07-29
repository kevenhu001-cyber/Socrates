export interface StreamRetryDecision {
  isHeartbeat: boolean;
  semanticActivity: boolean;
  attempt: number;
  maxAttempts: number;
}

/** A full SSE request may be replayed only before visible/semantic output. */
export function shouldRetryInterruptedStream(decision: StreamRetryDecision): boolean {
  return decision.isHeartbeat
    && !decision.semanticActivity
    && decision.attempt < decision.maxAttempts;
}
