/**
 * turnWatchdog — bounds a chat turn that stops making progress.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A streaming chat turn had no server-side deadline of its own. The
 * request timeout middleware explicitly EXEMPTS SSE routes (they are
 * legitimately long-lived), and the non-streaming LLM routes opt out
 * with `res.locals.timeoutMs = 0`. That exemption is right for a model
 * that is thinking for two minutes — but nothing bounded a turn where
 * the upstream stops producing anything at all: a stalled socket, a
 * provider that keeps the request open, a tool loop that spins without
 * emitting an event.
 *
 * The symptom was a request that never finished and never failed: the
 * client waited, the row stayed `running`, and the user's tokens were
 * committed to an answer nobody would ever see.
 *
 * TWO BUDGETS, NOT ONE
 * --------------------
 *  - `idleMs`: no PROGRESS for this long ends the turn. Progress means
 *    new content, new reasoning, a tool result, or a new upstream hop —
 *    a turn that is producing something is never cut off, no matter how
 *    long it takes.
 *  - `maxDurationMs`: the total wall-clock budget for the turn, for the
 *    case where a turn keeps trickling output forever.
 *
 * Both are disabled by a non-positive limit, so an operator can turn the
 * watchdog off without a code change. The defaults are deliberately
 * generous: they exist to catch a stuck turn, not to police a slow one.
 */

import { ApiError } from './errors.js';
import { localizeErrorCode, type ErrorLocale } from './errorMessages.js';

/** Which budget ran out. */
export type WatchdogExpiry = 'idle' | 'max_duration';

/** Ten minutes without a single byte of progress. */
export const DEFAULT_TURN_IDLE_TIMEOUT_MS = 10 * 60_000;
/** One hour of wall clock for the whole turn. */
export const DEFAULT_TURN_MAX_DURATION_MS = 60 * 60_000;
/** How often the pipeline checks the watchdog budgets. */
export const WATCHDOG_CHECK_INTERVAL_MS = 30_000;

export interface TurnWatchdogOptions {
  /** No progress for this long ends the turn. 0 or less disables it. */
  idleMs: number;
  /** Total wall-clock budget for the turn. 0 or less disables it. */
  maxDurationMs: number;
  /** Clock injection point for tests. */
  now?: () => number;
}

export interface TurnWatchdog {
  /** Record that the turn made progress. */
  touch(): void;
  /** Which budget is exhausted, or null while the turn may continue. */
  expiry(now?: number): WatchdogExpiry | null;
  /** Milliseconds since the last progress. */
  idleMs(now?: number): number;
  /** Milliseconds since the turn started. */
  elapsedMs(now?: number): number;
}

/**
 * Read the limits from the environment.
 *
 * `TURN_IDLE_TIMEOUT_MS` and `TURN_MAX_DURATION_MS` accept milliseconds.
 * A value of 0 (or anything unparseable) disables that budget.
 */
export function turnWatchdogLimits(env: Record<string, string | undefined> = process.env): {
  idleMs: number;
  maxDurationMs: number;
} {
  const read = (raw: string | undefined, fallback: number): number => {
    if (raw === undefined || raw.trim() === '') return fallback;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return parsed;
  };
  return {
    idleMs: read(env.TURN_IDLE_TIMEOUT_MS, DEFAULT_TURN_IDLE_TIMEOUT_MS),
    maxDurationMs: read(env.TURN_MAX_DURATION_MS, DEFAULT_TURN_MAX_DURATION_MS),
  };
}

export function createTurnWatchdog(options: TurnWatchdogOptions): TurnWatchdog {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  let lastProgressAt = startedAt;

  const touch = () => { lastProgressAt = now(); };

  const idleMs = (at: number = now()) => Math.max(0, at - lastProgressAt);
  const elapsedMs = (at: number = now()) => Math.max(0, at - startedAt);

  const expiry = (at: number = now()): WatchdogExpiry | null => {
    if (options.maxDurationMs > 0 && elapsedMs(at) >= options.maxDurationMs) return 'max_duration';
    if (options.idleMs > 0 && idleMs(at) >= options.idleMs) return 'idle';
    return null;
  };

  return { touch, expiry, idleMs, elapsedMs };
}

/**
 * The error the client sees when the watchdog ends a turn.
 *
 * The code is machine-readable (a client keys off it); the sentence is
 * localized; the status is 504 because from the client's point of view
 * the upstream did not deliver.
 */
export function watchdogError(expiry: WatchdogExpiry, locale: ErrorLocale = 'en'): ApiError {
  const code = expiry === 'idle' ? 'TURN_IDLE_TIMEOUT' : 'TURN_MAX_DURATION';
  const english = expiry === 'idle'
    ? 'The model stopped making progress and the turn was cancelled.'
    : 'The turn exceeded its maximum duration and was cancelled.';
  const message = localizeErrorCode(code, locale, english);
  /* `retryable: true` — the user can retry; the turn did not fail for a
   * reason that would make a replay pointless. */
  return new ApiError(504, code, message, undefined, true);
}

/** The abort reason the pipeline puts on the signal when the watchdog fires. */
export function watchdogAbortReason(expiry: WatchdogExpiry): string {
  return expiry === 'idle' ? 'turn_idle_timeout' : 'turn_max_duration';
}

/** The inverse: which budget an abort reason belongs to, if any. */
export function watchdogExpiryFromReason(reason: unknown): WatchdogExpiry | null {
  if (reason === 'turn_idle_timeout') return 'idle';
  if (reason === 'turn_max_duration') return 'max_duration';
  return null;
}
