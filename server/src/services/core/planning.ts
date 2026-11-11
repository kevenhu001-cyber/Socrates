import { z } from 'zod';

/* ─── Schemas ──────────────────────────────────────────────── */

const planStepSchema = z.object({
  title: z.string().min(1).max(160),
  detail: z.string().max(800).optional(),
  status: z.enum(['todo', 'in_progress', 'done']).optional(),
}).passthrough();

const planSchema = z.object({
  title: z.string().min(1).max(160),
  goal: z.string().max(800).optional(),
  steps: z.array(planStepSchema).min(1).max(30),
  notes: z.string().max(1000).optional(),
}).strict();

const specSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().max(1200).optional(),
  requirements: z.array(z.string().min(1).max(500)).min(1).max(40),
  acceptanceCriteria: z.array(z.string().min(1).max(500)).max(40).optional(),
  constraints: z.array(z.string().min(1).max(500)).max(40).optional(),
  outOfScope: z.array(z.string().min(1).max(500)).max(40).optional(),
}).strict();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compactIssues(error: z.ZodError) {
  return error.issues.slice(0, 8).map((issue) => ({
    path: issue.path.join('.') || 'spec',
    message: issue.message,
  }));
}

function planningError(errorCode: string, issues: Array<{ path: string; message: string }>, durationMs: number) {
  return {
    status: 'failed' as const,
    errorCode,
    retryable: true,
    userMessage: '结构化字段不符合要求，正在请求修正。',
    detail: issues,
    durationMs,
  };
}

export interface PlanningValidation {
  ok: boolean;
  fieldErrors: string[];
  errorCode?: string;
  userMessage?: string;
}

function planningValidation(
  userMessage: string,
  issues: Array<{ path: string; message: string }>,
): PlanningValidation {
  return {
    ok: false,
    fieldErrors: issues.map((issue) => `${issue.path}: ${issue.message}`),
    errorCode: 'plan_spec_invalid',
    userMessage,
  };
}

/** Pre-execution validation for plan content, shared by the chat pipeline and
 * the executor so both reject the same normalized shape with the same code. */
function validatePlanArgs(input: unknown): PlanningValidation {
  const parsed = planSchema.safeParse(input);
  return parsed.success
    ? { ok: true, fieldErrors: [] }
    : planningValidation('计划结构有字段不符合要求，已附上正确示例请模型修正。', compactIssues(parsed.error));
}

/** Pre-execution validation for spec content. */
function validateSpecArgs(input: unknown): PlanningValidation {
  const parsed = specSchema.safeParse(input);
  return parsed.success
    ? { ok: true, fieldErrors: [] }
    : planningValidation('规格结构有字段不符合要求，已附上正确示例请模型修正。', compactIssues(parsed.error));
}

/* ─── Tool definitions ─────────────────────────────────────── */

const PLAN_CONTENT_SCHEMA = {
      type: 'object',
      required: ['title', 'steps'],
      properties: {
        title: { type: 'string', maxLength: 160 },
        goal: { type: 'string', maxLength: 800 },
        steps: {
          type: 'array',
          minItems: 1,
          maxItems: 30,
          items: {
            type: 'object',
            required: ['title'],
            properties: {
              title: { type: 'string', maxLength: 160 },
              detail: { type: 'string', maxLength: 800 },
              status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            },
            additionalProperties: false,
          },
        },
        notes: { type: 'string', maxLength: 1000 },
      },
      additionalProperties: false,
    };

const SPEC_CONTENT_SCHEMA = {
      type: 'object',
      required: ['title', 'requirements'],
      properties: {
        title: { type: 'string', maxLength: 160 },
        summary: { type: 'string', maxLength: 1200 },
        requirements: { type: 'array', minItems: 1, maxItems: 40, items: { type: 'string', maxLength: 500 } },
        acceptanceCriteria: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 500 } },
        constraints: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 500 } },
        outOfScope: { type: 'array', maxItems: 40, items: { type: 'string', maxLength: 500 } },
      },
      additionalProperties: false,
    };

/** One strictly discriminated document contract. */
export const DOCUMENT_TOOL = {
  type: 'function',
  function: {
    name: 'create_document',
    description: 'Create a structured plan or specification card. Use kind:plan for ordered actions and kind:spec for requirements and acceptance criteria. Arguments are {kind, content}; content follows the selected schema. Use the user’s language and refer briefly to the resulting card without repeating it. Do not call for a single-step answer.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['kind', 'content'],
      properties: {
        kind: { type: 'string', enum: ['plan', 'spec'] },
        content: { anyOf: [PLAN_CONTENT_SCHEMA, SPEC_CONTENT_SCHEMA] },
      },
    },
  },
};

export function validateDocumentArgs(input: unknown): PlanningValidation {
  if (!isRecord(input) || !['plan', 'spec'].includes(String(input.kind)) || Object.keys(input).some(key => !['kind', 'content'].includes(key))) {
    return planningValidation('请使用 {kind: "plan"|"spec", content: {...}}。', [{ path: 'kind', message: 'Expected plan or spec with content, without extra envelope fields' }]);
  }
  return input.kind === 'plan' ? validatePlanArgs(input.content) : validateSpecArgs(input.content);
}

export function executeDocument(input: unknown) {
  const validation = validateDocumentArgs(input);
  if (!validation.ok) return planningError('plan_spec_invalid', validation.fieldErrors.map(message => ({ path: 'content', message })), 0);
  const document = input as { kind: 'plan' | 'spec'; content: unknown };
  return document.kind === 'plan' ? executePlan(document.content) : executeSpec(document.content);
}

/* ─── Executors ────────────────────────────────────────────── */

const STATUS_MARK: Record<string, string> = { done: '[x]', in_progress: '[~]', todo: '[ ]' };

function executePlan(input: unknown) {
  const startedAt = Date.now();
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return planningError('plan_spec_invalid', compactIssues(parsed.error), Date.now() - startedAt);
  const plan = parsed.data;
  const lines: string[] = [];
  lines.push(`# ${plan.title}`);
  if (plan.goal) lines.push(`Goal: ${plan.goal}`);
  lines.push('');
  plan.steps.forEach((step, index) => {
    const mark = STATUS_MARK[step.status || 'todo'];
    lines.push(`${index + 1}. ${mark} ${step.title}`);
    if (step.detail) lines.push(`   ${step.detail}`);
  });
  if (plan.notes) { lines.push(''); lines.push(`Notes: ${plan.notes}`); }
  return {
    status: 'completed' as const,
    plan,
    output: lines.join('\n'),
    errorCode: null,
    retryable: false,
    userMessage: null,
    detail: null,
    durationMs: Date.now() - startedAt,
  };
}

function executeSpec(input: unknown) {
  const startedAt = Date.now();
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) return planningError('plan_spec_invalid', compactIssues(parsed.error), Date.now() - startedAt);
  const spec = parsed.data;
  const lines: string[] = [];
  lines.push(`# ${spec.title}`);
  if (spec.summary) { lines.push(''); lines.push(spec.summary); }
  const section = (heading: string, items?: string[]) => {
    if (!items || items.length === 0) return;
    lines.push('');
    lines.push(`## ${heading}`);
    items.forEach((item) => lines.push(`- ${item}`));
  };
  section('Requirements', spec.requirements);
  section('Acceptance criteria', spec.acceptanceCriteria);
  section('Constraints', spec.constraints);
  section('Out of scope', spec.outOfScope);
  return {
    status: 'completed' as const,
    spec,
    output: lines.join('\n'),
    errorCode: null,
    retryable: false,
    userMessage: null,
    detail: null,
    durationMs: Date.now() - startedAt,
  };
}
