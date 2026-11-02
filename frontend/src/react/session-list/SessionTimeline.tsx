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
  if (entries.length > 80) return <VirtualSessionTimeline entries={entries} renderSession={renderSession} />;
  return <div className="recents-list-content">
    {entries.map((entry) => <React.Fragment key={entry.key}>
      {entry.session ? renderSession(entry.session) : <div className={entry.project ? 'recents-project-label' : 'recents-time-label'} role="heading" aria-level={3}>{entry.heading}</div>}
    </React.Fragment>)}
  </div>;
}
