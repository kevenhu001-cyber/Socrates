import type { TurnEvent, TurnRuntime } from '../../contracts/src/turnEvent.js';
export function createTurnRuntime(turnId: string): TurnRuntime;
export function normalizeTurnEvent(value: unknown): TurnEvent | null;
export function reduceTurnEvent(previous: TurnRuntime | null | undefined, event: unknown): TurnRuntime | null | undefined;
export function settleTurnRuntime(state: TurnRuntime | null | undefined, phase?: 'done' | 'failed' | 'stopped', at?: number): TurnRuntime | null | undefined;
export function normalizeTurnRuntime(value: unknown): TurnRuntime | null;
