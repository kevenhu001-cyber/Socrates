/**
 * Connected-app connector catalog and retrieval.
 *
 * The chat tool registry used to expose every connector tool the user had
 * connected: up to 319 OpenConnector actions across 114 services. That made
 * the model choose from a huge, mostly irrelevant tool list and invited
 * guessed names and arguments.
 *
 * This module builds a catalog of only the connected tools and scores them
 * against the user's request. The model sees two small discovery tools
 * (`search_connectors`, `get_connector_spec`) instead of the whole catalog;
 * `get_connector_spec` activates one tool for the next hop. The activation
 * store is per-turn, so a later turn starts from the same small surface.
 */

import {
  GITEE_TOOL,
  GITHUB_TOOL,
  NOTION_TOOL,
  ZOTERO_TOOL,
} from './connectorTools.js';
import { PROJECT_CONNECTOR_TOOLS, PROJECT_CONNECTOR_TOOL_NAMES } from './projectConnectorTools.js';
import { OPEN_CONNECTOR_CHAT_TOOLS } from './openConnectorChatTools.js';

export type ConnectorFamily = 'personal' | 'project' | 'open';

export interface ConnectorCatalogEntry {
  tool: string;
  service: string;
  family: ConnectorFamily;
  actionId: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Bilingual service aliases, used for a direct phrase bonus. */
  aliases: string[];
  /** Lowercased tool/service/action/description/parameter names plus aliases. */
  searchText: string;
}

export interface ConnectorCatalog {
  entries: ConnectorCatalogEntry[];
  byTool: Map<string, ConnectorCatalogEntry>;
  services: string[];
}

export interface ConnectorActivation {
  activate(tool: string): void;
  has(tool: string): boolean;
  active(): string[];
}

/** Per-turn set of connector tools the model has read a spec for. */
export function createConnectorActivation(): ConnectorActivation {
  const active = new Set<string>();
  return {
    activate(tool: string) {
      const name = String(tool || '').trim();
      if (name) active.add(name);
    },
    has(tool: string) {
      return active.has(String(tool || '').trim());
    },
    active() {
      return [...active];
    },
  };
}

/**
 * Small bilingual alias table for the services users ask about most often.
 * The model is asked to search in English, but a Chinese request should still
 * find the calendar, mail, repository, notes, reference and task tools.
 */
const SERVICE_ALIASES: Record<string, string[]> = {
  googlecalendar: ['calendar', 'schedule', 'event', 'meeting', '日历', '日程', '会议', '日程表'],
  gmail: ['gmail', 'email', 'mail', 'inbox', 'message', '邮件', '邮箱', '收件箱'],
  qq_mail: ['qq mail', 'qq邮箱', '邮件', '邮箱'],
  outlook: ['outlook', 'microsoft mail', '邮件', '邮箱', '收件箱'],
  netease_mail: ['netease', '163 mail', '网易邮箱', '邮件', '邮箱'],
  github: ['github', 'repo', 'repository', 'code', 'issue', 'pull request', '代码仓库', '仓库', '代码'],
  gitlab: ['gitlab', 'repo', 'repository', 'issue', 'merge request', '代码仓库', '仓库'],
  notion: ['notion', 'note', 'notes', 'doc', 'docs', 'wiki', 'page', '笔记', '文档', '页面'],
  zotero: ['zotero', 'reference', 'paper', 'citation', 'bibliography', '文献', '参考文献', '论文'],
  todoist: ['todoist', 'todo', 'task', 'checklist', '待办', '任务', '清单'],
  linear: ['linear', 'issue', 'project', 'task', '任务', '项目'],
  jira: ['jira', 'issue', 'ticket', 'project', '任务', '工单', '项目'],
  asana: ['asana', 'task', 'project', '任务', '项目'],
  trello: ['trello', 'board', 'card', 'task', '看板', '任务'],
  clickup: ['clickup', 'task', 'project', '任务', '项目'],
  monday: ['monday', 'board', 'task', 'project', '任务', '项目'],
  airtable: ['airtable', 'table', 'base', 'record', '表格', '数据表'],
  slack: ['slack', 'message', 'channel', 'chat', '消息', '频道'],
  discord: ['discord', 'message', 'channel', 'server', '消息', '频道'],
  telegram: ['telegram', 'tg', 'message', 'channel', '消息', '频道'],
  zhihu: ['zhihu', '知乎', '问答'],
  amap: ['amap', 'gaode', '高德', '地图', '导航'],
  mcdonalds_cn: ['mcdonalds', 'mcdonald', '麦当劳', '菜单', '快餐'],
  luckin_coffee: ['luckin', 'coffee', '瑞幸', '咖啡'],
  tencent_docs: ['tencent docs', '腾讯文档', '文档', '表格'],
  feishu: ['feishu', 'lark', '飞书', '文档', '消息'],
  dingtalk: ['dingtalk', '钉钉', '消息', '日程'],
  google_drive: ['google drive', 'drive', 'file', 'document', '云盘', '网盘', '文件'],
  dropbox: ['dropbox', 'file', '云盘', '网盘', '文件'],
  onedrive: ['onedrive', 'file', '云盘', '网盘', '文件'],
  figma: ['figma', 'design', 'file', '设计', '文件'],
  spotify: ['spotify', 'music', 'playlist', '音乐', '歌单'],
  youtube: ['youtube', 'video', 'channel', '视频', '频道'],
  twitter: ['twitter', 'tweet', 'post', '推文'],
  reddit: ['reddit', 'post', 'subreddit', '帖子'],
};

function aliasesFor(service: string): string[] {
  return SERVICE_ALIASES[service] || [];
}

function entryFromDefinition(
  definition: { function: { name: string; description?: string; parameters?: Record<string, unknown> } },
  service: string,
  family: ConnectorFamily,
  actionId: string,
): ConnectorCatalogEntry {
  const fn = definition.function;
  const parameters = (fn.parameters || {}) as Record<string, unknown>;
  const properties = parameters.properties && typeof parameters.properties === 'object'
    ? Object.keys(parameters.properties as Record<string, unknown>)
    : [];
  const description = String(fn.description || '');
  const aliases = aliasesFor(service);
  const searchText = [
    fn.name,
    service,
    actionId,
    description,
    ...properties,
    ...aliases,
  ].join(' ').toLowerCase();
  return {
    tool: fn.name,
    service,
    family,
    actionId,
    description,
    parameters,
    aliases,
    searchText,
  };
}

function hasConnection(
  connections: Record<string, unknown> | undefined,
  provider: string,
): boolean {
  return Boolean(connections?.[provider]);
}

/**
 * Build the catalog from the same connection snapshots the registry uses.
 * Only connected services are included; arXiv is deliberately absent because
 * it is a public search tool that stays in the core tool set.
 */
export function buildConnectorCatalog(input: {
  connectorConnectionsByProvider?: Record<string, unknown>;
  projectConnectorConnectionsByProvider?: Record<string, unknown>;
}): ConnectorCatalog {
  const personal = input.connectorConnectionsByProvider;
  const project = input.projectConnectorConnectionsByProvider;
  const entries: ConnectorCatalogEntry[] = [];

  if (hasConnection(personal, 'zotero')) {
    entries.push(entryFromDefinition(ZOTERO_TOOL, 'zotero', 'personal', 'zotero.search'));
  }
  if (hasConnection(personal, 'notion')) {
    entries.push(entryFromDefinition(NOTION_TOOL, 'notion', 'personal', 'notion.search_pages'));
  }
  if (hasConnection(personal, 'github')) {
    entries.push(entryFromDefinition(GITHUB_TOOL, 'github', 'personal', 'github.list_repos'));
  }
  if (hasConnection(personal, 'gitee')) {
    entries.push(entryFromDefinition(GITEE_TOOL, 'gitee', 'personal', 'gitee.list_repos'));
  }

  const projectTools: Array<[string, string]> = [
    ['github', PROJECT_CONNECTOR_TOOL_NAMES.GITHUB_IDENTITY],
    ['gmail', PROJECT_CONNECTOR_TOOL_NAMES.GMAIL_SEARCH],
    ['googlecalendar', PROJECT_CONNECTOR_TOOL_NAMES.GOOGLE_CALENDAR_LIST_EVENTS],
    ['todoist', PROJECT_CONNECTOR_TOOL_NAMES.TODOIST_LIST_TASKS],
    ['gitlab', PROJECT_CONNECTOR_TOOL_NAMES.GITLAB_IDENTITY],
    ['qq_mail', PROJECT_CONNECTOR_TOOL_NAMES.QQ_MAIL_SEARCH],
  ];
  for (const [provider, toolName] of projectTools) {
    if (!hasConnection(project, provider)) continue;
    const definition = PROJECT_CONNECTOR_TOOLS.find((tool) => tool.function.name === toolName);
    if (definition) entries.push(entryFromDefinition(definition, provider, 'project', toolName));
  }

  for (const tool of OPEN_CONNECTOR_CHAT_TOOLS) {
    if (!hasConnection(project, `oc_${tool.service}`)) continue;
    entries.push(entryFromDefinition(
      { function: { name: tool.tool, description: tool.description, parameters: tool.parameters } },
      tool.service,
      'open',
      tool.actionId,
    ));
  }

  const byTool = new Map<string, ConnectorCatalogEntry>();
  for (const entry of entries) {
    if (!byTool.has(entry.tool)) byTool.set(entry.tool, entry);
  }
  const unique = [...byTool.values()].sort((a, b) => a.tool.localeCompare(b.tool));
  const services = [...new Set(unique.map((entry) => entry.service))].sort();
  return { entries: unique, byTool, services };
}

/** Tools that stay in the core set even when the catalog is non-empty. */
export function splitInitialToolNames(
  allToolNames: readonly string[],
  catalog: ConnectorCatalog,
): string[] {
  return allToolNames.filter((name) => !catalog.byTool.has(name));
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'at', 'by', 'with', 'from',
  'my', 'me', 'please', 'can', 'could', 'would', 'you', 'i', 'we', 'want',
  'need', 'this', 'that', 'these', 'those', 'is', 'are', 'was', 'were', 'be',
  'do', 'does', 'did', 'what', 'which', 'who', 'how', 'about', 'and', 'or',
]);

function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens = new Set<string>();
  for (const token of lower.match(/[a-z0-9]+/g) || []) {
    if (!STOP_WORDS.has(token)) tokens.add(token);
  }
  /* Chinese has no word spaces. Character bigrams are a cheap, deterministic
     way to match a Chinese request against the bilingual service aliases. */
  for (const run of lower.match(/[\u4e00-\u9fff]+/g) || []) {
    if (run.length === 1) tokens.add(run);
    for (let i = 0; i < run.length - 1; i++) tokens.add(run.slice(i, i + 2));
  }
  return [...tokens];
}

export interface ConnectorMatch {
  tool: string;
  service: string;
  family: ConnectorFamily;
  description: string;
  score: number;
}

/**
 * Rank connected connector tools against a short request. The weights are
 * intentionally simple: service and tool names matter most, the action and
 * description next, and parameter names last. A phrase hit is a strong
 * signal. The result is bounded so the model never sees the whole catalog.
 */
export function searchConnectorCatalog(
  catalog: ConnectorCatalog,
  query: string,
  limit = 8,
): ConnectorMatch[] {
  const trimmed = String(query || '').trim();
  if (!trimmed) return [];
  const tokens = tokenize(trimmed);
  if (!tokens.length) return [];
  const phrase = trimmed.toLowerCase();
  const matches: ConnectorMatch[] = [];

  for (const entry of catalog.entries) {
    const tool = entry.tool.toLowerCase();
    const service = entry.service.toLowerCase();
    const action = entry.actionId.toLowerCase();
    const description = entry.description.toLowerCase();
    let score = 0;
    if (phrase.length >= 3 && entry.searchText.includes(phrase)) score += 12;
    /* A direct service alias hit ("email", "日历") is a stronger signal than
       an incidental word in a long tool description. Tool-name tokens are
       weighted below aliases so a generic verb such as "find" in an unrelated
       action name cannot outrank the service the user actually asked for. */
    for (const alias of entry.aliases) {
      if (alias && phrase.includes(alias.toLowerCase())) score += 12;
    }
    for (const token of tokens) {
      if (service.includes(token)) score += 10;
      if (tool.includes(token)) score += 6;
      if (action.includes(token)) score += 6;
      if (description.includes(token)) score += 2;
      if (entry.searchText.includes(token)) score += 1;
    }
    if (tokens.some((token) => service === token)) score += 10;
    if (score > 0) {
      matches.push({
        tool: entry.tool,
        service: entry.service,
        family: entry.family,
        description: entry.description,
        score,
      });
    }
  }

  matches.sort((a, b) => b.score - a.score || a.tool.localeCompare(b.tool));
  return matches.slice(0, Math.max(1, Math.min(20, Math.trunc(limit) || 8)));
}
