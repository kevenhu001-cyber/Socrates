import { categoryIcon, STROKE_ICONS } from '../../ui/icons/toolIcons.js';
import type { ToolRunGroupView, ToolRunState } from './toolRunModel.js';

function summaryIcon(state: ToolRunState, category: string): string {
  if (state === 'error') return STROKE_ICONS.alert;
  return categoryIcon(category);
}

export function ToolRunGroupSummary({
  view,
  category,
  inFlight,
  meta,
  isNarrowViewport,
  sheetOpen,
  open,
  onToggle,
}: {
  view: ToolRunGroupView;
  category: string;
  inFlight: boolean;
  meta: string[];
  isNarrowViewport: boolean;
  sheetOpen: boolean;
  open: boolean;
  onToggle: (button: HTMLButtonElement) => void;
}) {
  return (
    <button
      type="button"
      className="tool-run-summary"
      aria-haspopup={isNarrowViewport ? 'dialog' : undefined}
      aria-expanded={isNarrowViewport ? sheetOpen : open}
      onClick={(event) => onToggle(event.currentTarget)}
    >
      <span
        className="tool-run-summary-icon"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: summaryIcon(view.state, category) }}
      />
      <span className={`tool-run-summary-label${inFlight ? ' shimmer-text' : ''}`}>
        {view.headerLabel}
      </span>
      {meta.length ? <span className="tool-run-summary-meta">{meta.join(' · ')}</span> : null}
      <span
        className="tool-run-summary-chev"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
      />
    </button>
  );
}
