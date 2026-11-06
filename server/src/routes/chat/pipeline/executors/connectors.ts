/**
 * Connector tool executors.
 *
 * `connectors.ts` — personal provider connections (zotero/notion/github/gitee).
 * `projectConnectors.ts` — project-scoped connections (github identity,
 * gmail search, google calendar, todoist, gitlab, qq mail).
 */

import { executeConnectorTool, CONNECTOR_TOOL_NAMES } from '../../../../services/integrations/connectorTools.js';
import { executeProjectConnectorTool, PROJECT_CONNECTOR_TOOL_NAMES } from '../../../../services/integrations/projectConnectorTools.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';
import { normalizeToolResultRetryability, recordToolResultAndBoundRetryability } from '../toolResultPolicy.js';

export const executePersonalConnector: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, connectorConnectionsByProvider } = ctx;
  const { toolPolicy } = ctx;
  const toolName = call.function?.name || '';
  const TOOL_TO_PROVIDER: Record<string, string> = {
    [CONNECTOR_TOOL_NAMES.ZOTERO]: 'zotero',
    [CONNECTOR_TOOL_NAMES.NOTION]: 'notion',
    [CONNECTOR_TOOL_NAMES.GITHUB]: 'github',
    [CONNECTOR_TOOL_NAMES.GITEE]: 'gitee',
  };
  const provider = TOOL_TO_PROVIDER[toolName];
  const connection = provider ? (connectorConnectionsByProvider?.[provider] || null) : null;
  const rawResult = await executeConnectorTool(toolName, args, connection) as ToolResult;
  const result = toolPolicy
    ? recordToolResultAndBoundRetryability(toolName, rawResult, toolPolicy)
    : normalizeToolResultRetryability(rawResult);
  const ok = result.status === 'completed';
  emitter.event('tool_result', {
    id: call.id, ok, status: result.status,
    output: result.output || '',
    error: result.error || null,
    errorCode: result.errorCode || null,
    retryable: result.retryable,
    userMessage: ok ? null : (result.userMessage || '该工具暂不可用。'),
    detail: result.error || null,
  });
  return { result, outcomeRecorded: Boolean(toolPolicy) };
};

export const executeProjectConnector: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, projectConnectorConnectionsByProvider, toolPolicy } = ctx;
  const toolName = call.function?.name || '';
  const PROJECT_TOOL_TO_PROVIDER: Record<string, unknown> = {
    [PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY]:             projectConnectorConnectionsByProvider.github,
    [PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH]:                projectConnectorConnectionsByProvider.gmail,
    [PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS]: projectConnectorConnectionsByProvider.googlecalendar,
    [PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS]:          projectConnectorConnectionsByProvider.todoist,
    [PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY]:             projectConnectorConnectionsByProvider.gitlab,
    [PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH]:              projectConnectorConnectionsByProvider.qq_mail,
  };
  const projectToolResult = await executeProjectConnectorTool(
    toolName,
    args,
    req.userId!,
    PROJECT_TOOL_TO_PROVIDER[toolName] ?? null,
  );
  const result = toolPolicy
    ? recordToolResultAndBoundRetryability(toolName, projectToolResult as ToolResult, toolPolicy)
    : normalizeToolResultRetryability(projectToolResult as ToolResult);
  const ok = result.status === 'completed';
  emitter.event('tool_result', {
    id: call.id,
    ok,
    status: result.status,
    output: result.output || '',
    error: result.error || null,
    errorCode: result.errorCode || null,
    retryable: result.retryable,
    userMessage: result.userMessage || null,
    // Keep the model-facing correction detail and the mobile card
    // aligned for rejected connector argument objects.
    detail: result.error || null,
  });
  return { result, outcomeRecorded: Boolean(toolPolicy) };
};
