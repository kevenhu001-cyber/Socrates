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
  onRetry: () => void;
  onFix: () => void;
}

export function VisualizationFallbackActions({ retryLabel, fixLabel, onRetry, onFix }: VisualizationFallbackActionsProps) {
  return (
    <div className="visualization-fallback-actions">
      <Button variant="outline" size="sm" data-viz-fallback="retry" onClick={onRetry}>
        {retryLabel}
      </Button>
      <Button size="sm" data-viz-fallback="fix" onClick={onFix}>
        {fixLabel}
      </Button>
    </div>
  );
}
