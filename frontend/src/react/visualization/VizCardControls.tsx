import { useState } from 'react';
import { Expand, FileCode2, RefreshCw } from 'lucide-react';
import { Button } from '../ui/shadcn/button';
import { ToggleGroup, ToggleGroupItem } from '../ui/shadcn/toggle-group';

export interface VizCardControlsProps {
  cardId: string;
  initialView: 'preview' | 'code';
  showSource: boolean;
  viewToggle: boolean;
  onViewChange: (view: 'preview' | 'code') => void;
  onSource: () => void;
  onReload: () => void;
  onExpand: () => void;
}

export function VizCardControls({ cardId, initialView, showSource, viewToggle, onViewChange, onSource, onReload, onExpand }: VizCardControlsProps) {
  const [view, setView] = useState(initialView);

  function changeView(values: string[]) {
    const next = values[0];
    if (next !== 'preview' && next !== 'code') return;
    setView(next);
    onViewChange(next);
  }

  return (
    <>
      {viewToggle && (
        <ToggleGroup
          value={[view]}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label="Card view"
          className="viz-seg"
          onValueChange={changeView}
        >
          <ToggleGroupItem value="preview" className="viz-seg-btn" data-viz-card={cardId} data-viz-view-opt="preview">
            Preview
          </ToggleGroupItem>
          <ToggleGroupItem value="code" className="viz-seg-btn" data-viz-card={cardId} data-viz-view-opt="code">
            Code
          </ToggleGroupItem>
        </ToggleGroup>
      )}
      <span className="viz-status" role="status">
        <span className="viz-status-dot" />
        <span className="viz-status-label" />
      </span>
      {showSource && (
        <Button variant="ghost" size="icon-xs" className="viz-btn viz-btn-source" data-viz-card={cardId} title="View source" aria-label="View source" onClick={onSource}>
          <FileCode2 aria-hidden="true" />
        </Button>
      )}
      <Button variant="ghost" size="icon-xs" className="viz-btn viz-btn-reload" data-viz-card={cardId} title="Reload" aria-label="Reload" onClick={onReload}>
        <RefreshCw aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon-xs" className="viz-btn viz-btn-expand" data-viz-card={cardId} title="Expand" aria-label="Expand" onClick={onExpand}>
        <Expand aria-hidden="true" />
      </Button>
    </>
  );
}

export function VizErrorActions({ onToggleSource, onFix }: { onToggleSource: () => void; onFix: () => void }) {
  return (
    <div className="viz-error-actions">
      <Button variant="outline" size="xs" className="viz-error-btn" onClick={onToggleSource}>Show source</Button>
      <Button size="xs" className="viz-error-fix" onClick={onFix}>Fix with AI</Button>
    </div>
  );
}
