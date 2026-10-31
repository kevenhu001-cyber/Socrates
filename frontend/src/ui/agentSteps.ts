export interface AgentStepData {
  stepId: string;
  kind: 'command' | 'read' | 'file_change' | 'search' | 'mcp';
  title?: string | null;
  detail?: string | null;
  command?: string | null;
  status: 'running' | 'done' | 'failed';
  exitCode?: number | null;
  durationMs?: number | null;
  diffStat?: { files: number; added: number; removed: number; paths: string[] } | null;
  output?: string | null;
}

export interface AgentPlanData {
  steps: Array<{ title: string; status: 'todo' | 'in_progress' | 'done' }>;
  explanation?: string | null;
}

export type AgentTranslator = (key: string) => string;

export const MAX_COMMAND_CHARS = 96;
export const MAX_OUTPUT_CHARS = 4000;

const LABELS = {
  command: { key: 'agent.stepCommand', text: '运行了命令' },
  commandDone: { key: 'agent.stepCommandDone', text: '已运行' },
  read: { key: 'agent.stepRead', text: '读取了文件' },
  file_change: { key: 'agent.stepFileChange', text: '编辑了文件' },
  search: { key: 'agent.stepSearch', text: '搜索了网页' },
  mcp: { key: 'agent.stepMcp', text: '调用了 MCP 工具' },
  failed: { key: 'agent.stepFailed', text: '失败' },
} as const;

function translate(entry: { key: string; text: string }, translator: AgentTranslator): string {
  const value = translator(entry.key);
  return value && value !== entry.key ? value : entry.text;
}

export function truncateAgentText(text: string, max: number): string {
  const collapsed = String(text || '').replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

/** `用时 1h 39m 2s` — hours and minutes only appear when non-zero. */
export function formatElapsed(ms: number, translator: AgentTranslator = () => ''): string {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = Math.floor(total % 60);
  const parts: string[] = [];
  if (hours) parts.push(`${hours}h`);
  if (hours || minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  const elapsedLabel = translator('agent.elapsed');
  return `${elapsedLabel && elapsedLabel !== 'agent.elapsed' ? elapsedLabel : '用时'} ${parts.join(' ')}`;
}

export function agentStepLabel(step: AgentStepData, translator: AgentTranslator = () => ''): string {
  if (step.kind === 'command' && step.status !== 'running' && step.command) {
    return `${translate(LABELS.commandDone, translator)} ${truncateAgentText(step.command, MAX_COMMAND_CHARS)}`;
  }
  const label = LABELS[step.kind as keyof typeof LABELS] as { key: string; text: string } | undefined;
  if (label) return translate(label, translator);
  return String(step.title || '').trim() || translate(LABELS.command, translator);
}

function stepDuration(durationMs?: number | null): string {
  if (durationMs == null || !(durationMs > 0)) return '';
  if (durationMs < 60_000) return `${(durationMs / 1000).toFixed(1)}s`;
  const minutes = Math.floor(durationMs / 60_000);
  const seconds = Math.round((durationMs % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

function diffStatText(step: AgentStepData): string {
  const stat = step.diffStat;
  if (!stat) return '';
  const files = stat.files > 1 ? `${stat.files} files` : '';
  const counts = stat.added || stat.removed ? `+${stat.added} -${stat.removed}` : '';
  return [files, counts].filter(Boolean).join('  ');
}

function fileNames(step: AgentStepData): string {
  const paths = step.diffStat && Array.isArray(step.diffStat.paths) ? step.diffStat.paths : [];
  if (paths.length === 0) return '';
  const names = paths.slice(0, 3).map((path) => path.split('/').pop() || path);
  const extra = paths.length > names.length ? `, +${paths.length - names.length}` : '';
  return `${names.join(', ')}${extra}`;
}

export function agentStepCommand(step: AgentStepData): string {
  if (step.kind === 'command' && step.status !== 'running') return '';
  return truncateAgentText(fileNames(step) || step.detail || step.command || '', MAX_COMMAND_CHARS);
}

export function agentStepMeta(step: AgentStepData, translator: AgentTranslator = () => ''): string {
  const bits = [diffStatText(step), stepDuration(step.durationMs)].filter(Boolean);
  if (step.status === 'failed') {
    bits.push(step.exitCode != null
      ? `exit ${step.exitCode}`
      : translate(LABELS.failed, translator));
  }
  return bits.join('  ·  ');
}
