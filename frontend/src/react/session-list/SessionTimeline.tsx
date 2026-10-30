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
          result.push({ key: 'group-' + group + '-' + session.id, heading: group });
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
