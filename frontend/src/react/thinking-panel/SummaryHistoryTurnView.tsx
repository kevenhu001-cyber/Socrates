import { useEffect, useState } from 'react';
import { STROKE_ICONS, toolIcon } from '../../ui/icons/toolIcons.js';
import type { ThinkingPanelActivity } from './types';
import type { SummaryHistoryTurn } from './summaryHistory';
import { translate } from './copy';

function activityIcon(toolName: string): string {
  return toolName === 'web_search' ? STROKE_ICONS.fetch : toolIcon(toolName);
}

export function SummaryHistoryTurnView({
  turn,
  number,
  latest,
}: {
  turn: SummaryHistoryTurn;
  number: number;
  latest: boolean;
}) {
  const [expanded, setExpanded] = useState(latest || turn.streaming);
  const hasOpenActivity = turn.activities.some((activity) => (
    activity.state === 'running' || activity.state === 'awaiting'
  ));
  const showThinking = turn.streaming && !hasOpenActivity;
  const title = turn.question || translate('think.historyTurn', 'Turn {n}').replace('{n}', String(number));

  useEffect(() => {
    if (turn.streaming) setExpanded(true);
  }, [turn.streaming]);

  return (
    <li className={`thinking-history-turn${turn.streaming ? ' is-streaming' : ''}${expanded ? ' is-expanded' : ''}`} data-message-id={turn.id}>
      <button
        type="button"
        className="thinking-history-trigger"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="thinking-history-heading">
          <span className="thinking-history-question">{title}</span>
          <span className="thinking-history-state">
            {turn.streaming
              ? translate('think.historyWorking', 'Working on this answer')
              : translate('think.summaryComplete', 'Response ready.')}
          </span>
        </span>
        <span
          className="thinking-history-chevron"
          aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: STROKE_ICONS.chevronDown }}
        />
      </button>
      {expanded ? (
        <div className="thinking-history-detail">
          {turn.answerPreview ? <p className="thinking-history-answer">{turn.answerPreview}</p> : null}
          {turn.activities.length || showThinking ? (
            <ol className="thinking-summary-timeline">
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
              {showThinking ? (
                <li className="thinking-summary-item is-active" data-kind="thinking" aria-current="step">
                  <span className="thinking-summary-marker" aria-hidden="true"><span className="thinking-spinner" /></span>
                  <span className="thinking-summary-label shimmer-text">
                    {translate('common.thinkingLabel', 'Thinking')}
                  </span>
                </li>
              ) : null}
            </ol>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
