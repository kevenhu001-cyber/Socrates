import { useEffect, useRef, useState } from 'react';
import { agentStepCommand, agentStepLabel, agentStepMeta, formatElapsed, MAX_OUTPUT_CHARS, type AgentPlanData, type AgentStepData } from '../../ui/agentSteps.ts';
import { agentStepIcon } from '../../ui/icons/toolIcons.ts';
import type { ToolRunView } from './toolRunModel';
import { i18n } from '../legacy/gateway.ts';

export interface ToolRunAgentStepsProps {
  run: NonNullable<ToolRunView['agentRun']>;
  /** While true the run section keeps its live timer; then it settles once. */
  live: boolean;
  /** Terminal state to write when the run ends. */
  state?: 'done' | 'failed' | 'cancelled';
}

function translate(key: string): string {
  return i18n(key, key);
}

function StepIcon({ kind }: { kind: string }) {
  return <span className="agent-step-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: agentStepIcon(kind) }} />;
}

function AgentPlan({ plan }: { plan: AgentPlanData }) {
  if (!plan.steps.length) return null;
  const done = plan.steps.filter((step) => step.status === 'done').length;
  const title = translate('agent.stepPlan');
  return (
    <section className="agent-plan" data-progress={`${done}/${plan.steps.length}`}>
      <div className="agent-plan-head">
        <span className="agent-plan-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: agentStepIcon('plan') }} />
        <span className="agent-plan-title">{title === 'agent.stepPlan' ? '更新了计划' : title}</span>
      </div>
      <ol className="agent-plan-list">
        {plan.steps.slice(0, 40).map((step, index) => (
          <li className="agent-plan-item" data-status={step.status} key={`${index}-${step.title}`}>
            <span className="agent-plan-mark" aria-hidden="true" />
            <span className="agent-plan-text">{step.title}</span>
          </li>
        ))}
      </ol>
      <p className="agent-plan-note" hidden={!plan.explanation}>{plan.explanation || ''}</p>
    </section>
  );
}

function AgentStep({ step, state, live }: { step: AgentStepData; state: ToolRunAgentStepsProps['state']; live: boolean }) {
  const status = !live && step.status === 'running'
    ? state === 'failed' ? 'failed' : 'done'
    : step.status;
  const displayedStep = status === step.status ? step : { ...step, status };
  const command = agentStepCommand(displayedStep);
  const meta = agentStepMeta(displayedStep, translate);
  const bodyOutput = String(displayedStep.output || '');
  const visibleOutput = bodyOutput.length > MAX_OUTPUT_CHARS
    ? `…${bodyOutput.slice(-MAX_OUTPUT_CHARS)}`
    : bodyOutput;
  const paths = displayedStep.diffStat?.paths || [];
  const flat = !displayedStep.command && paths.length === 0 && !displayedStep.output;

  return (
    <details
      className={`agent-step${flat ? ' is-flat' : ''}`}
      data-step-id={displayedStep.stepId}
      data-kind={displayedStep.kind}
      data-state={status}
    >
      <summary className="agent-step-head">
        <StepIcon kind={displayedStep.kind} />
        <span className="agent-step-label">{agentStepLabel(displayedStep, translate)}</span>
        <code className="agent-step-cmd" hidden={!command}>{command}</code>
        <span className="agent-step-meta">{meta}</span>
      </summary>
      <div className="agent-step-body">
        {displayedStep.command ? <pre className="agent-step-pre" data-kind="command">{displayedStep.command}</pre> : null}
        {paths.length ? (
          <ul className="agent-step-paths">
            {paths.slice(0, 20).map((path) => <li key={path}>{path}</li>)}
          </ul>
        ) : null}
        {displayedStep.output ? <pre className="agent-step-pre" data-kind="output">{visibleOutput}</pre> : null}
      </div>
    </details>
  );
}

export function ToolRunAgentSteps({ run, live, state }: ToolRunAgentStepsProps) {
  const startedAtRef = useRef({ runId: run.runId, at: Date.now() });
  if (startedAtRef.current.runId !== run.runId) {
    startedAtRef.current = { runId: run.runId, at: Date.now() };
  }
  const [now, setNow] = useState(() => Date.now());
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (!live) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [live]);

  const finalDuration = run.durationMs != null && run.durationMs > 0
    ? run.durationMs
    : Math.max(0, now - startedAtRef.current.at);
  const runState = live ? 'running' : state || 'done';
  const elapsed = formatElapsed(finalDuration, translate);
  const steps = run.steps.slice(0, 200);

  return (
    <div className="agent-run-host">
      <section
        className="agent-run"
        data-run-id={run.runId || undefined}
        data-state={runState}
        data-started-at={startedAtRef.current.at}
        data-duration-ms={!live ? Math.round(finalDuration) : undefined}
      >
        <details className="agent-run-shell" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary className="agent-run-summary">
            <span className="agent-run-elapsed">{elapsed}</span>
            <span className="agent-run-chev" aria-hidden="true" />
          </summary>
          <div className="agent-run-steps">
            {run.plan ? <AgentPlan plan={run.plan} /> : null}
            {steps.map((step) => <AgentStep key={step.stepId} step={step} state={state} live={live} />)}
          </div>
        </details>
      </section>
    </div>
  );
}

export default ToolRunAgentSteps;
