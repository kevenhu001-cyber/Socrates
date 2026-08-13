/**
 * Run a model-emitted tool batch while honoring registry scheduling hints.
 *
 * Most native tools are side-effect-free and can run concurrently. A tool
 * marked `sessionSerial`, however, shares mutable conversation state (the
 * Python scratch directory today), so calls of that kind must not overlap.
 * Results are still returned in the model's original call order.
 */
export interface ToolSchedulingEntry {
  sessionSerial?: boolean;
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
  let sessionSerialTail: Promise<void> = Promise.resolve();

  const tasks = calls.map((call) => {
    const entry = registry.get(getName(call));
    if (!entry?.sessionSerial) {
      // Use a promise continuation so a synchronous throw is represented as
      // a rejected task just like an async tool failure.
      return Promise.resolve().then(() => execute(call));
    }

    // Advance the tail even when this invocation fails. Otherwise one bad
    // Python call would permanently prevent a later, independent correction
    // in the same turn from running.
    const task = sessionSerialTail.then(() => execute(call));
    sessionSerialTail = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  });

  return Promise.all(tasks);
}
