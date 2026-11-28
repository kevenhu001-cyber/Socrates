import type { compileDemonstrationRuntime } from './demonstration.js';
export function compileDemonstrationRuntimeAsync(
  input: unknown,
): Promise<ReturnType<typeof compileDemonstrationRuntime>>;
