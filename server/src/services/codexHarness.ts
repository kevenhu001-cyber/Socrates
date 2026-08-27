/**
 * codexHarness.js — embedded Codex agent runtime bridge.
 *
 * Spawns a single shared `codex-app-server` subprocess (the open-source
 * OpenAI Codex harness, JSON-RPC 2.0 over stdio) and exposes a typed
 * client for the app-server protocol:
 *
 *   - `ensureStarted()`  — lazy spawn + initialize handshake + auto-restart
 *   - `request()`        — JSON-RPC request (thread/start, turn/start, …)
 *   - `notify()`         — JSON-RPC notification (initialized, …)
 *   - `respondToRequest()` — answer a server-initiated request (approval)
 *   - `onThreadEvent()`  — subscribe to turn/item notifications for a thread
 *   - `claimThread()` / `isThreadOwner()` / `releaseThread()` — ownership
 *
 * Multi-tenancy: one subprocess serves every user. Each thread is created
 * with a per-thread `config` override (dotted-path keys) that injects that
 * user's own provider base_url + bearer token, its own `cwd` workspace and
 * a fixed approval/sandbox policy — so the agent runtime never sees another
 * tenant's credentials or files.
 *
 * The host app-server reads `CODEX_HOME` (default `~/.codex`). A dedicated
 * CODEX_HOME with a generated config.toml is expected in production so the
 * product does not inherit a developer's personal Codex configuration.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import os from 'node:os';

export const CODEX_ENABLED = process.env.CODEX_ENABLED !== 'false';
/**
 * Command that starts the app server.
 *
 * Historically this was a standalone `codex-app-server` executable. Recent
 * codex-cli releases ship the server as a subcommand instead, so the value
 * may carry arguments: `".../bin/codex.js app-server"`. Splitting on
 * whitespace keeps both forms working without a shell (which would reopen
 * the argument-injection surface a plain spawn avoids).
 */
export const CODEX_BIN = process.env.CODEX_APP_SERVER_BIN || 'codex-app-server';

/** `[command, ...leadingArgs]` parsed from CODEX_BIN. */
export function parseCodexCommand(raw: string): { command: string; args: string[] } {
  const parts = String(raw || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { command: 'codex-app-server', args: [] };
  const command = parts[0];
  const args = parts.slice(1);
  /* A binary named `codex` is the interactive CLI; the app-server lives
   * behind its `app-server` subcommand. Spawning the CLI directly with
   * `--listen stdio://` exits with an argument error, which surfaces to
   * users as every workspace task failing during initialization. The
   * standalone build is named codex-app-server and passes through as-is. */
  const base = command.replace(/^.*[\\/]/, '').toLowerCase();
  const isCodexCli = base === 'codex' || base === 'codex.js'
    || base === 'codex.cmd' || base === 'codex.ps1';
  if (isCodexCli && !args.includes('app-server')) args.push('app-server');
  return { command, args };
}
export const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
export const CODEX_CLIENT_NAME = process.env.CODEX_CLIENT_NAME || 'socrates';

/** Root under which per-user, per-thread workspaces are created. */
export const CODEX_WORKSPACE_ROOT = process.env.CODEX_WORKSPACE_ROOT || path.join(os.tmpdir(), 'socrates-codex');

const REQUEST_TIMEOUT_MS = Number(process.env.CODEX_REQUEST_TIMEOUT_MS || 60_000);
const MAX_RESTART_DELAY_MS = 30_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  method: string;
  timer: NodeJS.Timeout;
}

interface ThreadOwner {
  userId: string | null;
  model: string;
  createdAt: number;
}

export interface PendingApproval {
  rpcId: number | string;
  method: string;
  threadId: string;
  turnId: string | null;
  itemId: string | null;
  params: Record<string, unknown>;
  receivedAt: number;
}

type ThreadEventCb = (
  method: string,
  params: Record<string, unknown>,
  meta?: { rpcId: number | string },
) => void;

class CodexHarness extends EventEmitter {
  private child: ReturnType<typeof spawn> | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private nextId = 1;
  private pending = new Map<number | string, PendingRequest>();
  private initialized = false;
  private starting: Promise<void> | null = null;
  private stopped = false;
  private restartTimer: NodeJS.Timeout | null = null;
  /** Last bytes printed on the child's stderr — included in failure
   * messages so a crashed app-server is diagnosable from the journal. */
  private stderrTail = '';

  /** threadId → owner metadata (in-memory; threads are ephemeral in P1). */
  private owners = new Map<string, ThreadOwner>();
  /** threadId → Set of SSE subscribers. */
  private subscribers = new Map<string, Set<ThreadEventCb>>();
  /** rpcId → pending server-initiated request (approval) awaiting a decision. */
  private approvals = new Map<number | string, PendingApproval>();

  get isRunning(): boolean {
    return this.child !== null && this.initialized;
  }

  isThreadOwner(threadId: string, userId: string | null): boolean {
    const owner = this.owners.get(threadId);
    if (!owner) return false;
    return owner.userId === userId;
  }

  claimThread(threadId: string, userId: string | null, model: string) {
    this.owners.set(threadId, { userId, model, createdAt: Date.now() });
  }

  releaseThread(threadId: string) {
    this.owners.delete(threadId);
    this.subscribers.delete(threadId);
  }

  listApprovals(threadId: string): PendingApproval[] {
    const out: PendingApproval[] = [];
    for (const a of this.approvals.values()) {
      if (a.threadId === threadId) out.push(a);
    }
    return out;
  }

  /** Subscribe to turn/item notifications for a thread. Returns unsubscribe. */
  onThreadEvent(threadId: string, cb: ThreadEventCb): () => void {
    let set = this.subscribers.get(threadId);
    if (!set) {
      set = new Set();
      this.subscribers.set(threadId, set);
    }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) this.subscribers.delete(threadId);
    };
  }

  async ensureStarted(): Promise<void> {
    if (!CODEX_ENABLED) {
      throw new Error('Codex harness is disabled (CODEX_ENABLED=false)');
    }
    if (this.isRunning) return;
    if (this.starting) return this.starting;
    this.starting = this.start();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  private start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.stopped) {
        reject(new Error('Codex harness has been stopped'));
        return;
      }
      const { command, args: leadingArgs } = parseCodexCommand(CODEX_BIN);
      const argv = [...leadingArgs, '--listen', 'stdio://'];
      console.log(`[codex-harness] starting app-server: ${command} ${argv.join(' ')}`);
      this.stderrTail = '';
      const child = spawn(command, argv, {
        env: { ...process.env, CODEX_HOME },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.child = child;

      const rl = createInterface({ input: child.stdout });
      this.rl = rl;

      let buf = '';
      rl.on('line', (line) => {
        const msg = this.parseLine(line, buf);
        if (msg === null) return;
        this.dispatch(msg);
      });
      rl.on('error', (err) => {
        this.emit('log', 'warn', `[codex-harness] readline error: ${err.message}`);
      });

      child.stderr.on('data', (d: Buffer) => {
        const text = d.toString().trim();
        if (!text) return;
        this.stderrTail = `${this.stderrTail}\n${text}`.slice(-2000);
        this.emit('log', 'debug', `[codex-harness stderr] ${text.slice(0, 500)}`);
      });

      child.on('error', (err) => {
        const code = (err as NodeJS.ErrnoException).code;
        const message = code === 'ENOENT'
          ? `Codex app-server binary not found ("${command}"). Install Codex or point CODEX_APP_SERVER_BIN at the binary.`
          : err.message;
        this.emit('log', 'error', `[codex-harness] spawn error: ${message}`);
        this.teardown();
        reject(new Error(message));
      });

      child.on('exit', (code, signal) => {
        this.emit('log', 'warn', `[codex-harness] app-server exited (code=${code} signal=${signal})`);
        this.teardown();
        this.scheduleRestart();
      });

      // Wait for the process to be alive and ready. initialize() is sent
      // immediately; readiness = the initialize response arrives.
      this.initialize().then(resolve, reject);
    });
  }

  private teardown() {
    this.initialized = false;
    this.child = null;
    this.rl?.removeAllListeners();
    this.rl = null;
    // Fail every in-flight request so callers don't hang forever. Include
    // the child's stderr tail: when the binary exits during the initialize
    // handshake (wrong command, missing auth) this is the only place the
    // real reason surfaces.
    const tail = this.stderrTail.trim().split('\n').slice(-3).join(' ').slice(0, 300);
    const deathMessage = tail
      ? `Codex app-server process died: ${tail}`
      : 'Codex app-server process died';
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new Error(deathMessage));
    }
    this.pending.clear();
    this.owners.clear();
    this.subscribers.clear();
    this.approvals.clear();
  }

  private scheduleRestart() {
    if (this.stopped || this.restartTimer) return;
    const delay = 2000;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.stopped) return;
      this.emit('log', 'warn', '[codex-harness] restarting app-server…');
      this.ensureStarted().catch((err) => {
        this.emit('log', 'error', `[codex-harness] restart failed: ${err.message}`);
        this.scheduleRestart();
      });
    }, Math.min(delay, MAX_RESTART_DELAY_MS));
  }

  /** Split a stdout line into a parsed JSON message, tolerating leading junk. */
  private parseLine(line: string, _buf: string): any | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      // app-server may emit non-JSON lines on stdout in edge cases
      this.emit('log', 'debug', `[codex-harness stdout] ${line.slice(0, 200)}`);
      return null;
    }
  }

  private dispatch(msg: any) {
    if (msg.id != null && msg.method == null) {
      // Response to one of our requests.
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) {
          const code = msg.error.code;
          const message = msg.error.message || 'Codex app-server request failed';
          const err: any = new Error(message);
          err.codexErrorCode = code;
          p.reject(err);
        } else {
          p.resolve(msg.result);
        }
      }
      return;
    }
    if (msg.id != null && msg.method) {
      // Server-initiated request (approval, currentTime/read, …).
      this.handleServerRequest(msg);
      return;
    }
    // Notification.
    const method: string = msg.method;
    const params = msg.params || {};
    const threadId: string | undefined = params.threadId;
    if (threadId) {
      const set = this.subscribers.get(threadId);
      if (set) {
        for (const cb of [...set]) {
          try {
            cb(method, params);
          } catch (err) {
            this.emit('log', 'warn', `[codex-harness] subscriber error: ${(err as Error).message}`);
          }
        }
      }
    }
    this.emit('event', method, params);
  }

  private async handleServerRequest(msg: any) {
    const method: string = msg.method;
    const params = msg.params || {};
    const rpcId: number | string = msg.id;
    const threadId: string | undefined = params.threadId;

    if (threadId) {
      // Prune stale pending approvals (e.g. answered via another
      // connection or orphaned by a turn that ended).
      const cutoff = Date.now() - 10 * 60 * 1000;
      for (const [id, a] of this.approvals) {
        if (a.receivedAt < cutoff) this.approvals.delete(id);
      }
      this.approvals.set(rpcId, {
        rpcId,
        method,
        threadId,
        turnId: params.turnId ?? null,
        itemId: params.itemId ?? null,
        params,
        receivedAt: Date.now(),
      });
      // Redeliver to current subscribers immediately, carrying the rpcId
      // so a client can answer this exact request.
      const set = this.subscribers.get(threadId);
      if (set) {
        for (const cb of [...set]) {
          try {
            cb(method, params, { rpcId });
          } catch (err) {
            this.emit('log', 'warn', `[codex-harness] approval delivery error: ${(err as Error).message}`);
          }
        }
      }
      return;
    }

    // Requests not tied to a thread: auto-answer the safe ones.
    switch (method) {
      case 'currentTime/read':
        this.respondToRequest(rpcId, { currentTimeAt: Math.floor(Date.now() / 1000) });
        break;
      default:
        this.emit('log', 'warn', `[codex-harness] unanswered server request ${method}`);
        this.respondToRequest(rpcId, {});
    }
  }

  /** Answer a server-initiated request (approval decision etc.). */
  respondToRequest(rpcId: number | string, result: unknown) {
    const stdin = this.child?.stdin;
    if (!stdin || !stdin.writable) return false;
    this.approvals.delete(rpcId);
    stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: rpcId, result })}\n`);
    return true;
  }

  request(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      const stdin = this.child?.stdin;
      if (!stdin || !stdin.writable) {
        reject(new Error('Codex app-server is not running'));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request "${method}" timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, method, timer });
      stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  notify(method: string, params: Record<string, unknown> = {}) {
    const stdin = this.child?.stdin;
    if (!stdin || !stdin.writable) return false;
    stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
    return true;
  }

  private initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.child;
      const stdin = child?.stdin;
      if (!child || !stdin) {
        reject(new Error('no child process'));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex initialize timed out after ${REQUEST_TIMEOUT_MS}ms (check CODEX_APP_SERVER_BIN="${CODEX_BIN}")`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: (result) => {
          this.initialized = true;
          this.emit('ready', result);
          resolve();
        },
        reject,
        method: 'initialize',
        timer,
      });
      stdin.write(`${JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'initialize',
        params: {
          clientInfo: {
            name: CODEX_CLIENT_NAME,
            title: 'Socrates',
            version: '0.1.0',
          },
          capabilities: { experimentalApi: true },
        },
      })}\n`);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    const child = this.child;
    if (child) {
      try { child.kill(); } catch { /* ignore */ }
      // Give it a moment to exit cleanly, then force.
      await new Promise((r) => setTimeout(r, 300));
      if (!child.killed) {
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
      }
    }
    this.teardown();
  }
}

export const codexHarness = new CodexHarness();
