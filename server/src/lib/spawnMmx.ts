/**
 * Shared helpers for spawning the local `mmx` CLI.
 *
 * Centralised so the search engine (`searchEngines/mmx.js`) and the
 * vision service (`services/vision.js`) don't drift in how they
 * prepare the subprocess environment. Both consumers rely on the
 * same invariants:
 *
 *   1. PATH includes `~/.npm-global/bin` (where `npm install -g
 *      mmx-cli` drops the binary) and other common global-prefix
 *      locations.
 *   2. Server-side `MINIMAX_*` env vars are stripped so the CLI
 *      reads its own `~/.mmx/config.json` instead of being routed to
 *      the wrong provider.
 *   3. MMX_QUIET=1 silences mmx's own progress output on stderr.
 *
 * Update MMX_CONFLICTING_ENV_PREFIXES here when adding a new provider-
 * side credential that could collide with the CLI's own config.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const MMX_CONFLICTING_ENV_PREFIXES = [
  /^MINIMAX/i,                              // legacy server HTTP key/BASE_URL
];

const DEFAULT_EXTRA_PATHS = [
  path.join(os.homedir(), '.npm-global', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
].filter(Boolean);

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Build the env we hand to a child process invoking mmx. Strips any
 * env var whose name matches one of MMX_CONFLICTING_ENV_PREFIXES and
 * prepends the global-node prefix directories to PATH.
 */
export function buildSpawnEnv(extra: Record<string, string> = {}) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const env: Record<string, string> = { ...process.env, ...extra, MMX_QUIET: '1' } as Record<string, string>;
  for (const k of Object.keys(env)) {
    if (MMX_CONFLICTING_ENV_PREFIXES.some((rx) => rx.test(k))) delete env[k];
  }
  const extraPaths = DEFAULT_EXTRA_PATHS.join(sep);
  env.PATH = extraPaths + sep + (env.PATH || process.env.PATH || '');
  return env;
}

let mmxAvailable: boolean | null = null;

/**
 * Cached PATH probe for the mmx binary. The CLI is an optional search
 * engine / vision helper: when it is not installed every spawn fails
 * with ENOENT, which costs a failed child-process attempt and a warn
 * log on every call. Resolved once per process.
 */
export function isMmxCliAvailable(): boolean {
  if (mmxAvailable !== null) return mmxAvailable;
  const sep = process.platform === 'win32' ? ';' : ':';
  const names = process.platform === 'win32'
    ? ['mmx.cmd', 'mmx.exe', 'mmx']
    : ['mmx'];
  const dirs = (buildSpawnEnv().PATH || '').split(sep);
  for (const dir of dirs) {
    if (!dir) continue;
    for (const name of names) {
      try {
        fs.accessSync(path.join(dir, name), fs.constants.X_OK);
        mmxAvailable = true;
        return true;
      } catch { /* not in this directory */ }
    }
  }
  mmxAvailable = false;
  console.warn('[spawnMmx] mmx CLI not found on PATH — mmx-backed search/vision is disabled until it is installed and the server restarted');
  return false;
}

/**
 * Spawn the mmx CLI with the given args and resolve with its stdout.
 * `stderr` is captured but only surfaced on non-zero exit (via the
 * rejection message) to keep the happy path quiet.
 *
 * @param {string[]} args
 * @param {object} [opts]
 * @param {number} [opts.timeoutMs=8000]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>}   child stdout
 */
export function runMmx(
  args: string[],
  opts: { timeoutMs?: number; signal?: AbortSignal; [key: string]: unknown } = {},
): Promise<string> {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn('mmx', args, {
        signal: opts.signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildSpawnEnv(),
      });
    } catch (e) {
      reject(e);
      return;
    }

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });

    const timer = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch (err) { /* process already exited */ }
    }, timeoutMs);

    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`mmx exit ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(stdout);
    });
  });
}
