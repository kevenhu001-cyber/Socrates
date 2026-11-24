/**
 * toolContext — stage 2 of the chat stream pipeline.
 *
 * Assembles everything the tool-calling loop needs before the first hop:
 * the turn policy (iteration/call budgets), the user's connector
 * connection snapshots, the tool registry, the canonical name list, the
 * per-tool JSON schema accessor, and the canonical example bag. Extracted
 * verbatim from the route handler.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { connectorConnections, projectConnectorConnections } from '../../../db/schema/index.js';
import { codeInterpreter } from '../../../services/codeInterpreter/index.js';
import { createToolRegistry } from '../../../services/tools/toolCapabilityCatalog.js';
import { canonicalToolExampleJson } from '../../../services/tools/toolCorrectionMessage.js';
import { createToolTurnPolicy } from '../../../services/tools/toolTurnPolicy.js';
import {
  buildConnectorCatalog,
  addDeferredCoreTools,
  createConnectorActivation,
  splitInitialToolNames,
  type ConnectorActivation,
  type ConnectorCatalog,
} from '../../../services/integrations/connectorCatalog.js';
import type { JsonSchemaNode } from '../../../services/tools/toolCallSafety.js';
import type { Request } from 'express';
import { contentText, requestMessages } from './requestBody.js';

type PersonalConnectorSnapshot = typeof connectorConnections.$inferSelect;
type ProjectConnectorSnapshot = typeof projectConnectorConnections.$inferSelect;

interface RuntimeToolDefinition {
  function?: {
    name?: string;
    description?: string;
    parameters?: JsonSchemaNode;
  };
}

export interface StreamToolContext {
  toolPolicy: ReturnType<typeof createToolTurnPolicy>;
  MAX_TOOL_ITERATIONS: number;
  toolRegistry: ReturnType<typeof createToolRegistry>;
  toolDefs: RuntimeToolDefinition[];
  toolNames: string[];
  /** Tools offered on the first hop: core tools plus the discovery tools.
   * Connected connector tools are activated by get_connector_spec. */
  initialToolNames: string[];
  initialToolDefs: RuntimeToolDefinition[];
  schemaForTool: (name: string) => JsonSchemaNode | null;
  toolExamples: Record<string, string>;
  FUZZY_SAFE: (name: string) => boolean;
  connectorConnectionsByProvider: Record<string, PersonalConnectorSnapshot>;
  projectConnectorConnectionsByProvider: Record<string, ProjectConnectorSnapshot>;
  connectorCatalog: ConnectorCatalog;
  connectorActivation: ConnectorActivation;
}

/**
 * Load the user's connector connections so the tool registry can gate
 * connector tools on whether the user has actually connected each
 * provider. arXiv is always enabled (public API).
 */
async function loadConnectorSnapshots(userId?: string): Promise<{
  connectorConnectionsByProvider: Record<string, PersonalConnectorSnapshot>;
  projectConnectorConnectionsByProvider: Record<string, ProjectConnectorSnapshot>;
}> {
  const connectorConnectionsByProvider: Record<string, PersonalConnectorSnapshot> = {};
  const projectConnectorConnectionsByProvider: Record<string, ProjectConnectorSnapshot> = {};
  if (!userId) return { connectorConnectionsByProvider, projectConnectorConnectionsByProvider };
  try {
    const db = getDb();
    /* two independent reads on the path to the first
       upstream token; issue them together. A failure in one still leaves the
       other's connectors available, as before. */
    const [personal, project] = await Promise.allSettled([
      db
        .select()
        .from(connectorConnections)
        .where(
          and(
            eq(connectorConnections.userId, userId),
            eq(connectorConnections.status, 'connected'),
          ),
        ),
      db
        .select()
        .from(projectConnectorConnections)
        .where(
          and(
            eq(projectConnectorConnections.userId, userId),
            eq(projectConnectorConnections.status, 'connected'),
          ),
        ),
    ]);
    if (personal.status === 'fulfilled') {
      for (const row of personal.value) connectorConnectionsByProvider[row.provider] = row;
    } else {
      console.error(
        '[chat/stream] failed to load connector connections:',
        (personal.reason as Error)?.message,
      );
    }
    if (project.status === 'fulfilled') {
      for (const row of project.value) projectConnectorConnectionsByProvider[row.provider] = row;
    } else {
      console.error(
        '[chat/stream] failed to load project connector connections:',
        (project.reason as Error)?.message,
      );
    }
  } catch (err) {
    console.error('[chat/stream] failed to load connector connections:', (err as Error).message);
    // Non-blocking — connector tools simply won't be available.
  }
  return { connectorConnectionsByProvider, projectConnectorConnectionsByProvider };
}

/**
 * No classifier model call: prewarm clearly relevant capabilities, defer
 * the rest to the existing schema discovery path. Unknown intents retain
 * access to every enabled tool through discovery. Environment opt-out.
 */
export function selectDeferredCoreTools(body: unknown, mode: string): Set<string> {
  if (process.env.CHAT_DEFER_CORE_TOOLS === '0') return new Set();
  const messages = requestMessages(body);
  const users = messages.filter((m) => m.role === 'user');
  const latest = users.at(-1);
  const text = contentText(latest?.content).slice(0, 16000);
  // A short follow-up may refer to the preceding task.
  const prior = users.length > 1 && text.length < 80 ? contentText(users.at(-2)?.content).slice(0, 3000) : '';
  const intent = text + '\n' + prior;
  const deferred = new Set(['code_interpreter', 'render_intelligent_ui', 'get_ui_contract',
    'patch_intelligent_ui', 'image_search', 'workspace_agent', 'initialize_workspace',
    'create_document', 'create_site', 'arxiv_search']);
  const enable = (...names: string[]) => names.forEach((name) => deferred.delete(name));
  if (mode === 'tutor' || /图|示意|可视化|交互|仿真|推导|讲解|解释|diagram|chart|visual|plot|explain|derive|simulation/i.test(intent)) {
    enable('render_intelligent_ui', 'get_ui_contract', 'patch_intelligent_ui');
  }
  // Do not offer the sandbox for ordinary calculations, explanations, coding
  // questions or diagrams. Deferred discovery still covers uncommon tasks.
  if (/\b(?:python|numpy|pandas|scipy|matplotlib|csv|xlsx)\b|数据分析|数据处理|数值模拟|数值仿真|数值积分|蒙特卡洛|批量计算|运行代码|执行代码|文件转换|导出(?:数据|文件|表格)|\b(?:data analysis|data processing|numerical simulation|numerical integration|monte carlo|batch calculation|run code|execute code|file conversion|export (?:data|file))\b/i.test(intent)) {
    enable('code_interpreter');
  }
  if (/图片|照片|找图|image|photo|picture/i.test(intent)) enable('image_search');
  if (/仓库|编程|修改代码|修复|工作区|项目|实现|repo|github|coding|workspace|implement|refactor|debug|fix|edit files/i.test(intent)) enable('workspace_agent', 'initialize_workspace');
  if (/计划|需求|方案|文档|plan|specification|document/i.test(intent)) enable('create_document');
  if (/网页|网站|website|web page|html/i.test(intent)) enable('create_site');
  if (/论文|文献|arxiv|paper|literature/i.test(intent)) enable('arxiv_search');
  return deferred;
}

export async function createStreamToolContext(
  req: Request & { userId?: string },
  mode: string,
): Promise<StreamToolContext> {
  const toolPolicy = createToolTurnPolicy();
  const codeInterpreterToolDef = codeInterpreter.getToolDefinition();

  const { connectorConnectionsByProvider, projectConnectorConnectionsByProvider } =
    await loadConnectorSnapshots(req.userId);

  /* The catalog and the registry are derived from the same connection
     snapshots. The registry still knows every connected tool so an activated
     tool can execute; the first hop only offers the core tools plus the two
     discovery tools. */
  const deferredCore = selectDeferredCoreTools(req.body, mode);
  let connectorCatalog = buildConnectorCatalog({
    connectorConnectionsByProvider,
    projectConnectorConnectionsByProvider,
  });
  const connectorActivation = createConnectorActivation();

  const toolRegistry = createToolRegistry({
    codeInterpreterToolDef,
    mode,
    connectorConnectionsByProvider,
    projectConnectorConnectionsByProvider,
    connectorDiscoveryEnabled: connectorCatalog.entries.length > 0 || deferredCore.size > 0,
  });
  const toolDefs = toolRegistry.definitions as RuntimeToolDefinition[];
  connectorCatalog = addDeferredCoreTools(connectorCatalog, toolDefs, deferredCore);

  /* derive the prompt appendix from the same
   * definitions sent in the request. This keeps the injected system
   * guidance aligned with the current tool registry after additions or
   * connector changes. */
  const toolNames = toolDefs.map((tool) => tool.function?.name || '');

  /** The `parameters` schema for a tool, used for repair and feedback. */
  const schemaForTool = (name: string): JsonSchemaNode | null => {
    const definition = toolDefs.find((tool) => tool.function?.name === name);
    return definition?.function?.parameters || null;
  };

  /* Keep examples only for nontrivial structured calls. Simple calls have
   * their native schemas, and generated placeholder examples for connector
   * arguments are not necessarily semantically valid. On-error correction
   * still has access to the canonical example for every tool. */
  const exampleTools = new Set(['code_interpreter', 'patch_intelligent_ui', 'cite_sources', 'create_document']);
  const toolExamples: Record<string, string> = {};
  for (const name of toolNames) {
    if (!exampleTools.has(name)) continue;
    const example = canonicalToolExampleJson(name, schemaForTool(name));
    if (example) toolExamples[name] = example;
  }

  /* Side-effecting tools never accept a fuzzy name match: acting on a
   * guess is worse than returning a correction to the model. The caller
   * applies this to the RESOLVED name — gating on the requested string
   * would let a near-miss spelling (`code_interprete`) slide into the
   * sandbox anyway. `pure` is the registry's side-effect flag and it
   * fails closed: unknown or unmarked names are not fuzzy-safe. */
  const FUZZY_SAFE = (name: string) => toolRegistry.get(name)?.pure === true;

  const initialToolNames = splitInitialToolNames(toolNames, connectorCatalog).sort();
  const initialToolDefs = toolDefs.filter((tool) => initialToolNames.includes(tool.function?.name || ''));
  return {
    toolPolicy,
    MAX_TOOL_ITERATIONS: toolPolicy.maxIterations,
    toolRegistry,
    toolDefs,
    toolNames,
    initialToolNames,
    initialToolDefs,
    schemaForTool,
    toolExamples,
    FUZZY_SAFE,
    connectorConnectionsByProvider,
    projectConnectorConnectionsByProvider,
    connectorCatalog,
    connectorActivation,
  };
}
