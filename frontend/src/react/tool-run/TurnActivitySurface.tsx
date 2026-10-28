import { Button } from '../ui/Button';
import type { LiveTurnStatus } from '../types/domain';
import type { TurnActivityEntry } from '@socrates/contracts';
import { useEffect, useId, useReducer, useState, type ReactElement, type ReactNode } from 'react';
import { i18n } from '../legacy/gateway';
import { STROKE_ICONS } from '../../ui/icons/toolIcons';
import { ToolActivityIcon } from './ToolActivityIcon';

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
  children?: ReactNode;
  hasTools?: boolean;
}

const SparkleActivityIcon = (
  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" shapeRendering="geometricPrecision" className="thinking-accordion-icon">
    <path d="m12 3 1.9 4.8a2 2 0 0 0 1.3 1.3L20 11l-4.8 1.9a2 2 0 0 0-1.3 1.3L12 19l-1.9-4.8a2 2 0 0 0-1.3-1.3L4 11l4.8-1.9a2 2 0 0 0 1.3-1.3L12 3z" />
  </svg>
);

interface PublicSummaryEntry {
  id: string;
  text: string;
  phase?: string;
}

function summaryTimeline(activities: ReadonlyArray<TurnActivityEntry>): PublicSummaryEntry[] {
  const seen = new Set<string>();
  const latest: PublicSummaryEntry[] = [];
  const candidates = activities.filter((entry) => entry.kind === 'reasoning_summary' && entry.text?.trim()).reverse();
  for (const entry of candidates) {
    const text = entry.text!.trim();
    if (seen.has(text)) continue;
    seen.add(text);
    latest.push({ id: entry.id, text, phase: entry.phase });
    if (latest.length === 5) break;
  }
  return latest.reverse();
}

function activityTitle(input: {
  isLive: boolean;
  statusLabel?: string;
  elapsedSec?: number;
  hasTools: boolean;
}): string {
  if (input.isLive) return input.statusLabel || i18n('think.thinking', 'Thinking…');
  if (typeof input.elapsedSec === 'number' && Number.isFinite(input.elapsedSec) && input.elapsedSec > 0) {
    return i18n('think.thoughtDuration', 'Thought for {sec}s')
      .replace('{sec}', String(Math.max(1, Math.round(input.elapsedSec))));
  }
  return input.hasTools ? i18n('think.activity', 'Activity') : i18n('think.summary', 'Thought summary');
}

function ActivityTitleIcon({
  isLive,
  status,
  hasDetails,
  hasTools,
}: {
  isLive: boolean;
  status?: LiveTurnStatus;
  hasDetails: boolean;
  hasTools: boolean;
}): ReactElement | null {
  if (isLive && status?.toolName) return <ToolActivityIcon name={status.toolName} />;
  if (!isLive && hasDetails && !hasTools) return SparkleActivityIcon;
  return null;
}

function ActivityTitleMeta({
  isLive,
  answerStarted,
  elapsedSec,
}: {
  isLive: boolean;
  answerStarted: boolean;
  elapsedSec?: number;
}): ReactElement {
  return (
    <>
      {isLive && answerStarted ? (
        <span className="thinking-status-context">{i18n('think.answeringWhileWorking', 'Answering while activity continues')}</span>
      ) : null}
      {isLive && elapsedSec ? <span className="thinking-status-detail">{elapsedSec}s</span> : null}
    </>
  );
}

function ActivitySurfaceHeader({
  isLive,
  status,
  answerStarted,
  hasDetails,
  hasTools,
  isOpen,
  bodyId,
  title,
  onToggle,
}: {
  isLive: boolean;
  status?: LiveTurnStatus;
  answerStarted: boolean;
  hasDetails: boolean;
  hasTools: boolean;
  isOpen: boolean;
  bodyId: string;
  title: string;
  onToggle: () => void;
}): ReactElement {
  return (
    <div className={`thinking-accordion-head${isLive ? ' thinking-status' : ''}`} data-phase={isLive ? status?.phase : undefined}>
      <Button
        type="button"
        className="thinking-accordion-toggle"
        disabled={!hasDetails}
        aria-expanded={hasDetails ? isOpen : undefined}
        aria-controls={hasDetails ? bodyId : undefined}
        onClick={onToggle}
      >
        <span className="thinking-accordion-left">
          <ActivityTitleIcon isLive={isLive} status={status} hasDetails={hasDetails} hasTools={hasTools} />
          <span className="thinking-accordion-title thinking-status-label" role={isLive ? 'status' : undefined}>
            {title}
          </span>
          <ActivityTitleMeta isLive={isLive} answerStarted={answerStarted} elapsedSec={status?.elapsedSec} />
        </span>
        {hasDetails ? <span className="thinking-accordion-chev" aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
        /> : null}
      </Button>
    </div>
  );
}

function ActivitySurfaceBody({
  bodyId,
  isOpen,
  intentSummary,
  summaries,
  children,
}: {
  bodyId: string;
  isOpen: boolean;
  intentSummary?: string;
  summaries: PublicSummaryEntry[];
  children?: ReactNode;
}): ReactElement {
  return (
    <div id={bodyId} className="thinking-accordion-body" aria-hidden={!isOpen} inert={!isOpen}>
      <div className="thinking-accordion-inner">
        <div className="turn-activity-content">
          {intentSummary ? <p className="turn-activity-intent">{intentSummary}</p> : null}
          <div className="turn-activity-list" role="list">
            {summaries.map((entry) => (
              <div className="turn-activity-entry" role="listitem" key={entry.id} data-activity-id={entry.id} data-phase={entry.phase}>
                <div className="thinking-accordion-text">{entry.text}</div>
              </div>
            ))}
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function summariesWithFallback(
  timeline: PublicSummaryEntry[],
  publicSummary: string,
): PublicSummaryEntry[] {
  if (timeline.length) return timeline;
  return publicSummary ? [{ id: 'public-summary', text: publicSummary, phase: 'done' }] : [];
}

interface ActivitySurfaceViewProps {
  timeline: PublicSummaryEntry[];
  summaries: PublicSummaryEntry[];
  isLive: boolean;
  showActivityCue: boolean;
  answerStarted: boolean;
  status?: LiveTurnStatus;
  hasDetails: boolean;
  hasTools: boolean;
  isOpen: boolean;
  bodyId: string;
  title: string;
  intentSummary?: string;
  children?: ReactNode;
  onToggle: () => void;
}

function ActivitySurfaceView({
  timeline,
  summaries,
  isLive,
  showActivityCue,
  answerStarted,
  status,
  hasDetails,
  hasTools,
  isOpen,
  bodyId,
  title,
  intentSummary,
  children,
  onToggle,
}: ActivitySurfaceViewProps): ReactElement {
  return (
    <div
      className="turn-activity-surface thinking-accordion"
      data-turn-surface-part="activity"
      data-activity-timeline={timeline.length ? 'true' : undefined}
      data-live={isLive && showActivityCue ? 'true' : undefined}
      data-answer-started={answerStarted ? 'true' : undefined}
      data-open={isOpen ? 'true' : 'false'}
    >
      <ActivitySurfaceHeader
        isLive={isLive}
        status={status}
        answerStarted={answerStarted}
        hasDetails={hasDetails}
        hasTools={hasTools}
        isOpen={isOpen}
        bodyId={bodyId}
        title={title}
        onToggle={onToggle}
      />
      <ActivitySurfaceBody bodyId={bodyId} isOpen={isOpen} intentSummary={intentSummary} summaries={summaries}>
        {children}
      </ActivitySurfaceBody>
    </div>
  );
}

export function TurnActivitySurface({ publicSummary = '', activities = [], isLive = false, elapsedSec, statusLabel, status, showActivityCue = true, intentSummary, answerStarted = false, children, hasTools = false }: TurnActivitySurfaceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();
  const [, refreshLanguage] = useReducer((revision: number) => revision + 1, 0);
  const normalizedSummary = publicSummary.trim();
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => {
      document.removeEventListener('socrates:langchange', refreshLanguage);
    };
  }, []);

  // Only explicitly public summaries enter this list; keep the newest five unique entries.
  const timeline = summaryTimeline(activities);
  const summaries = summariesWithFallback(timeline, normalizedSummary);
  const hasDetails = Boolean(summaries.length || hasTools || intentSummary?.trim());
  if (!hasDetails && !isLive) return null;
  const title = activityTitle({ isLive, statusLabel, elapsedSec, hasTools });

  return <ActivitySurfaceView
    timeline={timeline}
    summaries={summaries}
    isLive={isLive}
    showActivityCue={showActivityCue}
    answerStarted={answerStarted}
    status={status}
    hasDetails={hasDetails}
    hasTools={hasTools}
    isOpen={isOpen}
    bodyId={bodyId}
    title={title}
    intentSummary={intentSummary}
    onToggle={() => setIsOpen((previous) => !previous)}
  >
    {children}
  </ActivitySurfaceView>;
}

export default TurnActivitySurface;
