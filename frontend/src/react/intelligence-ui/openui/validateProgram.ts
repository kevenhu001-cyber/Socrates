import { split, tokenize } from '@openuidev/lang-core';
import { createParser } from '@openuidev/react-lang';
import { openUiProgramIssues, openUiRuntimeIssues } from '@socrates/core';
import { library } from './library';
const parser = createParser(library.toJSONSchema(), 'Col');
export function programIssues(source: string): string[] {
  try {
    const parsed = parser.parse(source);
    // Runtime diagnostics belong to current state, not the source's defaults:
    // otherwise correcting an invalid input leaves a permanent error notice.
    return openUiProgramIssues(parsed, split(tokenize(source)).map((statement) => statement.id));
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
