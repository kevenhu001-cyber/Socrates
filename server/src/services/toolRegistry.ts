import { WEB_SEARCH_TOOL } from './webSearch.js';
import { WEB_FETCH_TOOL } from './fetchBatch.js';
import { READ_ATTACHMENT_TOOL } from './attachmentReader.js';
import { VISUALIZATION_TOOL } from './visualization.js';
import { PLAN_TOOL, SPEC_TOOL } from './planning.js';
import { CREATE_SITE_TOOL } from './siteCreation.js';
import {
  ARXIV_TOOL, ZOTERO_TOOL, NOTION_TOOL, GITHUB_TOOL, GITEE_TOOL,
  CONNECTOR_TOOL_NAMES,
} from './connectorTools.js';
import { PROJECT_CONNECTOR_TOOLS, PROJECT_CONNECTOR_TOOL_NAMES } from './projectConnectorTools.js';
import { OPEN_CONNECTOR_CHAT_TOOLS } from './openConnectorChatTools.js';
import { WORKSPACE_AGENT_TOOL, INITIALIZE_WORKSPACE_TOOL } from './agentRuntime.js';
import { PI_AGENT_ENABLED } from './piAgent.js';

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
  /* Scheduling surface, consumed by dispatchToolCalls:
   * - pure: side-effect-free → eligible for fuzzy name recovery; tools
   *   that run code or touch the workspace must be `false` (fail closed —
   *   a missing flag reads as not-pure).
   * - sessionSerial: `true` serializes same-named calls; a string shares
   *   a named lane across tools mutating the same state. */
  const entries = [
    { name: 'code_interpreter', modelDefinition: codeInterpreterToolDef, enabled: Boolean(codeInterpreterToolDef), pure: false, sessionSerial: 'code' },
    /* The workspace agent runs on the Pi coding-agent CLI (read / bash /
       edit / write) inside the server-owned conversation workspace. It is
       feature-flagged so Chat can fall back to native tools when Pi is not
       installed on the host. initialize_workspace shares its lane: a reset
       must not overlap an in-flight agent run. */
    { name: 'workspace_agent', modelDefinition: WORKSPACE_AGENT_TOOL, enabled: PI_AGENT_ENABLED, pure: false, sessionSerial: 'workspace' },
    { name: 'initialize_workspace', modelDefinition: INITIALIZE_WORKSPACE_TOOL, enabled: PI_AGENT_ENABLED, pure: false, sessionSerial: 'workspace' },
    { name: 'render_visualization', modelDefinition: VISUALIZATION_TOOL, enabled: process.env.VISUALIZATION_TOOL_ENABLED !== 'false', pure: true, sessionSerial: false },
    /* Tutor and Chat share the same native capability surface. Pedagogical
       search restraint belongs in the Tutor system policy; hiding the schema
       here made the client prompt promise a tool the model could not call. */
    { name: 'web_search', modelDefinition: WEB_SEARCH_TOOL, enabled: true, pure: true, sessionSerial: false },
    /* Reads a single page by URL through fetchBatch's SSRF-guarded path.
       Always available: it complements web_search (find a URL) by letting
       the model read the full page text a snippet cannot cover. */
    { name: 'web_fetch', modelDefinition: WEB_FETCH_TOOL, enabled: true, pure: true, sessionSerial: false },
    /* Reads a user-uploaded file attachment by fileId (ownership enforced
       server-side). Always available so uploaded attachments stay readable
       in every mode; the model only calls it when a message carries an
       [Attached file: …] pointer. */
    { name: 'read_attachment', modelDefinition: READ_ATTACHMENT_TOOL, enabled: true, pure: true, sessionSerial: false },
    /* Planning artifacts — pure structuring tools (no side effects) that
       validate a strict envelope and echo it back as a plan/spec card. */
    { name: 'create_plan', modelDefinition: PLAN_TOOL, enabled: true, pure: true, sessionSerial: false },
    { name: 'create_spec', modelDefinition: SPEC_TOOL, enabled: true, pure: true, sessionSerial: false },
    /* Sites the agent builds land in the same artifacts store the Sites
       page lists; publishing mints the /s/<token> share URL. */
    { name: 'create_site', modelDefinition: CREATE_SITE_TOOL, enabled: true, pure: false, sessionSerial: false },

    // ── Connector tools (gated on per-user connection) ──────
    { name: CONNECTOR_TOOL_NAMES.ARXIV,  modelDefinition: ARXIV_TOOL,    enabled: true, pure: true, sessionSerial: false },
    { name: CONNECTOR_TOOL_NAMES.ZOTERO, modelDefinition: ZOTERO_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.zotero), pure: true, sessionSerial: false },
    { name: CONNECTOR_TOOL_NAMES.NOTION, modelDefinition: NOTION_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.notion), pure: true, sessionSerial: false },
    { name: CONNECTOR_TOOL_NAMES.GITHUB, modelDefinition: GITHUB_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.github), pure: true, sessionSerial: false },
    { name: CONNECTOR_TOOL_NAMES.GITEE,  modelDefinition: GITEE_TOOL,   enabled: Boolean(connectorConnectionsByProvider?.gitee), pure: true, sessionSerial: false },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY, modelDefinition: PROJECT_CONNECTOR_TOOLS[0], enabled: Boolean(projectConnectorConnectionsByProvider?.github), pure: true, sessionSerial: false },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH, modelDefinition: PROJECT_CONNECTOR_TOOLS[1], enabled: Boolean(projectConnectorConnectionsByProvider?.gmail), pure: true, sessionSerial: false },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS, modelDefinition: PROJECT_CONNECTOR_TOOLS[2], enabled: Boolean(projectConnectorConnectionsByProvider?.googlecalendar), pure: true, sessionSerial: false },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS, modelDefinition: PROJECT_CONNECTOR_TOOLS[3], enabled: Boolean(projectConnectorConnectionsByProvider?.todoist), pure: true, sessionSerial: false },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY, modelDefinition: PROJECT_CONNECTOR_TOOLS[4], enabled: Boolean(projectConnectorConnectionsByProvider?.gitlab), pure: true, sessionSerial: false },
    { name: PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH, modelDefinition: PROJECT_CONNECTOR_TOOLS[5], enabled: Boolean(projectConnectorConnectionsByProvider?.qq_mail), pure: true, sessionSerial: false },
    /* OpenConnector chat tools (curated read-only allow-list). Each entry is
       offered only when the user connected that oc_<service> app. */
    ...OPEN_CONNECTOR_CHAT_TOOLS.map((tool) => ({
      name: tool.tool,
      modelDefinition: { type: 'function', function: { name: tool.tool, description: tool.description, parameters: tool.parameters } },
      enabled: Boolean(projectConnectorConnectionsByProvider?.[`oc_${tool.service}`]),
      pure: true,
      sessionSerial: false,
    })),
  ];
  return {
    entries,
    definitions: entries.filter((entry) => entry.enabled && entry.modelDefinition).map((entry) => entry.modelDefinition),
    get(name: string) { return entries.find((entry) => entry.name === name) || null; },
  };
}
