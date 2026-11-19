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
import { renderInlineMathHtml, type InlineMathOptions } from '../../render/inlineMath.ts';
import { mathLabelSource } from '../../render/latex.ts';
import { onKatexReady } from '../../vendor/lazy.ts';

export type InlineTextRenderer = (text: string, part: string) => ReactNode;

export function useInlineMath(options: InlineMathOptions = {}): InlineTextRenderer {
  const { display = false } = options;
  const [revision, setRevision] = useState(0);
  useEffect(() => onKatexReady(() => setRevision((value) => value + 1)), []);
  return useCallback<InlineTextRenderer>(
    (text, part) => {
      const html = renderInlineMathHtml(text, 'htmlAndMathml', { display });
      if (html === null) return text;
      return (
        <span
          className="math-inline"
          data-part={part}
          data-math-rev={revision}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    },
    [revision, display],
  );
}

/**
 * Shared rich inline text for DOM cards, including lazy KaTeX refresh.
 *
 * `display` typesets `$$…$$` and `\[…\]` as display math. Use it for block
 * copy (a derivation line, a callout) where the model was asked to write the
 * formula on its own line; leave it off for one-line labels, stems and
 * options, which must not grow a centred block.
 */
export const MathText = memo(function MathText({
  text = '',
  display = false,
}: {
  text?: string;
  display?: boolean;
}) {
  const render = useInlineMath({ display });
  const source = mathLabelSource(text);
  const rendered = render(source ?? text, 'content');
  return <>{typeof rendered === 'string' ? text : rendered}</>;
});
