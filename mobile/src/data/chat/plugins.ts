import type { ProjectConnector } from '@socrates/contracts';

export interface ComposerPluginSelection {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  directiveTemplate?: string;
}

const DIRECTIVE_TEMPLATES: Record<string, string> = {
  github: "Use my connected GitHub context when relevant to the user's request.",
  gitee: "Use my connected Gitee context when relevant to the user's request.",
  notion: "Use my connected Notion workspace when relevant to the user's request.",
  gmail: "Use my connected Gmail context when relevant to the user's request.",
  googledrive: "Use my connected Google Drive context when relevant to the user's request.",
  googlecalendar: "Use my connected Google Calendar context when relevant to the user's request.",
  todoist: "Use my connected Todoist tasks when relevant to the user's request.",
  ticktick: "Use my connected TickTick tasks when relevant to the user's request.",
  discord: "Use my connected Discord context when relevant to the user's request.",
  tencentdocs: "Use my connected Tencent Docs when relevant to the user's request.",
  onedrive: "Use my connected OneDrive files when relevant to the user's request.",
  outlook: "Use my connected Outlook context when relevant to the user's request.",
  gitlab: "Use my connected GitLab context when relevant to the user's request.",
  qqmail: "Use my connected QQ Mail context when relevant to the user's request.",
  feishu: "Use my connected Feishu context when relevant to the user's request.",
};

export function normalisePluginId(value: unknown): string {
  return String(value || '').toLowerCase().replace(/[_-]/g, '');
}

export function connectedComposerPlugins(connectors: ProjectConnector[]): ComposerPluginSelection[] {
  return connectors
    .filter((entry) => String(entry.connection?.status || '').toLowerCase() === 'connected')
    .map((entry) => ({
      id: entry.id,
      name: entry.name || entry.id,
      description: entry.description || '',
      capabilities: Array.isArray(entry.capabilities) ? entry.capabilities.slice() : [],
      directiveTemplate: DIRECTIVE_TEMPLATES[normalisePluginId(entry.id)],
    }));
}

export function pluginDirective(
  entry: Pick<ComposerPluginSelection, 'name' | 'directiveTemplate' | 'capabilities'>,
): string {
  if (entry.directiveTemplate) return entry.directiveTemplate;
  const capabilityText = entry.capabilities.length ? ` (${entry.capabilities.join(', ')})` : '';
  return `Use my connected ${entry.name}${capabilityText} context when relevant to the user's request.`;
}

export function serializeSelectedPluginContext(
  entries: ReadonlyArray<ComposerPluginSelection>,
  prompt: string,
): string {
  const trimmedPrompt = String(prompt || '').trim();
  if (!entries.length) return trimmedPrompt;
  const directives = entries.map(pluginDirective).join('\n');
  return `${directives}\n\n${trimmedPrompt}`.trim();
}
