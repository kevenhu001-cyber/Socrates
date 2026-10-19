import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { isolateAgentCommand } from '../src/services/util/agentIsolation.js';
import { runPiAgentTask } from '../src/services/tools/piAgent.js';

/* Bubblewrap needs unprivileged user namespaces. GitHub-hosted Ubuntu runners
   run under an AppArmor profile that denies `bwrap: setting up uid map`, and
   several container/CI sandboxes do the same. That is an environment limit, not
   a sandbox defect: the enforcement assertions below pass wherever namespaces
   are available. Probe once, then skip loudly instead of reporting a false
   isolation failure. The unit-level assertions that need no namespace (fail
   closed, production bypass rejection, abort, flag composition, SSRF) stay
   unconditional, so the merge gate keeps real coverage in every environment. */
let sandboxProbe;
function requireUsableSandbox(t) {
  if (process.platform !== 'linux') return t.skip('Linux Bubblewrap integration');
  if (sandboxProbe === undefined) {
    const command = isolateAgentCommand('/bin/true', [], tmpdir(), { PATH: process.env.PATH });
    const probe = spawnSync(command.bin, command.args, { env: command.env, encoding: 'utf8', timeout: 10000 });
    sandboxProbe = probe.status === 0 ? null : (probe.stderr || probe.error?.message || 'bwrap probe failed').trim();
  }
  if (sandboxProbe !== null) {
    console.warn(`[agentIsolation] SKIPPED: Bubblewrap cannot create a user namespace here — ${sandboxProbe}`);
    console.warn('[agentIsolation] isolation enforcement is UNVERIFIED in this environment; run on a host with unprivileged userns enabled');
    return t.skip(`Bubblewrap unavailable in this environment: ${sandboxProbe}`);
  }
  return true;
}

test('Bubblewrap hides adjacent secrets, other workspaces and host /proc; workspace remains writable', (t) => {
  if (!requireUsableSandbox(t)) return;
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-isolation-'));
  const workspace = path.join(base, 'workspace');
  const secret = path.join(base, 'secret.txt');
  mkdirSync(workspace);
  writeFileSync(secret, 'must not be readable');
  try {
    const program = `
      const fs = require('node:fs');
      for (const file of [${JSON.stringify(secret)}, '/proc/1/root${secret}']) {
        try { fs.readFileSync(file); process.exit(21); } catch (e) { if (!['ENOENT','EACCES'].includes(e.code)) throw e; }
      }
      try { fs.writeFileSync(${JSON.stringify(secret)}, 'private scratch copy'); } catch (e) { if (!['ENOENT','EACCES','EROFS'].includes(e.code)) throw e; }
      fs.writeFileSync('result.txt', 'isolated');
      console.log(process.env.HOME);
    `;
    const command = isolateAgentCommand(process.execPath, ['-e', program], workspace, { PATH: process.env.PATH });
    const result = spawnSync(command.bin, command.args, { env: command.env, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.equal(result.stdout.trim(), '/tmp/home');
    assert.equal(readFileSync(path.join(workspace, 'result.txt'), 'utf8'), 'isolated');
    assert.equal(readFileSync(secret, 'utf8'), 'must not be readable');
  } finally { rmSync(base, { recursive: true, force: true }); }
});

test('missing isolation executable fails closed rather than running on the host', async () => {
  const old = process.env.PI_AGENT_BWRAP_BIN;
  const workspace = mkdtempSync(path.join(tmpdir(), 'socrates-isolation-missing-'));
  process.env.PI_AGENT_BWRAP_BIN = '/no-such-bwrap';
  try {
    const result = await runPiAgentTask({ task: 'test', workspacePath: workspace, sessionId: 'test' });
    assert.equal(result.status, 'failed');
    assert.match(result.error, /unavailable/);
  } finally {
    if (old === undefined) delete process.env.PI_AGENT_BWRAP_BIN;
    else process.env.PI_AGENT_BWRAP_BIN = old;
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('production rejects the trusted-development isolation bypass', () => {
  const oldMode = process.env.PI_AGENT_ISOLATION;
  const oldEnv = process.env.NODE_ENV;
  process.env.PI_AGENT_ISOLATION = 'none';
  process.env.NODE_ENV = 'production';
  try {
    assert.throws(() => isolateAgentCommand(process.execPath, [], tmpdir(), {}), /isolation_required/);
  } finally {
    if (oldMode === undefined) delete process.env.PI_AGENT_ISOLATION; else process.env.PI_AGENT_ISOLATION = oldMode;
    if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv;
  }
});

test('an already aborted turn does not start an agent', async () => {
  const controller = new AbortController();
  controller.abort();
  const result = await runPiAgentTask({ task: 'test', workspacePath: '/does-not-exist', sessionId: 'test', signal: controller.signal });
  assert.equal(result.status, 'aborted');
});

test('timeout kills background descendants as well as the agent', async (t) => {
  if (!requireUsableSandbox(t)) return;
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-agent-tree-'));
  const workspace = path.join(base, 'workspace');
  mkdirSync(workspace);
  const cli = path.join(base, 'fake-pi');
  writeFileSync(cli, `#!/usr/bin/env node
const { spawn } = require('node:child_process');
spawn(process.execPath, ['-e', "setInterval(() => require('node:fs').appendFileSync('heartbeat', 'x'), 20)"], { stdio: 'ignore', detached: true });
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  const old = process.env.PI_AGENT_BIN;
  process.env.PI_AGENT_BIN = cli;
  try {
    const result = await runPiAgentTask({ task: 'test', workspacePath: workspace, sessionId: 'test', limits: { timeoutMs: 1200 } });
    assert.equal(result.status, 'timeout', result.error);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const size = readFileSync(path.join(workspace, 'heartbeat')).length;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(readFileSync(path.join(workspace, 'heartbeat')).length, size, 'descendant still writes after timeout');
  } finally {
    if (old === undefined) delete process.env.PI_AGENT_BIN; else process.env.PI_AGENT_BIN = old;
    rmSync(base, { recursive: true, force: true });
  }
});

test('the per-run provider extension is readable inside the isolated runtime', async (t) => {
  if (!requireUsableSandbox(t)) return;
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-agent-provider-'));
  const workspace = path.join(base, 'workspace');
  mkdirSync(workspace);
  const cli = path.join(base, 'fake-pi');
  writeFileSync(cli, `#!/usr/bin/env node
const fs = require('node:fs');
const extension = process.argv[process.argv.indexOf('--extension') + 1];
if (!fs.readFileSync(extension, 'utf8').includes('registerRunProvider')) process.exit(12);
console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: 'provider extension available' } }));
`, { mode: 0o755 });
  const old = process.env.PI_AGENT_BIN;
  process.env.PI_AGENT_BIN = cli;
  try {
    const result = await runPiAgentTask({ task: 'test', workspacePath: workspace, sessionId: 'test', provider: { baseUrl: 'https://provider.invalid/v1', model: 'test' } });
    assert.equal(result.status, 'completed', result.error);
    assert.equal(result.output, 'provider extension available');
  } finally {
    if (old === undefined) delete process.env.PI_AGENT_BIN; else process.env.PI_AGENT_BIN = old;
    rmSync(base, { recursive: true, force: true });
  }
});

test('workspace growth during a turn is detected and stops the agent', async (t) => {
  if (!requireUsableSandbox(t)) return;
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-agent-disk-'));
  const workspace = path.join(base, 'workspace');
  mkdirSync(workspace);
  const cli = path.join(base, 'fake-pi');
  writeFileSync(cli, `#!/usr/bin/env node
require('node:fs').writeFileSync('oversize', Buffer.alloc(17 * 1024 * 1024));
setInterval(() => {}, 1000);
`, { mode: 0o755 });
  const old = process.env.PI_AGENT_BIN;
  process.env.PI_AGENT_BIN = cli;
  try {
    const result = await runPiAgentTask({ task: 'test', workspacePath: workspace, sessionId: 'test', limits: { maxDiskMb: 16, timeoutMs: 5000 } });
    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'agent_workspace_disk_limit');
  } finally {
    if (old === undefined) delete process.env.PI_AGENT_BIN; else process.env.PI_AGENT_BIN = old;
    rmSync(base, { recursive: true, force: true });
  }
});

test('Bubblewrap includes --unshare-cgroup-try and configurable tmpfs size quota', (t) => {
  if (process.platform !== 'linux') return t.skip('Linux Bubblewrap integration');
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-agent-quota-'));
  const workspace = path.join(base, 'workspace');
  mkdirSync(workspace);
  try {
    const cmd = isolateAgentCommand(process.execPath, ['-v'], workspace, { PATH: process.env.PATH }, {
      tmpfsBytes: 10 * 1024 * 1024,
      allowNetwork: false,
    });
    assert.ok(cmd.args.includes('--unshare-cgroup-try'), 'must include cgroup try');
    assert.ok(cmd.args.includes('--unshare-net'), 'must include unshare-net when network disabled');
    const sizeIdx = cmd.args.indexOf('--size');
    assert.ok(sizeIdx >= 0, 'must specify --size for tmpfs');
    assert.equal(cmd.args[sizeIdx + 1], String(10 * 1024 * 1024));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('Bubblewrap unshare-net blocks outbound network socket connections', (t) => {
  if (!requireUsableSandbox(t)) return;
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-agent-net-'));
  const workspace = path.join(base, 'workspace');
  mkdirSync(workspace);
  try {
    const program = `
      const net = require('node:net');
      const socket = net.createConnection({ host: '1.1.1.1', port: 80, timeout: 500 });
      socket.on('error', (err) => {
        console.log('BLOCKED:' + err.code);
        process.exit(0);
      });
      socket.on('connect', () => {
        socket.destroy();
        console.log('CONNECTED');
        process.exit(42);
      });
    `;
    const command = isolateAgentCommand(process.execPath, ['-e', program], workspace, { PATH: process.env.PATH }, {
      allowNetwork: false,
    });
    const result = spawnSync(command.bin, command.args, { env: command.env, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /BLOCKED:(ENETUNREACH|EHOSTUNREACH|ENETDOWN|ECONNREFUSED)/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('Bubblewrap enforces tmpfs memory size limit on /tmp writes', (t) => {
  if (!requireUsableSandbox(t)) return;
  const base = mkdtempSync(path.join(tmpdir(), 'socrates-agent-tmpfs-'));
  const workspace = path.join(base, 'workspace');
  mkdirSync(workspace);
  try {
    const program = `
      const fs = require('node:fs');
      try {
        fs.writeFileSync('/tmp/oversize.bin', Buffer.alloc(10 * 1024 * 1024));
        process.exit(0);
      } catch (err) {
        if (err.code === 'ENOSPC') {
          console.log('QUOTA_REACHED');
          process.exit(0);
        }
        throw err;
      }
    `;
    // Set 2 MiB tmpfs quota
    const command = isolateAgentCommand(process.execPath, ['-e', program], workspace, { PATH: process.env.PATH }, {
      tmpfsBytes: 2 * 1024 * 1024,
    });
    const result = spawnSync(command.bin, command.args, { env: command.env, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    assert.match(result.stdout, /QUOTA_REACHED/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test('PiAgent rejects private or metadata IP provider URLs as SSRF', async () => {
  const workspace = mkdtempSync(path.join(tmpdir(), 'socrates-agent-ssrf-'));
  try {
    for (const badUrl of [
      'http://169.254.169.254/v1',
      'https://127.0.0.1:8080/v1',
      'https://10.0.0.5/v1',
      'https://192.168.1.1/v1',
      'http://example.com/v1',
      'https://localhost:8080/v1',
    ]) {
      const result = await runPiAgentTask({
        task: 'test',
        workspacePath: workspace,
        sessionId: 'test',
        provider: { baseUrl: badUrl, model: 'test' },
      });
      assert.equal(result.status, 'failed', `Must reject ${badUrl}`);
      assert.match(result.error, /agent_provider_url_rejected/, `Error must name rejected url for ${badUrl}`);
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
