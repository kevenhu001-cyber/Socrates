import { ConnectorError, ProjectConnector } from '@oomol-lab/connector';

/* A deliberately small, product-owned catalogue. The gateway owns OAuth,
 * credentials and the action schemas. Socrates owns which apps it exposes and
 * which actions it will later allow an agent to invoke. */
export const PROJECT_CONNECTOR_CATALOG = [
  { id: 'feishu', service: 'feishu', name: 'Feishu', description: 'Use documents and collaboration context from your Feishu account.', capabilities: ['Documents', 'Messages'] },
  { id: 'github', service: 'github', name: 'GitHub', description: 'Bring repositories, issues, pull requests, and CI context into a chat.', capabilities: ['Repositories', 'Issues', 'Pull requests'] },
  { id: 'gitee', service: 'gitee', name: 'Gitee', description: 'Use repositories and issue context from your Gitee account.', capabilities: ['Repositories', 'Issues'] },
  { id: 'gmail', service: 'gmail', name: 'Gmail', description: 'Search mail context that you explicitly authorize.', capabilities: ['Mail search'] },
  { id: 'notion', service: 'notion', name: 'Notion', description: 'Search pages and knowledge you share with Socrates.', capabilities: ['Page search'] },
  { id: 'slack', service: 'slack', name: 'Slack', description: 'Use relevant conversation and channel context from Slack.', capabilities: ['Channel search', 'Messages'] },
];

const byId = new Map(PROJECT_CONNECTOR_CATALOG.map((item) => [item.id, item]));
let client;

export function isProjectConnectorConfigured() {
  return Boolean(process.env.OOMOL_PROJECT_API_KEY);
}

export function getProjectConnector() {
  if (!isProjectConnectorConfigured()) return null;
  if (!client) {
    client = new ProjectConnector({
      apiKey: process.env.OOMOL_PROJECT_API_KEY,
      baseUrl: process.env.OOMOL_PROJECT_CONNECTOR_BASE_URL || undefined,
      timeoutMs: 30_000,
      maxRetries: 2,
    });
  }
  return client;
}

export function getProjectConnectorProvider(id) {
  return byId.get(String(id || '').toLowerCase()) || null;
}

export function externalUserId(userId) {
  /* Keep this stable and opaque. It is the tenant boundary at OOMOL. */
  return String(userId);
}

export function connectorErrorPayload(error) {
  if (error instanceof ConnectorError) {
    return { status: error.status || 502, code: error.code, message: error.message || 'Connector request failed' };
  }
  return { status: 502, code: 'connector_error', message: error?.message || 'Connector request failed' };
}
