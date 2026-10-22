import { split, tokenize } from '@openuidev/lang-core';
import { createParser } from '@openuidev/react-lang';
import { openUiProgramIssues, openUiRuntimeIssues } from '@socrates/core';
import { library } from './library';
const parser = createParser(library.toJSONSchema(), 'Col');
export function programIssues(source: string): string[] {
  try {
    const parsed = parser.parse(source);
    return [...openUiProgramIssues(parsed, split(tokenize(source)).map((statement) => statement.id)), ...openUiRuntimeIssues(parsed, parsed.stateDeclarations)];
  } catch {
    return ['OpenUI program could not be parsed'];
  }
}

export function runtimeProgramIssues(source: string, state: Record<string, unknown>): string[] {
  try {
    const parsed = parser.parse(source);
    return openUiRuntimeIssues(parsed, { ...parsed.stateDeclarations, ...state });
  } catch {
    return ['OpenUI program could not be evaluated'];
  }
}
