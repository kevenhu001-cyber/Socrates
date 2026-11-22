/**
 * Execution progress and result events, brokered through pubsub so an SSE
 * client on another process can receive them.
 */
import { publish, subscribe as pubsubSubscribe } from '../../lib/pubsub.js';

export type ProgressEvent = Record<string, unknown>;
export type ProgressListener = (event: ProgressEvent) => void;

function asProgressEvent(value: unknown): ProgressEvent {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as ProgressEvent)
    : { value };
}

export async function subscribeExecution(executionId: string, listener: ProgressListener) {
  return pubsubSubscribe(`exec_progress:${executionId}`, (payload) =>
    listener(asProgressEvent(payload)),
  );
}

export function unsubscribeExecution(executionId: string, listener: ProgressListener) {
  void listener;
}

export async function subscribeExecutionResult(executionId: string, listener: ProgressListener) {
  return pubsubSubscribe(`exec_result:${executionId}`, (payload) =>
    listener(asProgressEvent(payload)),
  );
}

export function unsubscribeExecutionResult(executionId: string, listener: ProgressListener) {
  void listener;
}

export function emitProgress(
  executionId: string,
  event: ProgressEvent,
  onProgress?: ProgressListener | null,
) {
  publish(`exec_progress:${executionId}`, event).catch(() => {
    /* logged in pubsub */
  });
  if (typeof onProgress === 'function') {
    try {
      onProgress(event);
    } catch (_) {
      /* empty-catch: intentional — a progress listener threw; the run continues */
    }
  }
}
