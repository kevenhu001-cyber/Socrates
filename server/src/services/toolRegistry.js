import { WEB_SEARCH_TOOL } from './webSearch.js';
import { VISUALIZATION_TOOL } from './visualization.js';
import {
  ARXIV_TOOL, ZOTERO_TOOL, NOTION_TOOL, GITHUB_TOOL, GITEE_TOOL,
  CONNECTOR_TOOL_NAMES,
} from './connectorTools.js';

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
export function createToolRegistry({ codeInterpreterToolDef, mode, connectorConnectionsByProvider }) {
  const entries = [
    { name: 'code_interpreter', modelDefinition: codeInterpreterToolDef, enabled: Boolean(codeInterpreterToolDef), pure: false, sessionSerial: true, maxConcurrency: 1, retries: 0 },
    { name: 'render_visualization', modelDefinition: VISUALIZATION_TOOL, enabled: process.env.VISUALIZATION_TOOL_ENABLED !== 'false', pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: 'web_search', modelDefinition: WEB_SEARCH_TOOL, enabled: mode !== 'tutor', pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },

    // ── Connector tools (gated on per-user connection) ──────
    { name: CONNECTOR_TOOL_NAMES.ARXIV,  modelDefinition: ARXIV_TOOL,    enabled: true, pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.ZOTERO, modelDefinition: ZOTERO_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.zotero), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.NOTION, modelDefinition: NOTION_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.notion), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.GITHUB, modelDefinition: GITHUB_TOOL,  enabled: Boolean(connectorConnectionsByProvider?.github), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: CONNECTOR_TOOL_NAMES.GITEE,  modelDefinition: GITEE_TOOL,   enabled: Boolean(connectorConnectionsByProvider?.gitee), pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
  ];
  return {
    entries,
    definitions: entries.filter((entry) => entry.enabled && entry.modelDefinition).map((entry) => entry.modelDefinition),
    get(name) { return entries.find((entry) => entry.name === name) || null; },
  };
}
