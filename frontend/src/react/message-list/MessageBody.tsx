import { useMemo, type MouseEvent, type RefObject } from 'react';

import { CanvasBlock } from '../canvas';
import { AssistantTurn } from '../tool-run/AssistantTurn';
import type { LegacyChatMessage } from '../types/domain';
import { openArtifactPreview } from '../../ui/artifactPreview.ts';
import { LinkPreviews } from './LinkPreviews';

export function MessageBody({
  message,
  role,
  html,
  isLive,
  readOnly,
  declarative,
  bodyRef,
}: {
  message: LegacyChatMessage;
  role: string;
  html: string;
  isLive: boolean;
  readOnly?: boolean;
  declarative: boolean;
  bodyRef: RefObject<HTMLDivElement | null>;
}) {
  const rawText = typeof message.rawText === 'string' ? message.rawText : '';
  function handlePreviewClick(event: MouseEvent<HTMLDivElement>) {
    const clicked = event.target instanceof Element ? event.target.closest('[data-artifact-preview]') : null;
    const assistantImage = !clicked && role === 'assistant' && event.target instanceof Element
      ? event.target.closest('img:not(.exec-artifact-image):not(.site-link-favicon)')
      : null;
    const target = clicked || assistantImage;
    if (!target) return;
    event.preventDefault();
    openArtifactPreview({
      url: target.getAttribute('data-artifact-url') || target.getAttribute('src') || target.getAttribute('href'),
      mimeType: target.getAttribute('data-artifact-mime') || (target.tagName === 'IMG' ? 'image/*' : ''),
      name: target.getAttribute('data-artifact-name') || target.getAttribute('alt') || '',
    });
  }
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
        onPreviewClick={handlePreviewClick}
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
        onClick={handlePreviewClick}
      >
        <AssistantTurn message={message} html={html} live={isLive} readOnly={readOnly} />
      </div>
    );
  }

  /* User bubbles always render from `rawText` directly via React children
     (auto-escaped, clean whitespace preservation matching Claude and ChatGPT),
     unifying live-sent turns and reloaded sessions even if historical records
     carried markdown paragraph tags. */
  if ((role === 'user' || !bodyHtml) && rawText.length > 0) {
    return (
      <div className="msg-body" ref={bodyRef} onClick={handlePreviewClick}>
        {rawText}
        {message.pageLinkPreviews?.length || message.pageLinkHint ? (
          <LinkPreviews items={message.pageLinkPreviews || []} showMissingUrlHint={message.pageLinkHint === true} />
        ) : null}
      </div>
    );
  }

  return <div className="msg-body" ref={bodyRef} onClick={handlePreviewClick} dangerouslySetInnerHTML={{ __html: bodyHtml }} />;
}
