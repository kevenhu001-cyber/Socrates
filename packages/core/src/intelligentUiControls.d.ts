export const INTELLIGENT_UI_CONTROL_GUIDANCE: string;
export function normalizeIntelligentUiControl<T>(node: T): T;
export function intelligentUiControlIssues(node: Record<string, unknown>): Array<{path: string; message: string}>;
