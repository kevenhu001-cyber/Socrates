/** Prefer the longest service id, including ids containing underscores. */
export function connectorToolIdOf(name: string, ids: ReadonlyArray<string>): string {
  const key = name.replace(/^oc_/, '').toLowerCase().replace(/[_-]/g, '');
  let match = '';
  let matchLength = 0;
  for (const id of ids) {
    const normalized = id.toLowerCase().replace(/[_-]/g, '');
    if (key.startsWith(normalized) && normalized.length > matchLength) {
      match = id;
      matchLength = normalized.length;
    }
  }
  return match;
}

const SERVICES: Record<string, string> = {
  github: 'GitHub', gitlab: 'GitLab', gitee: 'Gitee', gmail: 'Gmail',
  googlecalendar: 'Google Calendar', google_calendar: 'Google Calendar',
  googledrive: 'Google Drive', google_drive: 'Google Drive',
  notion: 'Notion', slack: 'Slack', todoist: 'Todoist', ticktick: 'TickTick',
  qq_mail: 'QQ Mail', qqmail: 'QQ Mail', outlook: 'Outlook',
};

/** Read a service/action identity from the tool name or connector dispatcher.
 * This is an execution fact; no provider reasoning or output is used as copy. */
export function connectorActivityOf(name: string, input: unknown): { service: string; action: string } | null {
  const bare = name.replace(/^oc_/, '');
  const id = Object.keys(SERVICES).find((candidate) => bare === candidate || bare.startsWith(candidate + '_'));
  if (!id) return null;
  const args = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const action = typeof args.action === 'string' ? args.action
    : typeof args.actionId === 'string' ? args.actionId : bare.slice(id.length + 1);
  return { service: SERVICES[id], action: action.replace(new RegExp('^' + id + '[._]'), '') };
}
