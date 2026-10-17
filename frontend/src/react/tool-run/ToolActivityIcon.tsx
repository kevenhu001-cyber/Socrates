import { useEffect, useState } from 'react';
import { toolIcon } from '../../ui/icons/toolIcons.ts';
import { connectorToolIdOf } from '../../ui/toolActivity.ts';

// Reuse local vendor marks, loaded only for connector activity.
const marks = new Map<string, string>();
let catalog: Promise<typeof import('../../connector-icons')> | undefined;

export function ToolActivityIcon({ name }: { name: string }) {
  const [resolved, setResolved] = useState({ name, markup: marks.get(name) || '' });
  useEffect(() => {
    if (marks.has(name) || !/^(?:oc_|github_|gmail_|google_calendar_|todoist_|gitlab_|qq_mail_|gitee_|notion_)/.test(name)) return;
    let current = true;
    catalog ??= import('../../connector-icons');
    void catalog.then((icons) => {
      const id = connectorToolIdOf(name, icons.connectorIconIds());
      const markup = icons.getConnectorActivityIconMarkup(id);
      marks.set(name, markup);
      if (current) setResolved({ name, markup });
    }).catch(() => {
      // Keep the category icon if the optional vendor chunk cannot load.
      catalog = undefined;
    });
    return () => { current = false; };
  }, [name]);

  const brand = marks.get(name) || (resolved.name === name ? resolved.markup : '');
  return <span className={`tool-inline-tool-icon${brand ? ' is-connector-brand' : ''}`} aria-hidden="true" dangerouslySetInnerHTML={{ __html: brand || toolIcon(name) }} />;
}
