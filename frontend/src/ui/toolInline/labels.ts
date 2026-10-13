/** Compatibility adapters; all tool semantics live in the shared model. */
import { toolRunGroupLabel, toolRunLabel, type ToolCallLike } from '../toolPresentationModel';
import { toolRunStateOf } from '../toolPresentationState';
import type { InlineToolGroupMember, InlineToolResult } from './types';
export { translate } from '../toolPresentationModel';

function callOf(name: string, result: InlineToolResult | null, input?: unknown): ToolCallLike {
  return { name, input, ...result, isError: result?.ok === false };
}

export function runningLabel(name: string, input?: unknown): string {
  return toolRunLabel({ name, input }, 'running').text;
}

export function doneLabel(name: string, result: InlineToolResult | null, input?: unknown): string {
  const call = callOf(name, result, input);
  return toolRunLabel(call, result?.status ? toolRunStateOf({ ...call, id: '', name }) : 'done').text;
}

export function errorLabel(name: string, result: InlineToolResult | null, input?: unknown): string {
  return toolRunLabel(callOf(name, result, input), 'error').text;
}

function groupLabel(members: InlineToolGroupMember[], state: 'done' | 'error'): string {
  const calls = members.map((member) => ({ ...callOf(member.name, member.result || null, member.input), isError: member.failed || member.result?.ok === false }));
  const label = toolRunGroupLabel(calls, state);
  return [label.text, ...(label.meta || [])].join(' · ');
}

export function groupErrorLabel(members: InlineToolGroupMember[]): string {
  return groupLabel(members, 'error');
}

export function groupDoneLabel(_name: string, members: InlineToolGroupMember[]): string {
  return groupLabel(members, members.some((m) => m.failed || m.result?.ok === false) ? 'error' : 'done');
}
