import { useState, type MouseEvent } from 'react';
import { Button } from '../ui/shadcn/button';

export interface VisualizationActionsProps {
  labels: {
    workbench: string;
    table: string;
    reset: string;
    download: string;
    fullscreen: string;
  };
  tableAvailable: boolean;
  resetAvailable: boolean;
  downloadAvailable: boolean;
  fullscreenAvailable: boolean;
  onWorkbench: () => void;
  onReset: () => void;
  onDownload: () => void;
  onFullscreen: () => void;
}

export function VisualizationActions({
  labels,
  tableAvailable,
  resetAvailable,
  downloadAvailable,
  fullscreenAvailable,
  onWorkbench,
  onReset,
  onDownload,
  onFullscreen,
}: VisualizationActionsProps) {
  const [tableOpen, setTableOpen] = useState(false);

  function toggleTable(event: MouseEvent<HTMLButtonElement>) {
    const table = event.currentTarget.closest('.visualization-card')?.querySelector<HTMLElement>('.visualization-data');
    if (!table) return;
    const nextOpen = table.hidden;
    table.hidden = !nextOpen;
    setTableOpen(nextOpen);
  }

  return (
    <div className="visualization-actions" data-viz-actions-root>
      <Button variant="ghost" size="xs" data-viz-action="workbench" aria-label={labels.workbench} title={labels.workbench} onClick={onWorkbench}>
        {labels.workbench}
      </Button>
      <Button variant="ghost" size="xs" data-viz-action="table" hidden={!tableAvailable} aria-expanded={tableOpen} aria-label={labels.table} title={labels.table} onClick={toggleTable}>
        {labels.table}
      </Button>
      <Button variant="ghost" size="xs" data-viz-action="reset" hidden={!resetAvailable} aria-hidden={!resetAvailable || undefined} aria-label={labels.reset} title={labels.reset} onClick={onReset}>
        {labels.reset}
      </Button>
      <Button variant="ghost" size="xs" data-viz-action="download" hidden={!downloadAvailable} aria-label={labels.download} title={labels.download} onClick={onDownload}>
        {labels.download}
      </Button>
      <Button variant="ghost" size="xs" data-viz-action="fullscreen" hidden={!fullscreenAvailable} aria-label={labels.fullscreen} title={labels.fullscreen} onClick={onFullscreen}>
        {labels.fullscreen}
      </Button>
    </div>
  );
}

export interface VisualizationFallbackActionsProps {
  retryLabel: string;
  fixLabel: string;
  tableLabel?: string;
  hideTableLabel?: string;
  /** The card has a data table to fall back to. */
  tableAvailable?: boolean;
  /** The table is already shown (automatic fallback after a chart failure). */
  tableInitiallyOpen?: boolean;
  onToggleTable?: (open: boolean) => void;
  onRetry: () => void;
  onFix: () => void;
}

/**
 * Failure actions: [View as table] is the primary action whenever the data
 * can be read as a table; [Retry] re-renders locally; [Fix with AI] asks the
 * model for a corrected call. When the card already fell back to its table,
 * the table toggle is not repeated.
 */
export function VisualizationFallbackActions({
  retryLabel,
  fixLabel,
  tableLabel,
  hideTableLabel,
  tableAvailable = false,
  tableInitiallyOpen = false,
  onToggleTable,
  onRetry,
  onFix,
}: VisualizationFallbackActionsProps) {
  const [tableOpen, setTableOpen] = useState(tableInitiallyOpen);
  const showTableToggle = tableAvailable && !tableInitiallyOpen && !!onToggleTable;
  return (
    <div className="visualization-fallback-actions">
      {showTableToggle ? (
        <Button size="sm" data-viz-fallback="table" aria-expanded={tableOpen} onClick={() => {
          const next = !tableOpen;
          setTableOpen(next);
          onToggleTable?.(next);
        }}>
          {tableOpen ? hideTableLabel || tableLabel : tableLabel}
        </Button>
      ) : null}
      <Button variant="outline" size="sm" data-viz-fallback="retry" onClick={onRetry}>
        {retryLabel}
      </Button>
      <Button variant={showTableToggle ? 'ghost' : 'outline'} size="sm" data-viz-fallback="fix" onClick={onFix}>
        {fixLabel}
      </Button>
    </div>
  );
}
