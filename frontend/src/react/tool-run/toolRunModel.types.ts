import type {AgentPlanData, AgentStepData} from '../../ui/agentSteps.js';
import type {ToolCallLike} from './labels.js';

export type ToolRunState = 'running' | 'done' | 'error' | 'stopped' | 'awaiting';

export interface SourceItem {
  title: string;
  url: string;
  host: string;
  date?: string;
  source?: string;
}

/** A block shown when the row is expanded. `fullText` is present only
 * when `text` was truncated for display — it powers the expand/copy
 * affordance so the middle of a long output is no longer unrecoverable. */
export type DetailSection =
  | { kind: 'sources'; title: string; items: SourceItem[] }
  | { kind: 'output'; title: string; text: string; fullText?: string }
  | { kind: 'error'; title: string; text: string; fullText?: string }
  | { kind: 'files'; title: string; paths: string[] };

/** A block behind the secondary "Technical details" toggle. */
export type TechSection =
  | { kind: 'args'; title: string; text: string }
  | { kind: 'fact'; title: string; text: string; retryable?: '1' | '0' };

export interface ToolRunView {
  id: string;
  name: string;
  category: string;
  state: ToolRunState;
  label: string;
  mono: boolean;
  /** Trailing dim facts: result counts, test summary, duration. */
  meta: string[];
  sections: DetailSection[];
  tech: TechSection[];
  /** Present when the row is retryable — drives the Retry button. */
  retry?: { toolId: string; tool: string; query: string; errorCode: string | null };
  /** Streaming argument text shown inline while running (never in a <details>). */
  livePreview?: string;
  /**
   * Partial stdout/stderr while the call runs. The legacy card had this
   * (`.agent-tool-stream`) but the compact row never showed it, so a long
   * sandbox run looked frozen.
   */
  liveOutput?: string;
  /** Set when the call is blocked on a user decision (legacy approvals). */
  approval?: ApprovalView;
  /** Agent-run step log, rendered by ui/agentSteps into a host. */
  agentRun?: {
    runId: string | null;
    steps: AgentStepData[];
    plan: AgentPlanData | null;
    /** Final wall-clock, when the run reported one. */
    durationMs: number | null;
  };
  /** Distinct file paths touched, for the "Edited N files" summary card. */
  fileSummary?: { count: number; paths: string[] };
}

export type TurnSegment =
  | { kind: 'text'; start: number; end: number; text: string }
  | { kind: 'think'; start: number; end: number; text: string }
  | { kind: 'tool'; call: ToolCallRecord }
  | {
    kind: 'group';
    category: string;
    /** Settled members, rendered inside the collapsed header. */
    members: ToolCallRecord[];
    /** Still-in-flight members, rendered after the header — the live line
        never hides inside a collapsed aggregate. */
    running: ToolCallRecord[];
    state: ToolRunState;
  };

/** The kind of text a tool produced. */
export type ToolTextStream = 'stdout' | 'stderr' | 'result';

export interface BaseToolOutput {
  /**
   * Stable identity: `${toolCallId}:${kind}:${discriminator}` — never a DOM id
   * or a random value, so live, history and share address the same output.
   */
  id: string;
  toolCallId: string;
}

export interface VisualizationOutput extends BaseToolOutput {
  kind: 'visualization';
  spec: Record<string, unknown>;
}

export interface ArtifactOutput extends BaseToolOutput {
  kind: 'artifact';
  fileId: string;
  mimeType: string | null;
  name: string | null;
}

export interface TextOutput extends BaseToolOutput {
  kind: 'text';
  stream: ToolTextStream;
  text: string;
}

/**
 * What a tool produced, in one protocol. The UI reads this instead of
 * guessing from `visualization` / `artifacts` / `output` fields: the runtime
 * owns normalization, the renderer only dispatches on `kind`.
 */
export type ToolOutput = VisualizationOutput | ArtifactOutput | TextOutput;

/** The persisted + live shape of a message.toolCalls[] entry. */
export interface ToolCallRecord extends ToolCallLike {
  id: string;
  name: string;
  textOffset?: number;
  results?: unknown[];
  artifacts?: ReadonlyArray<{ id: string; name?: string; mimeType?: string }>;
  stderr?: string;
  error?: string | null;
  userMessage?: string;
  detail?: unknown;
  errorCode?: string | null;
  retryable?: boolean;
  visualization?: Record<string, unknown> | null;
  /**
   * Normalized outputs, when the writer emits the protocol. Absent on every
   * message saved before it existed; `toolOutputsOf` synthesizes the same
   * list from the legacy fields in that case.
   */
  outputs?: ToolOutput[];
  _run?: { phase?: string; durationMs?: number; startedAt?: number; endedAt?: number };
  _cancelled?: boolean;
  _liveOutput?: string;
  approval?: {
    runId?: string;
    approvalId?: string;
    kind?: string;
    command?: string;
    changes?: string;
    reason?: string;
    cwd?: string;
    status?: string;
    ui?: { text: string; state?: string; disabled?: boolean };
  };
  steps?: AgentStepData[];
  plan?: AgentPlanData | null;
  runId?: string;
}

export interface ApprovalView {
  approvalId: string;
  runId: string;
  title: string;
  facts: Array<{ label: string; value: string }>;
  status: string;
  /** 'pending' until a decision is sent; then 'accepted' / 'declined' / 'stopped'. */
  state: string;
  disabled: boolean;
}

export interface ThinkRange {
  start: number;
  end: number;
  text: string;
}

export interface ToolRunGroupView extends ToolRunView {
  headerLabel: string;
  members: ToolRunView[];
  running: ToolRunView[];
  showsHeader: boolean;
}
