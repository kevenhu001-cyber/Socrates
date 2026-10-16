import { STROKE_ICONS, categoryIcon } from '../../ui/icons/toolIcons.js';
import type { ToolRunGroupView, ToolRunState } from './toolRunModel.js';

/**
 * Tool groups are activity, not success cards. Keep the category glyph for
 * normal running/completed work and reserve the alert glyph for failures.
 * Completion is already stated by the label/state and should not add a second,
 * brightly legible "success" signal beside the answer.
 */
function summaryIcon(state: ToolRunState, category: string): string {
  if (state === 'error') return STROKE_ICONS.alert;
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
  const live = view.state === 'running';
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
      <span className={`tool-run-summary-label${live ? ' shimmer-text' : ''}`}>
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
