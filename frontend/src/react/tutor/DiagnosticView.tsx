/**
 * RN-5 adapter for the shared diagnostic panel (packages/ui/src/study).
 * The legacy writers (`ui/diagnostic*.ts`) still build a `DiagnosticScreen`;
 * question copy is formatted here (markdown + KaTeX), option copy inline
 * (KaTeX + bold/code), the notice is
 * HTML from the writer, and the results' names and AI lines go through the
 * inline KaTeX renderer. The outer `diag-<kind>`
 * class keeps the view addressable from the shell and the e2e suite.
 */
import {
  DiagnosticPanel,
  type DiagnosticCommand,
  type DiagnosticCommandHandler,
  type DiagnosticOption,
  type DiagnosticScreen,
  type RenderDiagnosticRich,
} from '@socrates/ui/study';
import { useCallback, useEffect, useState } from 'react';
import { WebUiTheme } from '../rn/WebUiTheme';
import { useInlineMath } from '../rn/useInlineMath';
import { formatMsg } from '../../render/markdown.ts';
import { esc } from '../../render/helpers.ts';
import { renderInlineMathHtml } from '../../render/inlineMath.ts';
import { onKatexReady } from '../../vendor/lazy.ts';

export type { DiagnosticCommand, DiagnosticCommandHandler, DiagnosticScreen };
export type DiagOption = DiagnosticOption;

const RICH_CLASS: Record<Parameters<RenderDiagnosticRich>[1], string> = {
  'diag-question': 'diag-text diag-rich diag-rich-question',
  'diag-option': 'diag-rich diag-rich-option',
  'diag-notice': 'diag-rich diag-rich-notice',
};

/* RN-11: question and option copy arrives as markdown source and is
   formatted here, at paint time. KaTeX loads lazily, so a first paint can
   come before it; the `onKatexReady` revision paints again with the
   formulas typeset. The results notice is already HTML.
   RN-12: an option is one line, so it goes through the inline renderer
   (KaTeX inline + `**bold**` / `` `code` ``) instead of markdown. Markdown
   would read an option that is only `$\frac13$` as a display formula and
   centre and enlarge it. */
function richHtml(source: string, part: Parameters<RenderDiagnosticRich>[1]): string {
  if (part === 'diag-notice') return source;
  if (part === 'diag-option') return renderInlineMathHtml(source) ?? esc(source);
  return formatMsg(source);
}

function useKatexRevision(): number {
  const [revision, setRevision] = useState(0);
  useEffect(() => onKatexReady(() => setRevision((value) => value + 1)), []);
  return revision;
}

export function DiagnosticView({ screen, onCommand }: { screen: DiagnosticScreen; onCommand: DiagnosticCommandHandler }) {
  const revision = useKatexRevision();
  const renderText = useInlineMath();
  const renderRich = useCallback<RenderDiagnosticRich>((source, part) => (
    <div
      className={RICH_CLASS[part]}
      data-part={part}
      data-math-rev={revision}
      dangerouslySetInnerHTML={{ __html: richHtml(source, part) }}
    />
  ), [revision]);
  return (
    <div className={`diag-rn diag-${screen.kind}`} style={{ paddingInline: 12 }}>
      <WebUiTheme>
        <DiagnosticPanel screen={screen} onCommand={onCommand} renderRich={renderRich} renderText={renderText} />
      </WebUiTheme>
    </div>
  );
}
