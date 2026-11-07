/**
 * Host hook for the shared packages' `renderText` slot (mistake stems,
 * question-chain follow-ups): text with `$…$` comes back as a span of
 * KaTeX HTML that inherits the surrounding UiText font, size, colour and
 * line clamp; text without a formula stays the plain string.
 *
 * KaTeX loads lazily. Until it is ready the plain text shows, and the hook
 * repaints once `onKatexReady` fires.
 */
import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { renderInlineMathHtml } from '../../render/inlineMath.ts';
import { onKatexReady } from '../../vendor/lazy.ts';

export type InlineTextRenderer = (text: string, part: string) => ReactNode;

export function useInlineMath(): InlineTextRenderer {
  const [revision, setRevision] = useState(0);
  useEffect(() => onKatexReady(() => setRevision((value) => value + 1)), []);
  return useCallback<InlineTextRenderer>((text, part) => {
    const html = renderInlineMathHtml(text);
    if (html === null) return text;
    return <span className="math-inline" data-part={part} data-math-rev={revision} dangerouslySetInnerHTML={{ __html: html }} />;
  }, [revision]);
}

/** Shared rich inline text for DOM cards, including lazy KaTeX refresh. */
export const MathText = memo(function MathText({ text = '' }: { text?: string }) {
  const render = useInlineMath();
  return <>{render(text, 'content')}</>;
});
