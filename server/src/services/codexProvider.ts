/**
 * codexProvider.js — resolve which LLM provider a Codex thread should use,
 * and own per-user/per-session workspace directories.
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
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
      return {
        mode: 'user',
        model,
        config: buildUserCodexProviderConfig(baseUrl, key.keyPlaintext),
      };
    }
  } catch (err) {
    console.warn('[codex-provider] key resolution failed:', (err as Error).message);
  }
  // No user key → server's own Codex auth (CODEX_HOME). No override.
  return { mode: 'server', model: process.env.CODEX_DEFAULT_MODEL || null, config: null };
}

/**
 * Build the server-owned Codex provider override for a user's compatible
 * endpoint. Keep the selected provider name aligned with the nested provider
 * definition: Codex rejects a config whose `model_provider` points at a name
 * that was never registered under `model_providers.*`.
 */
export function buildUserCodexProviderConfig(baseUrl: string, bearerToken: string): Record<string, unknown> {
  return {
    model_provider: 'socrates',
    'model_providers.socrates.name': 'Socrates',
    'model_providers.socrates.base_url': baseUrl,
    'model_providers.socrates.wire_api': 'responses',
    'model_providers.socrates.experimental_bearer_token': bearerToken,
    'model_providers.socrates.requires_openai_auth': false,
  };
}

function safeWorkspaceSegment(value: string, maxLength: number): string {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLength);
}

/** Stable server-owned key for the directory attached to one conversation. */
export function sessionWorkspaceKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Create the isolated workspace directory for one user's thread.
 * cwd is returned as the thread's working directory; `workspace-write`
 * sandbox scopes the agent's file writes to this directory.
 */
export function ensureWorkspace(userId: string | null, threadId: string): string {
  const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
  const safeThread = safeWorkspaceSegment(threadId, 64);
  const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `t_${safeThread}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve the isolated workspace for one Socrates conversation. A session
 * directory is deliberately independent of the Codex thread ID, so retries,
 * approvals, and server restarts continue in the same working tree.
 */
export function ensureSessionWorkspace(userId: string | null, sessionId: string): string {
  const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
  const safeSession = safeWorkspaceSegment(sessionId, 64);
  const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `s_${safeSession}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve the stable project workspace used by legacy/session-less runtime
 * calls. The caller supplies only an opaque project key; the absolute path
 * never crosses the HTTP boundary. Session-bound runs use
 * ensureSessionWorkspace() instead and never share this tree.
 */
export function ensureProjectWorkspace(userId: string | null, projectKey: string): string {
  const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
  const safeProject = safeWorkspaceSegment(projectKey, 80);
  const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `p_${safeProject}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Rebuild a path from a persisted server-owned workspace key. */
export function ensureWorkspaceForKey(userId: string | null, workspaceKey: string): string {
  const key = String(workspaceKey || '');
  if (key.startsWith('session:')) {
    return ensureSessionWorkspace(userId, key.slice('session:'.length));
  }
  return ensureProjectWorkspace(userId, key);
}

/**
 * Keep project guidance inside the server-owned workspace without letting a
 * client override the runtime policy. Codex discovers a root AGENTS.md
 * automatically; the file is only created when absent so deliberate
 * workspace instructions are preserved.
 */
export function ensureWorkspaceInstructions(workspacePath: string, projectInstructions?: string | null): void {
  const instructions = String(projectInstructions || '').trim();
  const socratesDir = path.join(workspacePath, '.socrates');
  const skillsDir = path.join(workspacePath, '.agents', 'skills');
  mkdirSync(socratesDir, { recursive: true });
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(
    path.join(socratesDir, 'PROJECT_INSTRUCTIONS.md'),
    instructions ? `# Socrates project instructions\n\n${instructions.slice(0, 50_000)}\n` : '# Socrates project instructions\n\nNo additional project instructions.\n',
    { encoding: 'utf8', mode: 0o600 },
  );
  const agentsPath = path.join(workspacePath, 'AGENTS.md');
  if (!existsSync(agentsPath)) {
    writeFileSync(
      agentsPath,
      [
        '# Socrates workspace',
        '',
        'This directory is a project workspace managed by Socrates. Follow the user task and the server-enforced sandbox and approval policy.',
        instructions ? `\n## Project guidance\n\n${instructions.slice(0, 50_000)}` : '',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
  }
  const skillsReadme = path.join(skillsDir, 'README.md');
  if (!existsSync(skillsReadme)) {
    writeFileSync(
      skillsReadme,
      [
        '# Project skills',
        '',
        'This directory is managed by Socrates. Skills placed here are project guidance for Codex; they cannot change the server sandbox, provider, approval, network, or credential policy.',
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    );
  }
}

/** Best-effort removal for an archived project workspace. */
export function removeProjectWorkspace(userId: string | null, projectKey: string) {
  try {
    const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
    const safeProject = safeWorkspaceSegment(projectKey, 80);
    const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `p_${safeProject}`);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}

/** Remove a conversation workspace tree (best-effort). */
export function removeSessionWorkspace(userId: string | null, sessionId: string) {
  try {
    const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
    const safeSession = safeWorkspaceSegment(sessionId, 64);
    const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `s_${safeSession}`);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}

/** Remove a thread workspace tree (best-effort). */
export function removeWorkspace(userId: string | null, threadId: string) {
  try {
    const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
    const safeThread = safeWorkspaceSegment(threadId, 64);
    const dir = path.join(CODEX_WORKSPACE_ROOT, `u_${safeUser}`, `t_${safeThread}`);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}
