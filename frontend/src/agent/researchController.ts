import type { Message, ResearchJob, ResearchJobEvent, ResearchJobRequest } from '@socrates/contracts';

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

  async function accept(job: ResearchJob, epoch: number, stage?: string) {
    if (!current(epoch) || job.sessionId !== snapshot.scope?.sessionId) return;
    const previous = snapshot.jobs.find((view) => view.job.id === job.id);
    if (previous && previous.job.eventSequence > job.eventSequence) return;
    const view = { job, stage: stage || researchStage(job), reconnecting: false, busy: previous?.busy || false };
    emit({ jobs: previous ? snapshot.jobs.map((entry) => entry.job.id === job.id ? view : entry) : [...snapshot.jobs, view] });
    if (job.status === 'succeeded' && job.resultArtifactId && !ports.hasReport(job)) {
      try {
        const message = await ports.report(job, abort.signal);
        if (current(epoch) && message) ports.deliver(job, message);
      } catch {
        if (current(epoch)) emit({ issue: 'result' });
      }
    }
  }

  function watch(job: ResearchJob, epoch: number) {
    if (!active(job) || watching.has(job.id) || !current(epoch)) return;
    const ownedWatchers = watching;
    ownedWatchers.add(job.id);
    const signal = abort.signal;
    void (async () => {
      let cursor = job.eventSequence;
      let failures = 0;
      while (current(epoch)) {
        try {
          await ports.watch(job.id, cursor, signal, async (event) => {
            if (!current(epoch) || event.jobId !== job.id || event.sequence <= cursor) return;
            const latest = await ports.get(job.id, signal);
            await accept(latest, epoch, latest.eventSequence === event.sequence ? event.stage : undefined);
            cursor = event.sequence;
            failures = 0;
          });
          if (!current(epoch)) return;
          const latest = await ports.get(job.id, signal);
          await accept(latest, epoch);
          cursor = Math.max(cursor, latest.eventSequence);
          if (!active(latest)) return;
        } catch {
          if (!current(epoch)) return;
        }
        patchView(job.id, { reconnecting: true });
        await ports.delay(Math.min(15_000, 1000 * 2 ** Math.min(failures++, 4)), signal);
      }
    })().catch(() => { /* Scope cancellation ends the reconnect delay. */ }).finally(() => {
      ownedWatchers.delete(job.id);
      const latest = snapshot.jobs.find((view) => view.job.id === job.id)?.job;
      if (current(epoch) && latest && active(latest)) watch(latest, epoch);
    });
  }

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

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    open, refresh, submit, control,
    discardPending: () => {
      if (snapshot.submitting || !snapshot.scope) return;
      ports.pending(snapshot.scope, null);
      emit({ pending: null, issue: null });
      void refresh();
    },
  };
}
