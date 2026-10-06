export interface VisualizationCallLike {
  name?: unknown;
  input?: unknown;
  visualization?: unknown;
  isError?: unknown;
  status?: unknown;
  _run?: { phase?: unknown } | null;
}

/**
 * The v1 visualization spec a call carries, from whichever field the writer
 * used: `visualization` (the runtime's normalized result) or, while the call
 * is still streaming, the `render_visualization` arguments themselves.
 */
export function visualizationSpecOf(
  call: VisualizationCallLike | null | undefined,
): Record<string, unknown> | null {
  if (!call) return null;
  if (call.name === 'render_visualization') {
    const status = String(call.status || '').toLowerCase();
    const phase = String(call._run?.phase || '').toLowerCase();
    if (call.isError === true
      || ['failed', 'error', 'timeout', 'timed_out', 'cancelled', 'stopped', 'aborted'].includes(status)
      || ['failed', 'timed_out', 'cancelled'].includes(phase)) return null;
  }
  const persisted = call.visualization;
  if (persisted && typeof persisted === 'object' && (persisted as { version?: unknown }).version === 1) {
    return persisted as Record<string, unknown>;
  }
  if (call.name === 'render_visualization' && call.input && typeof call.input === 'object') {
    const input = call.input as Record<string, unknown>;
    if (input.version === 1) return input;
  }
  return null;
}
