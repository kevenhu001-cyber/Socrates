/**
 * react/tool-run/ToolRunDetail.tsx — the expanded body of a tool row.
 *
 * Two tiers, per the agreed design: `sections` are RESULTS (sources, output,
 * stderr, error text) and appear as soon as the row is expanded; `tech`
 * (argument dump, error code, retryable hint) sits behind a second, collapsed
 * 「技术细节」 toggle, because it is debugging surface rather than something
 * that helps a reader follow the answer.
 *
 * Class names deliberately match the imperative rows' markup
 * (tool-inline-detail-section / -title / -value, tool-inline-src*) so the one
 * stylesheet covers both until Stage 2 removes the old path.
 */
import { STROKE_ICONS } from '../../ui/icons/toolIcons.js';
import { translate } from './labels.js';
import { RetryButton, ResultSection, TechSectionBlock } from './ToolRunDetailSections.js';
import type { ToolRunView } from './toolRunModel';

export interface ToolRunDetailProps {
  view: ToolRunView;
  /** Share / history-replay surfaces hide the actions that mutate state. */
  readOnly?: boolean;
}

export function ToolRunDetail({ view, readOnly }: ToolRunDetailProps) {
  const hasResults = view.sections.length > 0;
  return (
    <div className="tool-inline-detail">
      {view.sections.map((section, index) => (
        <ResultSection key={`${section.kind}-${index}`} section={section} />
      ))}
      {!hasResults && !view.tech.length ? (
        <section className="tool-inline-detail-section">
          <div className="tool-inline-detail-empty">{translate('tool.noDetails', 'No additional details.')}</div>
        </section>
      ) : null}
      <RetryButton view={view} readOnly={readOnly} />
      {view.tech.length ? (
        <details className="tool-inline-tech">
          <summary className="tool-inline-tech-summary">
            <span
              className="tool-inline-tech-icon"
              aria-hidden="true"
              dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronRight }}
            />
            {translate('tool.techDetails', 'Technical details')}
          </summary>
          {view.tech.map((section, index) => (
            <TechSectionBlock key={`${section.title}-${index}`} section={section} />
          ))}
        </details>
      ) : null}
    </div>
  );
}

export default ToolRunDetail;
