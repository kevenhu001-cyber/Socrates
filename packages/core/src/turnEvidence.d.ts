import type { TurnSource, TurnCitation, TurnClaim, TurnRuntime } from '../../contracts/src/turnEvent.js';
export function normalizeTurnSource(value: unknown): TurnSource | null;
export function normalizeTurnCitation(value: unknown): TurnCitation | null;
export function normalizeTurnClaim(value: unknown): TurnClaim | null;
export function isCitableTurnRange(text: string, start: number, end: number): boolean;
export function annotateTurnProse(text: string, start: number, runtime?: TurnRuntime | null): string;

export function citableTurnMatches(text: string, quote: string): number[];
