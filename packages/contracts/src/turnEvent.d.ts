/** Public observations and validated declarative UI only. Never provider scratch work. */
export interface TurnActivityEntry {
  id: string;
  kind: 'waiting' | 'reasoning' | 'tool' | 'synthesis' | 'reasoning_summary';
  phase: 'running' | 'done' | 'failed' | 'stopped';
  startedAt: number;
  endedAt?: number;
  /** Only public provider summaries may populate text. */
  text?: string;
  toolCallId?: string;
  toolName?: string;
}
export type TurnUiNode = { id: string; type: string; parent?: string; [key: string]: unknown };
export interface TurnUiSurface {
  id: string;
  toolCallId: string;
  textOffset: number;
  phase: 'streaming' | 'committed' | 'aborted';
  nodes: TurnUiNode[];
}
export type TurnEventPayload =
  | { type: 'activity.upsert'; activity: TurnActivityEntry }
  | { type: 'generation'; phase: 'streaming' }
  | { type: 'ui.begin'; surfaceId: string; toolCallId: string; textOffset: number }
  | { type: 'ui.add'; surfaceId: string; node: TurnUiNode }
  | { type: 'ui.patch'; surfaceId: string; nodeId: string; props: Record<string, unknown> }
  | { type: 'ui.commit'; surfaceId: string; nodes: TurnUiNode[] }
  | { type: 'ui.abort'; surfaceId: string }
  | { type: 'turn.done'; phase: 'done' | 'failed' | 'stopped'; durationMs?: number };
export type TurnEvent = { version: 1; turnId: string; seq: number; at: number } & TurnEventPayload;
export interface TurnRuntime {
  version: 1;
  turnId: string;
  seq: number;
  lifecycle: 'live' | 'done' | 'failed' | 'stopped';
  generation: 'waiting' | 'streaming' | 'done';
  activities: TurnActivityEntry[];
  uiSurfaces: TurnUiSurface[];
  durationMs?: number;
}
