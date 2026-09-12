/**
 * react/tool-run/TurnUsage.tsx — the assistant message footer.
 *
 * Mirrors LobeHub's per-message Usage bar: a quiet 12px row under the
 * finalized answer with the model (and speed) on the left and the token
 * totals on the right. Streams do not render it — it appears only once
 * the `usage` frame has landed and the turn is finalized.
 */

import { translate } from './labels';
import {
  formatTokenCount,
  usageSummary,
  type TurnUsageData,
} from './usageModel.js';

export function TurnUsage({
  usage,
  modelInfo,
}: {
  usage?: TurnUsageData | null;
  modelInfo?: { label?: string; model?: string } | null;
}) {
  const summary = usageSummary(usage);
  const modelLabel = modelInfo?.label || modelInfo?.model || '';
  if (!summary && !modelLabel) return null;

  const speedLabel = translate('usage.speed', 'tok/s');

  return (
    <div className="turn-usage" data-testid="turn-usage">
      <span className="turn-usage-left">
        {modelLabel ? (
          <span className="turn-usage-model">{modelLabel}</span>
        ) : null}
        {summary?.speed ? (
          <span className="turn-usage-speed">
            <span className="turn-usage-dot" aria-hidden="true">·</span>
            {summary.speed} {speedLabel}
          </span>
        ) : summary?.duration ? (
          <span className="turn-usage-speed">
            <span className="turn-usage-dot" aria-hidden="true">·</span>
            {summary.duration}
          </span>
        ) : null}
      </span>
      {summary && (summary.promptTokens !== null || summary.completionTokens !== null) ? (
        <span className="turn-usage-right">
          {summary.promptTokens !== null ? (
            <span className="turn-usage-token">
              <span aria-hidden="true">↑</span>
              {formatTokenCount(summary.promptTokens)}
            </span>
          ) : null}
          {summary.completionTokens !== null ? (
            <span className="turn-usage-token">
              <span aria-hidden="true">↓</span>
              {formatTokenCount(summary.completionTokens)}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}

export default TurnUsage;
