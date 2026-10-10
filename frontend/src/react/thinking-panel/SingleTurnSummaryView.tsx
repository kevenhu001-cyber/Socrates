import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import type { ThinkingPanelActivity } from './types';
import type { SummaryHistoryTurn } from './summaryHistory';
import { translate } from './copy';

function activityIcon(toolName: string): string {
  return toolName === 'web_search' ? STROKE_ICONS.fetch : toolIcon(toolName);
}

export function SingleTurnSummaryView({ turn }: { turn: SummaryHistoryTurn }) {
  const hasOpenActivity = turn.activities.some((activity) => (
    activity.state === 'running' || activity.state === 'awaiting'
  ));
  const showThinking = turn.streaming;
  const isThinkingActive = turn.streaming && !hasOpenActivity;
  const summaryText = turn.summary || turn.answerPreview || turn.question || translate('think.summaryComplete', 'Response ready.');

  return (
    <div className="thinking-single-turn" data-message-id={turn.id}>
      <ol className="thinking-summary-timeline" role="list">
        {/* Step 1: Summary / Target line */}
        <li className="thinking-summary-item" data-kind="target">
          <span className="thinking-summary-marker" aria-hidden="true" />
          <span className="thinking-summary-label">
            {summaryText}
          </span>
        </li>

        {/* Tool activities if any */}
        {turn.activities.map((activity: ThinkingPanelActivity) => {
          const active = activity.state === 'running' || activity.state === 'awaiting';
          const icon = activityIcon(activity.toolName);
          return (
            <li
              key={activity.id}
              className={`thinking-summary-item${active ? ' is-active' : ` is-${activity.state}`}`}
              data-kind="tool"
              data-state={activity.state}
            >
              <span className="thinking-summary-marker" aria-hidden="true">
                {icon ? <span className="thinking-summary-icon" dangerouslySetInnerHTML={{ __html: icon }} /> : null}
              </span>
              <span className={`thinking-summary-label${active ? ' shimmer-text' : ''}`}>
                {activity.label}
              </span>
            </li>
          );
        })}

        {/* Step 2: Thinking / Problem-solving step */}
        {showThinking ? (
          <li
            className={`thinking-summary-item${isThinkingActive ? ' is-active' : ''}`}
            data-kind="thinking"
            aria-current={isThinkingActive ? 'step' : undefined}
          >
            <span className="thinking-summary-marker" aria-hidden="true" />
            <span className={`thinking-summary-label${isThinkingActive ? ' shimmer-text' : ''}`}>
              {translate('common.thinkingLabel', 'Thinking')}
            </span>
          </li>
        ) : null}
      </ol>
    </div>
  );
}
