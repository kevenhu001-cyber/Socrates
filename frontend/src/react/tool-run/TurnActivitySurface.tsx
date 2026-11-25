import { useId, useMemo, useRef, useState } from 'react';
import { activityTimeline, publicSummariesOf, stepsWithFallback, type ThinkingStep } from '@socrates/ui/turn';
import type { TurnActivityEntry } from '@socrates/contracts';
import type { TurnActivityStatus } from '../../legacy/turnActivityModel';
import { i18n } from '../../ui/legacyI18n.ts';
import { tf } from '../../legacy/toolPresentationModel.ts';
import { Icon } from '../../legacy/Icon';
import { useLocaleRefresh } from '../rn/WebUiTheme';
import { MathText } from '../rn/useInlineMath';
import { ToolActivityIcon, toolActivitySites } from './ToolActivityIcon';
import { ToolRunRow } from './ToolRunRow';
import { approvalViewOf, runStartedAt, type ToolCallRecord } from './toolRunModel';

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
      {step.title ? <div data-testid="thinking-step-title" className="activity-summary-title"><MathText text={step.title} /></div> : null}
      {step.summary ? <p className="thinking-step-summary"><MathText text={step.summary} /></p> : null}
    </div>
  );
}

function activityLabel(props: TurnActivitySurfaceProps, hasSummary: boolean) {
  if (props.isLive) return props.statusLabel || i18n('think.thinking', 'Thinking…');
  const seconds = props.reasoningDurationSec;
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) {
    return tf('think.thoughtDuration', 'Thought for {sec}s', { sec: Math.max(1, Math.round(seconds)) });
  }
  if (hasSummary) return i18n('think.reasoningSummary', 'Thinking summary');
  if (props.calls.length) return tf(
    props.calls.length === 1 ? 'think.summaryToolTitle' : 'think.summaryToolsTitle',
    props.calls.length === 1 ? 'Used {n} tool' : 'Used {n} tools',
    { n: props.calls.length },
  );
  return i18n('think.complete', 'Finished thinking');
}

/** One stable disclosure per assistant turn. Tool artifacts and pending
 * approvals deliberately remain in the transcript, outside the activity log. */
export function TurnActivitySurface(props: TurnActivitySurfaceProps) {
  const { activities, calls, activeTool, status, messageId, readOnly } = props;
  const [open, setOpen] = useState(false);
  const id = useId();
  const intentRef = useRef('');
  const hadActivity = useRef(false);
  useLocaleRefresh();
  if (props.intentSummary?.trim()) intentRef.current = props.intentSummary.trim();
  const intent = intentRef.current;
  const steps = useMemo(
    () => stepsWithFallback(publicSummariesOf(activities), props.publicSummary),
    [activities, props.publicSummary],
  );
  const timeline = useMemo(() => activityTimeline(
    steps,
    calls.filter((call) => call.id && call.name).map((call) => ({
      id: call.id,
      startedAt: runStartedAt(call) || undefined,
      item: call,
    })),
  ), [steps, calls]);
  const hasSummary = steps.length > 0 || Boolean(intent);
  const expandable = timeline.length > 0 || Boolean(intent);
  const live = Boolean(props.isLive);
  const working = live && status?.phase !== 'answering' && status?.phase !== 'tool-awaiting';
  const show = working || expandable || Boolean(props.reasoningDurationSec);
  // Do not flash an empty status row on ordinary completed answers.
  if (show) hadActivity.current = true;
  if (!show && !hadActivity.current) return null;
  if (!show) return null;
  const label = activityLabel(props, hasSummary);
  const toolName = live ? status?.toolName : undefined;
  const caption = (
    <>
      {toolName ? <ToolActivityIcon name={toolName} sites={toolActivitySites(activeTool)} /> : null}
      <span className="activity-caption" data-testid="turn-activity-label" role={working ? 'status' : undefined}>{label}</span>
      {expandable ? <Icon name="chevronRight" size={12} className="activity-chevron" /> : null}
    </>
  );
  return (
    <div className={`rn-turn-activity${live ? ' is-live' : ''}`}
      data-turn-surface-part="activity"
      data-live={working ? 'true' : undefined}
      data-phase={live ? status?.phase : undefined}
      data-activity-timeline={expandable ? 'true' : undefined}
      data-answer-started={props.answerStarted ? 'true' : undefined}
      data-open={open ? 'true' : 'false'}
    >
      <div data-testid="turn-activity">
        {expandable ? (
          <button type="button" className="rn-turn-activity-toggle" data-testid="turn-activity-toggle"
            aria-expanded={open} aria-controls={id} onClick={() => setOpen((value) => !value)}>
            {caption}
          </button>
        ) : (
          <div className="rn-turn-activity-toggle" data-testid="turn-activity-toggle">{caption}</div>
        )}
        <div id={id} data-testid="turn-activity-body"
          className={`ui-collapse activity-disclosure${open ? '' : ' collapsed'}`}
          aria-hidden={!open} inert={!open}>
          <div className="ui-collapse-inner">
            <div className="activity-timeline" data-testid="thinking-timeline">
              {intent ? <SummaryStep step={{ id: 'intent', title: i18n('think.taskOverview', 'Task overview'), summary: intent }} /> : null}
              {timeline.map((entry) => entry.kind === 'step' ? (
                <SummaryStep key={entry.step.id} step={entry.step} />
              ) : (
                entry.tools.map((call) => <ToolRunRow key={call.id} call={call} messageId={messageId}
                  readOnly={readOnly} live={live} approvalOutside={approvalViewOf(call)?.state === 'pending'} />)
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TurnActivitySurface;
