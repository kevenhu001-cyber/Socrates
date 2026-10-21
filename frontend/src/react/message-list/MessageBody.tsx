import { useMemo, type RefObject } from 'react';

import { formatMsg } from '../../render/markdown.ts';
import { CanvasBlock } from '../canvas';
import { AssistantTurn } from '../tool-run/AssistantTurn';
import type { LegacyChatMessage } from '../types/domain';

export function MessageBody({
  message,
  role,
  html,
  isLive,
  declarative,
  bodyRef,
}: {
  message: LegacyChatMessage;
  role: string;
  html: string;
  isLive: boolean;
  declarative: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  // Preserve historical user Markdown without parsing every offscreen row in
  // the loader. Newly sent user messages still display their original text.
  const bodyHtml = useMemo(() => html || (
    message.restoredFromHistory && role !== 'assistant' ? formatMsg(rawText) : ''
  ), [html, message.restoredFromHistory, role, rawText]);
  if (message.outputMode === 'canvas' && message.canvasId && role === 'assistant') {
    return (
      <CanvasBlock
        message={message}
        html={html}
        canvasId={message.canvasId}
        originalText={typeof message.rawText === 'string' ? message.rawText : ''}
      />
    );
  }

  if (declarative) {
    return (
      <div
        className="msg-body is-declarative turn-surface"
        data-ui-surface="assistant-turn"
        data-turn-state={isLive ? 'live' : 'settled'}
        ref={bodyRef}
      >
        <AssistantTurn message={message} html={html} live={isLive} />
      </div>
    );
  }

  /* P_user-msg-no-format — addMessage now skips formatMsg() on the click
     path for user messages and stores html = ''. Render the bubble from
     rawText via React children (auto-escaped, no DOMPurify roundtrip) so
     the user sees their original text without a markdown pass on every
     send. */
  if (!bodyHtml && rawText.length > 0) {
    return (
      <div className="msg-body" ref={bodyRef}>
        {rawText}
      </div>
    );
  }

  return <div className="msg-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
