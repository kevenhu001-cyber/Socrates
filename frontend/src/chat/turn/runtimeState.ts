/* chat/turn/runtimeState.ts — the shared turn-runtime contract.
 *
 * `chat/streamingTurn.ts` owns one mutable `state` object per streaming turn
 * and hands it to the helpers under `chat/turn/`. Before this file each
 * helper took an untyped `state` and re-derived every field it touched, so a
 * rename in the owner silently produced `undefined` in a helper. This
 * interface is the single description of what the helpers may read and
 * mutate; `streamingTurn.js` is the only producer.
 *
 * The type is declared here rather than in `streamingTurn.js` so the helpers
 * can be typed before the owner is converted.
 */
import { stateStore } from '../../state/store.ts';
import type { ActiveChatController } from '../turnState.ts';
import type { ToolRuntime } from '../toolRuntime.ts';
import type { StreamPlayer } from '../../render/streamPlayer.ts';
import type { normalizeTurnRuntime } from '@socrates/core';

/** `@socrates/core` re-exports the normaliser but not the runtime type. */
export type TurnRuntime = ReturnType<typeof normalizeTurnRuntime>;

/** The status line `message._liveStatus` that React's TurnStatus draws. */
export interface LiveStatus {
  phase: string;
  label?: string;
  mode?: string;
  state?: string;
  elapsedSec?: number;
  error?: string;
  retryable?: boolean;
  toolName?: string;
}

/** One entry of `message.toolCalls[]`, including the finish-time split point. */
export interface TurnToolCall {
  id?: string;
  textOffset?: number;
  _run?: unknown;
  [key: string]: unknown;
}

/** The store message a turn owns while it streams. */
export interface TurnMessage {
  clientId?: string;
  id?: string;
  type?: string;
  rawText?: string;
  html?: string | null;
  toolCalls?: TurnToolCall[];
  turnRuntime?: TurnRuntime;
  _liveStatus?: LiveStatus | null;
  _toolRunRev?: number;
  _turnAnchorMinHeight?: number;
  [key: string]: unknown;
}

/** The reasoning pill the turn installs on `state.thinkCtl`. */
export interface ThinkCtl {
  append?: (text?: string) => void;
  finalize?: () => void;
  remove?: () => void;
  setLabel?: (text: string, state?: string) => void;
}

/** `{id,name,offset}` ledger entry stamped onto `toolCalls[].textOffset`. */
export interface InlineToolRow {
  id: string;
  name?: string;
  offset: number;
}

export interface TurnRuntimeState {
  /* identity / DOM refs, set once */
  list: HTMLElement;
  div: HTMLElement;
  clientId: string;
  msgIdx: number;
  reactLive: boolean;
  retryBtnId: string;
  onRetry?: (() => unknown) | null;

  /* mutable streaming data */
  full: string;
  fullReasoning: string;
  reasoningDurationSec?: number;
  finished: boolean;
  _disposed: boolean;
  _elapsedTick: ReturnType<typeof setInterval> | null;
  thinkCtl: ThinkCtl | null;
  inlineToolRows: InlineToolRow[];
  _streamPlayer: StreamPlayer | null;
  _smooth: boolean;

  /* runtime singletons */
  toolRuntime: ToolRuntime;
  cancelScheduledRender(): void;
  ownsMessageSlot(): boolean;
  patchOwnedMessage(patch: Record<string, unknown>): TurnMessage | null;

  /* the controller this turn installed in turnState */
  ret: ActiveChatController | null;

  /* utilities */
  t(key: string, fallback?: string): string;
  appMode(): string;
}

/**
 * Read the message at `index` from the store as a turn message.
 *
 * Every turn helper needs this and none of them can narrow `unknown` on their
 * own, so the single cast lives here instead of at each call site.
 */
export function readTurnMessage(index: number): TurnMessage | null {
  if (index < 0) return null;
  const messages = stateStore.read('messages');
  if (!Array.isArray(messages)) return null;
  const message = messages[index];
  return (message as TurnMessage | null | undefined) || null;
}
