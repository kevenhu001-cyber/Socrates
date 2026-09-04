/**
 * Connector tool executors.
 *
 * `connectors.ts` — personal provider connections (zotero/notion/github/gitee).
 * `projectConnectors.ts` — project-scoped connections (github identity,
 * gmail search, google calendar, todoist, gitlab, qq mail).
 */

import { executeConnectorTool, CONNECTOR_TOOL_NAMES } from '../../../../services/connectorTools.js';
import { executeProjectConnectorTool, PROJECT_CONNECTOR_TOOL_NAMES } from '../../../../services/projectConnectorTools.js';
import type { ToolExecutor, ToolExecutionResult } from './types.js';
import type { ToolResult } from '../types.js';

export const executePersonalConnector: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, connectorConnectionsByProvider } = ctx;
  const toolName = call.function?.name || '';
  const TOOL_TO_PROVIDER: Record<string, string> = {
    [CONNECTOR_TOOL_NAMES.ZOTERO]: 'zotero',
    [CONNECTOR_TOOL_NAMES.NOTION]: 'notion',
    [CONNECTOR_TOOL_NAMES.GITHUB]: 'github',
    [CONNECTOR_TOOL_NAMES.GITEE]: 'gitee',
  };
  const provider = TOOL_TO_PROVIDER[toolName];
  const connection = provider ? (connectorConnectionsByProvider?.[provider] || null) : null;
  const toolResult = await executeConnectorTool(toolName, args, connection) as ToolResult;
  const ok = toolResult.status === 'completed';
  emitter.event('tool_result', {
    id: call.id, ok, status: toolResult.status,
    output: toolResult.output || '',
    error: toolResult.error || null,
    errorCode: toolResult.errorCode || null,
    retryable: false,
    userMessage: ok ? null : (toolResult.userMessage || '该工具暂不可用。'),
    detail: toolResult.error || null,
  });
  return { result: toolResult };
};

export const executeProjectConnector: ToolExecutor = async (
  args,
  call,
  ctx,
): Promise<ToolExecutionResult> => {
  const { emitter, req, projectConnectorConnectionsByProvider } = ctx;
  const toolName = call.function?.name || '';
  const PROJECT_TOOL_TO_PROVIDER: Record<string, any> = {
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
  const ok = projectToolResult.status === 'completed';
  emitter.event('tool_result', {
    id: call.id,
    ok,
    status: projectToolResult.status,
    output: projectToolResult.output || '',
    error: projectToolResult.error || null,
    errorCode: projectToolResult.errorCode || null,
    retryable: false,
    userMessage: projectToolResult.userMessage || null,
    // Keep the model-facing correction detail and the mobile card
    // aligned for rejected connector argument objects.
    detail: projectToolResult.error || null,
  });
  return { result: projectToolResult as ToolResult };
};
