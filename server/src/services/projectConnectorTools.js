import { connectorErrorPayload, externalUserId, getProjectConnector } from './oomolProjectConnector.js';

/* Explicit tool allow-list. Do not turn the catalog into an unrestricted
 * model tool: every agent-visible action is reviewed here and runs only for
 * the authenticated user's ProjectConnector connection. */
export const PROJECT_CONNECTOR_TOOL_NAMES = {
  GITHUB_IDENTITY: 'oomol_github_get_current_user',
  GMAIL_SEARCH: 'oomol_gmail_search_threads',
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
];

const ACTIONS = {
  [PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY]: { provider: 'github', actionId: 'github.get_current_user' },
  [PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH]: { provider: 'gmail', actionId: 'gmail.search_threads' },
};

export async function executeProjectConnectorTool(toolName, args, userId, connection) {
  const spec = ACTIONS[toolName];
  if (!spec || !connection || connection.status !== 'connected') {
    return { status: 'failed', errorCode: 'app_not_connected', error: 'The required app is not connected.', userMessage: 'Connect this app in Plugin Center first.' };
  }
  const project = getProjectConnector();
  if (!project) return { status: 'failed', errorCode: 'project_connector_not_configured', error: 'OOMOL ProjectConnector is not configured.', userMessage: 'The connector service is not configured yet.' };
  try {
    const data = await project.execute(externalUserId(userId), spec.actionId, args || {}, {
      connectionName: connection.connectionName || 'socrates',
      connectedAccountId: connection.connectedAccountId || undefined,
    });
    return { status: 'completed', output: JSON.stringify(data) };
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return { status: 'failed', errorCode: payload.code, error: payload.message, userMessage: 'The connected app could not complete that request.' };
  }
}
