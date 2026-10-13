/**
 * Run a model-emitted tool batch while honoring registry scheduling hints.
 *
 * Stability is preferred over unbounded speculative parallelism: outbound
 * tool work is globally bounded to two active calls by default. Operators can
 * lower TOOL_MAX_CONCURRENCY to 1 for strict serialization, or raise it when
 * their upstreams and quotas can absorb more parallel work. `sessionSerial`
 * still provides the stronger ordering contract for tools that share mutable
 * conversation state.
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

function toolConcurrencyLimit(): number {
  const configured = Number.parseInt(process.env.TOOL_MAX_CONCURRENCY || '2', 10);
  if (!Number.isFinite(configured)) return 2;
  return Math.max(1, Math.min(8, configured));
}

export async function dispatchToolCalls<TCall, TResult>(
  calls: readonly TCall[],
  getName: (call: TCall) => string,
  registry: ToolSchedulingRegistry,
  execute: (call: TCall) => Promise<TResult>,
): Promise<TResult[]> {
  /* One FIFO lane per shared mutable resource. A separate global permit pool
     bounds otherwise-independent tools so a single model response cannot fan
     out an unbounded number of upstream requests at once. */
  const laneTails = new Map<string, Promise<void>>();
  const concurrency = toolConcurrencyLimit();
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = async () => {
    if (active >= concurrency) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    active += 1;
  };

  const release = () => {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  };

  const runBounded = async (call: TCall): Promise<TResult> => {
    await acquire();
    try {
      return await execute(call);
    } finally {
      release();
    }
  };

  const tasks = calls.map((call) => {
    const entry = registry.get(getName(call));
    if (!entry?.sessionSerial) {
      return runBounded(call);
    }

    const laneKey = entry.sessionSerial === true ? getName(call) : entry.sessionSerial;

    // Advance the tail even when this invocation fails. Otherwise one bad
    // Python call would permanently prevent a later, independent correction
    // in the same turn from running.
    const tail = laneTails.get(laneKey) || Promise.resolve();
    const task = tail.then(() => runBounded(call));
    laneTails.set(laneKey, task.then(
      () => undefined,
      () => undefined,
    ));
    return task;
  });

  return Promise.all(tasks);
}
