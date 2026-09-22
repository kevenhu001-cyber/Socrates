/**
 * react/tool-run/AssistantTurn.tsx — one assistant answer, laid out declaratively.
 *
 * The turn is `rawText` sliced at each tool call's recorded `textOffset`, with
 * the rows spliced in at their split points. That layout rule existed three
 * times — inline while streaming, again as `outerHTML` baked into message.html
 * at finish(), and a third time in rebuildAssistantHtmlWithInlineTools() for
 * history and shared turns. This is now the only copy.
 *
 * Prose still goes through the legacy markdown renderer (it owns the
 * viz/mermaid placeholder registration that postRender fills in later); only
 * the tool rows changed hands. A `live` turn takes the streaming-safe variant
 * of that renderer and re-parses only the unfinished tail, which is the same
 * stable-prefix strategy the old imperative painter used — so a half-arrived
 * formula never leaks raw LaTeX, and completed blocks keep their DOM nodes.
 */
import { Fragment, useMemo, useRef } from 'react';

import { createSettledSplitter } from '../../render/streaming.js';
import { getLegacyActions } from '../legacy/gateway.js';
import {
  buildTurnLayout,
  stripLegacyToolHtml,
  toolRunView,
  type ToolCallRecord,
  type TurnSegment,
} from './toolRunModel.js';
import { ToolRunAttachments } from './ToolRunAttachments.js';
import { ToolRunGroup } from './ToolRunGroup.js';
import { ToolRunRow } from './ToolRunRow.js';
import { ToolRunSheetProvider } from './ToolRunSheet.js';
import { TurnStatus } from './TurnStatus.js';
import type { LegacyChatMessage } from '../types/domain';

export interface AssistantTurnProps {
  message: LegacyChatMessage;
  /** Share / replay: no Retry, no approval affordances. */
  readOnly?: boolean;
  /**
   * The turn is still streaming: paint prose with the streaming-safe renderer,
   * keep `<think>` inline so the live thinking block shows, and split the last
   * text segment into a settled prefix plus a re-parsed tail.
   */
  live?: boolean;
}

/** The caret the legacy painter kept outside the re-rendered tail. */
function StreamCursor() {
  return <span className="stream-cursor" aria-hidden="true">▍</span>;
}

/**
 * A finalized turn's prose can still carry tool-row markup when the message
 * was stored before this renderer existed, so every text segment passes through
 * stripLegacyToolHtml — but rendering markdown is expensive enough that the
 * per-call cost is worth a cache keyed on the source text.
 *
 * The cache hands back the same `{__html}` OBJECT, not just an equal string:
 * React treats a fresh `dangerouslySetInnerHTML` literal as a changed prop and
 * rewrites innerHTML, so a per-frame `{__html: settledText}` literal would blow
 * away and re-create every already-settled block on every streamed token —
 * losing the stable-prefix behaviour this renderer exists to keep.
 */
function useProseRenderer(live: boolean): {
  settled: (text: string) => { __html: string };
  tail: (text: string) => { __html: string };
} {
  return useMemo(() => {
    const legacy = getLegacyActions().render;
    const final = legacy.renderAssistantHTML;
    const progressive = legacy.renderAssistantProgressive;
    /* A runtime without the streaming variant (an older bridge, a unit-test
       harness) still renders — formatMsg's assumptions only bite mid-stream. */
    const paint = (text: string): string => {
      const clean = stripLegacyToolHtml(text);
      if (!clean.trim()) return '';
      try {
        return live && progressive ? progressive(clean) : final(clean);
      } catch (_) {
        /* A markdown failure in one segment must not blank the whole answer. */
        return '';
      }
    };
    const cache = new Map<string, { __html: string }>();
    const settled = (text: string): { __html: string } => {
      const key = live ? 'l' + text : 'f' + text;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const box = { __html: paint(text) };
      /* Evict the oldest half rather than clear(): a wholesale clear hands
         every still-mounted settled div a fresh {__html} object on the next
         render, and React rewrites all of their innerHTML in one frame —
         a visible flicker on very long answers. Map preserves insertion
         order, so the first keys are the coldest. */
      if (cache.size > 200) {
        let drop = Math.ceil(cache.size / 2);
        for (const oldKey of cache.keys()) {
          if (drop <= 0) break;
          cache.delete(oldKey);
          drop -= 1;
        }
      }
      cache.set(key, box);
      return box;
    };
    /* The unfinished tail is memoized on the LAST painted text rather than
       fully cached: it changes on every delta, but commits triggered by
       unrelated state (a tool-row update, a status stamp, another message)
       used to hand React a fresh {__html} object for identical text. React
       treats that as a changed prop and rewrites the live region's
       innerHTML — re-parsing the markdown AND rebuilding every math/code
       node in it. Returning the same box keeps the DOM untouched. */
    let lastTailText: string | null = null;
    let lastTailBox: { __html: string } | null = null;
    const tail = (text: string): { __html: string } => {
      if (lastTailBox !== null && text === lastTailText) return lastTailBox;
      lastTailText = text;
      lastTailBox = { __html: paint(text) };
      return lastTailBox;
    };
    return { settled, tail };
    /* `mathRev` is read, not passed: it is a counter the legacy boot bumps when
       lazily-loaded KaTeX becomes available, and the only way a *settled*
       segment can still need repainting is the renderer's own capabilities
       changing under it. Keyed on it so the cache below is rebuilt fresh. */
  }, [live, typeof window === 'undefined' ? 0 : window.__socratesMathRenderRev || 0]);
}

interface LiveTextSegmentProps {
  text: string;
  settled: (text: string) => { __html: string };
  tail: (text: string) => { __html: string };
}

/**
 * The still-growing last text segment of a live turn. The splitter peels
 * off completed markdown blocks one at a time, so each settles into its
 * own keyed div whose cached `{__html}` object keeps the same identity —
 * React then never rewrites that DOM. Only the open tail is re-parsed per
 * commit. This replaced the single-div prefix swap, which re-rendered the
 * whole settled region (and rebuilt every KaTeX/code/viz node in it) each
 * time a paragraph boundary arrived.
 *
 * The splitter is held in a ref, not state: it is a pure parse-side index
 * whose output fully determines the render. A push() during an abandoned
 * concurrent render simply replays on the next pass (same text → same
 * result), so no commit/effect dance is needed.
 */
function LiveTextSegment({ text, settled, tail }: LiveTextSegmentProps) {
  const splitterRef = useRef<ReturnType<typeof createSettledSplitter> | null>(null);
  if (!splitterRef.current) splitterRef.current = createSettledSplitter();
  const split = splitterRef.current.push(text);
  return (
    <>
      {split.blocks.map((block, index) => (
        <div
          key={index}
          className="tool-run-prose is-settled"
          dangerouslySetInnerHTML={settled(block)}
        />
      ))}
      <div
        className="tool-run-prose is-live"
        dangerouslySetInnerHTML={tail(split.tail)}
      />
    </>
  );
}

/** The last text segment of a live turn is the only one still growing. */
function lastTextIndex(segments: TurnSegment[]): number {
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index].kind === 'text') return index;
  }
  return -1;
}

export function AssistantTurn({ message, readOnly, live }: AssistantTurnProps) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  const calls = Array.isArray(message.toolCalls) ? (message.toolCalls as ToolCallRecord[]) : [];
  const isLive = Boolean(live);
  // toolCalls[] is mutated in place as rows settle. Rebuild this small, pure
  // layout on each published render so labels, states, and sentence-safe split
  // points cannot be trapped behind stale object identity.
  const segments: TurnSegment[] = buildTurnLayout(rawText, calls, {
    inlineThink: isLive,
    deferOpenParagraph: isLive,
  });
  const { settled, tail } = useProseRenderer(isLive);
  const growingIndex = isLive ? lastTextIndex(segments) : -1;
  /* P_tool-order-defer — the tool-running line is the stand-in for rows
     still deferred behind an unfinished paragraph. Once the real row
     mounts, the line retires so the two never appear together. */
  const hasMountedRow = segments.some(
    (segment) => segment.kind === 'tool' || segment.kind === 'group',
  );
  const liveStatus = message._liveStatus;
  const showStatus = !!liveStatus
    && (isLive || liveStatus.phase === 'error' || liveStatus.phase === 'stopped')
    && !(isLive && liveStatus.phase === 'tool-running' && hasMountedRow);
  /* Approvals and retries are filed against the message the row belongs to. */
  const messageId = String(message.clientId || message.id || '');

  return (
    <ToolRunSheetProvider>
      {segments.map((segment, index) => {
        if (segment.kind === 'text') {
          if (index !== growingIndex) {
            return (
              <div
                key={`text-${segment.start}-${index}`}
                className="tool-run-prose"
                dangerouslySetInnerHTML={settled(segment.text)}
              />
            );
          }
          /* Still arriving: completed markdown blocks mount once into keyed
             divs and only the open block is re-parsed. While a block stays
             unterminated — an unclosed fence or formula — it remains part of
             the tail. The typing cursor lives below, at the end of the turn
             (see below), never in here. */
          return (
            <LiveTextSegment
              key={`text-${segment.start}-${index}`}
              text={segment.text}
              settled={settled}
              tail={tail}
            />
          );
        }
        if (segment.kind === 'group') {
          const first = segment.members.length ? segment.members[0] : segment.running[0];
          return (
            <ToolRunGroup
              key={`group-${first ? first.id : index}-${index}`}
              segment={segment}
              messageId={messageId}
              readOnly={readOnly}
            />
          );
        }
        if (segment.kind === 'tool') {
          /* buildTurnLayout folds every run into a group, so this is the
             defensive path for a layout change that keeps single rows. */
          return (
            <Fragment key={`tool-${segment.call.id}`}>
              <ToolRunRow view={toolRunView(segment.call)} messageId={messageId} readOnly={readOnly} />
              <ToolRunAttachments call={segment.call} />
            </Fragment>
          );
        }
        /* With `inlineThink` (a live turn) think spans stay in the text
           segments and the streaming renderer draws the collapsible itself.
           This branch is only reachable on a finalized turn, where provider
           scratch work must not appear in the answer at all — the segment
           still consumed its span of rawText, which is what keeps the prose
           around it in order. */
        return null;
      })}
      {/* One status line per turn, after the rows: main.js writes what the
          assistant is doing into `message._liveStatus` and this is the only
          place that draws it. A finalized turn keeps the field only when the
          turn ended broken (a timeout, or a Stop with nothing to save), and
          then the line IS part of the answer. */}
      {showStatus && liveStatus ? (
        <TurnStatus status={liveStatus} messageId={messageId} />
      ) : null}
      {/* The typing frontier trails the WHOLE turn, not the last prose
          segment: when a tool row is the latest thing (fired at the end,
          nothing after it yet), a cursor inside the prose would paint
          ABOVE the row. While the status line shows, its spinner already
          carries the "alive" signal, so the cursor stays hidden there.
          On a settled turn (P_finish-stream-boundary) the cursor is also
          dropped from the rendered tree — its only role was the typing
          cue, and the parent CSS animates the toolbar in alongside. */}
      {isLive && !showStatus ? <StreamCursor /> : null}
    </ToolRunSheetProvider>
  );
}

export default AssistantTurn;
