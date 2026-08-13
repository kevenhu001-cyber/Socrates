import { connectorErrorPayload, externalUserId, getProjectConnector } from './oomolProjectConnector.js';
import { z } from 'zod';

/* Explicit tool allow-list. Do not turn the catalog into an unrestricted
 * model tool: every agent-visible action is reviewed here and runs only for
 * the authenticated user's ProjectConnector connection. */
export const PROJECT_CONNECTOR_TOOL_NAMES = {
  GITHUB_IDENTITY: 'oomol_github_get_current_user',
  GMAIL_SEARCH: 'oomol_gmail_search_threads',
  GOOGLE_CALENDAR_LIST_EVENTS: 'oomol_google_calendar_list_events',
  TODOIST_LIST_TASKS: 'oomol_todoist_list_tasks',
  GITLAB_IDENTITY: 'oomol_gitlab_get_current_user',
  QQ_MAIL_SEARCH: 'oomol_qq_mail_search_threads',
};

export const PROJECT_CONNECTOR_TOOLS = [
  {
    type: 'function', function: {
      name: PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY,
      description: 'Get the authenticated user of the connected GitHub account. Use only when GitHub identity or account context is needed.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function', function: {
      name: PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH,
      description: 'Search the user’s connected Gmail account for relevant email threads. Use only when email context is needed for the request.',
      parameters: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 } }, required: ['query'], additionalProperties: false },
    },
  },
  {
    type: 'function', function: {
      name: PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS,
      description: 'List events from the user’s connected Google Calendar. Use when schedule context is needed for planning or to answer “what’s on my calendar”.',
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'ISO date YYYY-MM-DD; omit for today.' } }, additionalProperties: false },
    },
  },
  {
    type: 'function', function: {
      name: PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS,
      description: 'List tasks from the user’s connected Todoist. Use when task context is needed (e.g. to plan a study session around open tasks).',
      parameters: { type: 'object', properties: { filter: { type: 'string', description: 'Todoist filter string, e.g. "today", "p1".' } }, additionalProperties: false },
    },
  },
  {
    type: 'function', function: {
      name: PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY,
      description: 'Get the authenticated user of the connected GitLab account. Use only when GitLab identity or account context is needed.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function', function: {
      name: PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH,
      description: 'Search the user’s connected QQ Mail account for relevant email threads. Use only when QQ Mail context is needed for the request.',
      parameters: { type: 'object', properties: { query: { type: 'string', minLength: 1, maxLength: 300 } }, required: ['query'], additionalProperties: false },
    },
  },
];

const ACTIONS = {
  [PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY]:             { provider: 'github',         actionId: 'github.get_current_user' },
  [PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH]:                { provider: 'gmail',          actionId: 'gmail.search_threads' },
  [PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS]: { provider: 'googlecalendar', actionId: 'google_calendar.list_events' },
  [PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS]:          { provider: 'todoist',        actionId: 'todoist.list_tasks' },
  [PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY]:             { provider: 'gitlab',         actionId: 'gitlab.get_current_user' },
  [PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH]:              { provider: 'qq_mail',        actionId: 'qq_mail.search_threads' },
};

/* The JSON schemas sent to a model are an instruction, not an enforcement
 * boundary. Validate again immediately before crossing into the external
 * ProjectConnector so malformed tool calls cannot smuggle unknown fields or
 * unexpectedly large values to a connected third-party account. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_INPUT = z.object({}).strict();
const SEARCH_INPUT = z.object({ query: z.string().trim().min(1).max(300) }).strict();
const CALENDAR_INPUT = z.object({
  date: z.string().regex(ISO_DATE, 'date must be YYYY-MM-DD').optional(),
}).strict();
const TODOIST_INPUT = z.object({ filter: z.string().trim().min(1).max(300).optional() }).strict();

const INPUT_SCHEMAS: Record<string, z.ZodType<Record<string, unknown>>> = {
  [PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY]: EMPTY_INPUT,
  [PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH]: SEARCH_INPUT,
  [PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS]: CALENDAR_INPUT,
  [PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS]: TODOIST_INPUT,
  [PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY]: EMPTY_INPUT,
  [PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH]: SEARCH_INPUT,
};

export function validateProjectConnectorToolArguments(toolName: string, args: unknown):
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string } {
  const schema = INPUT_SCHEMAS[toolName];
  if (!schema) return { ok: false, error: 'unknown_project_connector_tool' };
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || 'invalid_project_connector_arguments' };
  }
  return { ok: true, args: parsed.data };
}

export async function executeProjectConnectorTool(toolName: string, args: Record<string, unknown>, userId: string, connection: { status?: string; connectionName?: string | null; connectedAccountId?: string | null } | null) {
  const validated = validateProjectConnectorToolArguments(toolName, args);
  if (!validated.ok) {
    return {
      status: 'failed',
      errorCode: 'invalid_tool_arguments',
      error: validated.error,
      userMessage: '工具参数无效，请按要求重新生成。',
    };
  }
  const spec = ACTIONS[toolName];
  if (!spec || !connection || connection.status !== 'connected') {
    return { status: 'failed', errorCode: 'app_not_connected', error: 'The required app is not connected.', userMessage: 'Connect this app in Plugin Center first.' };
  }
  const project = getProjectConnector();
  if (!project) return { status: 'failed', errorCode: 'project_connector_not_configured', error: 'OOMOL ProjectConnector is not configured.', userMessage: 'The connector service is not configured yet.' };
  try {
    const data = await project.execute(externalUserId(userId), spec.actionId, validated.args, {
      connectionName: connection.connectionName || 'socrates',
      connectedAccountId: connection.connectedAccountId || undefined,
    });
    return { status: 'completed', output: JSON.stringify(data) };
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return { status: 'failed', errorCode: payload.code, error: payload.message, userMessage: 'The connected app could not complete that request.' };
  }
}
