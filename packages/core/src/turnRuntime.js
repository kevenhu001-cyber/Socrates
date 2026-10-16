import { validateIntelligentUi } from './intelligentUiValidation.js';

const PHASES = ['running', 'done', 'failed', 'stopped'];
const KINDS = ['waiting', 'reasoning', 'tool', 'synthesis', 'reasoning_summary'];
const record = (value) => value && typeof value === 'object' && !Array.isArray(value);
const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 200;
const time = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const offset = (value) => Number.isSafeInteger(value) && value >= 0;

function activityOf(value) {
  if (!record(value) || !id(value.id) || !KINDS.includes(value.kind) || !PHASES.includes(value.phase) || !time(value.startedAt)) return null;
  if (value.endedAt !== undefined && !time(value.endedAt)) return null;
  if (value.text !== undefined && (value.kind !== 'reasoning_summary' || typeof value.text !== 'string' || value.text.length > 500)) return null;
  if (value.toolCallId !== undefined && !id(value.toolCallId)) return null;
  if (value.toolName !== undefined && !id(value.toolName)) return null;
  return { id: value.id, kind: value.kind, phase: value.phase, startedAt: value.startedAt,
    ...(value.endedAt !== undefined ? { endedAt: value.endedAt } : {}),
    ...(value.text !== undefined ? { text: value.text } : {}),
    ...(value.toolCallId ? { toolCallId: value.toolCallId } : {}),
    ...(value.toolName ? { toolName: value.toolName } : {}),
  };
}

export function createTurnRuntime(turnId) {
  return { version: 1, turnId, seq: 0, lifecycle: 'live', generation: 'waiting', activities: [], uiSurfaces: [] };
}

/** Transport validation also applies to reconnect/replay and stored snapshots. */
export function normalizeTurnEvent(value) {
  if (!record(value) || value.version !== 1 || !id(value.turnId) || !offset(value.seq) || value.seq === 0 || !time(value.at)) return null;
  const base = { version: 1, turnId: value.turnId, seq: value.seq, at: value.at, type: value.type };
  if (value.type === 'activity.upsert') {
    const activity = activityOf(value.activity);
    return activity ? { ...base, activity } : null;
  }
  if (value.type === 'generation') return value.phase === 'streaming' ? { ...base, phase: 'streaming' } : null;
  if (value.type === 'turn.done') return ['done', 'failed', 'stopped'].includes(value.phase) && (value.durationMs === undefined || time(value.durationMs))
    ? { ...base, phase: value.phase, ...(value.durationMs !== undefined ? { durationMs: value.durationMs } : {}) } : null;
  if (!id(value.surfaceId)) return null;
  const surface = { ...base, surfaceId: value.surfaceId };
  switch (value.type) {
    case 'ui.begin': return id(value.toolCallId) && offset(value.textOffset) ? { ...surface, toolCallId: value.toolCallId, textOffset: value.textOffset } : null;
    case 'ui.add': return record(value.node) ? { ...surface, node: value.node } : null;
    case 'ui.patch': return id(value.nodeId) && record(value.props) ? { ...surface, nodeId: value.nodeId, props: value.props } : null;
    case 'ui.commit': return Array.isArray(value.nodes) ? { ...surface, nodes: value.nodes } : null;
    case 'ui.abort': return surface;
    default: return null;
  }
}

/** Immutable, ordered and idempotent; generation never closes the activity track. */
export function reduceTurnEvent(previous, input) {
  const event = normalizeTurnEvent(input);
  if (!event) return previous;
  const state = previous || createTurnRuntime(event.turnId);
  if (state.turnId !== event.turnId || event.seq <= state.seq || state.lifecycle !== 'live') return previous;
  let next = { ...state, seq: event.seq };
  if (event.type === 'activity.upsert') {
    const index = state.activities.findIndex((entry) => entry.id === event.activity.id);
    if (index < 0 && state.activities.length >= 256) return previous;
    next.activities = index < 0 ? [...state.activities, event.activity]
      : state.activities.map((entry, i) => i === index ? event.activity : entry);
  } else if (event.type === 'generation') {
    next.generation = 'streaming';
  } else if (event.type === 'turn.done') {
    next = settleTurnRuntime(next, event.phase, event.at);
    if (event.durationMs !== undefined) next.durationMs = event.durationMs;
  } else if (event.type === 'ui.begin') {
    if (state.uiSurfaces.length >= 20 || state.uiSurfaces.some((entry) => entry.id === event.surfaceId)) return previous;
    next.uiSurfaces = [...state.uiSurfaces, { id: event.surfaceId, toolCallId: event.toolCallId, textOffset: event.textOffset, phase: 'streaming', nodes: [] }];
  } else {
    const surface = state.uiSurfaces.find((entry) => entry.id === event.surfaceId);
    if (!surface || surface.phase !== 'streaming') return previous;
    let nodes = surface.nodes;
    let phase = surface.phase;
    if (event.type === 'ui.abort') { nodes = []; phase = 'aborted'; }
    if (event.type === 'ui.add') nodes = [...nodes, event.node];
    if (event.type === 'ui.patch') {
      if (!nodes.some((node) => node.id === event.nodeId) || ['id', 'type', 'parent'].some((key) => key in event.props)) return previous;
      nodes = nodes.map((node) => node.id === event.nodeId ? { ...node, ...event.props } : node);
    }
    if (event.type === 'ui.commit') { nodes = event.nodes; phase = 'committed'; }
    if (phase !== 'aborted' && !validateIntelligentUi({ version: 1, nodes }).ok) return previous;
    next.uiSurfaces = state.uiSurfaces.map((entry) => entry === surface ? { ...entry, nodes, phase } : entry);
  }
  // Bound the complete snapshot as well as individual surfaces.
  return JSON.stringify(next).length <= (next.lifecycle === 'live' ? 150000 : 160000) ? next : previous;
}

/** Used for local stop/failure too, when no terminal server frame arrives. */
export function settleTurnRuntime(state, phase = 'done', at = Date.now()) {
  if (!state || state.lifecycle !== 'live') return state;
  return { ...state, lifecycle: phase, generation: 'done',
    activities: state.activities.map((entry) => entry.phase === 'running'
      ? { ...entry, phase: phase === 'done' ? 'done' : phase, endedAt: at } : entry),
    // A turn ending does not validate an unfinished UI document.
    uiSurfaces: state.uiSurfaces.map((entry) => entry.phase === 'streaming' ? { ...entry, phase: 'aborted', nodes: [] } : entry),
  };
}

export function normalizeTurnRuntime(value) {
  if (!record(value) || value.version !== 1 || !id(value.turnId) || !offset(value.seq)
    || !['live', 'done', 'failed', 'stopped'].includes(value.lifecycle) || !['waiting', 'streaming', 'done'].includes(value.generation)
    || !Array.isArray(value.activities) || value.activities.length > 256 || !Array.isArray(value.uiSurfaces) || value.uiSurfaces.length > 20
    || (value.durationMs !== undefined && !time(value.durationMs))) return null;
  if (JSON.stringify(value).length > 160000) return null;
  const activities = value.activities.map(activityOf);
  if (activities.some((entry) => !entry) || new Set(activities.map((entry) => entry.id)).size !== activities.length) return null;
  const uiSurfaces = [];
  for (const surface of value.uiSurfaces) {
    if (!record(surface) || !id(surface.id) || !id(surface.toolCallId) || !offset(surface.textOffset)
      || !['streaming', 'committed', 'aborted'].includes(surface.phase) || !Array.isArray(surface.nodes)
      || (surface.nodes.length ? !validateIntelligentUi({ version: 1, nodes: surface.nodes }).ok : surface.phase === 'committed')) return null;
    uiSurfaces.push({ id: surface.id, toolCallId: surface.toolCallId, textOffset: surface.textOffset, phase: surface.phase, nodes: surface.phase === 'aborted' ? [] : surface.nodes });
  }
  if (new Set(uiSurfaces.map((surface) => surface.id)).size !== uiSurfaces.length) return null;
  return { version: 1, turnId: value.turnId, seq: value.seq, lifecycle: value.lifecycle, generation: value.generation,
    activities, uiSurfaces, ...(value.durationMs !== undefined ? { durationMs: value.durationMs } : {}) };
}
