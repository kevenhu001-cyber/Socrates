import { WEB_SEARCH_TOOL } from './webSearch.js';
import { WEB_FETCH_TOOL } from './fetchBatch.js';
import { VISUALIZATION_TOOL } from './visualization.js';
import { PLAN_TOOL, SPEC_TOOL } from './planning.js';
import {
  ARXIV_TOOL, ZOTERO_TOOL, NOTION_TOOL, GITHUB_TOOL, GITEE_TOOL,
  CONNECTOR_TOOL_NAMES,
} from './connectorTools.js';
import { PROJECT_CONNECTOR_TOOLS, PROJECT_CONNECTOR_TOOL_NAMES } from './projectConnectorTools.js';
import { OPEN_CONNECTOR_CHAT_TOOLS } from './openConnectorChatTools.js';
import { UNIFIED_CODEX_ENABLED, WORKSPACE_AGENT_TOOL } from './agentRuntime.js';

/** The model-facing capability registry. Route-specific executors retain
 * their streaming/session semantics while availability is defined once.
 *
 * @param {object} opts
 * @param {Function} opts.codeInterpreterToolDef
 * @param {string} opts.mode
 * @param {object} [opts.connectorConnectionsByProvider]  Map-like: {"github": row, "notion": row, …}
 *   Pass the user's connected connector_connections rows keyed by provider.
 *   Only providers with a live row get their tool enabled.  arXiv is always
 *   enabled (public, no auth needed).
 */
export function createToolRegistry({ codeInterpreterToolDef, mode, connectorConnectionsByProvider, projectConnectorConnectionsByProvider }: {
  codeInterpreterToolDef?: unknown;
  mode?: string;
  connectorConnectionsByProvider?: Record<string, unknown>;
  projectConnectorConnectionsByProvider?: Record<string, unknown>;
}) {
  const entries = [
    { name: 'code_interpreter', modelDefinition: codeInterpreterToolDef, enabled: Boolean(codeInterpreterToolDef), pure: false, sessionSerial: true, maxConcurrency: 1, retries: 0 },
    /* The Codex workspace agent is the first-class multi-step adapter. It
       remains feature-flagged so Chat can be migrated independently from
       existing native tools during rollout. The executor lives in the chat
       route and delegates to the durable Agent Runtime. */
    { name: 'workspace_agent', modelDefinition: WORKSPACE_AGENT_TOOL, enabled: UNIFIED_CODEX_ENABLED, pure: false, sessionSerial: true, maxConcurrency: 1, retries: 0 },
    { name: 'render_visualization', modelDefinition: VISUALIZATION_TOOL, enabled: process.env.VISUALIZATION_TOOL_ENABLED !== 'false', pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    /* Tutor and Chat share the same native capability surface. Pedagogical
       search restraint belongs in the Tutor system policy; hiding the schema
       here made the client prompt promise a tool the model could not call. */
    { name: 'web_search', modelDefinition: WEB_SEARCH_TOOL, enabled: true, pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    /* Reads a single page by URL through fetchBatch's SSRF-guarded path.
       Always available: it complements web_search (find a URL) by letting
       the model read the full page text a snippet cannot cover. */
    { name: 'web_fetch', modelDefinition: WEB_FETCH_TOOL, enabled: true, pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    /* Planning artifacts — pure structuring tools (no side effects) that
       validate a strict envelope and echo it back as a plan/spec card. */
    { name: 'create_plan', modelDefinition: PLAN_TOOL, enabled: true, pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: 'create_spec', modelDefinition: SPEC_TOOL, enabled: true, pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },

    // ── Connector tools (gated on per-user connection) ──────
    { name: CONNECTOR_TOOL_NAMES.ARXIV,  modelDefinition: ARXIV_TOOL,    enabled: true, pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.ZOTERO, modelDefinition: ZOTERO_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.zotero), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.NOTION, modelDefinition: NOTION_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.notion), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.GITHUB, modelDefinition: GITHUB_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.github), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.GITEE,  modelDefinition: GITEE_TOOL,   enabled: Boolean(connectorConnectionsByProvider?.gitee), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY, modelDefinition: PROJECT_CONNECTOR_TOOLS[0], enabled: Boolean(projectConnectorConnectionsByProvider?.github), pure: true, sessionSerial: false, maxConcurrency: 2, retries: 0 },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH, modelDefinition: PROJECT_CONNECTOR_TOOLS[1], enabled: Boolean(projectConnectorConnectionsByProvider?.gmail), pure: true, sessionSerial: false, maxConcurrency: 2, retries: 0 },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS, modelDefinition: PROJECT_CONNECTOR_TOOLS[2], enabled: Boolean(projectConnectorConnectionsByProvider?.googlecalendar), pure: true, sessionSerial: false, maxConcurrency: 2, retries: 0 },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS, modelDefinition: PROJECT_CONNECTOR_TOOLS[3], enabled: Boolean(projectConnectorConnectionsByProvider?.todoist), pure: true, sessionSerial: false, maxConcurrency: 2, retries: 0 },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY, modelDefinition: PROJECT_CONNECTOR_TOOLS[4], enabled: Boolean(projectConnectorConnectionsByProvider?.gitlab), pure: true, sessionSerial: false, maxConcurrency: 2, retries: 0 },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH, modelDefinition: PROJECT_CONNECTOR_TOOLS[5], enabled: Boolean(projectConnectorConnectionsByProvider?.qq_mail), pure: true, sessionSerial: false, maxConcurrency: 2, retries: 0 },
    /* OpenConnector chat tools (curated read-only allow-list). Each entry is
       offered only when the user connected that oc_<service> app. */
    ...OPEN_CONNECTOR_CHAT_TOOLS.map((tool) => ({
      name: tool.tool,
      modelDefinition: { type: 'function', function: { name: tool.tool, description: tool.description, parameters: tool.parameters } },
      enabled: Boolean(projectConnectorConnectionsByProvider?.[`oc_${tool.service}`]),
      pure: true,
      sessionSerial: false,
      maxConcurrency: 2,
      retries: 0,
    })),
  ];
  return {
    entries,
    definitions: entries.filter((entry) => entry.enabled && entry.modelDefinition).map((entry) => entry.modelDefinition),
    get(name: string) { return entries.find((entry) => entry.name === name) || null; },
  };
}
