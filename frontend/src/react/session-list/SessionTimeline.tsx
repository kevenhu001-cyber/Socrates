import React from 'react';
import type { SessionItem } from './types';
import type { SessionRowProps } from './SessionRow';
import { SessionRow } from './SessionRow';
import { timeGroupLabel } from './sessionListModel';

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
  let previousGroup: string | null = null;

  return (
    <div className="recents-list-content">
      {sessions.map((session) => {
        const group = timeGroupLabel(session, now);
        const header = group !== previousGroup
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
    </div>
  );
}
