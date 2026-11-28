import { useEffect, useState } from 'react';
import {
  agentStepLabel,
  agentStepMeta,
  formatElapsed,
  type AgentPlanData,
  type AgentStepData,
} from '../../legacy/agentSteps.ts';
import { agentStepIcon } from '../../legacy/icons/toolIcons.ts';
import type { ToolRunView } from './toolRunModel';
import { i18n } from '../../ui/legacyI18n.ts';

export interface ToolRunAgentStepsProps {
  run: NonNullable<ToolRunView['agentRun']>;
  /** While true the run section keeps its live timer; then it settles once. */
  live: boolean;
  /** Terminal state to write when the run ends. */
  state?: 'done' | 'failed' | 'cancelled' | 'awaiting';
  /** A real wall-clock timestamp from the recorded tool run, when available. */
  startedAt?: number;
}

function translate(key: string): string {
  return i18n(key, key);
}

function StepIcon({ kind }: Readonly<{ kind: string }>) {
  return (
    <span
      className="agent-step-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: agentStepIcon(kind) }}
    />
  );
}

function AgentPlan({ plan }: Readonly<{ plan: AgentPlanData }>) {
  if (!plan.steps.length) return null;
  const done = plan.steps.filter((step) => step.status === 'done').length;
  const title = translate('agent.stepPlan');
  return (
    <section className="agent-plan" data-progress={`${done}/${plan.steps.length}`}>
      <div className="agent-plan-head">
        <span
          className="agent-plan-icon"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: agentStepIcon('plan') }}
        />
        <span className="agent-plan-title">
          {title === 'agent.stepPlan' ? '更新了计划' : title}
        </span>
      </div>
      <ol className="agent-plan-list">
        {plan.steps.slice(0, 40).map((step, index) => (
          <li className="agent-plan-item" data-status={step.status} key={`${index}-${step.title}`}>
            <span className="agent-plan-mark" aria-hidden="true" />
            <span className="agent-plan-text">{step.title}</span>
          </li>
        ))}
      </ol>
      <p className="agent-plan-note" hidden={!plan.explanation}>
        {plan.explanation || ''}
      </p>
    </section>
  );
}

function AgentStep({
  step,
  state,
  live,
}: {
  step: AgentStepData;
  state: ToolRunAgentStepsProps['state'];
  live: boolean;
}) {
  // A settled run is not evidence that an unfinished individual step succeeded.
  const status =
    !live && step.status === 'running'
      ? state === 'cancelled'
        ? 'stopped'
        : 'unknown'
      : step.status;
  const statusLabel = status === 'done' ? '' : translate(`tool.status.${status}`);
  const meta = [agentStepMeta({ ...step, exitCode: undefined }, translate), statusLabel]
    .filter(Boolean)
    .join(' · ');
  const paths = step.diffStat?.paths || [];
  const heading = (
    <>
      <StepIcon kind={step.kind} />
      <span className="agent-step-label">
        {agentStepLabel({ ...step, command: undefined, title: '' }, translate)}
      </span>
      <span className="agent-step-meta">{meta}</span>
    </>
  );
  const attributes = {
    'data-step-id': step.stepId,
    'data-kind': step.kind,
    'data-state': status,
  };
  return paths.length ? (
    <details className="agent-step" {...attributes}>
      <summary className="agent-step-head">{heading}</summary>
      <div className="agent-step-body">
        <ul className="agent-step-paths">
          {paths.slice(0, 20).map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>
    </details>
  ) : (
    <div className="agent-step is-flat" {...attributes}>
      <div className="agent-step-head">{heading}</div>
    </div>
  );
}

export function ToolRunAgentSteps({
  run,
  live,
  state,
  startedAt = 0,
}: Readonly<ToolRunAgentStepsProps>) {
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!live || startedAt <= 0) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live, startedAt]);

  const finalDuration =
    run.durationMs != null && run.durationMs > 0
      ? run.durationMs
      : live && startedAt > 0
        ? Math.max(0, now - startedAt)
        : null;
  const runState = live ? 'running' : state || 'unknown';
  const statusKey = runState === 'cancelled' ? 'stopped' : runState;
  const elapsed =
    finalDuration !== null
      ? formatElapsed(finalDuration, translate)
      : translate(`tool.status.${statusKey}`);
  const steps = run.steps.slice(0, 200);

  return (
    <div className="agent-run-host">
      <section
        className="agent-run"
        data-run-id={run.runId || undefined}
        data-state={runState}
        data-started-at={startedAt > 0 ? startedAt : undefined}
        data-duration-ms={!live && finalDuration !== null ? Math.round(finalDuration) : undefined}
      >
        <details
          className="agent-run-shell"
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
        >
          <summary className="agent-run-summary">
            <span className="agent-run-elapsed">{elapsed}</span>
            <span className="agent-run-chev" aria-hidden="true" />
          </summary>
          <div className="agent-run-steps">
            {run.plan ? <AgentPlan plan={run.plan} /> : null}
            {steps.map((step) => (
              <AgentStep key={step.stepId} step={step} state={state} live={live} />
            ))}
          </div>
        </details>
      </section>
    </div>
  );
}

export default ToolRunAgentSteps;
