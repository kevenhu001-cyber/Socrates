/** Linux filesystem/PID isolation. Network remains shared for provider access;
 * cgroup limits and outbound filtering belong to the execution host. */
import { accessSync, constants, existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

export interface AgentCommand {
  bin: string;
  args: string[];
  env: NodeJS.ProcessEnv;
}

export interface AgentIsolationOptions {
  readOnlyFiles?: string[];
  allowNetwork?: boolean;
  tmpfsBytes?: number;
}

const DEFAULT_TMPFS_BYTES = 64 * 1024 * 1024; // 64 MiB hard memory limit on /tmp tmpfs

function executablePath(bin: string): string {
  const candidates = bin.includes('/') ? [path.resolve(bin)]
    : (process.env.PATH || '').split(path.delimiter).map((dir) => path.join(dir, bin));
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.X_OK);
      return realpathSync(candidate);
    } catch { /* Try the next executable search directory. */ }
  }
  throw new Error(`agent_executable_unavailable: ${bin}`);
}

export function isolateAgentCommand(
  bin: string,
  args: string[],
  workspacePath: string,
  env: NodeJS.ProcessEnv,
  optionsOrReadOnlyFiles?: string[] | AgentIsolationOptions,
): AgentCommand {
  const options: AgentIsolationOptions = Array.isArray(optionsOrReadOnlyFiles)
    ? { readOnlyFiles: optionsOrReadOnlyFiles }
    : (optionsOrReadOnlyFiles || {});

  const readOnlyFiles = options.readOnlyFiles || [];
  const allowNetwork = options.allowNetwork ?? (process.env.PI_AGENT_ALLOW_NET !== '0');
  const tmpfsBytes = options.tmpfsBytes ?? (
    process.env.PI_AGENT_TMPFS_BYTES ? Number(process.env.PI_AGENT_TMPFS_BYTES) : DEFAULT_TMPFS_BYTES
  );

  const mode = process.env.PI_AGENT_ISOLATION || 'bubblewrap';
  if (mode === 'none' && process.env.NODE_ENV !== 'production') return { bin, args, env };
  if (mode !== 'bubblewrap' || process.platform !== 'linux') {
    throw new Error('agent_isolation_required: use Linux Bubblewrap; none is for trusted non-production development only');
  }
  const wrapper = executablePath(process.env.PI_AGENT_BWRAP_BIN || 'bwrap');
  const executable = executablePath(bin);
  const node = realpathSync(process.execPath);
  const workspace = realpathSync(workspacePath);
  if (workspace === path.parse(workspace).root) throw new Error('agent_workspace_must_not_be_root');
  const sandboxArgs = [
    '--unshare-user', '--unshare-pid', '--unshare-ipc', '--unshare-uts',
    '--unshare-cgroup-try',
    '--die-with-parent', '--new-session', '--cap-drop', 'ALL',
    '--proc', '/proc', '--dev', '/dev',
    '--size', String(tmpfsBytes), '--tmpfs', '/tmp',
    '--dir', '/tmp/home',
  ];
  if (!allowNetwork) {
    sandboxArgs.push('--unshare-net');
  }
  for (const dir of ['/usr', '/bin', '/sbin', '/lib', '/lib64']) {
    if (existsSync(dir)) sandboxArgs.push('--ro-bind', dir, dir);
  }
  for (const file of ['/etc/ssl', '/etc/ca-certificates', '/etc/resolv.conf', '/etc/hosts', '/etc/nsswitch.conf']) {
    if (existsSync(file)) sandboxArgs.push('--ro-bind', file, file);
  }
  // A global npm CLI may import sibling packages. Expose installed code only,
  // never HOME, ~/.pi credentials, the application tree or other workspaces.
  const modulesIndex = executable.indexOf(`${path.sep}node_modules${path.sep}`);
  const runtime = modulesIndex < 0 ? executable
    : executable.slice(0, modulesIndex + '/node_modules'.length);
  for (const file of new Set([node, runtime, ...readOnlyFiles.map((file) => realpathSync(file))])) {
    sandboxArgs.push('--ro-bind', file, file);
  }
  sandboxArgs.push('--bind', workspace, workspace, '--chdir', workspace, '--', executable, ...args);
  return {
    bin: wrapper,
    args: sandboxArgs,
    env: {
      ...env,
      HOME: '/tmp/home', TMPDIR: '/tmp',
      PATH: `${path.dirname(node)}:/usr/local/bin:/usr/bin:/bin`,
    },
  };
}

/** Each turn owns a POSIX process group. Bubblewrap's PID namespace also
 * reaps descendants that create their own sessions inside the sandbox. */
export function killAgentProcessGroup(child: { pid?: number; kill(signal: NodeJS.Signals): boolean }): void {
  if (process.platform !== 'win32' && child.pid) {
    try { process.kill(-child.pid, 'SIGKILL'); return; } catch { /* Already exited; try the direct handle. */ }
  }
  try { child.kill('SIGKILL'); } catch { /* Already reaped. */ }
}
