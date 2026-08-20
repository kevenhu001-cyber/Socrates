import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface RustFetchRequest {
  url: string;
  headers?: Record<string, string>;
  maxBytes?: number;
  maxRedirects?: number;
  timeoutMs?: number;
  extract?: boolean;
}

export interface RustExtractedArticle {
  title: string;
  byline?: string | null;
  siteName?: string | null;
  excerpt: string;
  content: string;
  length: number;
  date?: string | null;
  method: string;
}

export interface RustFetchResponse {
  id: string;
  ok: boolean;
  status: number;
  code?: string;
  originalUrl: string;
  finalUrl?: string;
  headers?: Record<string, string>;
  body?: string;
  truncated?: boolean;
  reason?: string;
  article?: RustExtractedArticle;
}

interface RustWireRequest extends RustFetchRequest {
  id: string;
}

interface PendingRequest {
  resolve: (response: RustFetchResponse) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REQUEST_TIMEOUT_MS = 12_000;

let worker: RustFetchWorker | null = null;
let binaryUnavailable = false;
let unavailableLogged = false;

function rustFetchEnabled() {
  const configured = String(process.env.SOCRATES_RUST_FETCH || '').toLowerCase();
  // Native fetching is deliberately an explicit canary/production opt-in.
  // Existing Node tests replace global fetch and DNS; a silent process-wide
  // switch would make those fixtures non-deterministic.
  return configured === '1' || configured === 'true' || configured === 'on';
}

export function rustExtractionEnabled() {
  const configured = String(process.env.SOCRATES_RUST_EXTRACT || '').toLowerCase();
  return configured === '1' || configured === 'true' || configured === 'on';
}

function binaryName() {
  return process.platform === 'win32' ? 'socrates-fetchd.exe' : 'socrates-fetchd';
}

function resolveBinary() {
  const configured = process.env.SOCRATES_FETCHD_PATH;
  if (configured) return existsSync(configured) ? configured : null;

  const name = binaryName();
  const candidates = [
    path.resolve(process.cwd(), 'tools-rust', 'target', 'release', name),
    path.resolve(process.cwd(), '..', 'tools-rust', 'target', 'release', name),
    path.resolve(__dirname, '../../../tools-rust/target/release', name),
  ];
  return candidates.find((candidate) => existsSync(candidate)) || null;
}

class RustFetchWorker {
  readonly child: ChildProcessWithoutNullStreams;
  readonly pending = new Map<string, PendingRequest>();
  private stdoutBuffer = '';
  private disposed = false;

  constructor(binaryPath: string) {
    this.child = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => this.onStdout(chunk));
    this.child.stderr.on('data', (chunk: string) => {
      const message = String(chunk).trim();
      if (message) console.warn(`[rust-fetch] ${message}`);
    });
    this.child.on('error', (error) => this.failAll(error));
    this.child.on('exit', (code, signal) => {
      if (!this.disposed) {
        this.failAll(new Error(`rust fetch worker exited (${code ?? 'null'}/${signal ?? 'null'})`));
      }
      if (worker === this) worker = null;
    });
  }

  request(request: RustFetchRequest) {
    if (this.disposed || !this.child.stdin.writable) {
      return Promise.reject(new Error('rust fetch worker is not writable'));
    }
    const id = randomUUID();
    const wireRequest: RustWireRequest = { ...request, id };
    return new Promise<RustFetchResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('rust fetch worker request timeout'));
      }, Math.max(DEFAULT_REQUEST_TIMEOUT_MS, (request.timeoutMs || 0) + 2_000));
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(`${JSON.stringify(wireRequest)}\n`, (error) => {
          if (!error) return;
          const pending = this.pending.get(id);
          if (!pending) return;
          clearTimeout(pending.timer);
          this.pending.delete(id);
          pending.reject(error);
        });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private onStdout(chunk: string) {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf('\n');
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.onResponse(line);
      newline = this.stdoutBuffer.indexOf('\n');
    }
  }

  private onResponse(line: string) {
    let response: RustFetchResponse;
    try {
      response = JSON.parse(line) as RustFetchResponse;
    } catch (error) {
      this.failAll(new Error(`invalid rust fetch response: ${String(error)}`));
      return;
    }
    const pending = this.pending.get(response.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    pending.resolve(response);
  }

  private failAll(error: Error) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  async stop() {
    if (this.disposed) return;
    this.disposed = true;
    this.failAll(new Error('rust fetch worker stopped'));
    try { this.child.stdin.end(); } catch {}
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { this.child.kill(); } catch {}
        resolve();
      }, 1_000);
      this.child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }
}

function getWorker() {
  if (!rustFetchEnabled() || binaryUnavailable) return null;
  if (worker) return worker;
  const binary = resolveBinary();
  if (!binary) {
    binaryUnavailable = true;
    if (!unavailableLogged) {
      unavailableLogged = true;
      console.warn('[rust-fetch] native worker not found; using Node fetch fallback');
    }
    return null;
  }
  try {
    worker = new RustFetchWorker(binary);
    console.info(`[rust-fetch] native worker started: ${binary}`);
    return worker;
  } catch (error) {
    console.warn(`[rust-fetch] failed to start native worker: ${String(error)}`);
    return null;
  }
}

/**
 * Returns null when native Rust is not configured/available, allowing the
 * caller to keep the existing Node implementation. A structured Rust error
 * is returned normally and must not be treated as a transport failure.
 */
export async function fetchWithRust(request: RustFetchRequest): Promise<RustFetchResponse | null> {
  const current = getWorker();
  if (!current) return null;
  try {
    return await current.request(request);
  } catch (error) {
    console.warn(`[rust-fetch] worker request failed; using Node fallback: ${String(error)}`);
    await current.stop().catch(() => {});
    if (worker === current) worker = null;
    return null;
  }
}

export async function stopRustFetchWorker() {
  const current = worker;
  worker = null;
  if (current) await current.stop();
}

export function _resetRustFetchWorkerForTests() {
  binaryUnavailable = false;
  unavailableLogged = false;
}
