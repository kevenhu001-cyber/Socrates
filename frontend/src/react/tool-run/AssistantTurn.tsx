/**
 * One assistant answer, composed from public prose, tool runs, and turn status.
 * Parsing, prose caching, and streaming-tail decoration live in focused modules.
 */
import { useEffect, useRef, useState } from 'react';
import {
  buildTurnLayout,
  toolRunStateOf,
  type ToolCallRecord,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunDisclosureProvider } from './ToolRunDisclosure';
import { TurnStatus } from './TurnStatus.js';
import { TurnSummaryPill } from './TurnSummaryPill';
import { TurnSegmentContent } from './TurnSegmentContent';
import { useProseRenderer } from './proseRenderer';
import type { LegacyChatMessage } from '../types/domain';

export interface AssistantTurnProps {
  message: LegacyChatMessage;
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
  if (segment.kind === 'group') {
    const first = segment.members.length ? segment.members[0] : segment.running[0];
    return 'group-' + (first ? first.id : index) + '-' + index;
  }
  if (segment.kind === 'tool') return 'tool-' + segment.call.id;
  return 'think-' + index;
}

function shouldShowStatus(
  phase: string | undefined,
  live: boolean,
  hasRunningRow: boolean,
): boolean {
  if (!phase) return false;
  const terminalFailure = phase === 'error' || phase === 'stopped';
  if (!live && !terminalFailure) return false;
  if (live && !terminalFailure && hasRunningRow && phase !== 'retrying') return false;
  return true;
}

export function AssistantTurn({ message, readOnly, live }: AssistantTurnProps) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  const calls = Array.isArray(message.toolCalls) ? message.toolCalls as ToolCallRecord[] : [];
  const isLive = Boolean(live);
  const [isSettling, setIsSettling] = useState(false);
  const wasLiveRef = useRef(isLive);

  useEffect(() => {
    if (wasLiveRef.current && !isLive) {
      setIsSettling(true);
      const timer = setTimeout(() => setIsSettling(false), STREAM_SETTLE_MS);
      wasLiveRef.current = isLive;
      return () => clearTimeout(timer);
    }
    wasLiveRef.current = isLive;
  }, [isLive]);

  /* Tool-call records mutate in place as rows settle; rebuild this pure layout
     on each published render so states and sentence-safe offsets stay current. */
  const segments = buildTurnLayout(rawText, calls, {
    inlineThink: false,
    deferOpenParagraph: isLive,
  });
  const prose = useProseRenderer(isLive);
  const growingIndex = isLive ? lastTextIndex(segments) : -1;
  const hasRunningRow = segments.some((segment) =>
    segment.kind === 'group' ? segment.running.length > 0
      : segment.kind === 'tool' && ['running', 'awaiting'].includes(toolRunStateOf(segment.call)),
  );
  const liveStatus = message._liveStatus;
  const showStatus = shouldShowStatus(liveStatus?.phase, isLive, hasRunningRow);
  const messageId = String(message.clientId || message.id || '');

  return (
    <ToolRunDisclosureProvider>
      <TurnSummaryPill
        message={message}
        live={isLive}
        messageId={messageId}
        status={showStatus && liveStatus && !['error', 'stopped'].includes(liveStatus.phase) ? liveStatus : undefined}
      />
      {segments.map((segment, index) => (
        <TurnSegmentContent
          key={segmentKey(segment, index)}
          segment={segment}
          index={index}
          growingIndex={growingIndex}
          messageId={messageId}
          readOnly={readOnly}
          prose={prose}
        />
      ))}
      {showStatus && liveStatus && ['error', 'stopped'].includes(liveStatus.phase) ? (
        <TurnStatus status={liveStatus} messageId={messageId} readOnly={readOnly} />
      ) : null}
      {(isLive || isSettling) && !showStatus && !hasRunningRow ? (
        <StreamCursor state={message._playbackState} settling={!isLive && isSettling} />
      ) : null}
    </ToolRunDisclosureProvider>
  );
}

export default AssistantTurn;