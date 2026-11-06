/**
 * Loading and failure states shared by every native visualization host:
 * the OpenUI `Visualization` component, a rejected `render_intelligent_ui`
 * call, and the legacy imperative card.
 *
 * Deliberately restrained: white/grey surface, 1px rules, no shimmer, no
 * pulse, no dots. The full visual redesign lands later; these states only
 * have to be honest (a real title, a real reason, a way forward) and keep
 * their height so the transcript never collapses to a zero-height gap.
 */
import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { visualizationTableRows } from '@socrates/core/visualizationNormalize';
import { Button } from '../ui/shadcn/button';
import { i18n } from '../legacy/gateway';
import { visualizationRendererKind } from '../../render/visualizationRendererKind';

export type VizFailureReason =
  | 'dataFormat'
  | 'dataMissing'
  | 'mismatch'
  | 'truncated'
  | 'syntax'
  | 'library'
  | 'render'
  | 'unknownTemplate'
  | 'unknown';

const REASON_FALLBACKS: Record<VizFailureReason, string> = {
  dataFormat: 'Some values are not in a format the chart can read.',
  dataMissing: 'The chart has no data to draw.',
  mismatch: 'The number of labels and values do not match.',
  truncated: 'The visual was cut off while it was being generated (too much data).',
  syntax: 'The visual description has a syntax error.',
  library: 'The chart library failed to load.',
  render: 'The chart renderer hit an error.',
  unknownTemplate: 'This chart type is not supported.',
  unknown: 'Unknown error.',
};

export function vizReasonText(reason: VizFailureReason): string {
  return i18n(`viz.reason.${reason}`, REASON_FALLBACKS[reason]);
}

/** Map a server failure detail (or tool error code) to one readable reason. */
export function reasonFromToolFailure(detail: unknown, errorCode?: string | null): VizFailureReason {
  const record = detail && typeof detail === 'object' && !Array.isArray(detail) ? detail as Record<string, unknown> : {};
  if (record.truncated === true || record.stage === 'openui_truncated' || errorCode === 'arguments_truncated' || errorCode === 'arguments_too_large') return 'truncated';
  if (errorCode === 'arguments_parse_failed') return 'truncated';
  if (record.stage === 'openui_syntax' || record.stage === 'openui_program') return 'syntax';
  const first = Array.isArray(record.visualizations) ? record.visualizations[0] as Record<string, unknown> | undefined : undefined;
  if (first) {
    const issues = Array.isArray(first.issues) ? first.issues.join(' ') : '';
    if (first.stage === 'payload_shape') return /expected array, received undefined|required/i.test(issues) ? 'dataMissing' : 'dataFormat';
    if (first.stage === 'semantic') return /at least one numeric|no finite values/i.test(issues) ? 'dataMissing' : 'mismatch';
    if (first.stage === 'envelope') return /template/i.test(issues) ? 'unknownTemplate' : 'dataMissing';
    if (first.stage === 'envelope_misuse') return 'syntax';
  }
  return 'unknown';
}

/** Map a client-side render error to one readable reason. */
export function reasonFromRenderError(error: unknown): VizFailureReason {
  const message = String((error as Error | null)?.message || error || '');
  if (/load|script|chunk|network|fetch/i.test(message)) return 'library';
  if (/no chart option|empty/i.test(message)) return 'dataMissing';
  return 'render';
}

export function VisualizationTable({ rows }: { rows: Array<Array<string | number | null>> }) {
  if (rows.length < 2) return null;
  const [header, ...body] = rows;
  const shown = body.slice(0, 200);
  return (
    <div className="visualization-table-wrap viz-state-table" tabIndex={0}>
      <table className="visualization-table">
        <thead><tr>{header.map((cell, index) => <th key={index} scope="col">{cell === null ? '' : String(cell)}</th>)}</tr></thead>
        <tbody>
          {shown.map((row, rowIndex) => (
            <tr key={rowIndex}>{row.map((cell, index) => <td key={index} data-numeric={typeof cell === 'number' ? 'true' : undefined}>{cell === null || cell === '' ? '—' : String(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
      {body.length > shown.length ? <p className="viz-state-note">{i18n('viz.state.rowsShown', 'Showing the first {shown} of {total} rows').replace('{shown}', String(shown.length)).replace('{total}', String(body.length))}</p> : null}
    </div>
  );
}

export interface VisualizationSkeletonProps {
  title?: string | null;
  /** 'receiving' while arguments stream, 'loading' while the renderer loads. */
  phase: 'receiving' | 'loading';
  /** The template decides the engine, and the engine the card's stage height. */
  template?: string | null;
  /** Reserve the caption row the finished card will draw. */
  caption?: string | null;
}

/**
 * Same geometry as the finished card (header row, the engine's stage height,
 * the phone breakpoint, the caption row), so the card replaces it in place.
 * The status line sits inside the stage, where the card shows its own
 * progress line, instead of adding a row that would vanish later.
 */
export function VisualizationSkeleton({ title, phase, template, caption }: VisualizationSkeletonProps) {
  const label = phase === 'receiving'
    ? i18n('viz.state.receiving', 'Receiving data…')
    : i18n('viz.state.loadingRenderer', 'Loading the chart renderer…');
  return (
    <section className="viz-state-skeleton" aria-busy="true" data-viz-state={phase} data-renderer={visualizationRendererKind(template)}>
      <header className="viz-skeleton-header">
        <h3 className="viz-skeleton-title">{title || '\u00a0'}</h3>
      </header>
      <div className="viz-skeleton-stage">
        <p className="viz-skeleton-progress" role="status">{label}</p>
        <span className="viz-skeleton-gridline" aria-hidden="true" />
        <span className="viz-skeleton-gridline" aria-hidden="true" />
        <span className="viz-skeleton-gridline" aria-hidden="true" />
        <span className="viz-skeleton-gridline" aria-hidden="true" />
      </div>
      {caption ? <p className="viz-skeleton-caption">{caption}</p> : null}
    </section>
  );
}

export interface VisualizationFailureProps {
  title?: string | null;
  reason: VizFailureReason;
  /** Any spec-like value; used only to derive the "view as table" rows. */
  data?: unknown;
  rows?: Array<Array<string | number | null>>;
  details?: string | null;
  /** Local re-render (library load, sizing). Hidden when absent. */
  onRetry?: (() => void) | null;
  /** Prompt sent through the `tool-retry` event; hidden when absent or read-only. */
  fixPrompt?: string | null;
  readOnly?: boolean;
  children?: ReactNode;
}

export function VisualizationFailure({ title, reason, data, rows: providedRows, details, onRetry, fixPrompt, readOnly, children }: VisualizationFailureProps) {
  const host = useRef<HTMLElement>(null);
  const [tableOpen, setTableOpen] = useState(false);
  let rows = providedRows ?? [];
  if (!providedRows && data !== undefined) {
    try { rows = visualizationTableRows(data); } catch { rows = []; }
  }
  const hasTable = rows.length > 1;
  const fix = () => {
    if (!fixPrompt || readOnly) return;
    host.current?.dispatchEvent(new CustomEvent('tool-retry', {
      bubbles: true,
      detail: { tool: 'intelligent_ui', prompt: fixPrompt },
    }));
  };
  return (
    <section className="viz-state viz-state-failure" ref={host} data-viz-state="failed" data-viz-reason={reason}>
      {title ? <h3 className="viz-state-title">{title}</h3> : null}
      <div className="viz-state-body" role="status">
        <strong className="viz-state-heading">{i18n('viz.state.failedTitle', 'The chart could not be drawn')}</strong>
        <p className="viz-state-reason">{i18n('viz.state.reasonLabel', 'Reason: ')}{vizReasonText(reason)}</p>
        <div className="viz-state-actions">
          {hasTable ? (
            <Button size="sm" data-viz-fallback="table" aria-expanded={tableOpen} onClick={() => setTableOpen((open) => !open)}>
              {tableOpen ? i18n('viz.action.hideTable', 'Hide table') : i18n('viz.action.viewTable', 'View as table')}
            </Button>
          ) : null}
          {onRetry ? (
            <Button size="sm" variant="outline" data-viz-fallback="retry" onClick={onRetry}>
              {i18n('viz.action.retryRender', 'Retry')}
            </Button>
          ) : null}
          {fixPrompt && !readOnly ? (
            <Button size="sm" variant={hasTable ? 'ghost' : 'outline'} data-viz-fallback="fix" onClick={fix}>
              {i18n('viz.action.fixWithAi', 'Fix with AI')}
            </Button>
          ) : null}
        </div>
        {details ? (
          <details className="viz-state-details">
            <summary>{i18n('viz.state.details', 'Technical details')}</summary>
            <code>{details}</code>
          </details>
        ) : null}
      </div>
      {hasTable && tableOpen ? <VisualizationTable rows={rows} /> : null}
      {children}
    </section>
  );
}
