import { getCurrentLang } from '../../../ui/legacyI18n.ts';
import type { PluginItem } from './types';

export function detailText(en: string, zh: string): string {
  return getCurrentLang() === 'zh' ? zh : en;
}

/** Examples for the exact reviewed actions, never for an entire provider API. */
const examples: Record<string, readonly [string, string]> = {
  'github.get_current_user': ['Which GitHub account am I connected to?', '我当前连接的是哪个 GitHub 账户？'],
  'gitlab.get_current_user': ['Which GitLab account am I connected to?', '我当前连接的是哪个 GitLab 账户？'],
  'gmail.search_threads': ['Find email threads about my upcoming exam.', '查找与即将到来的考试有关的邮件。'],
  'qq_mail.search_threads': ['Find email threads about my upcoming exam.', '查找与即将到来的考试有关的邮件。'],
  'google_calendar.list_events': ['What is on my calendar today?', '查看我今天的日程。'],
  'todoist.list_tasks': ['List my Todoist tasks for today.', '列出我今天的 Todoist 待办事项。'],
  'amap.search_places': ['Find cafés near a place I specify.', '帮我查找指定地点附近的咖啡馆。'],
  'googlecalendar.find_event': ['Find calendar events about my research project.', '查找与科研项目相关的日程。'],
};

export function actionTitle(name: string): string {
  const words = name.split('.').pop()?.replace(/[_-]+/g, ' ').trim() || name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pluginDescription(plugin: PluginItem): string {
  if (!plugin.chatActions) return plugin.description || detailText('Connect this app to Socrates.', '将此插件连接到 Socrates。');
  if (plugin.chatActions.length === 0) {
    return detailText('No chat actions are currently registered for this app.', '此插件暂未注册可在聊天中使用的操作。');
  }
  const action = plugin.chatActions[0];
  if (plugin.chatActions.length === 1) return action.description;
  return detailText(
    `${plugin.chatActions.length} supported chat actions · ${actionTitle(action.name)} and more`,
    `支持 ${plugin.chatActions.length} 项聊天操作，包括 ${actionTitle(action.name)} 等。`,
  );
}

export function pluginExample(plugin: PluginItem, action: { name: string; description: string }): string {
  const example = examples[action.name];
  if (example) return detailText(example[0], example[1]);
  // Keep the original reviewed action name. A request with missing identifiers
  // should ask the user for those identifiers, not fabricate them.
  return detailText(
    `Use ${plugin.name} to ${actionTitle(action.name).toLowerCase()}. Ask me for any required details.`,
    `使用 ${plugin.name} 的 ${actionTitle(action.name)} 功能；如果缺少必要信息，请先询问我。`,
  );
}
