import { memo, useId } from 'react';
import { toolVerbOf } from '@socrates/ui/turn';
import {
  basename,
  clip,
  filePathOf,
  hostOf,
  queryOf,
  translate,
  urlOf,
} from '../../legacy/toolPresentationModel.ts';
import { Button } from '../ui/shadcn/button';
import { Icon } from '../../legacy/Icon';
import { isInlineSearchTool, toolCategory } from '../../render/toolCategory';
import { useLocaleRefresh, WebUiTheme } from '../rn/WebUiTheme';
import { ToolActivityIcon, toolActivitySites } from './ToolActivityIcon';
import { ToolRunAgentSteps } from './ToolRunAgentSteps';
import { ToolRunApproval } from './ToolRunApproval';
import { ToolRunDetail } from './ToolRunDetail';
import { publicToolDetailOf } from './publicToolDetail';
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
  /** Approvals have their own visible surface outside the activity. */
  approvalOutside?: boolean;
}

/** The same sentence-safe position owns the trigger, its detail and its actions. */
export const ToolRunRow = memo(function ToolRunRow({
  call,
  messageId,
  readOnly,
  live,
  approvalOutside,
}: ToolRunRowProps) {
  useLocaleRefresh();
  const view = toolRunView(call);
  const disclosure = useToolRunDisclosure(view.id);
  const detailId = useId();
  const running = live && view.state === 'running';
  const stateLabel = executionStateLabel(view.state, live);
  const label = stateLabel ? toolActionLabel(call) : view.label;
  const detail = publicToolDetailOf(view, call);
  const { expandable } = detail;
  const testId = `tool-row-${view.id}`;
  const search = isInlineSearchTool(call.name);
  const rowContent = (
    <>
      {running && search ? (
        <Icon
          name="activitySpinner"
          size={16}
          className="activity-step-glyph socrates-step-spinner"
          data-testid="thinking-step-spinner"
        />
      ) : search ? (
        <Icon name="search" size={16} className="activity-step-glyph" />
      ) : (
        <ToolActivityIcon name={view.name} sites={toolActivitySites(call)} />
      )}
      <span className="tool-run-label" data-testid="thinking-step-title">
        {label}
      </span>
      {stateLabel ? (
        <span className="tool-run-state" data-testid="thinking-step-status">
          {stateLabel}
        </span>
      ) : null}
      {running && !search ? (
        <Icon
          name="activitySpinner"
          size={16}
          className="activity-step-glyph socrates-step-spinner"
          data-testid="thinking-step-spinner"
        />
      ) : null}
      {expandable ? <Icon name={disclosure.open ? 'chevronUp' : 'chevronDown'} size={16} /> : null}
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
        {disclosure.open && expandable ? (
          <div id={detailId} className="tool-run-detail-body" data-testid="tool-detail">
            <ToolRunDetail detail={detail} />
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
      {view.approval && !approvalOutside ? (
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

function executionStateLabel(state: ToolRunView['state'], live: boolean): string | undefined {
  if (state === 'awaiting') return translate('tool.awaitingApproval', 'Waiting for your decision');
  if (state === 'stopped') return translate('tool.statusStopped', 'Stopped');
  if (state === 'running' && !live) return translate('tool.status.unknown', 'Status unknown');
  return undefined;
}

function toolActionLabel(call: ToolCallRecord): string {
  const verb = toolVerbOf(call.name);
  const category = toolCategory(call.name);
  const target =
    category === 'search'
      ? queryOf(call.input)
      : category === 'fetch'
        ? hostOf(urlOf(call.input))
        : category === 'read' || category === 'write'
          ? basename(filePathOf(call.input))
          : '';
  return [translate(verb.key, verb.fallback), clip(target, 40)].filter(Boolean).join(' · ');
}
