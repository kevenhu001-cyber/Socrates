/**
 * Shared helpers for spawning the local `firecrawl` CLI.
 *
 * Mirrors spawnMmx.js — the firecrawl-cli is an npm global binary
 * installed at the same prefix.  Server-side credential env vars are
 * NOT stripped because firecrawl reads from
 * ~/.config/firecrawl-cli/credentials.json, not from env variables.
 *
 * The firecrawl binary lives at ~/.npm-global/bin/firecrawl (symlink
 * to dist/index.js).  The same extra-PATH logic ensures it's found
 * even when the server runs with a sanitised PATH.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_EXTRA_PATHS = [
  path.join(os.homedir(), '.npm-global', 'bin'),
  '/usr/local/bin',
  '/opt/homebrew/bin',
].filter(Boolean);

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Build the env we hand to a child process invoking firecrawl.
 * Prepends the global-node prefix directories to PATH so the binary
 * is found.
 */
export function buildFirecrawlSpawnEnv(extra = {}) {
  const sep = process.platform === 'win32' ? ';' : ':';
  const env = { ...process.env, ...extra };
  const extraPaths = DEFAULT_EXTRA_PATHS.join(sep);
  env.PATH = extraPaths + sep + (env.PATH || process.env.PATH || '');
  return env;
}

/**
 * Spawn the firecrawl CLI with the given args and resolve with its stdout.
 * stderr is captured but only surfaced on non-zero exit.
 *
 * @param {string[]} args
 * @param {object}   [opts]
 * @param {number}   [opts.timeoutMs=10000]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<string>}  child stdout
 */
export function runFirecrawl(args, opts = {}) {
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn('firecrawl', args, {
        signal: opts.signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: buildFirecrawlSpawnEnv(),
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
      try { proc.kill('SIGTERM'); } catch (_) {}
    }, timeoutMs);

    proc.on('error', (e) => { clearTimeout(timer); reject(e); });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`firecrawl exit ${code}: ${stderr.slice(0, 200)}`));
        return;
      }
      resolve(stdout);
    });
  });
}
