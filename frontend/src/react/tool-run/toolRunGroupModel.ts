import {toolCategory} from '../../render/toolCategory.js';
import {formatSeconds, toolRunGroupLabel, translate} from './labels.js';
import {durationOf, toolRunStateOf} from './toolRunState.ts';
import {
  filePathSummaries,
  fileSummaryOf,
  groupSources,
  normalizeSources,
  toolRunView,
} from './toolRunDetails.ts';
import type {
  DetailSection,
  TechSection,
  ToolCallRecord,
  ToolRunGroupView,
  ToolRunState,
  TurnSegment,
} from './toolRunModel.types.ts';

function groupSectionsOf(members: ToolCallRecord[], views: ToolRunGroupView['members']): DetailSection[] {
  const sections: DetailSection[] = [];
  const sources = groupSources(members);
  /* Merging is the aggregate's job: with only one member that has sources, the
     panel would repeat that member's own expanded row verbatim one level up. */
  const contributing = members.filter((member) => normalizeSources(member.results).length > 0).length;
  if (sources.length && contributing > 1) {
    sections.push({ kind: 'sources', title: translate('tool.sources', 'Sources'), items: sources });
  }
  const paths = filePathSummaries(members);
  if (paths.length > 1) {
    sections.push({ kind: 'files', title: translate('tool.files', 'Files'), paths });
  }
  /* A collapsed group must not hide a failure. Lift every member's error text
     into the group panel, prefixed with the tool name. */
  for (const member of views) {
    for (const section of member.sections) {
      if (section.kind === 'error') {
        sections.push({ kind: 'error', title: `${member.name}: ${section.title}`, text: section.text });
      }
    }
  }
  return sections;
}

function groupTechOf(members: ToolCallRecord[]): TechSection[] {
  const tech: TechSection[] = [];
  const failedMembers = members.filter((member) => toolRunStateOf(member) === 'error');
  const firstFailed = failedMembers[0];
  if (firstFailed?.errorCode) {
    tech.push({ kind: 'fact', title: translate('tool.errorCode', 'Error code'), text: String(firstFailed.errorCode) });
  }
  if (failedMembers.length) {
    /* Aggregate hint: retryable only when every failed member is. */
    const allRetryable = failedMembers.every((member) => member.retryable !== false);
    tech.push({
      kind: 'fact',
      title: translate('tool.retryable', 'Retryable'),
      text: allRetryable
        ? translate('tool.retryableYes', 'Retryable — safe to run again')
        : translate('tool.retryableNo', 'Not retryable — change the arguments first'),
      retryable: allRetryable ? '1' : '0',
    });
  }
  return tech;
}

export function toolRunGroupView(
  members: ToolCallRecord[],
  running: ToolCallRecord[],
  state: ToolRunState,
): ToolRunGroupView {
  const memberViews = members.map(toolRunView);
  const runningViews = running.map(toolRunView);
  const all = members.concat(running);
  const label = toolRunGroupLabel(all, state === 'awaiting' ? 'done' : state);
  const meta = label.meta ? label.meta.slice() : [];
  const totalMs = all.reduce((sum, call) => sum + durationOf(call), 0);
  const seconds = state === 'running' ? '' : formatSeconds(totalMs);
  if (seconds) meta.push(seconds);

  const sections = groupSectionsOf(members, memberViews);
  const tech = groupTechOf(members);

  const fileSummary = fileSummaryOf(all);
  const retry = memberViews.find((m) => m.retry)?.retry;

  return {
    id: members.length ? members[0].id : (running.length ? running[0].id : ''),
    name: members.length ? members[0].name : '',
    category: toolCategory(members.length ? members[0].name : ''),
    state,
    label: label.text,
    mono: !!label.mono,
    meta,
    sections,
    tech,
    headerLabel: label.text,
    members: memberViews,
    running: runningViews,
    showsHeader: members.length >= 2,
    retry,
    fileSummary: fileSummary || undefined,
  };
}

/** Convenience: full group view for a layout segment. */
export function groupViewOf(segment: Extract<TurnSegment, { kind: 'group' }>): ToolRunGroupView {
  return toolRunGroupView(segment.members, segment.running, segment.state);
}
