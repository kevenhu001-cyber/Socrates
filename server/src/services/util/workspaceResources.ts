/**
 * Workspace resource policy — limits for the per-conversation agent
 * workspace created by the `initialize_workspace` tool.
 *
 * The model declares a memory and disk budget; this module normalizes the
 * numbers (so the tool schema, the durable workspace policy row,
 * and the pre-run disk gate agree) and measures on-disk usage so the
 * server can hard-enforce the storage cap before starting an agent turn.
 *
 * Memory is persisted on the policy and applied to the Pi agent process as
 * a Node heap cap at spawn time (`--max-old-space-size`).
 */

import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const MB = 1024 * 1024;

export const WORKSPACE_LIMIT_BOUNDS = {
  minMemoryMb: 64,
  maxMemoryMb: 4096,
  minDiskMb: 16,
  maxDiskMb: 8192,
} as const;

function resolveDefault(raw: string | undefined, fallback: number, min: number, max: number): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

export const WORKSPACE_LIMIT_DEFAULTS = {
  maxMemoryMb: resolveDefault(
    process.env.WORKSPACE_MAX_MEMORY_MB || process.env.CODEX_WORKSPACE_MAX_MEMORY_MB,
    512,
    WORKSPACE_LIMIT_BOUNDS.minMemoryMb,
    WORKSPACE_LIMIT_BOUNDS.maxMemoryMb,
  ),
  maxDiskMb: resolveDefault(
    process.env.WORKSPACE_MAX_DISK_MB || process.env.CODEX_WORKSPACE_MAX_DISK_MB,
    256,
    WORKSPACE_LIMIT_BOUNDS.minDiskMb,
    WORKSPACE_LIMIT_BOUNDS.maxDiskMb,
  ),
} as const;

export interface WorkspaceLimits {
  maxMemoryMb: number;
  maxDiskMb: number;
}

/** Clamp model-supplied limits into the supported range. */
export function normalizeWorkspaceLimits(raw: { maxMemoryMb?: unknown; maxDiskMb?: unknown } = {}): WorkspaceLimits {
  const memory = Number(raw.maxMemoryMb);
  const disk = Number(raw.maxDiskMb);
  return {
    maxMemoryMb: Number.isFinite(memory)
      ? Math.min(WORKSPACE_LIMIT_BOUNDS.maxMemoryMb, Math.max(WORKSPACE_LIMIT_BOUNDS.minMemoryMb, Math.trunc(memory)))
      : WORKSPACE_LIMIT_DEFAULTS.maxMemoryMb,
    maxDiskMb: Number.isFinite(disk)
      ? Math.min(WORKSPACE_LIMIT_BOUNDS.maxDiskMb, Math.max(WORKSPACE_LIMIT_BOUNDS.minDiskMb, Math.trunc(disk)))
      : WORKSPACE_LIMIT_DEFAULTS.maxDiskMb,
  };
}

/** Read the limits persisted on a workspace policy, falling back to defaults. */
export function limitsFromPolicy(policy: unknown): WorkspaceLimits {
  const record = policy && typeof policy === 'object' ? (policy as Record<string, unknown>) : {};
  return normalizeWorkspaceLimits({
    maxMemoryMb: record.maxMemoryMb,
    maxDiskMb: record.maxDiskMb,
  });
}

/**
 * Recursively measure a workspace tree. Symlinks are counted as entries but
 * never followed. An entry budget bounds work, but exceeding it or hitting
 * an unreadable subtree fails the quota check closed rather than ignoring
 * potentially unlimited bytes below a fixed depth.
 */
export function workspaceDiskUsageBytes(dir: string): number {
  let total = 0;
  let visited = 0;
  const pending = [dir];
  while (pending.length) {
    const current = pending.pop()!;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      return Infinity;
    }
    for (const entry of entries) {
      if (++visited > 100_000) return Infinity;
      const full = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) pending.push(full);
        else if (entry.isFile()) total += statSync(full).size;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return Infinity;
      }
    }
  }
  return total;
}

export interface WorkspaceResourceSnapshot {
  maxMemoryMb: number;
  maxDiskMb: number;
  diskBytes: number;
  diskLimitBytes: number;
  overDisk: boolean;
}

export function workspaceResourceSnapshot(dir: string, policy: unknown): WorkspaceResourceSnapshot {
  const limits = limitsFromPolicy(policy);
  const diskBytes = workspaceDiskUsageBytes(dir);
  const diskLimitBytes = limits.maxDiskMb * MB;
  return {
    ...limits,
    diskBytes,
    diskLimitBytes,
    overDisk: diskBytes > diskLimitBytes,
  };
}

/** Pre-run storage gate: refuse to start an agent turn over the cap. */
export function assertWorkspaceDiskWithinLimit(dir: string, policy: unknown): { ok: boolean; usageBytes: number; maxBytes: number } {
  const snapshot = workspaceResourceSnapshot(dir, policy);
  return { ok: !snapshot.overDisk, usageBytes: snapshot.diskBytes, maxBytes: snapshot.diskLimitBytes };
}

export { MB as WORKSPACE_MEGABYTE };
