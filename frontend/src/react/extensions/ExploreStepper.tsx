import { useEffect, useReducer, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import type { AgentRunEvent } from '../../extensions/types';
import {
  getAgentRunSnapshot,
  subscribeToAgentRuns,
} from '../../extensions/agentRunStore';
import { t } from '../legacy/gateway';

export type WorkflowStage = 'planning' | 'searching' | 'reading' | 'synthesizing';

const STAGES: ReadonlyArray<{ key: WorkflowStage; label: string }> = [
  { key: 'planning', label: 'research.plan' },
  { key: 'searching', label: 'research.search' },
  { key: 'reading', label: 'research.read' },
  { key: 'synthesizing', label: 'research.report' },
];

function stageIndex(stage: AgentRunEvent['stage']): number {
  return STAGES.findIndex((s) => s.key === stage);
}

function isActiveStage(event: AgentRunEvent | null, idx: number): boolean {
  if (!event) return false;
  const current = stageIndex(event.stage);
  if (current === -1) return event.stage === 'completed' || event.stage === 'failed';
  return idx === current;
}

function isPastStage(event: AgentRunEvent | null, idx: number): boolean {
  if (!event) return false;
  if (event.stage === 'completed' || event.stage === 'failed') return true;
  const current = stageIndex(event.stage);
  return current !== -1 && idx < current;
}

function statusLabel(event: AgentRunEvent | null): string {
  if (!event) return t('research.idle');
  if (event.message) return event.message;
  if (event.stage === 'completed') return t('research.complete');
  if (event.stage === 'failed') return t('research.failed');
  if (event.stage === 'cancelled') return t('research.cancelled');
  return t('research.running');
}

function workflowLabel(workflow: AgentRunEvent['workflow'] | undefined): string {
  if (workflow === 'deepResearch') return t('research.title');
  if (workflow === 'research') return t('research.findSources');
  if (workflow === 'explore') return t('research.explore');
  return t('research.workflow');
}

export function ExploreStepper({ event: supplied }: { event?: AgentRunEvent } = {}) {
  const snapshot = useSyncExternalStore(
    subscribeToAgentRuns,
    getAgentRunSnapshot,
    getAgentRunSnapshot,
  );

  const [, refreshLanguage] = useReducer((revision: number) => revision + 1, 0);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  const event = supplied || snapshot.lastEvent;
  const done = !!event && (event.stage === 'completed' || event.stage === 'failed' || event.stage === 'cancelled');
  const failed = !!event && event.stage === 'failed';

  return (
    <div
      className={`agent-stepper${done ? ' agent-stepper-done' : ''}${failed ? ' agent-stepper-failed' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="agent-stepper-head">
        <span className="agent-stepper-status" aria-hidden="true" />
        <span className="agent-stepper-title">
          <small className="agent-stepper-kicker">{workflowLabel(event?.workflow)}</small>
          <span>{statusLabel(event)}</span>
        </span>
        <span className="agent-stepper-workflow">
          {workflowLabel(event?.workflow)}
        </span>
      </div>
      {event?.current && event.total ? (
        <div className="agent-stepper-progress" aria-label={t('research.progress').replace('{current}', String(event.current)).replace('{total}', String(event.total))}>
          <span style={{ width: `${Math.min(100, Math.round((event.current / event.total) * 100))}%` }} />
        </div>
      ) : null}
      <ol className="agent-stepper-stages">
        {STAGES.map((stage, idx) => (
          <li
            key={stage.key}
            className={[
              'agent-stepper-stage',
              isActiveStage(event, idx) ? 'agent-stepper-stage-active' : '',
              isPastStage(event, idx) ? 'agent-stepper-stage-past' : '',
              done ? 'agent-stepper-stage-done' : '',
              failed ? 'agent-stepper-stage-failed' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="agent-stepper-dot" aria-hidden="true" />
            <span className="agent-stepper-label">{t(stage.label)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function mountExploreStepper(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(<ExploreStepper />);
  return () => root.unmount();
}
