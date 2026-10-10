/**
 * One assistant answer, composed from public prose, tool runs, and turn status.
 * Parsing, prose caching, and streaming-tail decoration live in focused modules.
 */
import { useEffect, useRef, useState } from 'react';
import {
  buildTurnLayout,
  type ToolCallRecord,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunSheetProvider } from './ToolRunSheet.js';
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
  hasMountedRow: boolean,
): boolean {
  if (!phase) return false;
  const terminalFailure = phase === 'error' || phase === 'stopped';
  if (!live && !terminalFailure) return false;
  if (live && phase === 'tool-running' && hasMountedRow) return false;
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
      const timer = setTimeout(() => setIsSettling(false), 300);
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
  const hasMountedRow = segments.some(
    (segment) => segment.kind === 'tool' || segment.kind === 'group',
  );
  const liveStatus = message._liveStatus;
  const showStatus = shouldShowStatus(liveStatus?.phase, isLive, hasMountedRow);
  const messageId = String(message.clientId || message.id || '');

  return (
    <ToolRunSheetProvider>
      <TurnSummaryPill
        message={message}
        live={isLive}
        messageId={messageId}
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
      {showStatus && liveStatus ? (
        <TurnStatus status={liveStatus} messageId={messageId} />
      ) : null}
      {(isLive || isSettling) && !showStatus ? (
        <StreamCursor state={message._playbackState} settling={!isLive && isSettling} />
      ) : null}
    </ToolRunSheetProvider>
  );
}

export default AssistantTurn;
