import { memo, useId, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityStep,
  ThinkingSurface,
  ThinkingTimeline,
  STATUS_COPY,
  activityTimeline,
  publicSummariesOf,
  stepsWithFallback,
  thinkingHeaderOf,
  thinkingLabelOf,
  toolTargetOf,
  toolVerbOf,
  type ThinkingLabels,
  type ThinkingStep,
} from '@socrates/ui/turn';
import type { TurnActivityEntry } from '@socrates/contracts';
import type { TurnActivityStatus } from '../../ui/turnActivityModel';
import { i18n } from '../legacy/gateway';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { ToolActivityIcon, toolActivitySites } from './ToolActivityIcon';
import { ThinkingSpark } from './ThinkingSpark';
import { ToolRunDetail } from './ToolRunDetail';
import { ToolRunAgentSteps } from './ToolRunAgentSteps';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import { useElapsed } from './useElapsed';
import {
  agentRunStateOf,
  runStartedAt,
  toolRunStateOf,
  toolRunView,
  type ToolCallRecord,
  type ToolRunView,
} from './toolRunModel';
import { tf, toolRunLabel } from '../../ui/toolPresentationModel.ts';
import { interfaceIcon } from '../../ui/icons/interfaceIcons.ts';

export interface TurnActivitySurfaceProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  reasoningDurationSec?: number;
  turnDurationMs?: number;
  activityStartedAt?: number;
  statusLabel?: string;
  status?: TurnActivityStatus;
  intentSummary?: string;
  /** True once answer prose has started, even if the turn is still live. */
  answerStarted?: boolean;
  /** Activity-layer tool calls, in transcript order. */
  calls?: ReadonlyArray<ToolCallRecord>;
  activeTool?: ToolCallRecord;
  readOnly?: boolean;
}

function thinkingLabels(hasSummary: boolean, hasIntent: boolean): ThinkingLabels {
  const mixed = hasSummary || hasIntent;
  return {
    runningNoTime: i18n('think.rn.runningNoTime', '正在处理…'),
    doneNoTime: hasSummary
      ? i18n('think.reasoningSummary', 'Thinking summary')
      : i18n('think.activityHistory', 'Activity history'),
    usedTool: mixed
      ? i18n('think.activityWithTool', 'Activity · {n} tool')
      : i18n('think.summaryToolTitle', 'Used {n} tool'),
    usedTools: mixed
      ? i18n('think.activityWithTools', 'Activity · {n} tools')
      : i18n('think.summaryToolsTitle', 'Used {n} tools'),
  };
}

const SUMMARY_PREVIEW_LENGTH = 96;

function SummaryStep({ step }: { step: ThinkingStep }): ReactElement {
  const [open, setOpen] = useState(false);
  const label = step.title || i18n('think.reasoningSummary', 'Thinking summary');
  const characters = Array.from(step.summary);
  const expandable = characters.length > SUMMARY_PREVIEW_LENGTH;
  const preview = expandable
    ? characters.slice(0, SUMMARY_PREVIEW_LENGTH).join('').trimEnd() + '…'
    : step.summary;
  return (
    <ActivityStep
      testID="thinking-step"
      label={label}
      icon={<StepGlyph html={interfaceIcon('thinking')} />}
      expandable={expandable}
      open={open}
      onToggle={expandable ? () => setOpen((value) => !value) : undefined}
      preview={preview ? <p className="thinking-step-preview">{preview}</p> : null}
      detail={expandable ? <p className="thinking-step-summary">{step.summary}</p> : null}
    />
  );
}

function StepGlyph({ html }: { html: string }) {
  return (
    <span
      className="tool-inline-tool-icon"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function hasDetail(view: ToolRunView): boolean {
  return Boolean(
    view.sections.length ||
    view.tech.length ||
    view.livePreview ||
    view.liveOutput ||
    view.approval ||
    view.agentRun,
  );
}

/** One tool call as one row. The detail opens inline, not in a drawer. */
const ToolStep = memo(function ToolStep({
  call,
  live,
  readOnly,
}: {
  call: ToolCallRecord;
  live: boolean;
  readOnly?: boolean;
}): ReactElement {
  useLocaleRefresh();
  const view = toolRunView(call);
  const state = toolRunStateOf(call);
  const running = live && state === 'running';
  const inFlight = live && (state === 'running' || state === 'awaiting');
  const disclosure = useToolRunDisclosure(view.id);
  const expandable = hasDetail(view);
  const label = toolRunLabel(call, state);
  const status = STATUS_COPY[state];
  const statusLabel =
    state === 'running' && !live
      ? i18n('tool.status.unknown', 'Status unknown')
      : i18n(status.key, status.fallback);
  const verb = toolVerbOf(view.name);
  const showAction = state === 'awaiting' || state === 'stopped' || (state === 'running' && !live);
  const title = showAction
    ? [i18n(verb.key, verb.fallback), toolTargetOf(view.name, call.input)]
        .filter(Boolean)
        .join(' · ')
    : label.text;
  const sites = toolActivitySites(call);
  return (
    <div
      className={`rn-tool-row${inFlight ? ' is-live' : ''}`}
      data-tcid={view.id}
      data-tool={view.name}
      data-state={state}
      data-react-owned="1"
      data-error={state === 'error' ? '1' : undefined}
    >
      <WebUiTheme>
        <ActivityStep
          testID={`tool-row-${view.id}`}
          label={title}
          live={running}
          status={statusLabel === title ? undefined : statusLabel}
          metadata={sites.length ? label.meta?.[0] : undefined}
          error={state === 'error'}
          icon={<ToolActivityIcon name={view.name} sites={sites} />}
          iconWidth={sites.length > 1 ? 30 : undefined}
          expandable={expandable}
          open={disclosure.open}
          onToggle={expandable ? () => disclosure.setOpen(!disclosure.open) : undefined}
          detail={
            expandable ? (
              <div className="thinking-step-detail-body" data-testid="tool-detail">
                <ToolRunDetail view={view} call={call} inFlight={inFlight} readOnly={readOnly} />
                {view.agentRun ? (
                  <ToolRunAgentSteps
                    run={view.agentRun}
                    live={inFlight}
                    state={agentRunStateOf(state)}
                  />
                ) : null}
              </div>
            ) : null
          }
        />
      </WebUiTheme>
    </div>
  );
});

function rowsFor(
  steps: ThinkingStep[],
  calls: ReadonlyArray<ToolCallRecord>,
  intent: string,
  live: boolean,
  readOnly?: boolean,
): ReactElement[] {
  const timeline = activityTimeline(
    steps,
    calls.map((call) => ({ id: call.id, startedAt: runStartedAt(call) || undefined, item: call })),
  );
  const rows: ReactElement[] = [];
  if (intent) {
    rows.push(
      <ActivityStep
        key="intent"
        label={i18n('think.taskOverview', 'Task overview')}
        preview={<p className="thinking-step-preview">{intent}</p>}
      />,
    );
  }
  for (const entry of timeline) {
    if (entry.kind === 'step') {
      rows.push(<SummaryStep key={entry.step.id} step={entry.step} />);
      continue;
    }
    for (const call of entry.tools) {
      rows.push(<ToolStep key={call.id} call={call} live={live} readOnly={readOnly} />);
    }
  }
  return rows;
}

const NO_ACTIVITIES: ReadonlyArray<TurnActivityEntry> = [];
const NO_CALLS: ReadonlyArray<ToolCallRecord> = [];

function useActivityDuration(props: TurnActivitySurfaceProps): number | undefined {
  const {
    status,
    activeTool,
    isLive,
    activityStartedAt,
    reasoningDurationSec,
    turnDurationMs,
    calls,
  } = props;
  const phase = status?.phase;
  const startedAt = phase === 'tool-running' ? runStartedAt(activeTool) : activityStartedAt || 0;
  const liveMs = useElapsed(
    Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0,
    Boolean(isLive),
  );
  if (isLive) {
    return liveMs > 0 ? liveMs / 1000 : status?.elapsedSec;
  }
  if (calls?.length) return turnDurationMs ? turnDurationMs / 1000 : undefined;
  return reasoningDurationSec;
}

export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const {
    activities = NO_ACTIVITIES,
    calls = NO_CALLS,
    activeTool,
    isLive = false,
    readOnly,
    status,
  } = props;
  const [isOpen, setIsOpen] = useState(false);
  const previousIntent = useRef('');
  const intent = props.intentSummary?.trim() || previousIntent.current;
  if (props.intentSummary?.trim()) previousIntent.current = intent;
  const bodyId = useId();
  useLocaleRefresh();

  const steps = useMemo(
    () => stepsWithFallback(publicSummariesOf(activities), props.publicSummary),
    [activities, props.publicSummary],
  );
  const rows = useMemo(
    () => rowsFor(steps, calls, intent, isLive, readOnly),
    [steps, calls, intent, isLive, readOnly],
  );
  const durationSec = useActivityDuration(props);
  const header = thinkingHeaderOf({
    live: isLive,
    durationSec,
    toolCount: calls.length,
    statusLabel: isOpen && status?.phase === 'waiting' ? status.label : props.statusLabel,
  });
  const hasDetails = rows.length > 0;
  if (!isLive && !hasDetails && header.durationSec === null) return null;

  const label =
    !isLive && !hasDetails
      ? i18n('think.complete', 'Finished thinking')
      : thinkingLabelOf(header, thinkingLabels(steps.length > 0, Boolean(intent)));
  const durationLabel =
    header.durationSec === null
      ? undefined
      : tf('think.rn.elapsed', '{sec}s', { sec: header.durationSec });
  const openRunningRow =
    isOpen && status?.phase === 'tool-running' && calls.some((call) => call.id === activeTool?.id);
  const showActivityCue =
    isLive && status?.phase !== 'tool-awaiting' && status?.phase !== 'answering' && !openRunningRow;
  const toolName = isLive ? status?.toolName : undefined;
  const sites = toolName ? toolActivitySites(activeTool) : [];

  return (
    <div
      className={`rn-turn-activity${isLive ? ' is-live' : ''}`}
      data-turn-surface-part="activity"
      data-activity-timeline={steps.length ? 'true' : undefined}
      data-live={showActivityCue ? 'true' : undefined}
      data-phase={isLive ? status?.phase : undefined}
      data-answer-started={props.answerStarted ? 'true' : undefined}
      data-open={isOpen ? 'true' : 'false'}
    >
      <WebUiTheme>
        <ThinkingSurface
          label={label}
          durationLabel={durationLabel}
          live={isLive}
          indicator={showActivityCue ? <ThinkingSpark /> : undefined}
          icon={toolName ? <ToolActivityIcon name={toolName} sites={sites} /> : undefined}
          iconWidth={sites.length > 1 ? 30 : undefined}
          expandable={hasDetails}
          open={isOpen}
          onToggle={() => setIsOpen((previous) => !previous)}
          bodyId={bodyId}
        >
          {hasDetails ? <ThinkingTimeline>{rows}</ThinkingTimeline> : null}
        </ThinkingSurface>
      </WebUiTheme>
    </div>
  );
}

export default TurnActivitySurface;
