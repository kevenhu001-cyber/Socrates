/**
 * The turn's activity surface (RN-2): the thinking line plus its timeline of
 * public summaries and tool calls, drawn with @socrates/ui/turn.
 *
 * Live:      「思考中 · 第 N 步」 over a travelling hairline.
 * Settled:   「思考 Xs · N 步」 ▸ — expands into the vertical timeline.
 * Tools:     consecutive calls merge into 「使用了 N 个工具」, expandable.
 *
 * Only public provider summaries reach this file; raw reasoning never does.
 */
import { useId, useState, type ReactElement } from 'react';
import {
  ThinkingSurface,
  ThinkingTimeline,
  ToolCallGroup,
  activityTimeline,
  aggregateStatus,
  formatDurationMs,
  publicSummariesOf,
  stepsWithFallback,
  sumDurations,
  thinkingHeaderOf,
  thinkingLabelOf,
  type ThinkingStep,
  type TimelineEntry,
  type ToolCardStatus,
} from '@socrates/ui/turn';
import type { TurnActivityEntry } from '@socrates/contracts';
import type { LiveTurnStatus } from '../types/domain';
import { i18n } from '../legacy/gateway';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { ToolActivityIcon } from './ToolActivityIcon';
import { ToolRunRow, callDurationMs, statusLabelOf } from './ToolRunRow';
import { runStartedAt, toolRunStateOf, toolRunView, type ToolCallRecord } from './toolRunModel';

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

function thinkingLabels() {
  return {
    live: i18n('think.rn.live', 'Thinking · step {n}'),
    done: i18n('think.rn.done', 'Thought {sec}s · {n} steps'),
    doneNoSteps: i18n('think.rn.doneNoSteps', 'Thought {sec}s'),
    doneNoTime: i18n('think.rn.doneNoTime', '{n} steps'),
    fallback: i18n('think.summary', 'Thought summary'),
  };
}

function ToolRunsEntry({ calls, messageId, readOnly }: { calls: ToolCallRecord[]; messageId?: string; readOnly?: boolean }): ReactElement {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  const rows = calls.map((call) => (
    <ToolRunRow key={call.id} view={toolRunView(call)} call={call} startedAt={runStartedAt(call)} messageId={messageId} readOnly={readOnly} activityOnly />
  ));
  if (calls.length === 1) return <>{rows}</>;
  const status = aggregateStatus(calls.map((call) => toolRunStateOf(call) as ToolCardStatus));
  const settled = status !== 'running' && status !== 'awaiting';
  const names = new Set(calls.map((call) => call.name));
  return (
    <WebUiTheme>
      <ToolCallGroup
        id={calls[0].id}
        icon={<ToolActivityIcon name={names.size === 1 ? calls[0].name : 'tool'} />}
        title={i18n('think.summaryToolsTitle', 'Used {n} tools').replace('{n}', String(calls.length))}
        status={status}
        statusLabel={statusLabelOf(status)}
        duration={settled ? formatDurationMs(sumDurations(calls.map(callDurationMs))) : ''}
        open={open}
        onToggle={() => setOpen((value) => !value)}
        bodyId={bodyId}
      >
        {rows}
      </ToolCallGroup>
    </WebUiTheme>
  );
}

function liveMeta(isLive: boolean, answerStarted: boolean, status?: LiveTurnStatus): string[] {
  if (!isLive) return [];
  const meta: string[] = [];
  if (answerStarted) meta.push(i18n('think.answeringWhileWorking', 'Answering while activity continues'));
  if (status?.elapsedSec) meta.push(`${status.elapsedSec}s`);
  return meta;
}

function timelineEntries(input: {
  steps: ThinkingStep[];
  calls: ReadonlyArray<ToolCallRecord>;
  intent: string;
  isLive: boolean;
  messageId?: string;
  readOnly?: boolean;
}): TimelineEntry[] {
  const { steps, calls, intent, isLive, messageId, readOnly } = input;
  const lastStep = steps[steps.length - 1];
  const timeline = activityTimeline(steps, calls.map((call) => ({ id: call.id, startedAt: runStartedAt(call) || undefined, item: call })));
  const entries: TimelineEntry[] = intent ? [{ kind: 'step', key: 'intent', title: intent, summary: '' }] : [];
  for (const entry of timeline) {
    if (entry.kind === 'step') {
      const live = isLive && entry.step === lastStep && entry.step.phase === 'running';
      entries.push({ kind: 'step', key: entry.step.id, title: entry.step.title, summary: entry.step.summary, live });
    } else {
      entries.push({ kind: 'node', key: entry.id, node: <ToolRunsEntry calls={entry.tools} messageId={messageId} readOnly={readOnly} /> });
    }
  }
  return entries;
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

function surfaceContent(activities: ReadonlyArray<TurnActivityEntry>, publicSummary: string | undefined, intentSummary: string | undefined, callCount: number) {
  const timelineSteps = publicSummariesOf(activities);
  const steps = stepsWithFallback(timelineSteps, (publicSummary || '').trim());
  const intent = intentSummary?.trim() || '';
  return { timelineSteps, steps, intent, hasDetails: Boolean(steps.length || callCount || intent) };
}

export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const { activities = [], isLive = false, elapsedSec, status, calls = [], messageId, readOnly } = props;
  const answerStarted = Boolean(props.answerStarted);
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  useLocaleRefresh();

  const { timelineSteps, steps, intent, hasDetails } = surfaceContent(activities, props.publicSummary, props.intentSummary, calls.length);
  if (!hasDetails && !isLive) return null;

  const header = thinkingHeaderOf({ live: isLive, stepCount: steps.length + calls.length, durationSec: elapsedSec });
  const attrs = surfaceDataAttrs({ isLive, showActivityCue: props.showActivityCue !== false, status, answerStarted, isOpen, hasTimeline: timelineSteps.length > 0 });

  return (
    <div className={`rn-turn-activity${isLive ? ' is-live' : ''}`} {...attrs}>
      <WebUiTheme>
        <ThinkingSurface
          label={thinkingLabelOf(header, thinkingLabels())}
          live={isLive}
          meta={liveMeta(isLive, answerStarted, status)}
          icon={isLive && status?.toolName ? <ToolActivityIcon name={status.toolName} /> : undefined}
          expandable={hasDetails}
          open={isOpen}
          onToggle={() => setIsOpen((previous) => !previous)}
          bodyId={bodyId}
        >
          {hasDetails ? <ThinkingTimeline entries={timelineEntries({ steps, calls, intent, isLive, messageId, readOnly })} /> : null}
        </ThinkingSurface>
      </WebUiTheme>
    </div>
  );
}

export default TurnActivitySurface;
