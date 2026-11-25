import { useId, useMemo, useRef, useState, type ReactElement } from 'react';
import {
  ActivityStep,
  ThinkingSurface,
  ThinkingTimeline,
  publicSummariesOf,
  stepsWithFallback,
  thinkingHeaderOf,
  thinkingLabelOf,
  type ThinkingLabels,
  type ThinkingStep,
} from '@socrates/ui/turn';
import type { TurnActivityEntry } from '@socrates/contracts';
import type { TurnActivityStatus } from '../../legacy/turnActivityModel';
import { i18n } from '../../ui/legacyI18n.ts';
import { WebUiTheme, useLocaleRefresh } from '../rn/WebUiTheme';
import { ToolActivityIcon, toolActivitySites } from './ToolActivityIcon';
import { useElapsed } from './useElapsed';
import { runStartedAt, type ToolCallRecord } from './toolRunModel';
import { tf } from '../../legacy/toolPresentationModel.ts';
import { interfaceIcon } from '../../legacy/icons/interfaceIcons.ts';
import { MathText } from '../rn/useInlineMath';

export interface TurnActivitySurfaceProps {
  /** Public model-provided summary only. Never pass parsed reasoning text here. */
  publicSummary?: string;
  activities?: ReadonlyArray<TurnActivityEntry>;
  isLive?: boolean;
  reasoningDurationSec?: number;
  activityStartedAt?: number;
  statusLabel?: string;
  status?: TurnActivityStatus;
  intentSummary?: string;
  /** True once answer prose has started, even if the turn is still live. */
  answerStarted?: boolean;
  activeToolInline?: boolean;
  activeTool?: ToolCallRecord;
}

function thinkingLabels(hasSummary: boolean): ThinkingLabels {
  return {
    runningNoTime: i18n('think.rn.runningNoTime', '正在处理…'),
    doneNoTime: hasSummary
      ? i18n('think.reasoningSummary', 'Thinking summary')
      : i18n('think.activityHistory', 'Activity history'),
    usedTool: i18n('think.summaryToolTitle', 'Used {n} tool'),
    usedTools: i18n('think.summaryToolsTitle', 'Used {n} tools'),
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
      preview={
        preview ? (
          <p className="thinking-step-preview">
            <MathText text={preview} />
          </p>
        ) : null
      }
      detail={
        expandable ? (
          <p className="thinking-step-summary">
            <MathText text={step.summary} />
          </p>
        ) : null
      }
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

const NO_ACTIVITIES: ReadonlyArray<TurnActivityEntry> = [];

function useActivityDuration(props: TurnActivitySurfaceProps, showLiveCaption: boolean) {
  const { status, activeTool, isLive, activityStartedAt, reasoningDurationSec } = props;
  const startedAt =
    status?.phase === 'tool-running' ? runStartedAt(activeTool) : activityStartedAt || 0;
  const liveMs = useElapsed(
    Number.isFinite(startedAt) && startedAt > 0 ? startedAt : 0,
    showLiveCaption,
  );
  if (!isLive) return reasoningDurationSec;
  if (showLiveCaption) return liveMs > 0 ? liveMs / 1000 : status?.elapsedSec;
  return undefined;
}

function useTurnIntent(intentSummary?: string): string {
  const previousIntent = useRef('');
  const trimmed = intentSummary?.trim();
  if (trimmed) {
    previousIntent.current = trimmed;
  }
  return trimmed || previousIntent.current;
}

function resolveSurfaceHeaderCopy(
  header: ReturnType<typeof thinkingHeaderOf>,
  hasDetails: boolean,
  isLive: boolean,
  hasSteps: boolean,
): { label: string; durationLabel: string | undefined } {
  if (!isLive && !hasDetails) {
    return {
      label: i18n('think.complete', 'Finished thinking'),
      durationLabel: undefined,
    };
  }
  const label = thinkingLabelOf(header, thinkingLabels(hasSteps));
  const durationLabel =
    header.durationSec === null
      ? undefined
      : tf('think.rn.elapsed', '{sec}s', { sec: header.durationSec });
  return { label, durationLabel };
}

function buildTurnActivityDataAttrs(
  isLive: boolean,
  hasSteps: boolean,
  showActivityCue: boolean,
  phase: string | undefined,
  answerStarted: boolean | undefined,
  isOpen: boolean,
) {
  return {
    className: `rn-turn-activity${isLive ? ' is-live' : ''}`,
    'data-turn-surface-part': 'activity',
    'data-activity-timeline': hasSteps ? 'true' : undefined,
    'data-live': showActivityCue ? 'true' : undefined,
    'data-phase': isLive ? phase : undefined,
    'data-answer-started': answerStarted ? 'true' : undefined,
    'data-open': isOpen ? 'true' : 'false',
  };
}

function resolveStatusLabel(
  isOpen: boolean,
  status: TurnActivityStatus | undefined,
  fallbackLabel: string | undefined,
): string | undefined {
  if (isOpen && status?.phase === 'waiting') {
    return status.label;
  }
  return fallbackLabel;
}

function resolveSurfaceIconProps(isLive: boolean, activeTool?: ToolCallRecord, toolName?: string) {
  const resolvedToolName = isLive ? toolName : undefined;
  const sites = resolvedToolName ? toolActivitySites(activeTool) : [];
  const icon = resolvedToolName ? (
    <ToolActivityIcon name={resolvedToolName} sites={sites} />
  ) : !isLive ? (
    <StepGlyph html={interfaceIcon('thinking')} />
  ) : undefined;
  const iconWidth = sites.length > 1 ? 30 : undefined;
  return { icon, iconWidth };
}

export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const { activities = NO_ACTIVITIES, activeTool, status } = props;
  const [isOpen, setIsOpen] = useState(false);
  const intent = useTurnIntent(props.intentSummary);
  const bodyId = useId();
  useLocaleRefresh();

  const steps = useMemo(
    () => stepsWithFallback(publicSummariesOf(activities), props.publicSummary),
    [activities, props.publicSummary],
  );
  const showLiveCaption = Boolean(props.isLive && !props.activeToolInline);
  const durationSec = useActivityDuration(props, showLiveCaption);
  const hasSteps = steps.length > 0;
  const hasDetails = Boolean(intent) || hasSteps;
  if (!showLiveCaption && !hasDetails && !durationSec) return null;

  const header = thinkingHeaderOf({
    live: showLiveCaption,
    durationSec,
    statusLabel: resolveStatusLabel(isOpen, status, props.statusLabel),
  });
  const { label, durationLabel } = resolveSurfaceHeaderCopy(
    header,
    hasDetails,
    showLiveCaption,
    hasSteps,
  );
  const phase = status?.phase;
  const showActivityCue = showLiveCaption && phase !== 'tool-awaiting' && phase !== 'answering';
  const { icon, iconWidth } = resolveSurfaceIconProps(
    showLiveCaption,
    activeTool,
    status?.toolName,
  );
  const containerAttrs = buildTurnActivityDataAttrs(
    showLiveCaption,
    hasSteps,
    showActivityCue,
    phase,
    props.answerStarted,
    isOpen,
  );

  return (
    <div {...containerAttrs}>
      <WebUiTheme>
        <ThinkingSurface
          label={label}
          durationLabel={durationLabel}
          live={showLiveCaption}
          icon={icon}
          iconWidth={iconWidth}
          expandable={hasDetails}
          open={isOpen}
          onToggle={() => setIsOpen((previous) => !previous)}
          bodyId={bodyId}
        >
          {hasDetails ? (
            <ThinkingTimeline>
              {intent ? (
                <ActivityStep
                  label={i18n('think.taskOverview', 'Task overview')}
                  preview={
                    <p className="thinking-step-preview">
                      <MathText text={intent} />
                    </p>
                  }
                />
              ) : null}
              {steps.map((step) => (
                <SummaryStep key={step.id} step={step} />
              ))}
            </ThinkingTimeline>
          ) : null}
        </ThinkingSurface>
      </WebUiTheme>
    </div>
  );
}

export default TurnActivitySurface;
