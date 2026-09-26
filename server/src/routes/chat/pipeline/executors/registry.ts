/**
 * Tool executor registry (LobeHub-alignment: self-registering tools).
 *
 * Maps a canonical tool name to its executor module. The pipeline
 * dispatcher looks tools up here instead of branching on names, so
 * adding a tool = one executor module + one entry below.
 *
 * `match` receives the requested (already canonicalized) name and may
 * claim a family of names (e.g. all project-connector tools) without the
 * dispatcher knowing about them.
 */

import type {ToolExecutor} from './types.js';
import {executeWorkspaceAgent} from './workspaceAgent.js';
import {executeInitializeWorkspace} from './workspaceInit.js';
import {executeCodeInterpreter} from './codeInterpreter.js';
import {executeRenderVisualization} from './renderVisualization.js';
import {executeWebSearch} from './webSearch.js';
import {executeWebFetch} from './webFetch.js';
import {executeReadAttachment} from './readAttachment.js';
import {executeSaveMemory} from './saveMemory.js';
import {executePlanSpec} from './planSpec.js';
import {executeCreateSite} from './createSite.js';
import {executePersonalConnector, executeProjectConnector,} from './connectors.js';
import {executeOpenConnector} from './openConnector.js';
import {CONNECTOR_TOOL_NAMES} from '../../../../services/connectorTools.js';
import {PROJECT_CONNECTOR_TOOL_NAMES} from '../../../../services/projectConnectorTools.js';
import {getOpenConnectorChatTool} from '../../../../services/openConnectorChatTools.js';

export interface ToolExecutorRegistry {
  /** Exact-name executor map. */
  get(name: string): ToolExecutor | null;
}

export function createToolExecutorRegistry(): ToolExecutorRegistry {
  const exact = new Map<string, ToolExecutor>([
    ['workspace_agent', executeWorkspaceAgent],
    ['initialize_workspace', executeInitializeWorkspace],
    ['code_interpreter', executeCodeInterpreter],
    ['render_visualization', executeRenderVisualization],
    ['web_search', executeWebSearch],
    ['web_fetch', executeWebFetch],
    ['read_attachment', executeReadAttachment],
    ['save_memory', executeSaveMemory],
    ['create_plan', executePlanSpec],
    ['create_spec', executePlanSpec],
    ['create_site', executeCreateSite],
  ]);

  const families: Array<{ includes: (name: string) => boolean; executor: ToolExecutor }> = [
    {
      includes: (name) => name.startsWith('oc_') && getOpenConnectorChatTool(name) !== null,
      executor: executeOpenConnector,
    },
    {
      includes: (name) => Object.values(PROJECT_CONNECTOR_TOOL_NAMES).includes(name as never),
      executor: executeProjectConnector,
    },
    {
      includes: (name) => Object.values(CONNECTOR_TOOL_NAMES).includes(name as (typeof CONNECTOR_TOOL_NAMES)[keyof typeof CONNECTOR_TOOL_NAMES]),
      executor: executePersonalConnector,
    },
  ];

  return {
    get(name: string): ToolExecutor | null {
      if (!name) return null;
      const direct = exact.get(name);
      if (direct) return direct;
      for (const family of families) {
        if (family.includes(name)) return family.executor;
      }
      return null;
    },
  };
}
