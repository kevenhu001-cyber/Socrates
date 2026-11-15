import React, { useEffect, useReducer, useSyncExternalStore, useMemo } from 'react';
import type { SessionItem } from '../../ui/sessionListState.ts';
import type { SessionRowProps } from './SessionRow';
import { SessionRow } from './SessionRow';
import { formatRelativeTime } from './sessionList.store';
import { timeGroupLabel } from './sessionListModel';
import { groupSessionsByProject } from './projectGroups';
import { useSessionOrganization } from '../../sidebar/organization.store';
import { getCachedProjects, subscribeToProjectCache } from '../../projects/projectCache';
import { VirtualSessionTimeline, type TimelineEntry } from './VirtualSessionTimeline';
import { i18n } from '../legacy/gateway';
import { WebUiTheme } from '../rn/WebUiTheme';
import { SessionGroupHeading } from './SessionGroupHeading';

type SessionTimelineProps = Pick<
  SessionRowProps,
  'onPick' | 'onTag' | 'onArchive' | 'onDelete' | 'onDragStart' | 'onDragEnd'
> & {
  nowTick: number;
  sessions: ReadonlyArray<SessionItem>;
  currentSessionId: string | null;
};

/* Bucket names come out of the model in English (they double as stable
   keys); the heading the user reads is localized here. */
const TIME_GROUP_KEYS: Record<string, string> = {
  Pinned: 'sidebar.organize.pinned',
  Today: 'recents.group.today',
  Yesterday: 'recents.group.yesterday',
  'Previous 7 days': 'recents.group.previous7',
  'Previous 30 days': 'recents.group.previous30',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function localizeTimeGroup(group: string): string {
  const key = TIME_GROUP_KEYS[group];
  if (key) return i18n(key, group);
  const month = MONTHS.indexOf(group);
  if (month >= 0) {
    const lang = document.documentElement.lang || undefined;
    try {
      return new Intl.DateTimeFormat(lang, { month: 'long' }).format(new Date(2000, month, 1));
    } catch (_) {
      return group;
    }
  }
  return group;
}

export function SessionTimeline({
  sessions,
  currentSessionId,
  nowTick,
  onPick,
  onTag,
  onArchive,
  onDelete,
  onDragStart,
  onDragEnd,
}: SessionTimelineProps) {
  const organization = useSessionOrganization((state) => state.organization);
  const projects = useSyncExternalStore(subscribeToProjectCache, getCachedProjects, getCachedProjects);
  const [languageRevision, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  const day = new Date().toDateString();
  // The minute clock renders labels, but grouping changes only by day.
  void nowTick;
  const entries = useMemo(() => {
    // Language is supplied by the existing global i18n bridge.
    void languageRevision;
    const groups = organization === 'projects' ? groupSessionsByProject(sessions, projects, {
      pinned: i18n('sidebar.organize.pinned', 'Pinned'),
      other: i18n('sidebar.organize.other', 'Other chats'),
      project: i18n('sidebar.organize.project', 'Project'),
    }) : [{ id: 'timeline', name: '', sessions }];
    const result: TimelineEntry[] = [];
    let previousGroup: string | null = null;
    const today = new Date(day);
    for (const section of groups) {
      if (section.name) result.push({ key: 'project-' + section.id, heading: section.name, project: true });
      for (const session of section.sessions) {
        const group = timeGroupLabel(session, today);
        if (organization === 'list' && group !== previousGroup) {
          result.push({ key: 'group-' + group + '-' + session.id, heading: localizeTimeGroup(group) });
        }
        previousGroup = group;
        result.push({ key: session.id, session });
      }
    }
    return result;
  }, [sessions, projects, organization, day, languageRevision]);
  /* Sticky group labels need one containing block per run. The virtual
     timeline below owns absolute rows and stays flat; this section view is
     for the normal-sized list, where each heading can stick inside its own
     group and be pushed out by the next one instead of overlapping it. */
  const sections = useMemo(() => {
    const result: Array<{ key: string; heading?: string; project?: boolean; sessions: SessionItem[] }> = [];
    for (const entry of entries) {
      if (entry.session) {
        if (!result.length) result.push({ key: 'group-' + entry.key, sessions: [] });
        result[result.length - 1].sessions.push(entry.session);
      } else {
        result.push({ key: entry.key, heading: entry.heading, project: entry.project, sessions: [] });
      }
    }
    return result;
  }, [entries]);
  const renderSession = (session: SessionItem, onRetentionChange?: (id: string, active: boolean) => void) => <SessionRow
    session={session}
    isActive={session.id === currentSessionId}
    timeLabel={formatRelativeTime(session.updatedAt || session.createdAt)}
    onPick={onPick}
    onTag={onTag}
    onArchive={onArchive}
    onDelete={onDelete}
    onDragStart={onDragStart}
    onDragEnd={onDragEnd}
    onRetentionChange={onRetentionChange}
  />;
  /* RN-10: rows and headings are shared RN shell parts; they read the web theme. */
  if (entries.length > 80) return <WebUiTheme><VirtualSessionTimeline entries={entries} renderSession={renderSession} /></WebUiTheme>;
  return <WebUiTheme><div className="recents-list-content">
    {sections.map((section) => <section className="recents-group" key={section.key}>
      {section.heading ? <SessionGroupHeading label={section.heading} project={section.project} /> : null}
      {section.sessions.map((session) => <React.Fragment key={session.id}>
        {renderSession(session)}
      </React.Fragment>)}
    </section>)}
  </div></WebUiTheme>;
}
