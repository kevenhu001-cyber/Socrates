/**
 * One assistant answer, composed from public prose, tool runs, and turn status.
 * Parsing, prose caching, and streaming-tail decoration live in focused modules.
 */
import { TurnEvidence } from '../citations/TurnEvidence';
import { TurnActivitySurface } from './TurnActivitySurface';
import { ToolRunGroup } from './ToolRunGroup';
import { ToolRunRow } from './ToolRunRow';
import { deriveTurnPresentationState } from '../../ui/turnActivityModel';
import { useEffect, useRef, useState } from 'react';
import {
  buildTurnLayout,
  sortableToolCalls,
  stripLegacyToolHtml,
  toolRunStateOf,
  toolRunView,
  runStartedAt,
  type ToolCallRecord,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunDisclosureProvider } from './ToolRunDisclosure';
import { TurnStatus } from './TurnStatus.js';
import { TurnSegmentContent } from './TurnSegmentContent';
import { useProseRenderer } from './proseRenderer';
import { stripLegacyTerminalHtml } from './toolRunLegacyHtml';
import type { LegacyChatMessage } from '../types/domain';

export interface AssistantTurnProps {
  message: LegacyChatMessage;
  /** Stored HTML is only a compatibility source for old snapshots that do not
   * carry rawText. It is rendered inside the same turn surface, never as a
   * second message-body renderer. */
  html?: string;
  /** Share / replay: no Retry, no approval affordances. */
  readOnly?: boolean;
  /** Paint public prose with the streaming renderer and split the live tail. */
  live?: boolean;
}

/* Keep the cursor mounted just long enough for the shared fast opacity fade.
 * The old 300 ms settle window overlapped the toolbar transition and made a
 * finished turn feel delayed even after all content was already present. */
const STREAM_SETTLE_MS = 120;

function StreamCursor({ state, settling }: { state?: string; settling?: boolean }) {
  const stateClass = state === 'starved' ? ' is-starved' : '';
  const settleClass = settling ? ' is-settling' : '';
  return <span className={'stream-cursor' + stateClass + settleClass} aria-hidden="true">▍</span>;
}

function lastTextIndex(segments: TurnSegment[]): number {
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index].kind === 'text') return index;
  }
  return -1;
}

function segmentKey(segment: TurnSegment, index: number): string {
  if (segment.kind === 'text') return 'text-' + segment.start + '-' + index;
  // Membership can expand before tool_use. Child outputs retain their own
  // call IDs; the run host stays mounted when its first call changes.
  if (segment.kind === 'group') return 'group-' + index;
  if (segment.kind === 'tool') return 'tool-' + segment.call.id;
  return 'think-' + index;
}

function callsForMessage(message: LegacyChatMessage): ToolCallRecord[] {
  const storedCalls = Array.isArray(message.toolCalls) ? message.toolCalls as ToolCallRecord[] : [];
  const surfaces = message.turnRuntime?.uiSurfaces || [];
  const calls = storedCalls.map((call) => {
    const uiSurface = surfaces.find((surface) => surface.toolCallId === call.id);
    return uiSurface ? { ...call, textOffset: uiSurface.textOffset, _run: call._run, uiSurface } : call;
  });
  for (const surface of surfaces) {
    if (surface.phase === 'aborted' || calls.some((call) => call.id === surface.toolCallId)) continue;
    calls.push({ id: surface.toolCallId, name: 'render_intelligent_ui', textOffset: surface.textOffset,
      status: surface.phase === 'committed' ? 'completed' : 'running', uiSurface: surface });
  }
  return calls;
}

function storedProseFor(rawText: string, html: string, calls: ToolCallRecord[]): string {
  if (rawText.trim() || !html.trim()) return '';
  return sortableToolCalls(rawText, calls).length > 0 ? stripLegacyToolHtml(html) : html;
}

function hasRunningToolRow(segments: TurnSegment[]): boolean {
  return segments.some((segment) => segment.kind === 'group'
    ? segment.running.length > 0
    : segment.kind === 'tool' && ['running', 'awaiting'].includes(toolRunStateOf(segment.call)));
}

function hasAnswerText(segments: TurnSegment[], storedProse: string): boolean {
  return segments.some((segment) => segment.kind === 'text' && segment.text.trim().length > 0)
    || Boolean(storedProse.trim());
}

function useStreamSettling(isLive: boolean): boolean {
  const [isSettling, setIsSettling] = useState(false);
  const wasLiveRef = useRef(isLive);
  useEffect(() => {
    const justSettled = wasLiveRef.current && !isLive;
    wasLiveRef.current = isLive;
    if (isLive) {
      setIsSettling(false);
      return;
    }
    if (!justSettled) return;
    setIsSettling(true);
    const timer = setTimeout(() => setIsSettling(false), STREAM_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [isLive]);
  return isSettling;
}

function ActivityToolRows({
  segments,
  messageId,
  readOnly,
}: {
  segments: TurnSegment[];
  messageId: string;
  readOnly?: boolean;
}): React.ReactElement {
  return (
    <>
      {segments.map((segment, index) => {
        if (segment.kind === 'group') {
          return <ToolRunGroup key={segmentKey(segment, index)} segment={segment} messageId={messageId} readOnly={readOnly} activityOnly />;
        }
        if (segment.kind === 'tool') {
          return <ToolRunRow key={segment.call.id} view={toolRunView(segment.call)} startedAt={runStartedAt(segment.call)} messageId={messageId} readOnly={readOnly} activityOnly />;
        }
        return null;
      })}
    </>
  );
}

function TurnSegmentsView({
  segments,
  message,
  growingIndex,
  messageId,
  calls,
  readOnly,
  prose,
}: {
  segments: TurnSegment[];
  message: LegacyChatMessage;
  growingIndex: number;
  messageId: string;
  calls: ToolCallRecord[];
  readOnly?: boolean;
  prose: ReturnType<typeof useProseRenderer>;
}): React.ReactElement {
  return (
    <>
      {segments.map((segment, index) => (
        <TurnSegmentContent
          key={segmentKey(segment, index)}
          segment={segment}
          turnRuntime={message.turnRuntime}
          index={index}
          growingIndex={growingIndex}
          messageId={messageId}
          tools={calls}
          readOnly={readOnly}
          prose={prose}
        />
      ))}
    </>
  );
}

function TurnIndicators({
  presentation,
  status,
  messageId,
  readOnly,
  isLive,
  isSettling,
  hasRunningRow,
  playbackState,
}: {
  presentation: ReturnType<typeof deriveTurnPresentationState>;
  status: ReturnType<typeof deriveTurnPresentationState>['status'];
  messageId: string;
  readOnly?: boolean;
  isLive: boolean;
  isSettling: boolean;
  hasRunningRow: boolean;
  playbackState?: string;
}): React.ReactElement {
  const showStatus = Boolean(status && ['error', 'stopped'].includes(status.phase));
  const showCursor = presentation.showCursor || (isSettling && !status && !hasRunningRow);
  return (
    <>
      {showStatus && status ? <TurnStatus status={status} messageId={messageId} readOnly={readOnly} /> : null}
      {showCursor ? <StreamCursor state={playbackState} settling={!isLive && isSettling} /> : null}
    </>
  );
}

function settledProseFor(status: ReturnType<typeof deriveTurnPresentationState>['status'], prose: string): string {
  return status && ['error', 'stopped'].includes(status.phase) ? stripLegacyTerminalHtml(prose) : prose;
}

export function AssistantTurn({ message, html, readOnly, live }: AssistantTurnProps) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  const calls = callsForMessage(message);
  const storedHtml = typeof html === 'string' ? html : '';
  const isLive = Boolean(live);
  const isSettling = useStreamSettling(isLive);

  /* Tool-call records mutate in place as rows settle; rebuild this pure layout
     on each published render so states and sentence-safe offsets stay current. */
  const segments = buildTurnLayout(rawText, calls, {
    inlineThink: false,
    deferOpenParagraph: isLive,
    restoredFromHistory: Boolean(message.restoredFromHistory),
  });
  const storedProse = storedProseFor(rawText, storedHtml, calls);
  // Keep the renderer and its block cache for the lifetime of a streamed turn.
  // Finishing only changes chrome; it must not repaint prose with another parser.
  const streamedRef = useRef(isLive);
  if (isLive) streamedRef.current = true;
  const prose = useProseRenderer(streamedRef.current);
  const textIdx = lastTextIndex(segments);
  const growingIndex = isLive ? (textIdx !== -1 ? textIdx : segments.findIndex((s) => s.kind === 'think')) : -1;
  const hasRunningRow = hasRunningToolRow(segments);
  /* The activity strip is mounted before the transcript so tool rows can
     remain in their sentence-safe position. Tell it when real answer prose
     has started, though, so the strip can become the small interleaved
     progress cue ChatGPT uses while the response continues composing. */
  const hasAnswerProse = hasAnswerText(segments, storedProse);
  const hasSettledTool = calls.some((c) => toolRunStateOf(c) === 'done');
  const activeTool = calls.find((call) => ['running', 'awaiting'].includes(toolRunStateOf(call)));
  const presentation = deriveTurnPresentationState(message, { live: isLive, hasRunningRow, hasSettledTool, activeTool });
  const liveStatus = presentation.status;
  const legacyHtml = settledProseFor(liveStatus, storedProse);
  const messageId = String(message.clientId || message.id || '');

  return (
    <ToolRunDisclosureProvider>
      <TurnEvidence runtime={message.turnRuntime} text={rawText}>
        <TurnActivitySurface
          activities={presentation.reasoningSummaries}
          publicSummary={presentation.publicSummary}
          isLive={presentation.activityLive}
          status={presentation.activityStatus}
          elapsedSec={presentation.reasoningDurationSec}
          statusLabel={presentation.activityLabel}
          intentSummary={presentation.intentSummary}
          answerStarted={hasAnswerProse}
          hasTools={segments.some((segment) => segment.kind === 'tool' || segment.kind === 'group')}
        >
          <ActivityToolRows segments={segments} messageId={messageId} readOnly={readOnly} />
        </TurnActivitySurface>
        {legacyHtml ? (
          <div
            className="tool-run-prose is-settled"
            dangerouslySetInnerHTML={{ __html: legacyHtml }}
          />
        ) : null}
        <TurnSegmentsView
          segments={segments}
          message={message}
          growingIndex={growingIndex}
          messageId={messageId}
          calls={calls}
          readOnly={readOnly}
          prose={prose}
        />
        <TurnIndicators
          presentation={presentation}
          status={liveStatus}
          messageId={messageId}
          readOnly={readOnly}
          isLive={isLive}
          isSettling={isSettling}
          hasRunningRow={hasRunningRow}
          playbackState={message._playbackState}
        />
      </TurnEvidence>
    </ToolRunDisclosureProvider>
  );
}

export default AssistantTurn;
