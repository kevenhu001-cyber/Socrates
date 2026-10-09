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
      <div className="msg-body is-declarative" ref={bodyRef}>
        <AssistantTurn message={message} live={isLive} />
      </div>
    );
  }

  return <div className="msg-body" ref={bodyRef} dangerouslySetInnerHTML={{ __html: html }} />;
}
