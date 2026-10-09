import type { AgentPlanData, AgentStepData } from '../../ui/agentSteps.js';

/** `event: agent_step` — one projected workspace-agent step. */
export interface AgentStepFrame extends AgentStepData {
  type: 'step';
  id: string;
  runId?: string;
}

/** `event: agent_plan` — the workspace-agent todo list. */
export interface AgentPlanFrame extends AgentPlanData {
  type: 'plan';
  id: string;
  runId?: string;
}

interface AgentToolCall {
  id: string;
  name: string;
  _toolResultApplied?: boolean;
  runId?: string;
  steps?: AgentStepData[];
  plan?: AgentPlanData | null;
}

interface AgentToolMessage<TEntry extends AgentToolCall> {
  toolCalls?: TEntry[];
  _orphanAgentFrames?: Record<string, Array<AgentStepFrame | AgentPlanFrame>>;
}

interface AgentFrameRuntimeOptions<
  TEntry extends AgentToolCall,
  TMessage extends AgentToolMessage<TEntry>,
> {
  activeMessage: () => TMessage | null;
  findEntry: (message: TMessage | null, id: string) => TEntry | null;
  onToolActivity: () => void;
  notifyToolRun: (message: TMessage | null) => void;
}

function projectStep(frame: AgentStepFrame): AgentStepData {
  return {
    stepId: String(frame.stepId),
    kind: frame.kind,
    title: frame.title ?? null,
    detail: frame.detail ?? null,
    command: frame.command ?? null,
    status: frame.status,
    exitCode: frame.exitCode ?? null,
    durationMs: frame.durationMs ?? null,
    diffStat: frame.diffStat ?? null,
    output: frame.output ?? null,
  };
}

function updateSteps(steps: AgentStepData[] | undefined, stored: AgentStepData): AgentStepData[] {
  const current = Array.isArray(steps) ? steps : [];
  const existingIndex = current.findIndex((candidate) => candidate.stepId === stored.stepId);
  if (existingIndex >= 0) {
    const next = current.slice(0);
    next[existingIndex] = stored;
    return next;
  }
  return current.length < 60 ? [...current, stored] : current;
}

/** Own buffering, projection and replay of the workspace agent's SSE frames. */
export function createAgentFrameRuntime<
  TEntry extends AgentToolCall,
  TMessage extends AgentToolMessage<TEntry>,
>(options: AgentFrameRuntimeOptions<TEntry, TMessage>) {
  function agentEntryFor(message: TMessage, frameId: string): TEntry | null {
    const direct = frameId ? options.findEntry(message, frameId) : null;
    if (direct) return direct;
    const calls = Array.isArray(message.toolCalls) ? message.toolCalls : [];
    for (let index = calls.length - 1; index >= 0; index--) {
      if (calls[index] && calls[index].name === 'workspace_agent' && !calls[index]._toolResultApplied) {
        return calls[index];
      }
    }
    return null;
  }

  function bufferAgentFrame(message: TMessage, frame: AgentStepFrame | AgentPlanFrame): void {
    if (!message._orphanAgentFrames) message._orphanAgentFrames = {};
    const key = String(frame.id || 'workspace_agent');
    if (!message._orphanAgentFrames[key]) message._orphanAgentFrames[key] = [];
    /* Bounded: a long run must not grow this buffer without limit. */
    if (message._orphanAgentFrames[key].length < 200) message._orphanAgentFrames[key].push(frame);
  }

  function recordAgentStep(frame: AgentStepFrame): void {
    let message = options.activeMessage();
    if (!message || !frame || !frame.stepId) return;
    const entry = agentEntryFor(message, String(frame.id || ''));
    if (!entry) {
      bufferAgentFrame(message, frame);
      return;
    }
    options.onToolActivity();
    message = options.activeMessage();
    const liveEntry = message ? agentEntryFor(message, String(frame.id || '')) : null;
    if (!message || !liveEntry) return;
    if (frame.runId) liveEntry.runId = String(frame.runId);
    /* Containers are REPLACED, never mutated in place. The snapshot cache
       uses identity changes to decide whether an entry needs re-projection. */
    liveEntry.steps = updateSteps(liveEntry.steps, projectStep(frame));
    options.notifyToolRun(message);
  }

  function recordAgentPlan(frame: AgentPlanFrame): void {
    let message = options.activeMessage();
    if (!message || !frame || !Array.isArray(frame.steps) || frame.steps.length === 0) return;
    const entry = agentEntryFor(message, String(frame.id || ''));
    if (!entry) {
      bufferAgentFrame(message, frame);
      return;
    }
    options.onToolActivity();
    message = options.activeMessage();
    const liveEntry = message ? agentEntryFor(message, String(frame.id || '')) : null;
    if (!message || !liveEntry) return;
    if (frame.runId) liveEntry.runId = String(frame.runId);
    liveEntry.plan = { steps: frame.steps.slice(0, 40), explanation: frame.explanation ?? null };
    options.notifyToolRun(message);
  }

  /** Replay frames that arrived before their tool_use landed. */
  function drainAgentFrames(entry: TEntry, message: TMessage): void {
    const buckets = message._orphanAgentFrames;
    if (!buckets) return;
    const queued = [
      ...(buckets[entry.id] || []),
      ...(entry.name === 'workspace_agent' ? (buckets.workspace_agent || []) : []),
    ];
    delete buckets[entry.id];
    if (entry.name === 'workspace_agent') delete buckets.workspace_agent;
    for (const frame of queued) {
      if (frame.type === 'plan') recordAgentPlan({ ...frame, id: entry.id });
      else recordAgentStep({ ...frame, id: entry.id });
    }
  }

  return { recordAgentStep, recordAgentPlan, drainAgentFrames };
}
