import { WEB_SEARCH_TOOL } from './webSearch.js';
import { VISUALIZATION_TOOL } from './visualization.js';

/** The model-facing capability registry. Route-specific executors retain
 * their streaming/session semantics while availability is defined once. */
export function createToolRegistry({ codeInterpreterToolDef, mode }) {
  const entries = [
    { name: 'code_interpreter', modelDefinition: codeInterpreterToolDef, enabled: Boolean(codeInterpreterToolDef), pure: false, sessionSerial: true, maxConcurrency: 1, retries: 0 },
    { name: 'render_visualization', modelDefinition: VISUALIZATION_TOOL, enabled: process.env.VISUALIZATION_TOOL_ENABLED !== 'false', pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
    { name: 'web_search', modelDefinition: WEB_SEARCH_TOOL, enabled: mode !== 'tutor', pure: true, sessionSerial: false, maxConcurrency: 4, retries: 1 },
  ];
  return {
    entries,
    definitions: entries.filter((entry) => entry.enabled && entry.modelDefinition).map((entry) => entry.modelDefinition),
    get(name) { return entries.find((entry) => entry.name === name) || null; },
  };
}
