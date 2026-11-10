/**
 * Per-tool argument policy for the chat pipeline.
 *
 * The pipeline used to special-case `SELF_NORMALIZING_TOOLS` inline: those
 * tools skipped the generic schema pre-pass and kept unknown keys so their
 * executor could move a mis-placed field. That set was invisible to the tool
 * definitions and to the tests that simulate the pipeline, so a new tool
 * could silently inherit the wrong tolerance.
 *
 * This module is the single declaration of that contract. `validation` is:
 *   - `schema`: run the generic `validateToolArguments` after repair;
 *   - `tool`:   run the tool's own pre-execution validator;
 *   - `none`:   the executor owns validation and returns its own correction.
 *
 * `dropUnknown` stays separate because it is a repair decision, not a
 * validation decision: plan/spec/intelligent-ui normalizers need to see the
 * alias or mis-placed key before the schema prunes it.
 */

import { validatePlanArgs, validateSpecArgs } from '../core/planning.js';

export type ToolArgumentValidationMode = 'schema' | 'tool' | 'none';

export interface ToolArgumentValidation {
  ok: boolean;
  fieldErrors: string[];
  /** Tool-specific error code, e.g. `plan_spec_invalid`. */
  errorCode?: string;
  /** Tool-specific user-facing message for the tool card. */
  userMessage?: string;
}

export interface ToolArgumentPolicy {
  /** Keep keys the schema does not declare so the tool's normalizer can move them. */
  dropUnknown: boolean;
  validation: ToolArgumentValidationMode;
  /** Required when `validation` is `tool`. */
  validate?: (args: Record<string, unknown>) => ToolArgumentValidation;
}

const DEFAULT_POLICY: ToolArgumentPolicy = {
  dropUnknown: true,
  validation: 'schema',
};

const POLICIES: Record<string, ToolArgumentPolicy> = {
  /* Legacy flat-spec route. Disabled in the registry, but kept here so a
     stored or replayed call still gets the visualization normalizer. */
  render_visualization: { dropUnknown: false, validation: 'none' },
  /* The demonstration program is a free-form nested object with per-kind
     requirements the shallow schema pre-pass cannot validate. Its executor
     owns the normalizer and the strict demonstration validator, so route
     every rejection to the demonstration-aware correction instead of the
     generated panel example. */
  render_intelligent_ui: { dropUnknown: false, validation: 'none' },
  /* Plan/spec have their own normalizers and zod schemas. Run them in the
     pipeline so an invalid card is rejected before execution, with the same
     error code and correction the executor used to produce. */
  create_plan: { dropUnknown: false, validation: 'tool', validate: validatePlanArgs },
  create_spec: { dropUnknown: false, validation: 'tool', validate: validateSpecArgs },
};

export function toolArgumentPolicy(toolName: string | null | undefined): ToolArgumentPolicy {
  return (toolName && POLICIES[toolName]) || DEFAULT_POLICY;
}

/** Tools whose executor owns argument validation. Kept as a derived set so
 * existing callers and tests can still ask the question directly. */
export const SELF_NORMALIZING_TOOLS: ReadonlySet<string> = new Set(
  Object.entries(POLICIES)
    .filter(([, policy]) => policy.validation === 'none')
    .map(([name]) => name),
);
