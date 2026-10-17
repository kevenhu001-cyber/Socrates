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

export function AssistantTurn({ message, html, readOnly, live }: AssistantTurnProps) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  const storedCalls = Array.isArray(message.toolCalls) ? message.toolCalls as ToolCallRecord[] : [];
  const surfaces = message.turnRuntime?.uiSurfaces || [];
  const calls: ToolCallRecord[] = storedCalls.map((call) => {
    const uiSurface = surfaces.find((surface) => surface.toolCallId === call.id);
    return uiSurface ? { ...call, textOffset: uiSurface.textOffset, _run: call._run, uiSurface } : call;
  });
  for (const surface of surfaces) {
    if (surface.phase === 'aborted' || calls.some((call) => call.id === surface.toolCallId)) continue;
    calls.push({ id: surface.toolCallId, name: 'render_intelligent_ui', textOffset: surface.textOffset,
      status: surface.phase === 'committed' ? 'completed' : 'running', uiSurface: surface });
  }
  const storedHtml = typeof html === 'string' ? html : '';
  const isLive = Boolean(live);
  const [isSettling, setIsSettling] = useState(false);
  const wasLiveRef = useRef(isLive);

  useEffect(() => {
    const justSettled = wasLiveRef.current && !isLive;
    wasLiveRef.current = isLive;
    if (isLive) {
      // A new live turn must not inherit the previous settle animation.
      setIsSettling(false);
      return;
    }
    if (!justSettled) return;
    setIsSettling(true);
    const timer = setTimeout(() => setIsSettling(false), STREAM_SETTLE_MS);
    return () => clearTimeout(timer);
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
  const textIdx = lastTextIndex(segments);
  const growingIndex = isLive ? (textIdx !== -1 ? textIdx : segments.findIndex((s) => s.kind === 'think')) : -1;
  const hasRunningRow = segments.some((segment) =>
    segment.kind === 'group' ? segment.running.length > 0
      : segment.kind === 'tool' && ['running', 'awaiting'].includes(toolRunStateOf(segment.call)),
  );
  const hasSettledTool = calls.some((c) => toolRunStateOf(c) === 'done');
  const activeTool = calls.find((call) => ['running', 'awaiting'].includes(toolRunStateOf(call)));
  const presentation = deriveTurnPresentationState(message, { live: isLive, hasRunningRow, hasSettledTool, activeTool });
  const liveStatus = presentation.status;
  const showStatus = Boolean(liveStatus);
  const legacyHtml = liveStatus && ['error', 'stopped'].includes(liveStatus.phase)
    ? stripLegacyTerminalHtml(storedProse) : storedProse;
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
          hasTools={segments.some((segment) => segment.kind === 'tool' || segment.kind === 'group')}
        >
          {segments.map((segment, index) => segment.kind === 'group'
            ? <ToolRunGroup key={segmentKey(segment, index)} segment={segment} messageId={messageId} readOnly={readOnly} activityOnly />
            : segment.kind === 'tool'
              ? <ToolRunRow key={segment.call.id} view={toolRunView(segment.call)} startedAt={runStartedAt(segment.call)} messageId={messageId} readOnly={readOnly} activityOnly />
              : null)}
        </TurnActivitySurface>
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
            turnRuntime={message.turnRuntime}
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
      </TurnEvidence>
    </ToolRunDisclosureProvider>
  );
}

export default AssistantTurn;
