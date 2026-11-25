import { memo, useId } from 'react';
import { Chevron, Spinner, toolTargetOf, toolVerbOf } from '@socrates/ui/turn';
import { translate } from '../../legacy/toolPresentationModel.ts';
import { agentStepCommand, agentStepLabel } from '../../legacy/agentSteps.ts';
import { Button } from '../ui/shadcn/button';
import { useLocaleRefresh, WebUiTheme } from '../rn/WebUiTheme';
import { ToolActivityIcon, toolActivitySites } from './ToolActivityIcon';
import { ToolRunAgentSteps } from './ToolRunAgentSteps';
import { ToolRunApproval } from './ToolRunApproval';
import { ToolRunDetail } from './ToolRunDetail';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import {
  agentRunStateOf,
  runStartedAt,
  toolRunView,
  type ToolCallRecord,
  type ToolRunView,
} from './toolRunModel';

interface ToolRunRowProps {
  call: ToolCallRecord;
  messageId?: string;
  readOnly?: boolean;
  live: boolean;
}

/** The same sentence-safe position owns the trigger, its detail and its actions. */
export const ToolRunRow = memo(function ToolRunRow({
  call,
  messageId,
  readOnly,
  live,
}: ToolRunRowProps) {
  useLocaleRefresh();
  const view = toolRunView(call);
  const disclosure = useToolRunDisclosure(view.id);
  const detailId = useId();
  const running = live && view.state === 'running';
  const stateLabel = executionStateLabel(view.state, live);
  const label = stateLabel ? toolActionLabel(call) : view.label;
  const expandable = hasToolDetail(view);
  const testId = `tool-row-${view.id}`;
  const rowContent = (
    <>
      <ToolActivityIcon name={view.name} sites={toolActivitySites(call)} />
      <span className="tool-run-label" data-testid="thinking-step-title">
        {label}
      </span>
      {stateLabel ? (
        <span className="tool-run-state" data-testid="thinking-step-status">
          {stateLabel}
        </span>
      ) : null}
      {running ? <Spinner /> : null}
      {expandable ? <Chevron open={disclosure.open} size={6} /> : null}
    </>
  );

  return (
    <div
      className={`rn-tool-row${running ? ' is-live' : ''}`}
      data-tcid={view.id}
      data-tool={view.name}
      data-state={view.state}
      data-react-owned="1"
      data-error={view.state === 'error' ? '1' : undefined}
    >
      <WebUiTheme>
        {expandable ? (
          <Button
            variant="surface"
            type="button"
            className="tool-run-trigger"
            data-testid={testId}
            title={label}
            aria-expanded={disclosure.open}
            aria-controls={detailId}
            onClick={() => disclosure.setOpen(!disclosure.open)}
          >
            {rowContent}
          </Button>
        ) : (
          <div className="tool-run-trigger" data-testid={testId} title={label}>
            {rowContent}
          </div>
        )}
        {running && !disclosure.open && view.agentRun ? (
          <AgentActivityPreview run={view.agentRun} />
        ) : null}
        {disclosure.open && expandable ? (
          <div id={detailId} className="tool-run-detail-body" data-testid="tool-detail">
            <ToolRunDetail
              view={view}
              call={call}
              inFlight={live && (view.state === 'running' || view.state === 'awaiting')}
              readOnly={readOnly}
            />
            {view.agentRun ? (
              <ToolRunAgentSteps
                run={view.agentRun}
                live={running}
                state={view.state === 'awaiting' ? 'awaiting' : agentRunStateOf(view.state)}
                startedAt={runStartedAt(call)}
              />
            ) : null}
          </div>
        ) : null}
      </WebUiTheme>
      {view.approval ? (
        <ToolRunApproval
          view={view.approval}
          messageId={messageId ?? ''}
          toolCallId={view.id}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
});

function hasToolDetail(view: ToolRunView): boolean {
  return Boolean(
    view.sections.length ||
    view.tech.length ||
    view.livePreview ||
    view.liveOutput ||
    view.approval ||
    view.agentRun,
  );
}

function executionStateLabel(state: ToolRunView['state'], live: boolean): string | undefined {
  if (state === 'awaiting') return translate('tool.awaitingApproval', 'Waiting for your decision');
  if (state === 'stopped') return translate('tool.statusStopped', 'Stopped');
  if (state === 'running' && !live) return translate('tool.status.unknown', 'Status unknown');
  return undefined;
}

function toolActionLabel(call: ToolCallRecord): string {
  const verb = toolVerbOf(call.name);
  const target = toolTargetOf(call.name, call.input);
  return [translate(verb.key, verb.fallback), target].filter(Boolean).join(' · ');
}

/** A live, compact preview of the recorded workspace activity. Raw terminal
 * output and approval controls stay in their existing, explicit surfaces. */
function AgentActivityPreview({ run }: { run: NonNullable<ToolRunView['agentRun']> }) {
  const active = [...run.steps].reverse().find((step) => step.status === 'running');
  const latest = active || run.steps[run.steps.length - 1];
  if (!latest) return null;
  const completed = run.steps.filter((step) => step.status === 'done').length;
  const label = latest.status === 'running'
    ? [translate('tool.status.running', 'Running'), agentStepCommand(latest)].filter(Boolean).join(' · ')
    : agentStepLabel(latest, (key) => translate(key, key));
  return (
    <div className="agent-activity-preview" data-state={latest.status} data-testid="agent-activity-preview">
      <span className="agent-activity-preview-label">{label}</span>
      <span className="agent-activity-preview-count">{completed}/{run.steps.length}</span>
    </div>
  );
}
