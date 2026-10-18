import type { Message, ResearchJob, ResearchJobEvent, ResearchJobRefineResult, ResearchJobRequest } from '@socrates/contracts';

export interface ResearchScope { userId: string; sessionId: string; projectId: string | null }
export interface ResearchView { job: ResearchJob; stage: string; reconnecting: boolean; busy: boolean }
export interface ResearchSnapshot {
  scope: ResearchScope | null;
  jobs: ResearchView[];
  pending: ResearchJobRequest | null;
  submitting: boolean;
  issue: 'load' | 'submit' | 'action' | 'result' | null;
}
export interface ResearchClientPorts {
  list(scope: ResearchScope, signal: AbortSignal): Promise<ResearchJob[]>;
  create(body: ResearchJobRequest, signal: AbortSignal): Promise<ResearchJob>;
  get(id: string, signal: AbortSignal): Promise<ResearchJob>;
  control(id: string, action: 'cancel' | 'retry', signal: AbortSignal): Promise<ResearchJob>;
  refine(id: string, instruction: string, signal: AbortSignal): Promise<ResearchJobRefineResult>;
  watch(id: string, after: number, signal: AbortSignal, event: (event: ResearchJobEvent) => Promise<void>): Promise<void>;
  hasReport(job: ResearchJob): boolean;
  report(job: ResearchJob, signal: AbortSignal): Promise<Message | null>;
  deliver(job: ResearchJob, message: Message): void;
  pending(scope: ResearchScope, body: ResearchJobRequest | null | undefined): ResearchJobRequest | null;
  key(): string;
  delay(ms: number, signal: AbortSignal): Promise<void>;
}
const active = (job: ResearchJob) => job.status === 'queued' || job.status === 'running';
export function researchStage(job: ResearchJob): string {
  if (job.status === 'succeeded') return 'completed';
  if (job.status !== 'running') return job.status;
  if (job.sourceCount) return 'synthesizing';
  if (job.searched) return 'searching';
  return 'planning';
}

type ResearchAcceptor = (job: ResearchJob, epoch: number, stage?: string) => Promise<void>;
interface ResearchControllerRuntime {
  ports: ResearchClientPorts;
  snapshot: () => ResearchSnapshot;
  signal: () => AbortSignal;
  current: (epoch: number) => boolean;
  emit: (patch: Partial<ResearchSnapshot>) => void;
}

function upsertResearchView(snapshot: ResearchSnapshot, view: ResearchView): ResearchView[] {
  return snapshot.jobs.some((entry) => entry.job.id === view.job.id)
    ? snapshot.jobs.map((entry) => entry.job.id === view.job.id ? view : entry)
    : [...snapshot.jobs, view];
}

async function deliverResearchReport(job: ResearchJob, epoch: number, runtime: ResearchControllerRuntime) {
  if (job.status !== 'succeeded' || !job.resultArtifactId || runtime.ports.hasReport(job)) return;
  try {
    const message = await runtime.ports.report(job, runtime.signal());
    if (runtime.current(epoch) && message) runtime.ports.deliver(job, message);
  } catch {
    if (runtime.current(epoch)) runtime.emit({ issue: 'result' });
  }
}

function createResearchAcceptor(runtime: ResearchControllerRuntime): ResearchAcceptor {
  return async (job, epoch, stage) => {
    if (!runtime.current(epoch) || job.sessionId !== runtime.snapshot().scope?.sessionId) return;
    const previous = runtime.snapshot().jobs.find((view) => view.job.id === job.id);
    if (previous && previous.job.eventSequence > job.eventSequence) return;
    const view: ResearchView = { job, stage: stage || researchStage(job), reconnecting: false, busy: previous?.busy || false };
    runtime.emit({ jobs: upsertResearchView(runtime.snapshot(), view) });
    await deliverResearchReport(job, epoch, runtime);
  };
}

interface ResearchWatcherDeps {
  ports: ResearchClientPorts;
  snapshot: () => ResearchSnapshot;
  signal: () => AbortSignal;
  current: (epoch: number) => boolean;
  patchView: (id: string, patch: Partial<ResearchView>) => void;
  watching: Set<string>;
  accept: ResearchAcceptor;
}

function startResearchWatcher(job: ResearchJob, epoch: number, deps: ResearchWatcherDeps) {
  if (!active(job) || deps.watching.has(job.id) || !deps.current(epoch)) return;
  const ownedWatchers = deps.watching;
  ownedWatchers.add(job.id);
  const signal = deps.signal();
  void (async () => {
    let cursor = job.eventSequence;
    let failures = 0;
    while (deps.current(epoch)) {
      try {
        await deps.ports.watch(job.id, cursor, signal, async (event) => {
          if (!deps.current(epoch) || event.jobId !== job.id || event.sequence <= cursor) return;
          const latest = await deps.ports.get(job.id, signal);
          await deps.accept(latest, epoch, latest.eventSequence === event.sequence ? event.stage : undefined);
          cursor = event.sequence;
          failures = 0;
        });
        if (!deps.current(epoch)) return;
        const latest = await deps.ports.get(job.id, signal);
        await deps.accept(latest, epoch);
        cursor = Math.max(cursor, latest.eventSequence);
        if (!active(latest)) return;
      } catch {
        if (!deps.current(epoch)) return;
      }
      deps.patchView(job.id, { reconnecting: true });
      await deps.ports.delay(Math.min(15_000, 1000 * 2 ** Math.min(failures++, 4)), signal);
    }
  })().catch(() => { /* Scope cancellation ends the reconnect delay. */ }).finally(() => {
    ownedWatchers.delete(job.id);
    const latest = deps.snapshot().jobs.find((view) => view.job.id === job.id)?.job;
    if (deps.current(epoch) && latest && active(latest)) startResearchWatcher(latest, epoch, deps);
  });
}

/** Owns subscriptions for one account/session. Every async completion checks
 * its captured generation before changing UI or delivering a report. */
export function createResearchController(ports: ResearchClientPorts) {
  let snapshot: ResearchSnapshot = { scope: null, jobs: [], pending: null, submitting: false, issue: null };
  let generation = 0;
  let abort = new AbortController();
  let watching = new Set<string>();
  const listeners = new Set<() => void>();
  const emit = (patch: Partial<ResearchSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };
  const current = (epoch: number) => epoch === generation && !abort.signal.aborted;
  const patchView = (id: string, patch: Partial<ResearchView>) => emit({ jobs: snapshot.jobs.map((view) => view.job.id === id ? { ...view, ...patch } : view) });
  const runtime: ResearchControllerRuntime = { ports, snapshot: () => snapshot, signal: () => abort.signal, current, emit };
  const accept = createResearchAcceptor(runtime);
  const watch = (job: ResearchJob, epoch: number) => startResearchWatcher(job, epoch, {
    ports, snapshot: () => snapshot, signal: () => abort.signal, current, patchView, watching, accept,
  });

  async function refresh() {
    const epoch = generation;
    const scope = snapshot.scope;
    if (!scope) return;
    try {
      const jobs = await ports.list(scope, abort.signal);
      if (!current(epoch)) return;
      emit({ issue: null });
      for (const job of jobs) {
        await accept(job, epoch);
        watch(job, epoch);
      }
    } catch { if (current(epoch)) emit({ issue: 'load' }); }
  }

  function open(scope: ResearchScope | null) {
    if (JSON.stringify(snapshot.scope) === JSON.stringify(scope)) return;
    abort.abort();
    abort = new AbortController();
    generation++;
    watching = new Set();
    emit({ scope, jobs: [], pending: scope ? ports.pending(scope, undefined) : null, submitting: false, issue: null });
    if (scope) {
      const epoch = generation;
      void refresh().then(() => { if (current(epoch) && snapshot.pending) void submit(); });
    }
  }

  async function submit(query?: string) {
    const scope = snapshot.scope;
    if (!scope || snapshot.submitting) return;
    if (query && snapshot.pending && snapshot.pending.query !== query.trim()) { emit({ issue: 'submit' }); return; }
    const epoch = generation;
    // A response lost after acceptance retains the original key, including
    // across reload. Never silently replace an unresolved submission.
    const body = snapshot.pending || { query: (query || '').trim(), sessionId: scope.sessionId, projectId: scope.projectId, idempotencyKey: ports.key() };
    if (!body.query) return;
    ports.pending(scope, body);
    emit({ pending: body, submitting: true, issue: null });
    try {
      const job = await ports.create(body, abort.signal);
      ports.pending(scope, null);
      if (!current(epoch)) return;
      emit({ pending: null, submitting: false });
      await accept(job, epoch);
      watch(job, epoch);
      return job;
    } catch {
      if (current(epoch)) emit({ submitting: false, issue: 'submit' });
    }
  }

  async function control(id: string, action: 'cancel' | 'retry') {
    const epoch = generation;
    const view = snapshot.jobs.find((entry) => entry.job.id === id);
    if (!view || view.busy) return;
    patchView(id, { busy: true });
    try {
      const job = await ports.control(id, action, abort.signal);
      await accept(job, epoch);
      watch(job, epoch);
    } catch { if (current(epoch)) emit({ issue: 'action' }); }
    finally { if (current(epoch)) patchView(id, { busy: false }); }
  }

  async function refine(id: string, instruction: string) {
    const epoch = generation;
    const view = snapshot.jobs.find((entry) => entry.job.id === id);
    if (!view || view.busy || !active(view.job) || !instruction.trim()) return;
    patchView(id, { busy: true });
    try {
      const result = await ports.refine(id, instruction.trim(), abort.signal);
      await accept(result.previous, epoch);
      await accept(result.job, epoch);
      watch(result.job, epoch);
      return result.job;
    } catch { if (current(epoch)) emit({ issue: 'action' }); }
    finally { if (current(epoch)) patchView(id, { busy: false }); }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open, refresh, submit, control, refine,
    discardPending: () => {
      if (snapshot.submitting || !snapshot.scope) return;
      ports.pending(snapshot.scope, null);
      emit({ pending: null, issue: null });
      void refresh();
    },
  };
}
