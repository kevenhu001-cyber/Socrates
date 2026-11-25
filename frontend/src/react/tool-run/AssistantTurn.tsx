/**
 * One assistant answer, composed from public prose, tool runs, and turn status.
 * Parsing, prose caching, and streaming-tail decoration live in focused modules.
 */
import { TurnEvidence } from '../citations/TurnEvidence';
import { TurnActivitySurface } from './TurnActivitySurface';
import { deriveTurnPresentationState } from '../../legacy/turnActivityModel';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  approvalViewOf,
  buildTurnLayout,
  groupOutputCalls,
  runStartedAt,
  stripLegacyToolHtml,
  toolRunStateOf,
  type ToolCallRecord,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunDisclosureProvider } from './ToolRunDisclosure';
import { TurnStatus } from './TurnStatus.js';
import { TurnSegmentContent } from './TurnSegmentContent';
import { ToolRunAttachments } from './ToolRunAttachments';
import { ToolRunApproval } from './ToolRunApproval';
import { useProseRenderer, useScaffoldTurnProse } from './proseRenderer';
import { useLocaleRefresh } from '../rn/WebUiTheme';
import { stripLegacyTerminalHtml } from './toolRunLegacyHtml';
import type { ChatMessage } from '../types/domain';

export interface AssistantTurnProps {
  message: ChatMessage;
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

function segmentKey(segment: Exclude<TurnSegment, { kind: 'tool' | 'group' }>): string {
  // Text ranges never overlap, so the source offset alone names a prose run.
  // Folding in the array index re-keyed (and remounted, dropping the streamed
  // block DOM) every later prose run whenever a row or group was inserted
  // ahead of it, e.g. a deferred tool row mounting when the turn settles.
  if (segment.kind === 'text') return 'text-' + segment.start;
  /* Think ranges never overlap, so their source offset is stable too. */
  return 'think-' + segment.start;
}

function callsForMessage(
  message: ChatMessage,
  rawTextLength: number,
  live: boolean,
): ToolCallRecord[] {
  const storedCalls = Array.isArray(message.toolCalls)
    ? (message.toolCalls as ToolCallRecord[])
    : [];
  const surfaces = message.turnRuntime?.uiSurfaces || [];
  const calls = storedCalls.map((call) => {
    const uiSurface = surfaces.find((surface) => surface.toolCallId === call.id);
    return uiSurface
      ? {
          ...call,
          textOffset: live ? Math.min(uiSurface.textOffset, rawTextLength) : uiSurface.textOffset,
          _run: call._run,
          uiSurface,
        }
      : call;
  });
  for (const surface of surfaces) {
    if (surface.phase === 'aborted' || calls.some((call) => call.id === surface.toolCallId))
      continue;
    calls.push({
      id: surface.toolCallId,
      name: 'render_intelligent_ui',
      // The event's offset counts upstream text, which can be ahead of playback.
      textOffset: live ? Math.min(surface.textOffset, rawTextLength) : surface.textOffset,
      status: surface.phase === 'committed' ? 'completed' : 'running',
      uiSurface: surface,
    });
  }
  return calls;
}

function storedProseFor(rawText: string, html: string, segments: TurnSegment[]): string {
  if (rawText.trim() || !html.trim()) return '';
  return segments.some((segment) => segment.kind === 'tool' || segment.kind === 'group')
    ? stripLegacyToolHtml(html)
    : html;
}

function hasRunningToolRow(segments: TurnSegment[]): boolean {
  return segments.some((segment) =>
    segment.kind === 'group'
      ? segment.running.length > 0
      : segment.kind === 'tool' && ['running', 'awaiting'].includes(toolRunStateOf(segment.call)),
  );
}

function hasAnswerText(segments: TurnSegment[], storedProse: string): boolean {
  return (
    segments.some((segment) => segment.kind === 'text' && segment.text.trim().length > 0) ||
    Boolean(storedProse.trim())
  );
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

function TurnSegmentsView({
  segments,
  message,
  growingIndex,
  calls,
  readOnly,
  prose,
}: {
  segments: TurnSegment[];
  message: ChatMessage;
  growingIndex: number;
  calls: ToolCallRecord[];
  readOnly?: boolean;
  prose: ReturnType<typeof useProseRenderer>;
}): React.ReactElement {
  return (
    <>
      {segments.flatMap((segment, index) => {
        if (segment.kind === 'group' || segment.kind === 'tool') {
          const members = segment.kind === 'group' ? groupOutputCalls(segment) : [segment.call];
          // Parallel tools can join a group after its first output has mounted.
          // Keep attachments keyed by call at the transcript level across regrouping.
          return members.map((call) => (
            <ToolRunAttachments
              key={`output-${call.id}`}
              call={call}
              tools={calls}
              readOnly={readOnly}
            />
          ));
        }
        return (
          <TurnSegmentContent
            key={segmentKey(segment)}
            segment={segment}
            turnRuntime={message.turnRuntime}
            index={index}
            growingIndex={growingIndex}
            tools={calls}
            readOnly={readOnly}
            prose={prose}
          />
        );
      })}
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
      {showStatus && status ? (
        <TurnStatus status={status} messageId={messageId} readOnly={readOnly} />
      ) : null}
      {showCursor ? <StreamCursor state={playbackState} settling={!isLive && isSettling} /> : null}
    </>
  );
}

function settledProseFor(
  status: ReturnType<typeof deriveTurnPresentationState>['status'],
  prose: string,
): string {
  return status && ['error', 'stopped'].includes(status.phase)
    ? stripLegacyTerminalHtml(prose)
    : prose;
}

export function AssistantTurn({ message, html, readOnly, live }: AssistantTurnProps) {
  /* Tool rows, group labels and the activity caption are localized at render
     time; a language switch must repaint the already-rendered answer too. */
  useLocaleRefresh();
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  const isLive = Boolean(live);
  /* callsForMessage derives purely from the message snapshot: reconcile keeps
     unchanged rows at a stable identity and snapshots changed rows into fresh
     frozen objects, so memoizing on the row gives "rebuild only when the row
     actually changed" instead of on every parent re-render. */
  const calls = useMemo(
    () => callsForMessage(message, rawText.length, isLive),
    [message, rawText.length, isLive],
  );
  const storedHtml = typeof html === 'string' ? html : '';
  const isSettling = useStreamSettling(isLive);

  /* Tool-call states ride on the message snapshot (see above); the layout is
     pure, so it only needs recomputing when the row or its liveness flips. */
  const segments = useMemo(
    () =>
      buildTurnLayout(rawText, calls, {
        inlineThink: false,
        deferOpenParagraph: isLive,
        restoredFromHistory: Boolean(message.restoredFromHistory),
      }),
    [rawText, calls, isLive, message.restoredFromHistory],
  );
  const storedProse = storedProseFor(rawText, storedHtml, segments);
  // Keep the renderer and its block cache for the lifetime of a streamed turn.
  // Finishing only changes chrome; it must not repaint prose with another parser.
  const streamedRef = useRef(isLive);
  if (isLive) streamedRef.current = true;
  const turnProse = useProseRenderer(streamedRef.current);
  const prose = useScaffoldTurnProse(turnProse, rawText);
  const textIdx = lastTextIndex(segments);
  const growingIndex = isLive
    ? textIdx !== -1
      ? textIdx
      : segments.findIndex((s) => s.kind === 'think')
    : -1;
  const hasRunningRow = hasRunningToolRow(segments);
  const hasAnswerProse = hasAnswerText(segments, storedProse);
  const hasSettledTool = calls.some((c) => toolRunStateOf(c) === 'done');
  // The collapsed activity header represents the most recently started
  // active call, not whichever running call happened to appear first.
  const activeTool = calls.reduce<ToolCallRecord | undefined>((latest, call) => {
    const state = toolRunStateOf(call);
    if (state !== 'awaiting' && state !== 'running') return latest;
    if (!latest || runStartedAt(call) >= runStartedAt(latest)) return call;
    return latest;
  }, undefined);
  const presentation = deriveTurnPresentationState(message, {
    live: isLive,
    answerStarted: hasAnswerProse,
    hasRunningRow,
    hasSettledTool,
    activeTool,
  });
  const liveStatus = presentation.status;
  const legacyHtml = settledProseFor(liveStatus, storedProse);
  const messageId = String(message.clientId || message.id || '');

  return (
    <ToolRunDisclosureProvider>
      <TurnEvidence runtime={message.turnRuntime} text={rawText} entryId={messageId}>
        <TurnActivitySurface
          activities={presentation.activities}
          publicSummary={presentation.publicSummary}
          isLive={presentation.activityLive}
          status={presentation.activityStatus}
          activityStartedAt={presentation.activityStartedAt}
          reasoningDurationSec={presentation.reasoningDurationSec}
          statusLabel={presentation.activityLabel}
          intentSummary={presentation.intentSummary}
          answerStarted={hasAnswerProse}
          activeTool={activeTool}
          calls={calls}
          messageId={messageId}
          readOnly={readOnly}
        />
        {calls.map((call) => {
          const approval = approvalViewOf(call);
          return approval ? (
            <ToolRunApproval
              key={call.id}
              view={approval}
              messageId={messageId}
              toolCallId={call.id}
              readOnly={readOnly}
            />
          ) : null;
        })}
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
