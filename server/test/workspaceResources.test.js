import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  WORKSPACE_LIMIT_BOUNDS,
  WORKSPACE_LIMIT_DEFAULTS,
  assertWorkspaceDiskWithinLimit,
  limitsFromPolicy,
  normalizeWorkspaceLimits,
  workspaceDiskUsageBytes,
  workspaceResourceSnapshot,
} from '../src/services/workspaceResources.js';

test('workspace limits clamp to the supported range and fall back to defaults', () => {
  assert.deepEqual(normalizeWorkspaceLimits({ maxMemoryMb: 1, maxDiskMb: 1 }), {
    maxMemoryMb: WORKSPACE_LIMIT_BOUNDS.minMemoryMb,
    maxDiskMb: WORKSPACE_LIMIT_BOUNDS.minDiskMb,
  });
  assert.deepEqual(normalizeWorkspaceLimits({ maxMemoryMb: 99999, maxDiskMb: 99999 }), {
    maxMemoryMb: WORKSPACE_LIMIT_BOUNDS.maxMemoryMb,
    maxDiskMb: WORKSPACE_LIMIT_BOUNDS.maxDiskMb,
  });
  assert.deepEqual(normalizeWorkspaceLimits({}), WORKSPACE_LIMIT_DEFAULTS);
  assert.deepEqual(limitsFromPolicy({ maxMemoryMb: 256.9, maxDiskMb: '128' }), {
    maxMemoryMb: 256,
    maxDiskMb: 128,
  });
});

test('disk usage walks the tree and the pre-run gate blocks over-cap workspaces', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'socrates-workspace-'));
  try {
    mkdirSync(path.join(dir, 'src'));
    writeFileSync(path.join(dir, 'a.txt'), 'x'.repeat(2048));
    writeFileSync(path.join(dir, 'src', 'b.txt'), 'y'.repeat(1024));
    assert.equal(workspaceDiskUsageBytes(dir), 3072);

    const under = assertWorkspaceDiskWithinLimit(dir, { maxDiskMb: 16 });
    assert.equal(under.ok, true);
    assert.equal(under.usageBytes, 3072);

    /* The disk cap clamps to a 16 MB minimum, so exceed it with a real
       file rather than a fractional limit. */
    writeFileSync(path.join(dir, 'big.bin'), Buffer.alloc(17 * 1024 * 1024));
    const snapshot = workspaceResourceSnapshot(dir, { maxMemoryMb: 128, maxDiskMb: 16 });
    assert.equal(snapshot.overDisk, true);
    const over = assertWorkspaceDiskWithinLimit(dir, { maxDiskMb: 16 });
    assert.equal(over.ok, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
