/**
 * One assistant answer, composed from public prose, tool runs, and turn status.
 * Parsing, prose caching, and streaming-tail decoration live in focused modules.
 */
import { deriveTurnPresentationState } from '../../ui/turnActivityModel';
import { useEffect, useRef, useState } from 'react';
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
import { TurnSummaryPill } from './TurnSummaryPill';
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
  if (segment.kind === 'group') {
    const first = groupOutputCalls(segment)[0];
    return 'group-' + (first ? first.id : index) + '-' + index;
  }
  if (segment.kind === 'tool') return 'tool-' + segment.call.id;
  return 'think-' + index;
}

export function AssistantTurn({ message, html, readOnly, live }: AssistantTurnProps) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  const calls = Array.isArray(message.toolCalls) ? message.toolCalls as ToolCallRecord[] : [];
  const storedHtml = typeof html === 'string' ? html : '';
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
    restoredFromHistory: Boolean(message.restoredFromHistory),
  });
  const canSpliceStoredTools = sortableToolCalls(rawText, calls).length > 0;
  const storedProse = !rawText.trim() && storedHtml.trim()
    ? (canSpliceStoredTools ? stripLegacyToolHtml(storedHtml) : storedHtml)
    : '';
  // Keep the renderer and its block cache for the lifetime of a streamed turn.
  // Finishing only changes chrome; it must not repaint prose with another parser.
  const streamedRef = useRef(isLive);
  if (isLive) streamedRef.current = true;
  const prose = useProseRenderer(streamedRef.current);
  const growingIndex = isLive ? lastTextIndex(segments) : -1;
  const hasRunningRow = segments.some((segment) =>
    segment.kind === 'group' ? segment.running.length > 0
      : segment.kind === 'tool' && ['running', 'awaiting'].includes(toolRunStateOf(segment.call)),
  );
  const hasSettledTool = calls.some((c) => toolRunStateOf(c) === 'done');
  const presentation = deriveTurnPresentationState(message, { live: isLive, hasRunningRow, hasSettledTool });
  const liveStatus = presentation.status;
  const showStatus = Boolean(liveStatus);
  const legacyHtml = liveStatus && ['error', 'stopped'].includes(liveStatus.phase)
    ? stripLegacyTerminalHtml(storedProse) : storedProse;
  const messageId = String(message.clientId || message.id || '');

  return (
    <ToolRunDisclosureProvider>
      <TurnSummaryPill
        summary={presentation.publicSummary}
        messageId={messageId}
        status={showStatus && liveStatus && !['error', 'stopped'].includes(liveStatus.phase) ? liveStatus : undefined}
      />
      {legacyHtml ? (
        <div
          className="tool-run-prose is-settled"
          dangerouslySetInnerHTML={{ __html: legacyHtml }}
        />
      ) : null}
      {segments.map((segment, index) => (
        <TurnSegmentContent
          key={segmentKey(segment, index)}
          segment={segment}
          index={index}
          growingIndex={growingIndex}
          messageId={messageId}
          tools={calls}
          readOnly={readOnly}
          prose={prose}
        />
      ))}
      {showStatus && liveStatus && ['error', 'stopped'].includes(liveStatus.phase) ? (
        <TurnStatus status={liveStatus} messageId={messageId} readOnly={readOnly} />
      ) : null}
      {(presentation.showCursor || (isSettling && !showStatus && !hasRunningRow)) ? (
        <StreamCursor state={message._playbackState} settling={!isLive && isSettling} />
      ) : null}
    </ToolRunDisclosureProvider>
  );
}

export default AssistantTurn;
