/**
 * RN-5 adapter for the shared diagnostic panel (packages/ui/src/study).
 * The legacy writers (`ui/diagnostic*.ts`) still build a `DiagnosticScreen`;
 * question / option copy is formatted here (markdown + KaTeX), the notice is
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
   formulas typeset. The results notice is already HTML. */
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
      dangerouslySetInnerHTML={{ __html: part === 'diag-notice' ? source : formatMsg(source) }}
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
