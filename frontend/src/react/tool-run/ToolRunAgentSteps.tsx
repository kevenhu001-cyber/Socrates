/**
 * react/tool-run/ToolRunAgentSteps.tsx — the Codex step log under a run's row.
 *
 * A workspace-agent turn reports its activity as a list of steps plus a todo
 * plan. Drawing that is genuinely intricate (running vs done rows, diffs, exit
 * codes, a shared elapsed timer, in-place upsert keyed by stepId) and
 * `ui/agentSteps.ts` already owns it, idempotently, for history replay and the
 * drawer. So this component does not re-implement the markup: it keeps a host
 * node and hands that node to the existing upserts whenever the data changes.
 *
 * What it does fix is where the data comes from. The steps used to live only in
 * DOM that finish() baked into message.html, which is why a reload re-drew them
 * but a declarative bubble could not; they are now persisted on the tool call
 * (server/src/routes/sessions.ts) and read back from here.
 */
import { useEffect, useRef } from 'react';

import {
  settleAgentRun,
  stopAgentRunTimer,
  upsertAgentPlan,
  upsertAgentStep,
} from '../../ui/agentSteps.js';
import type { ToolRunView } from './toolRunModel';

export interface ToolRunAgentStepsProps {
  run: NonNullable<ToolRunView['agentRun']>;
  /** While true the run section keeps its live timer; then it settles once. */
  live: boolean;
  /** Terminal state to write when the run ends. */
  state?: 'done' | 'failed' | 'cancelled';
}

/**
 * Cheap change detector: the step list only ever grows or flips a status, and
 * re-running the upserts is idempotent but not free.
 */
function runSignature(props: ToolRunAgentStepsProps): string {
  const { run, live, state } = props;
  let steps = '';
  for (const step of run.steps) steps += step.stepId + ':' + step.status + ';';
  let plan = '';
  if (run.plan) {
    for (const item of run.plan.steps) plan += item.status + ',';
  }
  return `${run.runId}|${steps}|${plan}|${live ? 'live' : state || 'done'}`;
}

export function ToolRunAgentSteps(props: ToolRunAgentStepsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const drawnRef = useRef('');
  /* The render keeps its own record of what was last drawn, so this effect can
     run after every render without deps and still do nothing when the data is
     unchanged — the alternative is a dep array on a `run` object that
     toolRunView rebuilds each time. */
  useEffect(() => {
    const signature = runSignature(props);
    if (drawnRef.current === signature) return;
    drawnRef.current = signature;
    const host = hostRef.current;
    if (!host) return;
    const { run, live, state } = props;
    try {
      if (run.plan) upsertAgentPlan(host, run.plan, run.runId);
      for (const step of run.steps) upsertAgentStep(host, step, run.runId);
      if (!live) {
        settleAgentRun(host, { runId: run.runId, state: state || 'done', durationMs: run.durationMs });
      }
    } catch (_) {
      /* Presentation only — the row's own status line still tells the truth. */
    }
  });

  useEffect(() => () => {
    /* A run that is still going when its bubble unmounts (session switch,
       regenerate) must leave the shared timer, which otherwise keeps ticking a
       detached node. */
    const host = hostRef.current;
    const section = host && host.querySelector('.agent-run');
    if (section) stopAgentRunTimer(section as HTMLElement);
  }, []);

  return <div className="agent-run-host" ref={hostRef} />;
}

export default ToolRunAgentSteps;
