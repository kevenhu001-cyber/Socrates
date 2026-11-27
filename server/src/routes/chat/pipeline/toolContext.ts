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
import { INTELLIGENT_UI_PROVIDER_TOOL } from '../../../services/intelligentUi.js';
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

/* Intent prewarm is an optimization, not an authorization gate: a tool that
 * is not prewarmed remains discoverable through search_connectors. These
 * patterns therefore require an explicit action, not a topic mention.
 * "解释这个图表" or "项目为什么慢" must not load the visualization or
 * workspace toolset for a prose answer. */
const DEFINITION_QUESTION = /(?:什么是|是什么意思|是什么|what\s+is|what\s+does|meaning\s+of)/i;

const VISUAL_VERB =
  /(?:画|绘制|画出|生成|制作|创建|做个|做一个|呈现|展示|更新|修改|调整|render|draw|plot|chart|diagram|visuali[sz]e|create|make|build|show|update|edit|patch|refresh)/i;
const VISUAL_NOUN =
  /(?:图|图表|示意图|曲线|函数图像|流程图|关系图|对比图|可视化|交互演示|演示|仿真|动画|chart|diagram|graph|plot|visual|simulation|animation)/i;

const WORKSPACE_ACTION =
  /(?:修改|编辑|创建|新建|删除|重命名|移动|修复|调试|实现|重构|运行|执行|测试|检查|审查|查看|读取|写入|编写|加|改|review|inspect|read|write|create|edit|update|delete|rename|move|fix|debug|implement|refactor|run|execute|test|check)/i;
const WORKSPACE_OBJECT =
  /(?:代码|源码|文件|仓库|项目|脚本|测试|工作区|目录|bug|repo|repository|codebase|workspace|file|script|test)/i;

const DOCUMENT_VERB =
  /(?:写|生成|创建|制定|整理|输出|起草|做|列|给我|make|create|write|draft|generate|build|give)/i;
const DOCUMENT_NOUN = /(?:计划|方案|需求文档|文档|规格|spec|plan|document|proposal)/i;

const SITE_VERB = /(?:创建|制作|搭建|生成|建|做|写|build|create|make|generate|code)/i;
const SITE_NOUN = /(?:网站|网页|website|web\s*page|html|site)/i;

const PAPER_VERB = /(?:找|搜索|查找|检索|查|阅读|读|推荐|search|find|look\s+up|read|recommend)/i;
const PAPER_NOUN = /(?:论文|文献|paper|literature|arxiv)/i;

const IMAGE_VERB = /(?:找|搜索|查找|搜|来|给我|展示|show|find|search|look\s+for)/i;
const IMAGE_NOUN = /(?:图片|照片|图像|image|photo|picture)/i;

/**
 * No classifier model call: prewarm clearly relevant capabilities, defer
 * the rest to the existing schema discovery path. Unknown intents retain
 * access to every enabled tool through discovery. Environment opt-out.
 */
export function selectDeferredCoreTools(body: unknown, _mode: string): Set<string> {
  if (process.env.CHAT_DEFER_CORE_TOOLS === '0') return new Set();
  const messages = requestMessages(body);
  const users = messages.filter((m) => m.role === 'user');
  const latest = users.at(-1);
  const text = contentText(latest?.content).slice(0, 16000);
  // A short follow-up may refer to the preceding task.
  const prior =
    users.length > 1 && text.length < 80 ? contentText(users.at(-2)?.content).slice(0, 3000) : '';
  const intent = text + '\n' + prior;
  const deferred = new Set([
    'code_interpreter',
    'render_intelligent_ui',
    'get_ui_contract',
    'patch_intelligent_ui',
    'image_search',
    'workspace_agent',
    'initialize_workspace',
    'create_document',
    'create_site',
    'arxiv_search',
  ]);
  const enable = (...names: string[]) => names.forEach((name) => deferred.delete(name));
  /* A short follow-up inherits the prior topic for intent matching, but a
     definitional prior ("what is …") must not turn "continue" into a
     workspace request. */
  const definitional =
    DEFINITION_QUESTION.test(text) || (text.length < 80 && DEFINITION_QUESTION.test(prior));
  /* Tutor mode used to prewarm the whole visualization stack for every
   * turn. Most tutor turns are prose explanations; discovery still exposes
   * the visual tools when a chart is actually requested. */
  if (VISUAL_VERB.test(intent) && VISUAL_NOUN.test(intent)) {
    enable('render_intelligent_ui', 'get_ui_contract', 'patch_intelligent_ui');
  }
  // Mentioning Python, CSV or numerical methods is not itself an execution
  // request. Prewarm only for clear run/process/export intent; deferred tool
  // discovery remains available for less common tasks.
  const needsCodeExecution =
    /(?:用\s*python.{0,24}(?:运行|执行|计算|分析|绘制|处理|仿真)|(?:运行|执行).{0,16}python(?:代码|脚本)?|(?:^|[，。；！？\n])\s*(?:请\s*|帮我\s*)?(?:运行|执行)\s*(?:这段|上述|以下|我的)?\s*(?:代码|脚本|程序)(?=\s*(?:$|[\n，。；！？,.!?：:]|并|然后|并且))|python.{0,24}(?:run|execute|calculate|analyze|plot|process|simulate)|(?:run|execute|perform|calculate|analyze|process|plot).{0,30}(?:python|numpy|pandas|scipy|matplotlib|dataset|csv|excel|spreadsheet|simulation|monte carlo)|(?:分析|处理|清洗|统计|绘制).{0,20}(?:这份|这些|给定|上传|提供的)?(?:数据|csv|excel|表格)|(?:运行|执行|进行|完成|帮我做|帮我进行|做一下|做一个|perform|do|run).{0,16}(?:数据分析|数据处理|数据清洗|数据统计|数值模拟|数值仿真|数值积分|蒙特卡洛|批量计算|data analysis|data processing|numerical simulation|numerical integration|monte carlo|batch calculation)|(?:导出|转换).{0,20}(?:csv|excel|数据|文件|表格)|\b(?:import\s+(?:numpy|pandas|scipy|matplotlib)|from\s+(?:numpy|pandas|scipy|matplotlib)\b|run (?:this )?(?:code|script|simulation)|execute (?:this )?(?:code|script|simulation)|export (?:this )?(?:data|file|table|csv)|convert (?:this )?file)\b)/i.test(
      intent,
    );
  if (needsCodeExecution) enable('code_interpreter');
  if (IMAGE_VERB.test(intent) && IMAGE_NOUN.test(intent)) enable('image_search');
  if (!definitional && WORKSPACE_ACTION.test(intent) && WORKSPACE_OBJECT.test(intent)) {
    enable('workspace_agent', 'initialize_workspace');
  }
  if (DOCUMENT_VERB.test(intent) && DOCUMENT_NOUN.test(intent)) enable('create_document');
  if (SITE_VERB.test(intent) && SITE_NOUN.test(intent)) enable('create_site');
  if (PAPER_VERB.test(intent) && PAPER_NOUN.test(intent)) enable('arxiv_search');
  return deferred;
}

export async function createStreamToolContext(
  req: Request & { userId?: string },
  mode: string,
  reasoningEffort?: string,
): Promise<StreamToolContext> {
  const toolPolicy = createToolTurnPolicy({ reasoningEffort });
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
  const validationDefs = toolRegistry.definitions as RuntimeToolDefinition[];
  const toolDefs: RuntimeToolDefinition[] = validationDefs.map((definition) =>
    definition.function?.name === 'render_intelligent_ui'
      ? INTELLIGENT_UI_PROVIDER_TOOL
      : definition,
  );
  connectorCatalog = addDeferredCoreTools(connectorCatalog, toolDefs, deferredCore);

  /* derive the prompt appendix from the same
   * definitions sent in the request. This keeps the injected system
   * guidance aligned with the current tool registry after additions or
   * connector changes. */
  const toolNames = toolDefs.map((tool) => tool.function?.name || '');

  /** The `parameters` schema for a tool, used for repair and feedback. */
  const schemaForTool = (name: string): JsonSchemaNode | null => {
    const definition = validationDefs.find((tool) => tool.function?.name === name);
    return definition?.function?.parameters || null;
  };

  /* Keep examples only for nontrivial structured calls. Simple calls have
   * their native schemas, and generated placeholder examples for connector
   * arguments are not necessarily semantically valid. On-error correction
   * still has access to the canonical example for every tool. */
  const exampleTools = new Set([
    'code_interpreter',
    'patch_intelligent_ui',
    'cite_sources',
    'create_document',
  ]);
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
  const initialToolDefs = toolDefs.filter((tool) =>
    initialToolNames.includes(tool.function?.name || ''),
  );
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
