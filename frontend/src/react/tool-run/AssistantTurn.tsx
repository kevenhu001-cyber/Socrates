/**
 * One assistant answer, composed from public prose, tool runs, and turn status.
 * Parsing, prose caching, and streaming-tail decoration live in focused modules.
 */
import { TurnEvidence } from '../citations/TurnEvidence';
import { TurnActivitySurface } from './TurnActivitySurface';
import { deriveTurnPresentationState } from '../../ui/turnActivityModel';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildTurnLayout,
  groupOutputCalls,
  sortableToolCalls,
  stripLegacyToolHtml,
  toolRunStateOf,
  type ToolCallRecord,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunDisclosureProvider } from './ToolRunDisclosure';
import { TurnStatus } from './TurnStatus.js';
import { TurnSegmentContent } from './TurnSegmentContent';
import { useProseRenderer, useScaffoldTurnProse } from './proseRenderer';
import { hasCompleteScaffold } from '../../render/markdownScaffolds.ts';
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
  /* The dot is drawn by CSS (::before); no glyph, so nothing leaks into
     copied text or the accessible name. */
  return <span className={'stream-cursor' + stateClass + settleClass} aria-hidden="true" />;
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

/** Activity-layer calls in transcript order (group members, then lone calls). */
function activityCallsOf(segments: TurnSegment[]): ToolCallRecord[] {
  return segments.flatMap((segment) => segment.kind === 'group'
    ? groupOutputCalls(segment)
    : segment.kind === 'tool' ? [segment.call] : []);
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
  /* callsForMessage derives purely from the message snapshot: reconcile keeps
     unchanged rows at a stable identity and snapshots changed rows into fresh
     frozen objects, so memoizing on the row gives "rebuild only when the row
     actually changed" instead of on every parent re-render. */
  const calls = useMemo(() => callsForMessage(message), [message]);
  const storedHtml = typeof html === 'string' ? html : '';
  const isLive = Boolean(live);
  const isSettling = useStreamSettling(isLive);

  /* Tool-call states ride on the message snapshot (see above); the layout is
     pure, so it only needs recomputing when the row or its liveness flips. */
  const segments = useMemo(
    () => buildTurnLayout(rawText, calls, {
      inlineThink: false,
      deferOpenParagraph: isLive,
      restoredFromHistory: Boolean(message.restoredFromHistory),
    }),
    [rawText, calls, isLive, message.restoredFromHistory],
  );
  const storedProse = storedProseFor(rawText, storedHtml, calls);
  // Keep the renderer and its block cache for the lifetime of a streamed turn.
  // Finishing only changes chrome; it must not repaint prose with another parser.
  // Exception: the streaming renderer paints scaffolds (quiz, flashcard, …) as
  // static `.sc-live` previews and never mounts their cards. A settled turn
  // that holds a closed scaffold switches to the final renderer once, which
  // schedules the mounts; the preview reserves the card's box, so nothing moves.
  const streamedRef = useRef(isLive);
  if (isLive) streamedRef.current = true;
  const mountScaffolds = !isLive && hasCompleteScaffold(rawText);
  /* Quiz and practice are single-shot per turn. The turn is painted block by
     block, so the winner is decided over the whole text first. */
  const turnProse = useProseRenderer(streamedRef.current && !mountScaffolds);
  const prose = useScaffoldTurnProse(turnProse, rawText);
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
          calls={activityCallsOf(segments)}
          messageId={messageId}
          readOnly={readOnly}
        />
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
