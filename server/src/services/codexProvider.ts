/**
 * codexProvider.js — resolve which LLM provider a Codex thread should use,
 * and own per-user/per-thread workspace directories.
 *
 * Codex speaks the OpenAI Responses API. Socrates users bring their own
 * OpenAI-compatible endpoints (chat/completions). P1 support:
 *   - If the user has an active, non-built-in key → inject it as a per-thread
 *     `model_providers.socrates` override (base_url + bearer token).
 *   - Otherwise fall back to the server's own Codex auth (CODEX_HOME auth,
 *     e.g. ChatGPT OAuth) with no provider override.
 *   - Built-in "Beagle" (MiniMax chat/completions) is NOT Responses-capable,
 *     so it is never injected.
 *
 * The server always constructs the `config` override — the client never
 * supplies config, so approval/sandbox knobs cannot be weakened by a tenant.
 */

import path from 'node:path';
import { mkdirSync, rmSync } from 'node:fs';
import { getActiveApiKey } from './apiKey.js';
import { CODEX_WORKSPACE_ROOT } from './codexHarness.js';

export interface ResolvedCodexProvider {
  mode: 'user' | 'server';
  model: string | null;
  /** dotted-path config override for thread/start, or null when using server auth. */
  config: Record<string, unknown> | null;
}

export async function resolveCodexProvider(userId: string | null): Promise<ResolvedCodexProvider> {
  try {
    const key = userId ? await getActiveApiKey(userId) : null;
    if (
      key &&
      !key.isBuiltIn &&
      key.keyPlaintext &&
      key.url &&
      /^https?:\/\//i.test(key.url)
    ) {
      const baseUrl = key.url.replace(/\/+$/, '');
      const model = key.model || null;
      const name = `socrates-${(userId || 'anon').slice(0, 8)}`;
      return {
        mode: 'user',
        model,
        config: {
          model_provider: name,
          'model_providers.socrates.name': 'Socrates',
          'model_providers.socrates.base_url': baseUrl,
          'model_providers.socrates.wire_api': 'responses',
          'model_providers.socrates.experimental_bearer_token': key.keyPlaintext,
          'model_providers.socrates.requires_openai_auth': false,
        },
      };
    }
  } catch (err) {
    console.warn('[codex-provider] key resolution failed:', (err as Error).message);
  }
  // No user key → server's own Codex auth (CODEX_HOME). No override.
  return { mode: 'server', model: process.env.CODEX_DEFAULT_MODEL || null, config: null };
}

/**
 * Create the isolated workspace directory for one user's thread.
 * cwd is returned as the thread's working directory; `workspace-write`
 * sandbox scopes the agent's file writes to this directory.
 */
export function ensureWorkspace(userId: string | null, threadId: string): string {
  const safeUser = (userId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
  const safeThread = threadId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `t_${safeThread}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Remove a thread workspace tree (best-effort). */
export function removeWorkspace(userId: string | null, threadId: string) {
  try {
    const safeUser = (userId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 32);
    const safeThread = threadId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
    const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `t_${safeThread}`);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}
