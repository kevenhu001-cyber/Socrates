export interface InlineToolEntry {
  id: string;
  name: string;
  input?: unknown;
}

export interface InlineToolResult {
  ok?: boolean;
  status?: string;
  errorCode?: string | null;
  retryable?: boolean;
  durationMs?: number;
  results?: unknown[];
  output?: string;
  stderr?: string;
  error?: string;
  userMessage?: string;
  detail?: unknown;
}

export interface InlineToolGroupMember {
  id: string;
  name: string;
  input?: unknown;
  result?: InlineToolResult | null;
  cancelled?: boolean;
  failed?: boolean;
}

export interface InlineToolMessageCall {
  id?: string;
  name?: string;
  input?: unknown;
  output?: string | null;
  isError?: boolean;
  results?: unknown[];
  stderr?: string;
  error?: string;
  errorCode?: string | null;
  retryable?: boolean;
  userMessage?: string;
  detail?: unknown;
  durationMs?: number;
  _run?: { phase?: string; durationMs?: number };
}
