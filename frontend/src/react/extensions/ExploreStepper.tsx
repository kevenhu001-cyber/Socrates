import { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import type { AgentRunEvent } from '../../extensions/types';
import {
  getAgentRunSnapshot,
  subscribeToAgentRuns,
} from '../../extensions/agentRunStore';

export type WorkflowStage = 'planning' | 'searching' | 'reading' | 'synthesizing';

const STAGES: ReadonlyArray<{ key: WorkflowStage; label: string }> = [
  { key: 'planning', label: 'Plan' },
  { key: 'searching', label: 'Search' },
  { key: 'reading', label: 'Read' },
  { key: 'synthesizing', label: 'Report' },
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
  if (!event) return 'Idle';
  if (event.stage === 'completed') return 'Complete';
  if (event.stage === 'failed') return 'Failed';
  if (event.status === 'running') return event.message || 'Running…';
  return event.message || 'In progress';
}

export function ExploreStepper() {
  const snapshot = useSyncExternalStore(
    subscribeToAgentRuns,
    getAgentRunSnapshot,
    getAgentRunSnapshot,
  );

  const event = snapshot.lastEvent;
  const done = !!event && (event.stage === 'completed' || event.stage === 'failed');
  const failed = !!event && event.stage === 'failed';

  return (
    <div
      className={`agent-stepper${done ? ' agent-stepper-done' : ''}${failed ? ' agent-stepper-failed' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="agent-stepper-head">
        <span className="agent-stepper-status" aria-hidden="true" />
        <span className="agent-stepper-title">{statusLabel(event)}</span>
        <span className="agent-stepper-workflow">
          {event ? event.workflow : ''}
        </span>
      </div>
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
            <span className="agent-stepper-label">{stage.label}</span>
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
