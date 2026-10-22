export function openUiProgramIssues(parsed: unknown, declarations: readonly string[]): string[];
export function openUiStateIssue(state: unknown): string | null;
export function openUiRuntimeIssues(parsed: unknown, state: Record<string, unknown>): string[];
