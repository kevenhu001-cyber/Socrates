import { useMemo, type RefObject } from 'react';

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
  const bodyHtml = useMemo(() => html || '', [html]);
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

  /* User bubbles always render from `rawText` directly via React children
     (auto-escaped, clean whitespace preservation matching Claude and ChatGPT),
     unifying live-sent turns and reloaded sessions even if historical records
     carried markdown paragraph tags. */
  if ((role === 'user' || !bodyHtml) && rawText.length > 0) {
    return (
      <div className="msg-body" ref={bodyRef}>
        {rawText}
      </div>
    );
  }

  return <div className="msg-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
