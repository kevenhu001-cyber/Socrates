import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
/* `src/lib` and compiled `dist/lib` have the same depth below server/.
   Resolve through the stable server root so prompt loading works in both
   development and the compiled production runtime. */
const SERVER_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.dirname(SERVER_ROOT);

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

const BEAGLE_PROMPT_PATH = path.resolve(REPO_ROOT, 'prompts/beagle.md');
const TEACHER_MODE_PROMPT_PATH = path.resolve(REPO_ROOT, 'prompts/teacher-mode.md');
/* P_code-interpreter-prompt — the routing/when-NOT-to-call guidance
 * for code_interpreter. The tool's own `description` field already
 * covers the runnable-Python rules (no top-level await, etc.) — the
 * markdown file complements that with the dispatch logic the model
 * needs to choose between code_interpreter, render_intelligent_ui, and
 * a hand-written ```viz block. The file is intended to be
 * hot-reloaded; the loader reads mtime on every call and re-caches
 * when it changes. */
const CODE_INTERPRETER_PROMPT_PATH = path.resolve(REPO_ROOT, 'prompts/code-interpreter.md');
/* RN-6 — per-turn learning-mode behavior for Tutor mode. One markdown file,
 * one `## mode: <id>` section per mode plus a `## shared` section that every
 * mode gets (the next-questions contract). Hot-reloaded like the others. */
const LEARNING_MODES_PROMPT_PATH = path.resolve(REPO_ROOT, 'prompts/learning-modes.md');

export const LEARNING_MODE_IDS = ['think', 'recall', 'connect', 'diagnose', 'mistakes', 'practice'] as const;
export type LearningModeId = typeof LEARNING_MODE_IDS[number];

interface PromptFiles {
  stat(path: string): Promise<{ mtimeMs: number; size: number }>;
  readFile(path: string, encoding: 'utf8'): Promise<string>;
}

/** Cache source bytes, never rendered dates. Coalesce cold reads and reloads,
 * but stat each new request so edits are visible without a process restart.
 * The injectable filesystem/clock keep the invalidation tests independent of
 * the real prompt files. Session snapshots remain frozen by their own store. */
export function createPromptLoader(files: PromptFiles = fs, clock = () => new Date()) {
  const cache = new Map<string, { mtime: number; size: number; raw: string }>();
  const pending = new Map<string, Promise<string | null>>();
  async function read(filePath: string): Promise<string | null> {
    try {
      const stat = await files.stat(filePath);
      const hit = cache.get(filePath);
      if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.raw;
      const raw = await files.readFile(filePath, 'utf8');
      cache.set(filePath, { mtime: stat.mtimeMs, size: stat.size, raw });
      return raw;
    } catch (err) {
      cache.delete(filePath);
      console.error('[prompts] Failed to load', filePath + ':', (err as Error).message);
      return null;
    }
  }
  return {
    async load(filePath: string, interpolateDates = false): Promise<string | null> {
      let work = pending.get(filePath);
      if (!work) {
        work = read(filePath);
        pending.set(filePath, work);
      }
      let raw: string | null;
      try { raw = await work; }
      finally { if (pending.get(filePath) === work) pending.delete(filePath); }
      if (raw === null || !interpolateDates) return raw;
      const now = clock();
      return raw.replace(/\[current date\]/g, now.toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      })).replace(/\[current year\]/g, String(now.getFullYear()));
    },
    clear() { cache.clear(); },
  };
}

const promptLoader = createPromptLoader();
const loadPrompt = (filePath: string) => promptLoader.load(filePath, filePath === BEAGLE_PROMPT_PATH);

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
 * The chat route (server/src/routes/chat/helpers.ts) is the current
 * sole consumer; this stays here so future prompt files have a
 * single place to register their loader.
 */
export async function getTeacherModePrompt() {
  return loadPrompt(TEACHER_MODE_PROMPT_PATH);
}

/**
 * Load the code_interpreter routing guidance from
 * prompts/code-interpreter.md. The file complements (does not
 * duplicate) the tool's function-calling `description` field: the
 * `description` field is canonical for the runnable-Python rules,
 * while this markdown is canonical for "when to call this tool vs.
 * render_intelligent_ui vs. a hand-written ```viz block".
 *
 * Returns null if the file can't be read; the caller should fall
 * back to not injecting anything (the `description` field still
 * carries the most-important rules).
 */
export async function getCodeInterpreterPrompt() {
  return loadPrompt(CODE_INTERPRETER_PROMPT_PATH);
}

/** Split the learning-modes file into its `## shared` and `## mode: id` sections. */
export function parseLearningModeSections(raw: string): { shared: string; modes: Record<string, string> } {
  const modes: Record<string, string> = {};
  let shared = '';
  const parts = raw.split(/^## +/m).slice(1);
  for (const part of parts) {
    const newline = part.indexOf('\n');
    const heading = (newline < 0 ? part : part.slice(0, newline)).trim();
    const body = newline < 0 ? '' : part.slice(newline + 1).trim();
    if (heading === 'shared') shared = body;
    const match = heading.match(/^mode:\s*([a-z-]+)$/);
    if (match) modes[match[1]] = body;
  }
  return { shared, modes };
}

/**
 * The server-owned instructions for one learning mode: the shared contract
 * followed by the mode's own section. Null when the file is unreadable or
 * the mode has no section, so the turn simply runs without mode behavior.
 */
export async function getLearningModePrompt(mode: LearningModeId): Promise<string | null> {
  const raw = await loadPrompt(LEARNING_MODES_PROMPT_PATH);
  if (!raw) return null;
  const { shared, modes } = parseLearningModeSections(raw);
  const own = modes[mode];
  if (!own) return null;
  return [own, shared].filter(Boolean).join('\n\n');
}

/* Test hook — wipe the in-memory cache so tests can simulate file edits
   without going through the filesystem. Not exported on the route layer. */
export function _clearPromptCacheForTests() {
  promptLoader.clear();
}
