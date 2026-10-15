/**
 * Planning tools — create_plan and create_spec.
 *
 * These are "pure" structuring tools in the same family as
 * render_visualization: they take semantic content, validate it against a
 * strict schema, and echo back a tidy artifact the model then presents to
 * the user. They have no external side effects, so they run concurrently
 * and never touch the database, network, or sandbox.
 *
 * Why native tools rather than free-form prose:
 *   - The structured envelope forces the model to commit to an ordered,
 *     trackable breakdown (steps for a plan, requirements/criteria for a
 *     spec) instead of a loose wall of text.
 *   - The frontend renders the tool card inline (see toolCards.js /
 *     toolInline.ts), so the plan/spec is visually distinct from ordinary
 *     reply prose.
 *
 * Tool-description convention mirrors WEB_SEARCH_TOOL / ARXIV_TOOL:
 *   ## What this tool does / When to call / When NOT to call /
 *   ## Parameters / ## Output format.
 */

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

/* ─── Normalization ─────────────────────────────────────────
 * Weaker models frequently wrap the payload in {plan|spec|input|arguments}
 * or send steps as bare strings. Unwrap a single recognizable envelope and
 * coerce string steps into {title} so the strict schema does not reject an
 * otherwise-usable call. */
function unwrapEnvelope(input: any, keys: string[]) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const inputKeys = Object.keys(input);
  if (inputKeys.length === 1 && keys.includes(inputKeys[0])
      && input[inputKeys[0]] && typeof input[inputKeys[0]] === 'object') {
    return input[inputKeys[0]];
  }
  return input;
}

function normalizePlan(input: any) {
  const source = unwrapEnvelope(input, ['plan', 'input', 'arguments']);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const normalized: Record<string, any> = { ...source };
  const rawSteps = normalized.steps ?? normalized.items ?? normalized.tasks;
  if (Array.isArray(rawSteps)) {
    normalized.steps = rawSteps.map((step: any) => {
      if (typeof step === 'string') return { title: step };
      if (!step || typeof step !== 'object') return step;
      const next = { ...step };
      if (!next.title) next.title = next.name ?? next.label ?? next.step ?? next.text;
      delete next.name; delete next.label; delete next.step; delete next.text;
      return next;
    });
  }
  delete normalized.items; delete normalized.tasks;
  return normalized;
}

function normalizeSpec(input: any) {
  const source = unwrapEnvelope(input, ['spec', 'input', 'arguments']);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return source;
  const normalized: Record<string, any> = { ...source };
  if (!normalized.summary && typeof normalized.overview === 'string') normalized.summary = normalized.overview;
  delete normalized.overview;
  if (!normalized.requirements && Array.isArray(normalized.features)) normalized.requirements = normalized.features;
  delete normalized.features;
  if (!normalized.acceptanceCriteria) {
    normalized.acceptanceCriteria = normalized.acceptance_criteria ?? normalized.acceptance;
  }
  delete normalized.acceptance_criteria; delete normalized.acceptance;
  if (!normalized.outOfScope) normalized.outOfScope = normalized.out_of_scope ?? normalized.nonGoals ?? normalized.non_goals;
  delete normalized.out_of_scope; delete normalized.nonGoals; delete normalized.non_goals;
  const arrayify = (value: unknown) => (typeof value === 'string' ? [value] : value);
  normalized.requirements = arrayify(normalized.requirements);
  normalized.acceptanceCriteria = arrayify(normalized.acceptanceCriteria);
  normalized.constraints = arrayify(normalized.constraints);
  normalized.outOfScope = arrayify(normalized.outOfScope);
  return normalized;
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

/* ─── Tool definitions ─────────────────────────────────────── */

export const PLAN_TOOL = {
  type: 'function',
  function: {
    name: 'create_plan',
    description:
      '## What this tool does\n' +
      'Captures an ordered, trackable action or study plan as a structured artifact. The interface renders it as a distinct plan card (title, optional goal, numbered steps with optional per-step status) above your reply.\n\n' +
      '## When to call\n' +
      '- The user asks for a plan, roadmap, study schedule, or step-by-step approach to a multi-step task or project.\n' +
      '- You are about to walk the user through a procedure that has clear, orderable stages.\n' +
      '- Breaking a large request into sequenced, checkable steps genuinely helps the user act.\n\n' +
      '## When NOT to call\n' +
      '- Single-step answers, direct factual questions, or short explanations.\n' +
      '- A specification of WHAT to build (use create_spec for requirements/acceptance criteria).\n' +
      '- Merely to restate content you already wrote in prose.\n\n' +
      '## Parameters\n' +
      '- title: short plan name (required).\n' +
      '- goal: one-sentence objective the plan achieves (optional).\n' +
      '- steps: 1-30 ordered steps, each { title, detail?, status? }. status is one of todo | in_progress | done.\n' +
      '- notes: caveats, assumptions, or dependencies (optional).\n\n' +
      '## Output format\n' +
      'On success the plan card is rendered in the conversation. Refer to it briefly in prose (do not paste the whole plan again). Follow the user\'s language for all titles, details, and notes.',
    parameters: {
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
    },
  },
};

export const SPEC_TOOL = {
  type: 'function',
  function: {
    name: 'create_spec',
    description:
      '## What this tool does\n' +
      'Captures a structured specification (what to build or deliver) as an artifact: title, optional summary, functional requirements, and optional acceptance criteria, constraints, and out-of-scope items. The interface renders it as a distinct spec card above your reply.\n\n' +
      '## When to call\n' +
      '- The user asks you to specify, scope, or define requirements for a feature, document, API, or design.\n' +
      '- You need to pin down WHAT a deliverable must satisfy before any HOW / implementation discussion.\n' +
      '- Turning a vague request into testable requirements and acceptance criteria helps the user.\n\n' +
      '## When NOT to call\n' +
      '- The user wants an ordered sequence of actions (use create_plan instead).\n' +
      '- Simple questions, explanations, or code you can just provide directly.\n\n' +
      '## Parameters\n' +
      '- title: short spec name (required).\n' +
      '- summary: one-paragraph overview of the deliverable (optional).\n' +
      '- requirements: 1-40 functional requirements, each a concise sentence (required).\n' +
      '- acceptanceCriteria: 0-40 verifiable pass/fail conditions (optional).\n' +
      '- constraints: technical, budget, or policy limits (optional).\n' +
      '- outOfScope: explicitly excluded items to prevent scope creep (optional).\n\n' +
      '## Output format\n' +
      'On success the spec card is rendered in the conversation. Refer to it briefly in prose (do not paste the whole spec again). Follow the user\'s language for all fields.',
    parameters: {
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
    },
  },
};

/* ─── Executors ────────────────────────────────────────────── */

const STATUS_MARK: Record<string, string> = { done: '[x]', in_progress: '[~]', todo: '[ ]' };

export function executePlan(input: unknown) {
  const startedAt = Date.now();
  const parsed = planSchema.safeParse(normalizePlan(input));
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

export function executeSpec(input: unknown) {
  const startedAt = Date.now();
  const parsed = specSchema.safeParse(normalizeSpec(input));
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
