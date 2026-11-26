import { useId, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ThinkingSurface,
  activityTimeline,
  publicSummariesOf,
  stepsWithFallback,
  type ThinkingStep,
} from '@socrates/ui/turn';
import type { TurnActivityEntry } from '@socrates/contracts';
import type { TurnActivityStatus } from '../../legacy/turnActivityModel';
import { i18n } from '../../ui/legacyI18n.ts';
import { tf } from '../../legacy/toolPresentationModel.ts';
import { useLocaleRefresh, WebUiTheme } from '../rn/WebUiTheme';
import { MathText } from '../rn/useInlineMath';
import { Icon } from '../../legacy/Icon';
import { ToolActivityIcon, ToolSiteMarks, turnActivitySites } from './ToolActivityIcon';
import { isInlineSearchTool } from '../../render/toolCategory';
import { ToolRunRow } from './ToolRunRow';
import { ToolRunGroupRow } from './ToolRunGroupRow';
import { useElapsed } from './useElapsed';
import { runStartedAt, toolRunStateOf, toolRunView, type ToolCallRecord } from './toolRunModel';

export interface TurnActivitySurfaceProps {
  /** Only provider-approved public summaries, never raw reasoning. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  reasoningDurationSec?: number;
  activityStartedAt?: number;
  statusLabel?: string;
  status?: TurnActivityStatus;
  intentSummary?: string;
  answerStarted?: boolean;
  activeTool?: ToolCallRecord;
  calls: ReadonlyArray<ToolCallRecord>;
  messageId: string;
  readOnly?: boolean;
}

function SummaryStep({ step }: { step: ThinkingStep }) {
  return (
    <div className="activity-summary-step" data-testid="thinking-step">
      <Icon name="check" size={18} className="activity-step-glyph" />
      <div className="activity-summary-copy">
      {step.title ? (
        <div data-testid="thinking-step-title" className="activity-summary-title">
          <MathText text={step.title} />
        </div>
      ) : null}
      {step.summary ? (
        <p className="thinking-step-summary">
          <MathText text={step.summary} />
        </p>
      ) : null}
      </div>
    </div>
  );
}

function activityLabel(
  props: TurnActivitySurfaceProps,
  hasSummary: boolean,
  latestStep?: ThinkingStep,
  latestTool?: ToolCallRecord,
) {
  if (props.isLive) {
    return props.statusLabel || props.status?.label || i18n('think.thinking', 'Thinking…');
  }
  // Once settled, keep the headline on the final event rather than turning it
  // into a count of the entire hidden history.
  if (latestTool) return toolRunView(latestTool).label;
  const seconds = props.reasoningDurationSec;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
    return tf('think.thoughtDuration', 'Thought for {sec}s', {
      sec: Math.max(1, Math.round(seconds)),
    });
  }
  if (hasSummary) {
    return latestStep?.title || i18n('think.reasoningSummary', 'Thinking summary');
  }
  if (latestStep) return i18n('think.complete', 'Finished thinking');
  if (props.calls.length)
    return tf(
      props.calls.length === 1 ? 'think.summaryToolTitle' : 'think.summaryToolsTitle',
      props.calls.length === 1 ? 'Used {n} tool' : 'Used {n} tools',
      { n: props.calls.length },
    );
  return i18n('think.complete', 'Finished thinking');
}

/** Render short bursts as individual rows and fold only large, settled runs.
 * Failed, active, approval and agent-run entries stay independently visible. */
function toolActivityRows(
  calls: ReadonlyArray<ToolCallRecord>,
  messageId: string,
  readOnly: boolean | undefined,
  live: boolean,
): ReactElement[] {
  const rows: ReactElement[] = [];
  let completedBurst: ToolCallRecord[] = [];

  const flushBurst = () => {
    if (!completedBurst.length) return;
    if (completedBurst.length >= 4) {
      rows.push(
        <ToolRunGroupRow
          key={`tool-group-${completedBurst[0].id}`}
          calls={completedBurst}
          messageId={messageId}
          readOnly={readOnly}
          live={live}
        />,
      );
    } else {
      for (const call of completedBurst) {
        rows.push(
          <ToolRunRow
            key={`tool-${call.id}`}
            call={call}
            messageId={messageId}
            readOnly={readOnly}
            live={live}
            approvalOutside
          />,
        );
      }
    }
    completedBurst = [];
  };

  for (const call of calls) {
    const view = toolRunView(call);
    const canGroup =
      toolRunStateOf(call) === 'done' && !view.agentRun && !view.approval;
    if (canGroup) {
      completedBurst.push(call);
      continue;
    }
    flushBurst();
    rows.push(
      <ToolRunRow
        key={`tool-${call.id}`}
        call={call}
        messageId={messageId}
        readOnly={readOnly}
        live={live}
        approvalOutside
      />,
    );
  }
  flushBurst();
  return rows;
}

function useActivityTimeline(
  activities: TurnActivitySurfaceProps['activities'],
  calls: TurnActivitySurfaceProps['calls'],
  publicSummary: TurnActivitySurfaceProps['publicSummary'],
) {
  const steps = useMemo(
    () => stepsWithFallback(publicSummariesOf(activities), publicSummary),
    [activities, publicSummary],
  );
  const reasoningLabel = i18n('think.observedReasoning', 'Model reasoning');
  const reasoningDone = i18n('think.observedReasoningDone', 'Reasoning finished');
  const timeline = useMemo(() => {
    const toolStarts = new Map<string, number>();
    for (const entry of activities || []) {
      if (entry.kind === 'tool' && entry.toolCallId && Number.isFinite(entry.startedAt)) {
        toolStarts.set(entry.toolCallId, entry.startedAt);
      }
    }
    const reasoningSteps = steps.length
      ? steps
      : (activities || [])
          .filter((entry) => entry.kind === 'reasoning')
          .map((entry) => ({
            id: entry.id,
            title: entry.phase === 'done' ? reasoningDone : reasoningLabel,
            summary: '',
            startedAt: entry.startedAt,
          }));
    return activityTimeline(
      reasoningSteps,
      calls
        .filter((call) => call.id && call.name)
        .map((call) => ({
          id: call.id,
          startedAt: toolStarts.get(call.id) ?? (runStartedAt(call) || undefined),
          item: call,
        })),
    );
  }, [steps, calls, activities, reasoningLabel, reasoningDone]);
  return { steps, timeline };
}

/** One stable disclosure per assistant turn. Tool artifacts and pending
 * approvals deliberately remain in the transcript, outside the activity log. */
export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const { activities, calls, activeTool, status, messageId, readOnly } = props;
  const [open, setOpen] = useState(false);
  const id = useId();
  const intentRef = useRef('');
  useLocaleRefresh();
  if (props.intentSummary?.trim()) intentRef.current = props.intentSummary.trim();
  const intent = intentRef.current;
  const { steps, timeline } = useActivityTimeline(activities, calls, props.publicSummary);
  const hasSummary = steps.length > 0 || Boolean(intent);
  const expandable = timeline.length > 0 || Boolean(intent);
  const latestEntry = timeline[timeline.length - 1];
  const latestStep = latestEntry?.kind === 'step' ? latestEntry.step : undefined;
  const latestTools = latestEntry?.kind === 'tools' ? latestEntry.tools : undefined;
  const latestTool = latestTools?.[latestTools.length - 1];
  const live = Boolean(props.isLive);
  const liveToolPhase = live && (status?.phase === 'tool-running' || status?.phase === 'tool-awaiting');
  const headerTool = live ? (liveToolPhase ? activeTool : undefined) : latestTool;
  const working = live && status?.phase !== 'answering' && status?.phase !== 'tool-awaiting';
  const startedAt =
    status?.phase === 'tool-running' ? runStartedAt(activeTool) : props.activityStartedAt || 0;
  const elapsedMs = useElapsed(startedAt, working);
  const elapsedSec = elapsedMs > 0 ? elapsedMs / 1000 : status?.elapsedSec;
  const label = activityLabel(props, hasSummary, latestStep, latestTool);
  const toolName = headerTool?.name || (liveToolPhase ? status?.toolName : undefined);
  const sites = !toolName || isInlineSearchTool(toolName) ? turnActivitySites(calls) : [];
  const headerIcon = sites.length ? (
    <ToolSiteMarks sites={sites} />
  ) : toolName ? (
    <ToolActivityIcon name={toolName} />
  ) : undefined;
  const currentActivity = live
    ? status?.phase || 'working'
    : latestTool
      ? 'tool'
      : latestStep
        ? 'thinking'
        : 'complete';
  // Keep the mounted timeline stable during elapsed-time ticks. Nested tool
  // detail disclosures already mount their expensive output only when opened.
  const overviewTitle = i18n('think.taskOverview', 'Task overview');
  const history = useMemo(
    () => (
      <>
        {intent ? (
          <SummaryStep
            step={{
              id: 'intent',
              title: overviewTitle,
              summary: intent,
            }}
          />
        ) : null}
        {timeline.flatMap((entry) =>
          entry.kind === 'step'
            ? [<SummaryStep key={`summary-${entry.step.id}`} step={entry.step} />]
            : toolActivityRows(entry.tools, messageId, readOnly, live),
        )}
      </>
    ),
    [intent, timeline, messageId, readOnly, live, overviewTitle],
  );
  if (!live && !expandable && !props.reasoningDurationSec) return null;
  const durationLabel =
    working && elapsedSec
      ? tf('think.rn.elapsed', '{sec}s', { sec: Math.max(1, Math.round(elapsedSec)) })
      : undefined;

  return (
    <div
      className={`rn-turn-activity${live ? ' is-live' : ''}`}
      data-turn-surface-part="activity"
      data-live={working ? 'true' : undefined}
      data-phase={live ? status?.phase : undefined}
      data-current-activity={currentActivity}
      data-activity-timeline={expandable ? 'true' : undefined}
      data-answer-started={props.answerStarted ? 'true' : undefined}
      data-open={open ? 'true' : 'false'}
    >
      <WebUiTheme>
        <ThinkingSurface
          label={label}
          labelClassName="activity-caption"
          durationLabel={durationLabel}
          durationClassName="activity-duration"
          live={working}
          icon={headerIcon}
          iconWidth={sites.length ? 22 * sites.length : 18}
          fullWidth
          disclosureIcon={<Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} className="activity-chevron" />}
          expandable={expandable}
          open={open}
          onToggle={() => setOpen((value) => !value)}
          bodyId={id}
          bodyClassName={`ui-collapse activity-disclosure${open ? '' : ' collapsed'}`}
          bodyStyle={{ display: 'grid', marginTop: 0, marginBottom: 0 }}
          bodyInert={!open}
        >
          <div className="ui-collapse-inner">
            <div
              className="activity-timeline"
              data-testid="thinking-timeline"
            >
              {history}
              {working && !liveToolPhase ? (
                <div className="activity-current-step" data-testid="activity-current-step">
                  <Icon name="activitySpinner" size={18} className="activity-step-glyph socrates-step-spinner" />
                  <span>{label}</span>
                </div>
              ) : null}
            </div>
          </div>
        </ThinkingSurface>
      </WebUiTheme>
    </div>
  );
}

export default TurnActivitySurface;
