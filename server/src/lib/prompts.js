import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ─────────────────────────────────────────────────────────────────
   PROMPT LOADERS
   ─────────────────────────────────────────────────────────────────
   These read prompt files from prompts/ at the repo root and cache
   them in memory keyed by file mtime — so editing the markdown on
   disk is picked up on the next request without a server restart,
   and we don't hit the filesystem on every chat call.

   Both loaders are async (use fs.promises) so they don't block the
   event loop on disk I/O even at cold-start when the cache is empty.
   ───────────────────────────────────────────────────────────────── */

const BEAGLE_PROMPT_PATH = path.resolve(__dirname, '../../../prompts/beagle.md');
const TEACHER_MODE_PROMPT_PATH = path.resolve(__dirname, '../../../prompts/teacher-mode.md');

/* Per-file mtime-keyed cache. Key = absolute path, value = { mtime, content }. */
const cache = new Map();

async function loadPrompt(filePath) {
  try {
    const stat = await fs.stat(filePath);
    const mtime = stat.mtimeMs;
    const hit = cache.get(filePath);
    if (hit && hit.mtime === mtime) return hit.content;

    const raw = await fs.readFile(filePath, 'utf8');
    const content = substitutePlaceholders(raw, filePath);
    cache.set(filePath, { mtime, content });
    return content;
  } catch (err) {
    console.error('[prompts] Failed to load', filePath + ':', err.message);
    return null;
  }
}

/* Replace `[current date]` (and `[current year]`) placeholders with the
   actual values at request time. This is what makes the hardcoded date
   in prompts/beagle.md stay current without manual edits every month.

   We do the substitution at *load* time and cache the result for the
   same mtime, so a request that lands within the same second as a
   reload will see the same date. The cost of re-running this on every
   request (every chat turn) is one Date.toLocaleDateString call —
   cheaper than re-reading disk. If we ever need per-request date
   freshness within the same minute, switch to a per-call wrapper. */
let substitutedForDate = null;
let substitutedContent = null;
function substitutePlaceholders(raw, filePath) {
  if (filePath !== BEAGLE_PROMPT_PATH) return raw;
  const now = new Date();
  const today = now.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const year = String(now.getFullYear());
  // Recompute only when the calendar day changes — saves re-running
  // the two .replace calls on every chat turn when nothing has changed.
  const dayKey = now.toDateString();
  if (dayKey === substitutedForDate && substitutedContent !== null) {
    return substitutedContent;
  }
  substitutedForDate = dayKey;
  substitutedContent = raw
    .replace(/\[current date\]/g, today)
    .replace(/\[current year\]/g, year);
  return substitutedContent;
}

/* ─────────────────────────────────────────────────────────────────
   Public API
   ───────────────────────────────────────────────────────────────── */

/**
 * Load the full Beagle behavior spec from prompts/beagle.md.
 * Returns null if the file can't be read (caller should fall back to
 * its own identity prompt rather than dropping the system role).
 *
 * The returned string is intended to be the first system message sent
 * to the built-in MiniMax-M3 model via the minimax proxy. For
 * user-configured providers, do NOT inject this — they bring their
 * own model identity and would be confused by an in-depth spec that
 * names a different upstream.
 */
export async function getBeagleSystemPrompt() {
  return loadPrompt(BEAGLE_PROMPT_PATH);
}

/**
 * Same loader, exposed for any future caller that needs teacher-mode.
 * (chat.js still owns its own cached copy at the route level — keeping
 * this here so future prompt files have a single place to register.)
 */
export async function getTeacherModePrompt() {
  return loadPrompt(TEACHER_MODE_PROMPT_PATH);
}

/* Test hook — wipe the in-memory cache so tests can simulate file edits
   without going through the filesystem. Not exported on the route layer. */
export function _clearPromptCacheForTests() {
  cache.clear();
  substitutedForDate = null;
  substitutedContent = null;
}