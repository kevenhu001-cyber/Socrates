// Codex — first-class workspace-agent template.
//
// Codex remains visibly branded, but its entry point now augments the active
// Chat/Tutor composer instead of opening a second conversation surface. The
// model can route the turn to workspace_agent while the reply, approvals,
// artifacts, and history stay attached to the current Socrates session.

import type { ExtensionDefinition } from '../types';

export const CODEX_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l-3 3 3 3"/><path d="M13 15l3-3-3-3"/><rect x="3" y="3" width="18" height="18" rx="4"/></svg>';

const CODEX_SYSTEM_PROMPT = [
  'The user has enabled the Codex workspace agent for this turn.',
  'Treat the current Socrates session and selected project as the source of truth for context.',
  'Use the workspace_agent tool when the request needs multi-step repository or file work, commands, code changes, experiments, MCP access, or a durable project task.',
  'Keep short explanations and simple calculations in the native response path. Do not call workspace_agent merely to sound technical.',
  'When workspace_agent returns, explain what was inspected or changed, mention tests and artifacts, and preserve Tutor teaching context when the surface is Tutor.',
].join('\n');

export const codexExtension: ExtensionDefinition = {
  key: 'codex',
  kind: 'template',
  nameKey: 'composer.codex',
  nameFallback: 'Codex 工作代理',
  descriptionKey: 'composer.codexHint',
  descriptionFallback: '在当前会话中使用项目工作区代理',
  hintKey: 'composer.codexHint',
  hintFallback: '在当前会话中使用项目工作区代理',
  icon: CODEX_ICON,
  shortcut: '/codex',
  systemPrompt: CODEX_SYSTEM_PROMPT,
  body: '告诉 Codex 你希望它在当前项目中完成什么…',
  placement: { tools: 6, picker: 3 },
  onActivate(ctx) {
    ctx.setTemplate({
      key: 'codex',
      title: 'Codex 工作代理',
      hint: '在当前会话中使用项目工作区代理',
      icon: CODEX_ICON,
      systemPrompt: CODEX_SYSTEM_PROMPT,
      body: '告诉 Codex 你希望它在当前项目中完成什么…',
      shortcut: '/codex',
      workflow: 'agent',
    });
    ctx.focusComposer(ctx.surface, 'end');
  },
};
