/**
 * Shape normalization for `render_intelligent_ui` arguments.
 *
 * Delegates to shared DOM-free @socrates/core normalization so server
 * and client apply the exact same deterministic repairs.
 */
import {
  asArray,
  numberLike,
  normalizeIntelligentUiNode as coreNormalizeNode,
  normalizeIntelligentUiArgs as coreNormalizeArgs,
  normalizeIntelligentUiPatchArgs as coreNormalizePatchArgs,
} from '../../../packages/core/src/intelligentUiNormalize.js';
import { normalizeDemonstrationProgram as normalizeCoreDemonstrationProgram } from '../../../packages/core/src/demonstration.js';

export { asArray, numberLike };

export function normalizeDemonstrationProgram(program: unknown): unknown {
  return normalizeCoreDemonstrationProgram(program);
}

export function normalizeIntelligentUiNode(raw: unknown): unknown {
  return coreNormalizeNode(raw);
}

export function normalizeIntelligentUiArgs(value: unknown): unknown {
  return coreNormalizeArgs(value);
}

export function normalizeIntelligentUiPatchArgs(value: unknown): unknown {
  return coreNormalizePatchArgs(value);
}
