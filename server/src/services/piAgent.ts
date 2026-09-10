/**
 * Pi Agent runtime — executes the conversational workspace agent with the
 * `pi` coding-agent CLI in JSON event-stream mode.
 *
 * Replaces the previous app-server based path for chat: one `pi --mode json` process
 * per agent turn, cwd pinned to the server-owned workspace, tools restricted
 * to read/bash/edit/write, and the session id + session dir stored inside the
 * workspace so consecutive turns continue the same conversation.
 *
 * Wire contract (see pi docs/json.md): stdout is JSONL — a `session` header
 * followed by AgentEvent records (`message_update`, `tool_execution_*`,
 * `turn_end`, `agent_end`, …). This module normalizes those records into the
 * small vocabulary the chat runtime already understands.
 */

import { spawn, type ChildProcessByStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Readable } from 'node:stream';
import { AGENT_STEP_LABELS, type AgentStepKind } from './agentStepProjection.js';

const DEFAULT_TIMEOUT_MS = Math.max(60_000, Number(process.env.PI_AGENT_TIMEOUT_MS || 15 * 60_000));
const MAX_OUTPUT_CHARS = 2_000_000;
const MAX_STREAM_LINE_CHARS = 2_000_000;

const PI_BIN_CANDIDATES = [
  '/home/ubuntu/.volta/bin/pi',
  '/home/ubuntu/.npm-global/bin/pi',
  '/usr/local/bin/pi',
  '/usr/bin/pi',
];

export function resolvePiAgentBin(): string | null {
  const configured = String(process.env.PI_AGENT_BIN || '').trim();
  if (configured) {
    if (configured.includes('/')) return existsSync(configured) ? configured : null;
    return configured;
  }
  for (const candidate of PI_BIN_CANDIDATES) {
    if (existsSync(candidate)) return candidate;
  }
  return 'pi';
}

export const PI_AGENT_ENABLED = process.env.PI_AGENT_ENABLED !== 'false' && !!resolvePiAgentBin();

export interface PiAgentLimits {
  maxMemoryMb?: number;
  timeoutMs?: number;
}

/** The user-selected LLM endpoint for this run. */
export interface PiAgentProvider {
  baseUrl: string;
  model: string;
  apiKey?: string | null;
}

export interface PiAgentEvent {
  type: 'delta' | 'reasoning' | 'step_start' | 'step_update' | 'step_end' | 'done' | 'error';
  /** Tool step payload for `step_*` events. */
  step?: {
    stepId: string;
    kind: AgentStepKind;
    title: string;
    detail: string | null;
    command: string | null;
    status: 'running' | 'done' | 'failed';
    output: string | null;
    isError?: boolean;
  };
  /** Text chunks for `delta` / `reasoning` / `step_update`. */
  chunk?: string;
}

export interface PiAgentRunInput {
  task: string;
  workspacePath: string;
  sessionId: string;
  signal?: AbortSignal;
  limits?: PiAgentLimits;
  /** When set, Pi runs against the endpoint + model the user selected. */
  provider?: PiAgentProvider | null;
  onEvent?: (event: PiAgentEvent) => void;
}

export interface PiAgentRunResult {
  status: 'completed' | 'failed' | 'timeout' | 'aborted';
  output: string;
  error: string | null;
}

function toolKind(toolName: string, args: Record<string, unknown>): AgentStepKind {
  const name = String(toolName || '').toLowerCase();
  if (name === 'bash' || name === 'shell' || name === 'command') return 'command';
  if (name === 'edit' || name === 'write' || name === 'file_change') return 'file_change';
  if (name === 'grep' || name === 'glob' || name === 'ls' || name === 'web_search' || name === 'search') return 'search';
  if (name === 'read' || name === 'cat') return 'read';
  if (name.startsWith('mcp') || name.includes('mcp')) return 'mcp';
  const command = String(args.command || '');
  if (command && /^\s*(cat|head|tail|ls|tree|find|grep|rg|sed|awk|wc)\b/.test(command)) return 'read';
  return 'command';
}

function stepTitle(kind: AgentStepKind): string {
  switch (kind) {
    case 'command': return AGENT_STEP_LABELS.command;
    case 'read': return AGENT_STEP_LABELS.read;
    case 'file_change': return AGENT_STEP_LABELS.fileChange;
    case 'search': return AGENT_STEP_LABELS.search;
    case 'mcp': return AGENT_STEP_LABELS.mcp;
    default: return AGENT_STEP_LABELS.command;
  }
}

function stepDetail(toolName: string, args: Record<string, unknown>): { detail: string | null; command: string | null } {
  const firstString = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = args[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
    return null;
  };
  const command = firstString('command', 'cmd');
  if (command) return { detail: command.slice(0, 400), command: command.slice(0, 400) };
  const filePath = firstString('path', 'file_path', 'filePath', 'file', 'pattern');
  if (filePath) return { detail: path.basename(filePath).slice(0, 240), command: null };
  const query = firstString('query', 'q');
  if (query) return { detail: query.slice(0, 240), command: null };
  return { detail: toolName ? String(toolName) : null, command: null };
}

function textFromMessage(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => {
      if (!part || typeof part !== 'object') return '';
      const record = part as Record<string, unknown>;
      if (record.type === 'text' && typeof record.text === 'string') return record.text;
      return '';
    })
    .join('');
}

function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const record = message as Record<string, unknown>;
  if (record.role !== 'assistant') return '';
  return textFromMessage(record);
}

function clamp(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}\n[…truncated…]` : value;
}

/**
 * Run one agent turn. Never throws for task-level failures — the caller
 * turns the returned status into the chat tool result.
 */
export function runPiAgentTask(input: PiAgentRunInput): Promise<PiAgentRunResult> {
  return new Promise((resolve) => {
    const bin = resolvePiAgentBin();
    if (!bin) {
      resolve({ status: 'failed', output: '', error: 'pi_agent_unavailable' });
      return;
    }
    const timeoutMs = input.limits?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const memoryMb = Number(input.limits?.maxMemoryMb);
    const args = [
      '--mode', 'json',
      '--approve',
      '--no-extensions',
      '--tools', 'read,bash,edit,write',
      '--session-dir', path.join(input.workspacePath, '.pi-sessions'),
      '--session-id', input.sessionId,
    ];
    /* The user's selected model wins: register a throwaway provider that
       points at their endpoint + key through the per-run extension. */
    const userProvider = input.provider && input.provider.baseUrl && input.provider.model
      ? input.provider
      : null;
    if (userProvider) {
      const extensionPath = fileURLToPath(new URL('../../scripts/pi-run-provider.mjs', import.meta.url));
      args.push('--extension', extensionPath, '--provider', 'socrates-run', '--model', userProvider.model);
    } else {
      const envProvider = String(process.env.PI_AGENT_PROVIDER || '').trim();
      const envModel = String(process.env.PI_AGENT_MODEL || '').trim();
      if (envProvider) args.push('--provider', envProvider);
      if (envModel) args.push('--model', envModel);
    }
    const thinking = String(process.env.PI_AGENT_THINKING || '').trim();
    if (thinking) args.push('--thinking', thinking);
    args.push(input.task);

    const env: NodeJS.ProcessEnv = { ...process.env, PI_OFFLINE: '0' };
    if (userProvider) {
      env.PI_RUN_BASE_URL = userProvider.baseUrl;
      env.PI_RUN_MODEL_ID = userProvider.model;
      if (userProvider.apiKey) env.PI_RUN_API_KEY = userProvider.apiKey;
    }
    if (Number.isFinite(memoryMb) && memoryMb > 0) {
      const flags = `--max-old-space-size=${Math.trunc(memoryMb)}`;
      env.NODE_OPTIONS = env.NODE_OPTIONS ? `${env.NODE_OPTIONS} ${flags}` : flags;
    }

    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(bin, args, {
        cwd: input.workspacePath,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      resolve({ status: 'failed', output: '', error: (err as Error).message });
      return;
    }

    let stdoutBuffer = '';
    let output = '';
    let lastAssistantText = '';
    let error: string | null = null;
    let settled = false;
    const steps = new Map<string, { output: string; kind: AgentStepKind; title: string; detail: string | null; command: string | null }>();

    const emit = (event: PiAgentEvent) => {
      try { input.onEvent?.(event); } catch { /* consumer errors never break the run */ }
    };

    const finish = (status: PiAgentRunResult['status'], errorMessage: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      input.signal?.removeEventListener?.('abort', onAbort);
      try { child.kill('SIGKILL'); } catch { /* already gone */ }
      if (!output) output = lastAssistantText;
      resolve({ status, output: clamp(output, MAX_OUTPUT_CHARS), error: errorMessage });
    };

    const onAbort = () => finish('aborted', 'aborted');
    input.signal?.addEventListener?.('abort', onAbort, { once: true });
    const timer = setTimeout(() => finish('timeout', `pi_agent_timeout_after_${timeoutMs}ms`), timeoutMs);

    const handleRecord = (record: Record<string, unknown>) => {
      const type = String(record.type || '');
      switch (type) {
        case 'message_update': {
          const update = record.assistantMessageEvent as Record<string, unknown> | undefined;
          const updateType = String(update?.type || '');
          const delta = typeof update?.delta === 'string' ? update.delta : '';
          if (!delta) return;
          if (updateType.includes('thinking') || updateType.includes('reasoning')) {
            emit({ type: 'reasoning', chunk: delta });
          } else {
            output = clamp(output + delta, MAX_OUTPUT_CHARS);
            emit({ type: 'delta', chunk: delta });
          }
          return;
        }
        case 'message_end': {
          const text = extractAssistantText(record.message);
          if (text) {
            lastAssistantText = text;
            if (!output) output = text;
          }
          return;
        }
        case 'tool_execution_start': {
          const stepId = String(record.toolCallId || record.id || '');
          const toolName = String(record.toolName || 'tool');
          const toolArgs = (record.args && typeof record.args === 'object' ? record.args : {}) as Record<string, unknown>;
          const kind = toolKind(toolName, toolArgs);
          const { detail, command } = stepDetail(toolName, toolArgs);
          const entry = { output: '', kind, title: stepTitle(kind), detail, command };
          steps.set(stepId, entry);
          emit({
            type: 'step_start',
            step: {
              stepId,
              kind,
              title: entry.title,
              detail,
              command,
              status: 'running',
              output: null,
            },
          });
          return;
        }
        case 'tool_execution_update': {
          const stepId = String(record.toolCallId || record.id || '');
          const entry = steps.get(stepId);
          const partial = record.partialResult;
          const chunk = typeof partial === 'string' ? partial
            : partial && typeof partial === 'object'
              ? String((partial as Record<string, unknown>).text ?? (partial as Record<string, unknown>).output ?? '')
              : '';
          if (!chunk) return;
          if (entry) entry.output = clamp(entry.output + chunk, 4000);
          emit({ type: 'step_update', chunk });
          return;
        }
        case 'tool_execution_end': {
          const stepId = String(record.toolCallId || record.id || '');
          const entry = steps.get(stepId);
          const isError = record.isError === true;
          const result = record.result;
          const resultText = typeof result === 'string'
            ? result
            : result && typeof result === 'object'
              ? String((result as Record<string, unknown>).text ?? (result as Record<string, unknown>).output ?? '')
              : '';
          const combined = clamp(entry?.output || resultText, 4000);
          emit({
            type: 'step_end',
            step: {
              stepId,
              kind: entry?.kind || 'command',
              title: entry?.title || AGENT_STEP_LABELS.command,
              detail: entry?.detail ?? null,
              command: entry?.command ?? null,
              status: isError ? 'failed' : 'done',
              output: combined || null,
              isError,
            },
          });
          return;
        }
        case 'agent_end': {
          const messages = Array.isArray(record.messages) ? record.messages : [];
          for (let i = messages.length - 1; i >= 0; i -= 1) {
            const text = extractAssistantText(messages[i]);
            if (text) { lastAssistantText = text; break; }
          }
          return;
        }
        case 'error': {
          const message = typeof record.message === 'string' ? record.message
            : record.error && typeof record.error === 'object'
              ? String((record.error as Record<string, unknown>).message ?? '')
              : '';
          if (message) error = message;
          return;
        }
        default:
          return;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      if (stdoutBuffer.length > MAX_STREAM_LINE_CHARS && !stdoutBuffer.includes('\n')) {
        stdoutBuffer = '';
        return;
      }
      let newline = stdoutBuffer.indexOf('\n');
      while (newline !== -1) {
        const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '').trim();
        stdoutBuffer = stdoutBuffer.slice(newline + 1);
        if (line) {
          try {
            handleRecord(JSON.parse(line) as Record<string, unknown>);
          } catch { /* non-JSON banner lines are ignored */ }
        }
        newline = stdoutBuffer.indexOf('\n');
      }
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr = clamp(stderr + chunk, 4000);
    });

    child.on('error', (err) => finish('failed', (err as Error).message));
    child.on('close', (code) => {
      if (settled) return;
      emit({ type: 'done' });
      if (code === 0) {
        finish('completed', null);
      } else {
        finish('failed', error || stderr.trim() || `pi_agent_exit_${code}`);
      }
    });
  });
}
