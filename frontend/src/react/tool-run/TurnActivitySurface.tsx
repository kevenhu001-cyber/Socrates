/**
 * The turn's activity surface (RN-2): one quiet line of run time above a
 * rail of steps.
 *
 * Live:      the header counts up (「已运行 12秒」) behind the turning
 *            sphere, its caption sweeps a shimmer, and the running step
 *            spins on its own arc.
 * Settled:   the count freezes (「运行了 12秒」), the glyph and the shimmer
 *            stop with it, and every row is still.
 * Steps:     public provider summaries and tool calls share one row shape;
 *            a row opens its detail inline, beneath its own label.
 *
 * Only public provider summaries reach this file; raw reasoning never does.
 */
import { useId, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityStep,
  ThinkingSurface,
  ThinkingTimeline,
  activityTimeline,
  publicSummariesOf,
  stepsWithFallback,
  thinkingHeaderOf,
  thinkingLabelOf,
  type ThinkingLabels,
  type ThinkingStep,
} from '@socrates/ui/turn';
import type { TurnActivityEntry } from '@socrates/contracts';
import type { LiveTurnStatus } from '../types/domain';
import { i18n } from '../legacy/gateway';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { ToolActivityIcon } from './ToolActivityIcon';
import { ThinkingSpark } from './ThinkingSpark';
import { ToolRunDetail } from './ToolRunDetail';
import { ToolRunAgentSteps } from './ToolRunAgentSteps';
import { useToolRunDisclosure } from './ToolRunDisclosure';
import { useElapsed } from './useElapsed';
import { agentRunStateOf, runStartedAt, toolRunStateOf, toolRunView, type ToolCallRecord, type ToolRunView } from './toolRunModel';
import { toolRunLabel } from '../../ui/toolPresentationModel.ts';
import { interfaceIcon } from '../../ui/icons/interfaceIcons.ts';

export interface TurnActivitySurfaceProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  elapsedSec?: number;
  statusLabel?: string;
  status?: LiveTurnStatus;
  showActivityCue?: boolean;
  intentSummary?: string;
  /** True once answer prose has started, even if the turn is still live. */
  answerStarted?: boolean;
  /** Activity-layer tool calls, in transcript order. */
  calls?: ReadonlyArray<ToolCallRecord>;
  messageId?: string;
  readOnly?: boolean;
}

function thinkingLabels(): ThinkingLabels {
  return {
    running: i18n('think.rn.running', '已运行 {sec}秒'),
    ran: i18n('think.rn.ran', '运行了 {sec}秒'),
    runningNoTime: i18n('think.rn.runningNoTime', '正在处理…'),
    doneNoTime: i18n('think.rn.doneNoTime', '活动详情'),
  };
}

/** A public summary row. The body text, when present, is the disclosure. */
function SummaryStep({ step, live }: { step: ThinkingStep; live: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const label = step.title || step.summary;
  const expandable = Boolean(step.summary);
  return (
    <ActivityStep
      testID="thinking-step"
      label={label}
      live={live}
      icon={<StepGlyph html={interfaceIcon('thinking')} />}
      expandable={expandable}
      open={open}
      onToggle={expandable ? () => setOpen((value) => !value) : undefined}
      detail={expandable ? <p className="thinking-step-summary">{step.summary}</p> : null}
    />
  );
}

function StepGlyph({ html }: { html: string }) {
  return <span className="tool-inline-tool-icon" aria-hidden="true" dangerouslySetInnerHTML={{ __html: html }} />;
}

function hasDetail(view: ToolRunView): boolean {
  return Boolean(view.sections.length || view.tech.length || view.livePreview || view.liveOutput || view.approval);
}

/** One tool call as one row. The detail opens inline, not in a drawer. */
function ToolStep({ call, readOnly }: { call: ToolCallRecord; readOnly?: boolean }): ReactElement {
  const view = toolRunView(call);
  const state = toolRunStateOf(call);
  const inFlight = state === 'running' || state === 'awaiting';
  const disclosure = useToolRunDisclosure(view.id);
  const expandable = hasDetail(view);
  const label = toolRunLabel(call, state).text;
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
          label={label}
          live={inFlight}
          error={state === 'error'}
          icon={<ToolActivityIcon name={view.name} />}
          expandable={expandable}
          open={disclosure.open}
          onToggle={expandable ? () => disclosure.setOpen(!disclosure.open) : undefined}
          detail={expandable ? (
            <div className="thinking-step-detail-body" data-testid="tool-detail">
              <ToolRunDetail view={view} call={call} inFlight={inFlight} readOnly={readOnly} />
              {view.agentRun ? <ToolRunAgentSteps run={view.agentRun} live={inFlight} state={agentRunStateOf(state)} /> : null}
            </div>
          ) : null}
        />
      </WebUiTheme>
    </div>
  );
}

/** The observed run start: earliest activity or tool stamp, else mount time. */
function useRunStart(activities: ReadonlyArray<TurnActivityEntry>, calls: ReadonlyArray<ToolCallRecord>): number {
  const mountAt = useRef(Date.now());
  return useMemo(() => {
    let first = 0;
    for (const entry of activities) {
      if (typeof entry.startedAt === 'number' && entry.startedAt > 0 && (!first || entry.startedAt < first)) first = entry.startedAt;
    }
    for (const call of calls) {
      const started = runStartedAt(call);
      if (started > 0 && (!first || started < first)) first = started;
    }
    return first || mountAt.current;
  }, [activities, calls]);
}

/** Build the rail's rows, plus the live-status fallback when nothing runs. */
function rowsFor(input: {
  steps: ThinkingStep[];
  calls: ReadonlyArray<ToolCallRecord>;
  intent: string;
  isLive: boolean;
  statusLabel?: string;
  status?: LiveTurnStatus;
  readOnly?: boolean;
}): ReactElement[] {
  const { steps, calls, intent, isLive, statusLabel, status, readOnly } = input;
  const timeline = activityTimeline(steps, calls.map((call) => ({ id: call.id, startedAt: runStartedAt(call) || undefined, item: call })));
  const lastStep = steps[steps.length - 1];
  const rows: ReactElement[] = [];
  if (intent) rows.push(<ActivityStep key="intent" testID="thinking-step" label={intent} />);
  for (const entry of timeline) {
    if (entry.kind === 'step') {
      const step = entry.step;
      rows.push(<SummaryStep key={step.id} step={step} live={isLive && step === lastStep && step.phase === 'running'} />);
      continue;
    }
    for (const call of entry.tools) rows.push(<ToolStep key={call.id} call={call} readOnly={readOnly} />);
  }

  /* While the turn is live something must always be visibly working. If no
     tool row owns the spinner, the transport's own status takes the last row. */
  const hasLiveRow = isLive && (
    (lastStep?.phase === 'running')
    || calls.some((call) => ['running', 'awaiting'].includes(toolRunStateOf(call)))
  );
  if (isLive && !hasLiveRow) {
    rows.push(
      <ActivityStep
        key="status"
        testID="thinking-step"
        label={statusLabel || i18n('think.rn.runningNoTime', '正在处理…')}
        live
        icon={status?.toolName ? <ToolActivityIcon name={status.toolName} /> : undefined}
      />,
    );
  }
  return rows;
}

function surfaceDataAttrs(input: { isLive: boolean; showActivityCue: boolean; status?: LiveTurnStatus; answerStarted: boolean; isOpen: boolean; hasTimeline: boolean }) {
  return {
    'data-turn-surface-part': 'activity',
    'data-activity-timeline': input.hasTimeline ? 'true' : undefined,
    'data-live': input.isLive && input.showActivityCue ? 'true' : undefined,
    'data-phase': input.isLive ? input.status?.phase : undefined,
    'data-answer-started': input.answerStarted ? 'true' : undefined,
    'data-open': input.isOpen ? 'true' : 'false',
  };
}

export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const { activities = [], isLive = false, elapsedSec, status, calls = [], readOnly } = props;
  const statusLabel = props.statusLabel?.trim();
  const answerStarted = Boolean(props.answerStarted);
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  useLocaleRefresh();

  const timelineSteps = publicSummariesOf(activities);
  const steps = stepsWithFallback(timelineSteps, (props.publicSummary || '').trim());
  const intent = props.intentSummary?.trim() || '';

  const liveSec = useElapsed(useRunStart(activities, calls), isLive);
  /* The ticking counter stops with the turn; keep the last observed second
     so a settled row never drops back to "activity details". */
  const lastSec = useRef(0);
  if (isLive) lastSec.current = Math.max(lastSec.current, Math.ceil(liveSec / 1000));
  const frozenSec = lastSec.current || undefined;
  const durationSec = isLive ? liveSec / 1000 : frozenSec ?? elapsedSec;
  const header = thinkingHeaderOf({ live: isLive, durationSec });
  const label = thinkingLabelOf(header, thinkingLabels());

  const rows = rowsFor({ steps, calls, intent, isLive, statusLabel, status, readOnly });
  const hasDetails = rows.length > 0 && Boolean(steps.length || intent || calls.length);
  if (!hasDetails && !isLive) return null;
  const attrs = surfaceDataAttrs({ isLive, showActivityCue: props.showActivityCue !== false, status, answerStarted, isOpen, hasTimeline: timelineSteps.length > 0 });

  return (
    <div className={`rn-turn-activity${isLive ? ' is-live' : ''}`} {...attrs}>
      <WebUiTheme>
        <ThinkingSurface
          label={label}
          live={isLive}
          indicator={isLive ? <ThinkingSpark /> : undefined}
          expandable={hasDetails}
          open={isOpen}
          onToggle={() => setIsOpen((previous) => !previous)}
          bodyId={bodyId}
        >
          {hasDetails ? <ThinkingTimeline>{rows}</ThinkingTimeline> : null}
        </ThinkingSurface>
        {!hasDetails && isLive ? <ThinkingTimeline>{rows}</ThinkingTimeline> : null}
      </WebUiTheme>
    </div>
  );
}

export default TurnActivitySurface;
