import { STROKE_ICONS, categoryIcon } from '../../ui/icons/toolIcons.js';
import type { ToolRunGroupView, ToolRunState } from './toolRunModel.js';

/**
 * The monochrome check marks settled work; an alert still marks failure.
 * Running work retains its category glyph in the same slot.
 */
function summaryIcon(state: ToolRunState, category: string): string {
  if (state === 'error') return STROKE_ICONS.alert;
  if (state === 'done') return STROKE_ICONS.check;
  return categoryIcon(category);
}

export function ToolRunGroupSummary({
  view,
  category,
  meta,
  open,
  onToggle,
}: {
  view: ToolRunGroupView;
  category: string;
  meta: string[];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="tool-run-summary"
      aria-expanded={open}
      onClick={onToggle}
    >
      <span
        className={`tool-run-summary-icon is-${view.state}`}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: summaryIcon(view.state, category) }}
      />
      <span className="tool-run-summary-label">
        {view.headerLabel}
      </span>
      <span
        className="tool-run-summary-chev"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
      />
      {meta.length ? <span className="tool-run-summary-meta">{meta.join(' · ')}</span> : null}
    </button>
  );
}
