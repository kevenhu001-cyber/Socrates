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
import { Fragment, useMemo } from 'react';

import { splitStreamingMarkdown } from '../../render/streaming.js';
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
      if (cache.size > 200) cache.clear();
      cache.set(key, box);
      return box;
    };
    /* The unfinished tail is deliberately NOT cached: it changes on every
       frame, and caching a string that is never repeated only grows the map. */
    return { settled, tail: (text: string) => ({ __html: paint(text) }) };
    /* `mathRev` is read, not passed: it is a counter the legacy boot bumps when
       lazily-loaded KaTeX becomes available, and the only way a *settled*
       segment can still need repainting is the renderer's own capabilities
       changing under it. Keyed on it so the cache below is rebuilt fresh. */
  }, [live, typeof window === 'undefined' ? 0 : window.__socratesMathRenderRev || 0]);
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
    deferOpenSentence: isLive,
  });
  const { settled, tail } = useProseRenderer(isLive);
  const growingIndex = isLive ? lastTextIndex(segments) : -1;
  /* P_tool-order-defer — the tool-running line is the stand-in for rows
     still deferred behind an unfinished sentence. Once the real row
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
    <>
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
          /* Still arriving: everything up to the last blank line is settled
             markdown (parsed once, held in the cache) and only the open block
             is re-parsed. When splitStreamingMarkdown refuses the cut — an
             unclosed fence or formula — the whole segment is the tail.
             The cursor marks the typing frontier; while the live status
             line is showing (e.g. a tool row deferred behind an unfinished
             sentence) the spinner already carries the "alive" signal, and
             the tail's block markup would push the dot onto its own line
             next to the spinner — a stray bullet. Hide it there. */
          const split = splitStreamingMarkdown(segment.text);
          const showCursor = !showStatus;
          return (
            <Fragment key={`text-${segment.start}-${index}`}>
              {split.prefix ? (
                <div
                  className="tool-run-prose is-settled"
                  dangerouslySetInnerHTML={settled(split.prefix)}
                />
              ) : null}
              <div className="tool-run-prose is-live">
                <span dangerouslySetInnerHTML={tail(split.tail)} />
                {showCursor ? <StreamCursor /> : null}
              </div>
            </Fragment>
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
    </>
  );
}

export default AssistantTurn;
