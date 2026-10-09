import { isInlineSearchTool } from '../../render/toolCategory.js';
import { reportSwallow } from '../../util/reportSwallow.ts';
import type { InlineToolGroupMember, InlineToolResult } from './types.ts';

export function translate(key: string, fallback: string): string {
  try {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w.t === 'function') {
      const s = (w.t as (k: string) => string)(key);
      if (s && s !== key) return s;
    }
  } catch (e) { reportSwallow(e, 'toolInline.s.prefLookup'); /* ignore */ }
  return fallback;
}

type Label = [key: string, fallback: string];

const RUNNING_LABELS: Record<string, Label> = {
  workspace_agent: ['tool.actionCodex', 'Working in the workspace…'],
  code_interpreter: ['tool.actionCode', 'Executing code…'],
  Code: ['tool.actionCode', 'Executing code…'],
  render_visualization: ['tool.actionVisual', 'Creating a visual'],
  web_fetch: ['tool.actionFetch', 'Reading the page…'],
  create_plan: ['tool.actionPlan', 'Drafting a plan…'],
  create_spec: ['tool.actionSpec', 'Drafting a spec…'],
  Read: ['tool.actionRead', 'Reading files'],
  Glob: ['tool.actionRead', 'Reading files'],
  Grep: ['tool.actionRead', 'Reading files'],
  WebFetch: ['tool.actionRead', 'Reading files'],
  Write: ['tool.actionWrite', 'Updating files'],
  Edit: ['tool.actionWrite', 'Updating files'],
  Bash: ['tool.actionWrite', 'Updating files'],
};

const DONE_LABELS: Record<string, Label> = {
  code_interpreter: ['tool.doneAnalyze', 'Analyzed data'],
  Code: ['tool.doneAnalyze', 'Analyzed data'],
  render_visualization: ['tool.doneVisual', 'Created a visual'],
  web_fetch: ['tool.doneFetch', 'Read the page'],
  create_plan: ['tool.donePlan', 'Drafted a plan'],
  create_spec: ['tool.doneSpec', 'Drafted a spec'],
  workspace_agent: ['tool.doneCodex', 'Completed the workspace task'],
  Read: ['tool.doneRead', 'Read files'],
  Glob: ['tool.doneRead', 'Read files'],
  Grep: ['tool.doneRead', 'Read files'],
  WebFetch: ['tool.doneRead', 'Read files'],
  Write: ['tool.doneWrite', 'Updated files'],
  Edit: ['tool.doneWrite', 'Updated files'],
  Bash: ['tool.doneWrite', 'Updated files'],
};

const SEARCH_RUNNING_LABEL: Label = ['tool.actionSearch', 'Searching the web…'];
const DEFAULT_RUNNING_LABEL: Label = ['tool.actionDefault', 'Using a tool'];
const DEFAULT_DONE_LABEL: Label = ['tool.doneDefault', 'Finished using tool'];

function renderLabel(label: Label): string {
  return translate(label[0], label[1]);
}

function searchDoneLabel(result: InlineToolResult | null): string {
  const count = result && Array.isArray(result.results) ? result.results.length : 0;
  if (count > 0) {
    return translate('tool.searchDone', 'Found {n} web results').replace('{n}', String(count));
  }
  return translate('tool.searchEmpty', 'No web results found');
}

export function runningLabel(name: string): string {
  if (isInlineSearchTool(name)) return renderLabel(SEARCH_RUNNING_LABEL);
  return renderLabel(RUNNING_LABELS[name] || DEFAULT_RUNNING_LABEL);
}

export function doneLabel(name: string, result: InlineToolResult | null): string {
  if (result && result.status === 'awaiting_approval') {
    return translate('tool.awaitingApproval', 'Waiting for your decision');
  }
  if (isInlineSearchTool(name)) return searchDoneLabel(result);
  return renderLabel(DONE_LABELS[name] || DEFAULT_DONE_LABEL);
}

export function errorLabel(name: string, result: InlineToolResult | null): string {
  if (result && result.status === 'timeout') return translate('tool.statusTimeout', 'Timeout');
  if (isInlineSearchTool(name)) return translate('tool.searchFailed', 'Web search failed');
  if (name === 'workspace_agent') return translate('tool.codexFailed', 'Workspace task failed');
  return translate('tool.actionFailed', 'Tool call failed');
}

export function groupErrorLabel(members: InlineToolGroupMember[]): string {
  const failed = members.filter((m) => m.failed || (m.result && m.result.ok === false)).length;
  const base = translate('tool.groupNeedsAttention', 'Tool needs attention');
  if (!failed) return base;
  return base + ' · ' + translate('tool.failedCount', '{n} failed').replace('{n}', String(failed));
}

export function groupDoneLabel(name: string, members: InlineToolGroupMember[]): string {
  const count = members.length;
  const failed = members.filter((m) => m.failed || (m.result && m.result.ok === false)).length;
  if (failed > 0) return groupErrorLabel(members);
  if (isInlineSearchTool(name)) {
    let total = 0;
    for (const member of members) {
      const results = member.result && Array.isArray(member.result.results)
        ? member.result.results
        : [];
      total += results.length;
    }
    if (total > 0) {
      return translate('tool.groupSearchDone', 'Found {n} sources · {m} searches')
        .replace('{n}', String(total))
        .replace('{m}', String(count));
    }
    return translate('tool.groupSearchEmpty', 'No results · {m} searches')
      .replace('{m}', String(count));
  }
  if (name === 'code_interpreter' || name === 'Code') {
    return translate('tool.groupCodeDone', 'Executed {m} runs').replace('{m}', String(count));
  }
  if (name === 'render_visualization') {
    return translate('tool.groupVisualDone', 'Created {m} visuals').replace('{m}', String(count));
  }
  return translate('tool.groupDone', 'Used {m} tools').replace('{m}', String(count));
}
