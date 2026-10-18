import React, { useEffect, useReducer, useSyncExternalStore } from 'react';
import type { SessionItem } from './types';
import type { SessionRowProps } from './SessionRow';
import { SessionRow } from './SessionRow';
import { timeGroupLabel } from './sessionListModel';
import { groupSessionsByProject } from './projectGroups';
import { useSessionOrganization } from '../../sidebar/organization.store';
import { getCachedProjects, subscribeToProjectCache } from '../../projects/projectCache';
import { i18n } from '../legacy/gateway';

type SessionTimelineProps = Pick<
  SessionRowProps,
  'nowTick' | 'onPick' | 'onTag' | 'onArchive' | 'onDelete' | 'onDragStart' | 'onDragEnd'
> & {
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
  const now = new Date();
  const organization = useSessionOrganization((state) => state.organization);
  const projects = useSyncExternalStore(subscribeToProjectCache, getCachedProjects, getCachedProjects);
  const [, refreshLanguage] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    document.addEventListener('socrates:langchange', refreshLanguage);
    return () => document.removeEventListener('socrates:langchange', refreshLanguage);
  }, []);
  const groups = organization === 'projects' ? groupSessionsByProject(sessions, projects, {
    pinned: i18n('sidebar.organize.pinned', 'Pinned'),
    other: i18n('sidebar.organize.other', 'Other chats'),
    project: i18n('sidebar.organize.project', 'Project'),
  }) : [{ id: 'timeline', name: '', sessions }];
  let previousGroup: string | null = null;

  return (
    <div className="recents-list-content">
      {groups.map((section) => <React.Fragment key={section.id}>
        {section.name ? <div className="recents-project-label" role="heading" aria-level={3}>{section.name}</div> : null}
        {section.sessions.map((session) => {
          const group = timeGroupLabel(session, now);
          const header = organization === 'list' && group !== previousGroup
            ? <div className="recents-time-label" key={'g-' + group + '-' + session.id}>{group}</div>
            : null;
          previousGroup = group;
          return (
            <React.Fragment key={session.id}>
              {header}
              <SessionRow
                session={session}
                isActive={session.id === currentSessionId}
                nowTick={nowTick}
                onPick={onPick}
                onTag={onTag}
                onArchive={onArchive}
                onDelete={onDelete}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
              />
            </React.Fragment>
          );
        })}
      </React.Fragment>)}
    </div>
  );
}
