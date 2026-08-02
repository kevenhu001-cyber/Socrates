// frontend/src/extensions/agentRunStore.ts
// Typed agent-run store + window bridge for workflow-stage events.
//
// Explore / DeepResearch publish {workflow, stage, status, current,
// total, message} events as they progress; new UIs (the explore stage
// stepper, the analyze workbench) subscribe via useSyncExternalStore
// or window.__socratesAgentRunBridge. Modeled on the other
// __socrates*Bridge objects (chatRuntimeStore, composerToolsStore).
//
// Exploration note: DeepResearch today mutates .search-progress DOM
// directly with string labels. This store is the structured event
// layer we add so new UIs get a stable {stage,status} contract
// instead of scraping presentation text.

import type { AgentRunEvent } from './types';

export interface AgentRunSnapshot {
  /** Monotonic revision — bump on every publish. */
  revision: number;
  /** Most recent run (per runId), keyed for quick lookup. */
  runs: ReadonlyMap<string, AgentRunEvent>;
  /** Latest event (for instant re-render). */
  lastEvent: AgentRunEvent | null;
}

export interface AgentRunBridge {
  getSnapshot(): AgentRunSnapshot;
  publish(event: AgentRunEvent): void;
  subscribe(listener: () => void): () => void;
}

const HIDDEN: AgentRunSnapshot = Object.freeze({
  revision: 0,
  runs: new Map<string, AgentRunEvent>(),
  lastEvent: null,
});

let snapshot: AgentRunSnapshot = HIDDEN;
const listeners = new Set<() => void>();

function commit(event: AgentRunEvent): void {
  const runs = new Map(snapshot.runs);
  runs.set(event.runId, event);
  snapshot = Object.freeze({
    revision: snapshot.revision + 1,
    runs,
    lastEvent: Object.freeze({ ...event }),
  });
  listeners.forEach((listener) => listener());
}

export function getAgentRunSnapshot(): AgentRunSnapshot {
  return snapshot;
}

export function subscribeToAgentRuns(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishAgentRun(event: AgentRunEvent): void {
  if (!event || !event.runId || !event.workflow || !event.stage) return;
  commit(event);
}

export function installAgentRunBridge(): AgentRunBridge {
  const existing = window.__socratesAgentRunBridge;
  if (existing) return existing;
  const bridge: AgentRunBridge = {
    getSnapshot: () => snapshot,
    publish: publishAgentRun,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  window.__socratesAgentRunBridge = bridge;
  return bridge;
}

declare global {
  interface Window {
    __socratesAgentRunBridge?: AgentRunBridge;
  }
}
