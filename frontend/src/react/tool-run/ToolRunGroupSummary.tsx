import { STROKE_ICONS, categoryIcon } from '../../ui/icons/toolIcons.js';
import type { ToolRunGroupView, ToolRunState } from './toolRunModel.js';

/**
 * A settled run closes with a check; a failed one with an alert. This is the
 * one moment a green-ish confirmation is worth spending colour on: the reader
 * needs to know at a glance that the work the model did before answering
 * actually finished. While running the category glyph stands in, so the slot
 * never empties and the label never jumps.
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
      {meta.length ? <span className="tool-run-summary-meta">{meta.join(' · ')}</span> : null}
      <span
        className="tool-run-summary-chev"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
      />
    </button>
  );
}
