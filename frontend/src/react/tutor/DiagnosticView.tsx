/**
 * RN-5 adapter for the shared diagnostic panel (packages/ui/src/study).
 * The legacy writers (`ui/diagnostic*.ts`) still build a `DiagnosticScreen`;
 * question / option / notice HTML is rendered by the shell (markdown + KaTeX
 * already applied by the writer) into the RN tree. The outer `diag-<kind>`
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
import { WebUiTheme } from '../rn/WebUiTheme';

export type { DiagnosticCommand, DiagnosticCommandHandler, DiagnosticScreen };
export type DiagOption = DiagnosticOption;

const RICH_CLASS: Record<Parameters<RenderDiagnosticRich>[1], string> = {
  'diag-question': 'diag-text diag-rich diag-rich-question',
  'diag-option': 'diag-rich diag-rich-option',
  'diag-notice': 'diag-rich diag-rich-notice',
};

const renderRich: RenderDiagnosticRich = (html, part) => (
  <div className={RICH_CLASS[part]} data-part={part} dangerouslySetInnerHTML={{ __html: html }} />
);

export function DiagnosticView({ screen, onCommand }: { screen: DiagnosticScreen; onCommand: DiagnosticCommandHandler }) {
  return (
    <div className={`diag-rn diag-${screen.kind}`}>
      <WebUiTheme>
        <DiagnosticPanel screen={screen} onCommand={onCommand} renderRich={renderRich} />
      </WebUiTheme>
    </div>
  );
}
