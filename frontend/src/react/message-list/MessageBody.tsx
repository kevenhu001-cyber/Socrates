import type { RefObject } from 'react';

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
  if (!html && typeof message.rawText === 'string' && message.rawText.length > 0) {
    return (
      <div className="msg-body" ref={bodyRef}>
        {message.rawText}
      </div>
    );
  }

  return <div className="msg-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
