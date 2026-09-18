export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface User {
  id: string;
  email: string;
  displayName: string | null;
  tier?: string | null;
  plan?: string | null;
  isGuest?: boolean;
  verifiedAt?: string | null;
  createdAt?: string | null;
  customInstructions?: string | null;
  preferences?: Record<string, JsonValue>;
  defaultModel?: string | null;
}

export interface Attachment {
  id: string;
  kind: string;
  docKind?: string;
  name: string;
  mime: string;
  dataUrl?: string;
  text?: string;
  truncated?: boolean;
  size: number;
  fileId?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  input?: JsonValue;
  output?: string | null;
  isError?: boolean;
  /** Structured planning/specification output emitted by native tools. */
  plan?: JsonValue;
  spec?: JsonValue;
  /** Execution metadata is optional because it is only available for some tools. */
  executionId?: string | null;
  durationMs?: number | null;
  progressPhase?: string | null;
  argumentsText?: string | null;
  stderr?: string | null;
  errorText?: string | null;
  userMessage?: string | null;
  detail?: string | null;
  retryable?: boolean;
  artifacts?: Array<{ id: string; mimeType?: string | null; name?: string | null }>;
  results?: Array<Record<string, JsonValue>>;
  textOffset?: number;
  visualization?: JsonValue;
}

export interface Message {
  id?: string;
  clientId?: string | null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  rawText?: string | null;
  content?: string | null;
  html?: string | null;
  type?: string | null;
  reasoningContent?: string | null;
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  createdAt?: string | null;
}

export interface TutorState {
  teachingStage?: 'motivate' | 'define' | 'develop' | 'illustrate' | 'exercise' | 'check' | null;
  currentExampleIdx?: number | null;
  practiceAttempts?: number | null;
  practicePhase?: string | null;
  teachingPlan?: JsonValue;
  boundariesHistory?: JsonValue[];
  mistakeFilter?: string | null;
}

export interface ExamData {
  [key: string]: JsonValue | undefined;
  topic?: string;
  difficulty?: string;
  count?: number;
  lang?: string;
  types?: string[];
  questions?: JsonValue[];
  answers?: JsonObject;
  submitted?: boolean;
  results?: JsonValue;
}

export interface Session extends TutorState {
  id: string;
  title?: string | null;
  topic: string;
  domain?: string | null;
  mode: 'chat' | 'tutor';
  phase?: 'topic' | 'diagnostic' | 'chat' | string;
  kind?: 'chat' | 'tutor' | 'exam' | string;
  examData?: ExamData | null;
  projectId?: string | null;
  pinned?: boolean;
  archivedAt?: string | null;
  preview?: string | null;
  totalQ?: number;
  currentNode?: number;
  branchedFrom?: JsonValue;
  tags?: string[];
  updatedAt?: string;
  createdAt?: string;
  messages?: Message[];
  kbNodes?: JsonValue[];
  mistakes?: JsonValue[];
  streamingText?: string | null;
  streamingReasoning?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description?: string | null;
  color?: string | null;
  icon?: string | null;
  systemPrompt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export type ScheduledFrequency = 'once' | 'hourly' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type ScheduledStatus = 'pending' | 'active' | 'paused' | 'completed' | 'failed';

export interface ScheduledTask {
  id: string;
  title: string;
  prompt: string;
  sessionId?: string | null;
  cronExpression?: string | null;
  frequency: ScheduledFrequency | string;
  status: ScheduledStatus | string;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  runCount?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface ProjectConnectorField {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  help?: string;
}

export interface ProjectConnector {
  id: string;
  service?: string;
  name: string;
  description?: string;
  capabilities?: string[];
  authType?: 'oauth' | 'api_key' | 'custom_credential' | string;
  credentialInput?: { fields: ProjectConnectorField[] };
  connection?: {
    status?: string;
    connectionName?: string | null;
    requestId?: string | null;
    connectedAccountId?: string | null;
    displayName?: string | null;
    updatedAt?: string | null;
    lastError?: string | null;
  } | null;
}

export type KnowledgeNodeStatus = 'fuzzy' | 'internalized' | 'blank' | string;

export interface KnowledgeNode {
  nodeName: string | null;
  status: KnowledgeNodeStatus;
  sessionId: string;
  sessionTitle: string | null;
}

export interface Mistake {
  id: string;
  sessionId?: string | null;
  nodeName?: string | null;
  questionContent: string;
  userAnswer?: string | null;
  correctAnswer?: string | null;
  source?: string;
  isResolved?: boolean;
  collectedAt?: string | null;
  resolvedAt?: string | null;
}

export interface Memory {
  id: string;
  text: string;
  scope?: string;
  projectId?: string | null;
  source?: string;
  enabled?: boolean;
  confidence?: number | null;
  createdAt?: string | null;
}

export interface ChatRequest {
  messages: Array<{ role: string; content: string | JsonValue }>;
  temperature?: number;
  max_tokens?: number;
  mode?: 'chat' | 'tutor';
  reasoning_effort?: 'low' | 'medium' | 'high';
  extra_body?: JsonObject;
}

export interface ChatSseHandlers {
  onDelta?: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolUse?: (payload: JsonValue) => void;
  onToolResult?: (payload: JsonValue) => void;
  onToolProgress?: (payload: JsonValue) => void;
  onToolCallDelta?: (payload: JsonValue) => void;
  onExecutionStart?: (payload: JsonValue) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
}

export interface MobileTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshExpiresAt: string;
}

export type EmbeddedTarget =
  | 'projects'
  | 'scheduled'
  | 'plugins'
  | 'knowledge'
  | 'mistakes'
  | 'skills'
  | 'api-settings'
  | 'profile'
  | 'usage'
  | 'storage';

export interface MobileWebSessionRequest {
  target: EmbeddedTarget;
}

export interface MobileWebSessionResponse {
  url: string;
  expiresAt: string;
}

export type MobileWebViewMessage =
  | { type: 'ready' }
  | { type: 'navigate'; target: EmbeddedTarget }
  | { type: 'openExternal'; url: string }
  | { type: 'download'; url: string; filename?: string }
  | { type: 'authExpired' }
  | { type: 'close' };

export interface ApiErrorBody {
  error?: string;
  code?: string;
  message?: string;
  detail?: string;
  retryAfterSeconds?: number;
}

export interface OutboxItem {
  id: string;
  sessionId: string;
  clientId: string;
  operation: 'create-session' | 'upsert-session' | 'upload-file';
  payload: JsonValue;
  retryCount: number;
  createdAt: string;
}

export type ArtifactMessage =
  | { type: 'ready'; artifactId: string }
  | { type: 'resize'; height: number }
  | { type: 'openLink'; url: string }
  | { type: 'copy'; text: string }
  | { type: 'share'; title: string; content: string }
  | { type: 'error'; message: string };

export type ChatSseEventName =
  | 'tool_use'
  | 'tool_result'
  | 'tool_progress'
  | 'tool_call_delta'
  | 'execution_start'
  | 'error';
