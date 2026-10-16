import { randomUUID } from 'node:crypto';
import type { PublicTurnActivity } from '../../../packages/contracts/src/turnActivity.js';
import type { TurnActivityEntry, TurnEvent, TurnEventPayload, TurnUiNode } from '../../../packages/contracts/src/turnEvent.js';
import { validateIntelligentUi } from './intelligentUi.js';
import { createIntelligentUiNodeStream } from './intelligentUiStream.js';

/** All modern public events for one turn share identity, ordering and time. */
export function createTurnEventController(emit: (event: TurnEvent) => void, turnId: string = randomUUID()) {
  let seq = 0;
  let finished = false;
  let generated = false;
  let processId = 0;
  let process: TurnActivityEntry | undefined;
  const tools = new Map<string, TurnActivityEntry>();
  const surfaces = new Map<string, { parser: ReturnType<typeof createIntelligentUiNodeStream>; nodes: TurnUiNode[]; published: Set<string>; aborted: boolean }>();
  const publish = (payload: TurnEventPayload) => {
    if (!finished) emit({ version: 1, turnId, seq: ++seq, at: Date.now(), ...payload });
  };
  const update = (activity: TurnActivityEntry) => publish({ type: 'activity.upsert', activity });
  const endProcess = () => {
    if (process?.phase === 'running') update({ ...process, phase: 'done', endedAt: Date.now() });
    process = undefined;
  };
  const startProcess = (kind: TurnActivityEntry['kind'], text?: string) => {
    if (process?.kind === kind && process.text === text) return;
    endProcess();
    process = { id: `process-${++processId}`, kind, phase: 'running', startedAt: Date.now(), ...(text ? { text } : {}) };
    update(process);
  };
  const beginSurface = (id: string, textOffset: number) => {
    if (surfaces.has(id) || surfaces.size >= 20) return surfaces.get(id);
    const surface = { parser: createIntelligentUiNodeStream(), nodes: [], published: new Set<string>(), aborted: false };
    surfaces.set(id, surface);
    publish({ type: 'ui.begin', surfaceId: id, toolCallId: id, textOffset });
    return surface;
  };
  const abortSurface = (id: string) => {
    const surface = surfaces.get(id);
    if (!surface || surface.aborted) return;
    surface.aborted = true;
    publish({ type: 'ui.abort', surfaceId: id });
  };
  return {
    activity(value: PublicTurnActivity) {
      if (value.type === 'thinking') {
        if (!process && !generated) startProcess('waiting');
      } else if (value.type === 'synthesizing') {
        startProcess('synthesis');
      } else if (value.type === 'public_reasoning_summary') {
        startProcess('reasoning_summary', value.text.trim().slice(0, 500));
      } else if (value.type === 'tool') {
        endProcess();
        if (!tools.has(value.toolCallId) && tools.size < 128) {
          const entry: TurnActivityEntry = { id: `tool-${value.toolCallId}`, kind: 'tool', phase: 'running', startedAt: Date.now(), toolCallId: value.toolCallId, toolName: value.toolName };
          tools.set(value.toolCallId, entry); update(entry);
        }
      }
    },
    reasoning() { startProcess('reasoning'); },
    generation() {
      if (!generated) { generated = true; publish({ type: 'generation', phase: 'streaming' }); }
      // Only the startup wait ends on prose. Real process work has its own track.
      if (process?.kind === 'waiting') endProcess();
    },
    toolArguments(delta: { id?: string | null; name?: string | null; arguments?: string }, textOffset: number) {
      if (!delta.id || delta.name !== 'render_intelligent_ui' || typeof delta.arguments !== 'string') return;
      const surface = beginSurface(delta.id, textOffset);
      if (!surface || surface.aborted) return;
      const result = surface.parser.push(delta.arguments);
      if (result.failed) { abortSurface(delta.id); return; }
      for (const candidate of result.nodes) {
        const node = candidate as TurnUiNode;
        // Parents may arrive later; validate each node's data before buffering it.
        if (!node || typeof node !== 'object' || !validateIntelligentUi({ version: 1, nodes: [{ ...node, parent: undefined }] }).ok
          || surface.nodes.some((entry) => entry.id === node.id)) { abortSurface(delta.id); return; }
        surface.nodes.push(node);
      }
      // Emit connected subtrees only; forward references remain buffered.
      let advanced = true;
      while (advanced) {
        advanced = false;
        for (const node of surface.nodes) {
          if (surface.published.has(node.id) || (node.parent && !surface.published.has(node.parent))) continue;
          const visible = surface.nodes.filter((entry) => surface.published.has(entry.id));
          if (!validateIntelligentUi({ version: 1, nodes: [...visible, node] }).ok) { abortSurface(delta.id); return; }
          surface.published.add(node.id);
          publish({ type: 'ui.add', surfaceId: delta.id, node });
          advanced = true;
        }
      }
    },
    toolResult(id: string, ok: boolean, input?: unknown, textOffset = 0) {
      const activity = tools.get(id);
      if (activity?.phase === 'running') {
        const settled: TurnActivityEntry = { ...activity, phase: ok ? 'done' : 'failed', endedAt: Date.now() };
        tools.set(id, settled); update(settled);
      }
      if (input !== undefined) {
        const surface = beginSurface(id, textOffset);
        if (!surface || surface.aborted) return;
        if (ok && validateIntelligentUi(input).ok) {
          publish({ type: 'ui.commit', surfaceId: id, nodes: (input as { nodes: TurnUiNode[] }).nodes });
        } else abortSurface(id);
      } else if (!ok) abortSurface(id);
    },
    done(phase: 'done' | 'failed' | 'stopped', durationMs?: number) {
      publish({ type: 'turn.done', phase, durationMs });
      finished = true;
      surfaces.clear(); tools.clear();
    },
  };
}
