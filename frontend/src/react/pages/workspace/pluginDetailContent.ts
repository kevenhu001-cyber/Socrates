import { getCurrentLang } from '../../../ui/legacyI18n.ts';
import type { PluginItem } from './types';

export function detailText(en: string, zh: string): string {
  return getCurrentLang() === 'zh' ? zh : en;
}

/** Examples for the exact reviewed actions, never for an entire provider API. */
const examples: Record<string, readonly [string, string]> = {
  'github.search_repositories': [
    'Find repositories relevant to my project.',
    '查找与我的项目相关的仓库。',
  ],
  'github.list_pull_requests': [
    'Show open pull requests in my repository.',
    '查看仓库中尚未合并的 Pull Request。',
  ],
  'github.list_workflow_runs': [
    'Check the latest CI runs in my repository.',
    '检查仓库最近的 CI 运行结果。',
  ],
  'github.get_current_user': [
    'Which GitHub account am I connected to?',
    '我当前连接的是哪个 GitHub 账户？',
  ],
  'gitlab.get_current_user': [
    'Which GitLab account am I connected to?',
    '我当前连接的是哪个 GitLab 账户？',
  ],
  'gmail.search_threads': [
    'Find email threads about my upcoming exam.',
    '查找与即将到来的考试有关的邮件。',
  ],
  'qq_mail.search_threads': [
    'Find email threads about my upcoming exam.',
    '查找与即将到来的考试有关的邮件。',
  ],
  'google_calendar.list_events': ['What is on my calendar today?', '查看我今天的日程。'],
  'todoist.list_tasks': ['List my Todoist tasks for today.', '列出我今天的 Todoist 待办事项。'],
  'amap.search_places': ['Find cafés near a place I specify.', '帮我查找指定地点附近的咖啡馆。'],
  'googlecalendar.find_event': [
    'Find calendar events about my research project.',
    '查找与科研项目相关的日程。',
  ],
};

const localizedActions: Record<string, readonly [string, string]> = {
  'github.search_repositories': ['搜索仓库', '按关键词查找 GitHub 仓库。'],
  'github.list_pull_requests': ['查看 Pull Request', '查看指定仓库的 Pull Request。'],
  'github.list_workflow_runs': ['检查 CI 运行', '查看指定仓库的 GitHub Actions 运行记录。'],
  'github.get_current_user': ['获取账户信息', '查看当前连接的 GitHub 账户身份。'],
  'gitlab.get_current_user': ['获取账户信息', '查看当前连接的 GitLab 账户身份。'],
  'gmail.search_threads': ['搜索邮件', '根据关键词搜索授权 Gmail 账户中的相关邮件会话。'],
  'qq_mail.search_threads': ['搜索邮件', '根据关键词搜索授权 QQ 邮箱中的相关邮件会话。'],
  'google_calendar.list_events': ['查看日程', '查看已连接 Google 日历中的指定日期日程。'],
  'todoist.list_tasks': ['查看任务', '根据过滤条件获取已连接 Todoist 账户中的待办事项。'],
  'amap.search_places': ['搜索地点', '通过关键词搜索地点。'],
  'amap.get_place_detail': ['查看地点详情', '通过地点 ID 查询地点信息。'],
  'googlecalendar.find_event': ['搜索日程', '通过关键词查找日历事件。'],
  'googlecalendar.find_free_slots': ['查询空闲时间', '根据日历忙闲数据查找空闲时段。'],
  'googlecalendar.get_calendar_list_entry': ['查看日历', '根据日历 ID 获取日历列表条目。'],
  'ticktick.get_habit': ['查看习惯', '根据习惯 ID 查询滴答清单中的习惯。'],
  'ticktick.get_project_by_id': ['查看项目', '根据项目 ID 查询滴答清单项目。'],
  'ticktick.get_project_with_data': ['查看项目待办', '查询滴答清单项目及未完成任务和分组。'],
};

export function actionDescription(action: { name: string; description: string }): string {
  return detailText(action.description, localizedActions[action.name]?.[1] || action.description);
}

export function actionTitle(name: string): string {
  if (getCurrentLang() === 'zh' && localizedActions[name]) return localizedActions[name][0];
  const words = name.split('.').pop()?.replace(/[_-]+/g, ' ').trim() || name;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pluginDescription(plugin: PluginItem): string {
  if (!plugin.chatActions)
    return (
      plugin.description || detailText('Connect this app to Socrates.', '将此插件连接到 Socrates。')
    );
  if (plugin.chatActions.length === 0) {
    return detailText(
      'No chat actions are currently registered for this app.',
      '此插件暂未注册可在聊天中使用的操作。',
    );
  }
  const action = plugin.chatActions[0];
  if (plugin.chatActions.length === 1) return actionDescription(action);
  return detailText(
    `${plugin.chatActions.length} supported chat actions · ${actionTitle(action.name)} and more`,
    `支持 ${plugin.chatActions.length} 项聊天操作，包括 ${actionTitle(action.name)} 等。`,
  );
}

export function pluginExample(
  plugin: PluginItem,
  action: { name: string; description: string },
): string {
  const example = examples[action.name];
  if (example) return detailText(example[0], example[1]);
  // Keep the original reviewed action name. A request with missing identifiers
  // should ask the user for those identifiers, not fabricate them.
  return detailText(
    `Use ${plugin.name} to ${actionTitle(action.name).toLowerCase()}. Ask me for any required details.`,
    `使用 ${plugin.name} 的 ${actionTitle(action.name)} 功能；如果缺少必要信息，请先询问我。`,
  );
}
