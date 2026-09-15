/**
 * Run a model-emitted tool batch while honoring registry scheduling hints.
 *
 * Most native tools are side-effect-free and can run concurrently. A tool
 * marked `sessionSerial`, however, shares mutable conversation state (the
 * Python scratch directory today), so calls of that kind must not overlap.
 * Results are still returned in the model's original call order.
 */
export interface ToolSchedulingEntry {
  /* `true` serializes same-named calls; a string names a lane SHARED
   * across tools that mutate the same state — e.g. workspace_agent and
   * initialize_workspace both touch the conversation workspace, so they
   * share the 'workspace' lane, while code_interpreter's scratch dir is
   * independent and gets its own 'code' lane. */
  sessionSerial?: boolean | string;
}

export interface ToolSchedulingRegistry {
  get(name: string): ToolSchedulingEntry | null | undefined;
}

export async function dispatchToolCalls<TCall, TResult>(
  calls: readonly TCall[],
  getName: (call: TCall) => string,
  registry: ToolSchedulingRegistry,
  execute: (call: TCall) => Promise<TResult>,
): Promise<TResult[]> {
  /* One FIFO lane per shared resource, not one global lane: a
   * code_interpreter call need not wait behind a workspace_agent run —
   * they serialize only within their own lane. */
  const laneTails = new Map<string, Promise<void>>();

  const tasks = calls.map((call) => {
    const entry = registry.get(getName(call));
    if (!entry?.sessionSerial) {
      // Use a promise continuation so a synchronous throw is represented as
      // a rejected task just like an async tool failure.
      return Promise.resolve().then(() => execute(call));
    }

    const laneKey = entry.sessionSerial === true ? getName(call) : entry.sessionSerial;

    // Advance the tail even when this invocation fails. Otherwise one bad
    // Python call would permanently prevent a later, independent correction
    // in the same turn from running.
    const tail = laneTails.get(laneKey) || Promise.resolve();
    const task = tail.then(() => execute(call));
    laneTails.set(laneKey, task.then(
      () => undefined,
      () => undefined,
    ));
    return task;
  });

  return Promise.all(tasks);
}
