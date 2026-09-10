/**
 * workspacePaths.ts — server-owned workspace directories.
 *
 * One tree per user and conversation: `u_<user>/s_<session>` under the
 * configured workspace root. The path never crosses the HTTP boundary;
 * callers receive absolute paths for the Pi agent process only.
 *
 * `WORKSPACE_ROOT` is the canonical env; `CODEX_WORKSPACE_ROOT` is still
 * read as a fallback so existing deployments and their workspace trees
 * keep resolving without a migration.
 */

import os from 'node:os';
import path from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

export const WORKSPACE_ROOT = String(
  process.env.WORKSPACE_ROOT
  || process.env.CODEX_WORKSPACE_ROOT
  || path.join(os.tmpdir(), 'socrates-workspaces'),
);

function safeWorkspaceSegment(value: string, maxLength: number): string {
  return String(value || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, maxLength);
}

/** Stable server-owned key for the directory attached to one conversation. */
export function sessionWorkspaceKey(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Resolve the isolated workspace for one Socrates conversation. A session
 * directory is deliberately independent of any agent thread id, so retries
 * and server restarts continue in the same working tree.
 */
export function ensureSessionWorkspace(userId: string | null, sessionId: string): string {
  const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
  const safeSession = safeWorkspaceSegment(sessionId, 64);
  const dir = path.join(WORKSPACE_ROOT, `u_${safeUser}`, `s_${safeSession}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Resolve the stable project workspace used by session-less runtime calls.
 * The caller supplies only an opaque project key.
 */
export function ensureProjectWorkspace(userId: string | null, projectKey: string): string {
  const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
  const safeProject = safeWorkspaceSegment(projectKey, 80);
  const dir = path.join(WORKSPACE_ROOT, `u_${safeUser}`, `p_${safeProject}`);
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
 * Keep project guidance inside the server-owned workspace. The agent loads
 * a root AGENTS.md automatically; the file is only created when absent so
 * deliberate workspace instructions are preserved.
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
        'This directory is a project workspace managed by Socrates. Follow the user task and the server-enforced sandbox and resource policy.',
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
        'This directory is managed by Socrates. Skills placed here are project guidance for the agent; they cannot change the server sandbox, provider, or credential policy.',
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
    const dir = path.join(WORKSPACE_ROOT, `u_${safeUser}`, `p_${safeProject}`);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}

/** Remove a conversation workspace tree (best-effort). */
export function removeSessionWorkspace(userId: string | null, sessionId: string) {
  try {
    const safeUser = safeWorkspaceSegment(userId || 'anon', 32);
    const safeSession = safeWorkspaceSegment(sessionId, 64);
    const dir = path.join(WORKSPACE_ROOT, `u_${safeUser}`, `s_${safeSession}`);
    rmSync(dir, { recursive: true, force: true });
  } catch { /* best-effort cleanup */ }
}
