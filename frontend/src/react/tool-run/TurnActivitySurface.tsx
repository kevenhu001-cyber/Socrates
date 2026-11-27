import { useEffect, useId, useMemo, useRef, type ReactElement } from 'react';
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
import { clip, liveToolParts, tf } from '../../legacy/toolPresentationModel.ts';
import { useLocaleRefresh, WebUiTheme } from '../rn/WebUiTheme';
import { MathText } from '../rn/useInlineMath';
import { Icon } from '../../legacy/Icon';
import { ThinkingSpark } from './ThinkingSpark';
import { toggleThoughtsPanel } from './mountThoughts';
import { closeThoughtsIfKey, updateThoughts, useThoughtsPanel } from './thoughtsStore';
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
      <Icon name="thinking" size={16} className="activity-step-glyph" />
      <div className="activity-summary-copy">
        {step.title ? (
          <div data-testid="thinking-step-title" className="activity-summary-title">
            <MathText text={step.title} />
          </div>
        ) : null}
        {step.summary ? (
          <div className="activity-summary-detail">
            <span className="activity-step-bullet" aria-hidden="true" />
            <p className="thinking-step-summary">
              <MathText text={step.summary} />
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function activityLabel(
  props: TurnActivitySurfaceProps,
  settledSeconds: number,
  hasSummary: boolean,
  latestStep?: ThinkingStep,
  latestTool?: ToolCallRecord,
) {
  if (props.isLive) {
    return props.statusLabel || props.status?.label || i18n('think.thinking', 'Thinking…');
  }
  if (settledSeconds) {
    return tf('think.thoughtDuration', 'Thought for {sec}s', {
      sec: Math.max(1, Math.round(settledSeconds)),
    });
  }
  if (latestTool) return toolRunView(latestTool).label;
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
    const canGroup = toolRunStateOf(call) === 'done' && !view.agentRun && !view.approval;
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
            phase: entry.phase,
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

function buildSurfaceCaption(
  props: TurnActivitySurfaceProps,
  settledSeconds: number,
  working: boolean,
  headerTool: ToolCallRecord | undefined,
  hasSummary: boolean,
  latestStep?: ThinkingStep,
  latestTool?: ToolCallRecord,
) {
  const liveParts = working ? liveToolParts(headerTool) : null;
  if (!liveParts) {
    return {
      label: activityLabel(props, settledSeconds, hasSummary, latestStep, latestTool),
      labelContent: undefined,
    };
  }
  const label = liveParts.target
    ? `${liveParts.verb} ${clip(liveParts.target, 72)}`
    : liveParts.verb;
  const labelContent = (
    <>
      <span className="activity-caption-verb">{liveParts.verb}</span>
      {liveParts.target ? (
        <>
          {' '}
          <span className="activity-caption-target">{liveParts.target}</span>
        </>
      ) : null}
    </>
  );
  return { label, labelContent };
}

function activityPhaseKind(
  live: boolean,
  status: TurnActivityStatus | undefined,
  latestTool: ToolCallRecord | undefined,
  latestStep: ThinkingStep | undefined,
): string {
  if (live) return status?.phase || 'working';
  if (latestTool) return 'tool';
  return latestStep ? 'thinking' : 'complete';
}

function useThoughtsSync(
  open: boolean,
  entryKey: string,
  panelTitle: string,
  panelDurationLabel: string | undefined,
  timelineContent: ReactElement,
) {
  useEffect(() => {
    if (!open) return;
    updateThoughts({
      key: entryKey,
      title: panelTitle,
      durationLabel: panelDurationLabel,
      content: timelineContent,
    });
  }, [open, entryKey, panelTitle, panelDurationLabel, timelineContent]);

  useEffect(() => () => closeThoughtsIfKey(entryKey), [entryKey]);
}

/** One stable borderless activity trigger per assistant turn; opening reveals the
 * external Thoughts drawer (desktop) or sheet (mobile). Pending approvals
 * deliberately remain in the transcript, outside the activity log. */
export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const { activities, calls, activeTool, status, messageId, readOnly } = props;
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const intentRef = useRef('');
  useLocaleRefresh();
  if (props.intentSummary?.trim()) intentRef.current = props.intentSummary.trim();
  const intent = intentRef.current;
  const { steps, timeline } = useActivityTimeline(activities, calls, props.publicSummary);
  const hasSummary = steps.length > 0 || Boolean(intent);
  const expandable = timeline.length > 0 || Boolean(intent);
  const latestEntry = timeline[timeline.length - 1];
  const latestStep = latestEntry?.kind === 'step' ? latestEntry.step : undefined;
  const latestTool =
    latestEntry?.kind === 'tools' ? latestEntry.tools[latestEntry.tools.length - 1] : undefined;
  const live = Boolean(props.isLive);
  const reasoningSeconds = props.reasoningDurationSec ?? 0;
  const settledSeconds =
    !live && Number.isFinite(reasoningSeconds) ? Math.max(0, reasoningSeconds) : 0;
  const liveToolPhase =
    live && (status?.phase === 'tool-running' || status?.phase === 'tool-awaiting');
  const headerTool = live ? (liveToolPhase ? activeTool : undefined) : latestTool;
  const working = live && status?.phase !== 'answering' && status?.phase !== 'tool-awaiting';
  const startedAt =
    status?.phase === 'tool-running' ? runStartedAt(activeTool) : props.activityStartedAt || 0;
  const elapsedMs = useElapsed(startedAt, working);
  const elapsedSec = elapsedMs > 0 ? elapsedMs / 1000 : status?.elapsedSec;
  const { label, labelContent } = buildSurfaceCaption(
    props,
    settledSeconds,
    working,
    headerTool,
    hasSummary,
    latestStep,
    latestTool,
  );
  const headerIcon = working ? undefined : (
    <Icon name="thinking" size={16} className="activity-leading-glyph" />
  );
  const currentActivity = activityPhaseKind(live, status, latestTool, latestStep);
  const entryKey = `thoughts:${messageId || id}`;
  const thoughtsState = useThoughtsPanel();
  const open = thoughtsState.isOpen && thoughtsState.entry?.key === entryKey;

  const durationLabel =
    working && elapsedSec
      ? tf('think.rn.elapsed', '{sec}s', { sec: Math.max(1, Math.round(elapsedSec)) })
      : undefined;
  const panelTitle = i18n('think.thoughtsTitle', 'Thoughts');
  const panelDurationLabel =
    !live && settledSeconds > 0
      ? tf('think.thoughtDuration', 'Thought for {sec}s', {
          sec: Math.max(1, Math.round(settledSeconds)),
        })
      : durationLabel;

  const overviewTitle = i18n('think.taskOverview', 'Task overview');
  const history = useMemo(
    () => (
      <>
        {intent ? (
          <SummaryStep step={{ id: 'intent', title: overviewTitle, summary: intent }} />
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
  const timelineContent = useMemo(
    () => (
      <>
        {history}
        {working && !liveToolPhase ? (
          <div className="activity-current-step" data-testid="activity-current-step">
            <Icon
              name="activitySpinner"
              size={16}
              className="activity-step-glyph socrates-step-spinner"
            />
            <span>{label}</span>
          </div>
        ) : null}
      </>
    ),
    [history, working, liveToolPhase, label],
  );

  useThoughtsSync(open, entryKey, panelTitle, panelDurationLabel, timelineContent);

  if (!live && !expandable && !settledSeconds) return null;

  return (
    <div
      ref={rootRef}
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
          labelContent={labelContent}
          labelClassName="activity-caption"
          durationLabel={durationLabel}
          durationClassName="activity-duration"
          live={working}
          indicator={working ? <ThinkingSpark size={16} /> : undefined}
          icon={headerIcon}
          iconWidth={16}
          fullWidth={false}
          disclosureIcon={<Icon name="chevronRight" size={14} className="activity-chevron" />}
          expandable={expandable}
          open={open}
          inlineBody={false}
          ariaHasPopup={expandable ? 'dialog' : undefined}
          onToggle={() => {
            const trigger = rootRef.current?.querySelector<HTMLElement>(
              '[data-testid="turn-activity-toggle"]',
            );
            toggleThoughtsPanel(
              {
                key: entryKey,
                title: panelTitle,
                durationLabel: panelDurationLabel,
                content: timelineContent,
              },
              trigger,
            );
          }}
          bodyId="thoughtsPanel"
        />
      </WebUiTheme>
    </div>
  );
}

export default TurnActivitySurface;
