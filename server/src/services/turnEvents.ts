import { reduceTurnEvent } from '../../../packages/core/src/turnRuntime.js';
import { normalizeTurnSource, citableTurnMatches } from '../../../packages/core/src/turnEvidence.js';
import { applyIntelligentUiPatch } from '../../../packages/core/src/intelligentUiPatch.js';
import { randomUUID } from 'node:crypto';
import type { PublicTurnActivity } from '../../../packages/contracts/src/turnActivity.js';
import type { TurnActivityEntry, TurnEvent, TurnEventPayload, TurnUiNode, TurnRuntime, TurnSource, TurnClaim, TurnCitation } from '../../../packages/contracts/src/turnEvent.js';
import { validateIntelligentUi } from './intelligentUi.js';
import { createIntelligentUiNodeStream } from './intelligentUiStream.js';

/** All modern public events for one turn share identity, ordering and time. */
export function createTurnEventController(emit: (event: TurnEvent) => void, turnId: string = randomUUID()) {
  let seq = 0;
  let runtime: TurnRuntime | null | undefined = null;
  let sourceSeq = 0;
  let claimSeq = 0;
  let finished = false;
  let generated = false;
  let processId = 0;
  let process: TurnActivityEntry | undefined;
  const tools = new Map<string, TurnActivityEntry>();
  const surfaces = new Map<string, { parser: ReturnType<typeof createIntelligentUiNodeStream>; nodes: TurnUiNode[]; published: Set<string>; aborted: boolean }>();
  const publish = (payload: TurnEventPayload): boolean => {
    if (finished) return false;
    const event: TurnEvent = { version: 1, turnId, seq: seq + 1, at: Date.now(), ...payload };
    const next = reduceTurnEvent(runtime, event);
    if (!next || next === runtime) return false;
    runtime = next;
    seq++;
    emit(event);
    return true;
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
    registerSources(values: Array<{ url?: unknown; title?: unknown; snippet?: unknown }>): TurnSource[] {
      if (finished) return [];
      const registered: TurnSource[] = [];
      for (const value of values.slice(0, 80)) {
        const candidate = normalizeTurnSource({ ...value, id: `source-${sourceSeq + 1}` });
        if (!candidate) continue;
        const existing = runtime?.sources?.find((source) => source.url === candidate.url);
        if (existing) { registered.push(existing); continue; }
        if (publish({ type: 'source.upsert', source: candidate })) { sourceSeq++; registered.push(candidate); }
      }
      return registered;
    },
    citeSources(args: Record<string, unknown>, text: string) {
      const fail = (error: string) => ({ ok: false as const, error });
      if (finished || !Array.isArray(args.claims) || !args.claims.length || args.claims.length > 20) return fail('Expected 1–20 claims in a live turn');
      const pending: Array<{ claim: TurnClaim; citations: TurnCitation[] }> = [];
      for (const input of args.claims) {
        if (!input || typeof input.quote !== 'string' || !input.quote.trim() || input.quote.length > 2000
          || !Array.isArray(input.sourceIds) || !input.sourceIds.length || input.sourceIds.length > 8
          || !input.sourceIds.every((id: unknown) => runtime?.sources?.some((source) => source.id === id))) return fail('Use exact prose quotes and registered source IDs');
        const positions = citableTurnMatches(text, input.quote);
        const occurrence = input.occurrence;
        if (occurrence !== undefined && (!Number.isSafeInteger(occurrence) || occurrence < 0 || occurrence > 1000)) return fail('Invalid quote occurrence');
        const start = positions[occurrence ?? 0];
        if (start === undefined || (positions.length !== 1 && occurrence === undefined)) return fail('Quote must match already-written visible prose uniquely; otherwise supply occurrence');
        const citations: TurnCitation[] = [...new Set<string>(input.sourceIds)].map((sourceId) => ({ id: `citation-${sourceId}`, sourceId }));
        const claim: TurnClaim = { id: `claim-${claimSeq + pending.length + 1}`, start, end: start + input.quote.length, quote: input.quote, citationIds: citations.map((citation) => citation.id) };
        pending.push({ claim, citations });
      }
      // Preflight the complete batch, including snapshot budgets and overlaps.
      let candidate = runtime;
      for (const [index, item] of pending.entries()) {
        const next = reduceTurnEvent(candidate, { version: 1, turnId, seq: seq + index + 1, at: Date.now(), type: 'claim.annotate', ...item });
        if (next === candidate || !next) return fail('Overlapping claim or evidence limit exceeded');
        candidate = next;
      }
      for (const item of pending) publish({ type: 'claim.annotate', ...item });
      claimSeq += pending.length;
      return { ok: true as const, output: `Annotated ${pending.length} claims with registered source references.` };
    },
    patchUi(args: Record<string, unknown>) {
      const fail = (error: string) => ({ ok: false as const, error });
      const surface = runtime?.uiSurfaces.find((entry) => entry.id === args.surfaceId);
      if (finished || !surface || surface.phase !== 'committed') return fail('Unknown or uncommitted surface in this turn');
      if (!Number.isSafeInteger(args.revision) || args.revision !== (surface.revision || 0)) return fail(`Stale revision; current revision is ${surface.revision || 0}`);
      const result = applyIntelligentUiPatch(surface.nodes, args.operations);
      if (!result.ok) return fail(result.error);
      if (!publish({ type: 'ui.edit', surfaceId: surface.id, baseRevision: surface.revision || 0, operations: args.operations as import('../../../packages/contracts/src/turnEvent.js').TurnUiEdit[] })) return fail('Turn snapshot limit exceeded');
      return { ok: true as const, output: `Updated surface ${surface.id}; revision ${(surface.revision || 0) + 1}. Nodes: ${result.nodes.map((node) => node.id).join(', ')}` };
    },
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
