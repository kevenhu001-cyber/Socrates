import { useMemo, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

import type { ToolCall } from '../types/domain';
import {
  getAgentRunSnapshot,
  subscribeToAgentRuns,
} from '../../extensions/agentRunStore';

function readToolCalls(): ToolCall[] {
  try {
    const state = (window as unknown as { state?: { session?: { messages?: Array<{ toolCalls?: ToolCall[] }> } } }).state;
    const messages = state?.session?.messages ?? [];
    const out: ToolCall[] = [];
    for (let i = messages.length - 1; i >= 0 && out.length < 8; i--) {
      const calls = messages[i]?.toolCalls;
      if (Array.isArray(calls)) {
        for (let j = calls.length - 1; j >= 0 && out.length < 8; j--) {
          out.push(calls[j]);
        }
      }
    }
    return out.reverse();
  } catch {
    return [];
  }
}

function phaseClass(phase?: ToolCall['phase'], isError?: boolean): string {
  if (isError) return 'analyze-workbench-call-failed';
  if (phase === 'succeeded' || phase === 'running') return `analyze-workbench-call-${phase}`;
  return '';
}

function inputSummary(input?: unknown): string {
  if (input == null) return '';
  const text = JSON.stringify(input);
  if (!text) return '';
  return text.length > 90 ? text.slice(0, 90) + '…' : text;
}

function outputSummary(output?: string | null, isError?: boolean): string {
  if (isError) return 'Error — see tool card';
  if (!output) return '';
  const text = String(output);
  const line = text.split('\n')[0] || '';
  return line.length > 80 ? line.slice(0, 80) + '…' : line;
}

export function AnalyzeWorkbench() {
  const snapshot = useSyncExternalStore(
    subscribeToAgentRuns,
    getAgentRunSnapshot,
    getAgentRunSnapshot,
  );

  /* Agent events are the invalidation signal for legacy session messages.
     The previous empty dependency list froze the workbench at its initial
     "No tool activity yet" state even while calls were arriving. */
  const calls = useMemo(readToolCalls, [snapshot.revision]);
  const hasCalls = calls.length > 0;

  return (
    <div className="analyze-workbench" aria-label="Analysis tool activity">
      <div className="analyze-workbench-head">
        <span className="analyze-workbench-title">Analysis tools</span>
        <span className="analyze-workbench-count">{calls.length}</span>
      </div>
      {hasCalls ? (
        <ul className="analyze-workbench-calls">
          {calls.map((call) => (
            <li
              key={call.id}
              className={`analyze-workbench-call ${phaseClass(call.phase, call.isError)}`}
            >
              <span className="analyze-workbench-call-name">
                {call.name}
                {call.phase ? <em className="analyze-workbench-call-phase">{call.phase}</em> : null}
              </span>
              <span className="analyze-workbench-call-input">{inputSummary(call.input)}</span>
              <span className="analyze-workbench-call-output">
                {outputSummary(call.output, call.isError)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="analyze-workbench-empty">No tool activity yet.</p>
      )}
    </div>
  );
}

export function mountAnalyzeWorkbench(host: HTMLElement): () => void {
  const root = createRoot(host);
  root.render(<AnalyzeWorkbench />);
  return () => root.unmount();
}
