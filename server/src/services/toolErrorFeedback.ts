/**
 * toolErrorFeedback.ts — model-facing correction text for a rejected call.
 *
 * A structured error code alone ("invalid_tool_arguments") tells the model
 * that something is wrong but not what a correct call looks like, so models
 * tend to re-emit the same broken shape until the turn runs out of budget.
 * Every rejection therefore ships three things:
 *
 *   1. the specific field errors, when the executor produced any,
 *   2. a compact rendering of the tool's own JSON Schema, and
 *   3. one complete, copy-ready example call that satisfies that schema.
 *
 * The examples are derived from the same registry definitions that are sent
 * to the provider as `tools`, so prompt guidance cannot drift from the
 * executable contract. Hand-written examples exist for the tools whose
 * schemas are too nested for a generated skeleton to be useful; everything
 * else falls back to a skeleton built from the schema itself.
 */

import type { JsonSchemaNode } from './toolCallSafety.js';

const MAX_SCHEMA_LINES = 24;
const MAX_DETAIL_CHARS = 1200;

export interface ToolErrorFeedbackInput {
  /** Canonical tool name, or the name the model asked for when unknown. */
  toolName: string;
  /** The tool's `function.parameters` node, when the tool exists. */
  schema?: JsonSchemaNode | null;
  /** Machine-readable failure reason, e.g. `invalid_tool_arguments`. */
  errorCode: string;
  /** Field-level messages from a validator, when available. */
  fieldErrors?: string | string[] | null;
  /** Whether the model may try a corrected call in this turn. */
  retryable: boolean;
  /** Names the model can call right now (used by unknown-tool feedback). */
  availableTools?: readonly string[];
  /** Extra sentence appended before the schema block. */
  hint?: string | null;
}

export interface ToolErrorFeedback {
  /** Text for the `role:'tool'` message the model reads next. */
  modelMessage: string;
  /** Compact technical detail for the UI's "details" disclosure. */
  detail: string;
  /** One-line Chinese status line for the tool card. */
  userMessage: string;
}

/* Hand-written canonical calls. Each one validates against its tool's own
   executor, which the unit tests assert so an example can never rot. */
const CANONICAL_EXAMPLES: Record<string, Record<string, unknown>> = {
  web_search: { query: 'Python 3.13 release date', count: 5 },
  web_fetch: { url: 'https://example.com/article' },
  code_interpreter: { language: 'python', code: 'import pandas as pd\nprint(pd.__version__)' },
  workspace_agent: { task: 'Read server/src/app.ts and list the registered routes.' },
  create_plan: {
    title: '两周复习计划',
    goal: '在两周内完成微积分期中复习',
    steps: [
      { title: '梳理极限与连续性', status: 'done' },
      { title: '练习导数应用题', detail: '每天 10 题，重点是最值问题', status: 'in_progress' },
      { title: '模拟卷限时训练', status: 'todo' },
    ],
  },
  create_spec: {
    title: '导出 PDF 报告',
    summary: '把会话中的可视化与结论导出为一份可分享的 PDF。',
    requirements: [
      '用户可以从会话菜单触发导出。',
      '导出内容包含标题、正文与全部可视化卡片。',
    ],
    acceptanceCriteria: ['导出的 PDF 在 A4 页面下不裁切图表。'],
  },
  render_visualization: {
    version: 1,
    template: 'bar',
    title: '各科目得分',
    accessibilitySummary: '柱状图比较三个科目的得分，数学最高。',
    payload: {
      categories: ['数学', '物理', '化学'],
      series: [{ name: '得分', data: [92, 85, 78] }],
      xLabel: '科目',
      yLabel: '得分',
    },
  },
  arxiv_search: { query: 'diffusion models sampling' },
  zotero_search: { query: 'attention is all you need' },
  notion_search_pages: { query: 'meeting notes' },
  github_list_repos: { query: 'socrates' },
  gitee_list_repos: { query: 'socrates' },
};

/** The canonical example for a tool, generated from its schema if needed. */
export function canonicalToolExample(
  toolName: string,
  schema?: JsonSchemaNode | null,
): Record<string, unknown> | null {
  const handWritten = CANONICAL_EXAMPLES[toolName];
  if (handWritten) return handWritten;
  if (!schema || !schema.properties) return null;
  const example: Record<string, unknown> = {};
  const required = Array.isArray(schema.required) ? schema.required : [];
  const keys = required.length ? required : Object.keys(schema.properties).slice(0, 3);
  for (const key of keys) {
    const property = schema.properties[key];
    if (!property) continue;
    example[key] = exampleValueFor(key, property, 0);
  }
  return Object.keys(example).length ? example : null;
}

/** `{"query":"…","count":5}` — one line, safe to paste into a tool call. */
export function canonicalToolExampleJson(
  toolName: string,
  schema?: JsonSchemaNode | null,
): string | null {
  const example = canonicalToolExample(toolName, schema);
  if (!example) return null;
  try {
    return JSON.stringify(example);
  } catch {
    return null;
  }
}

function exampleValueFor(key: string, schema: JsonSchemaNode, depth: number): unknown {
  if (depth > 3) return 'value';
  if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  switch (type) {
    case 'string': return `<${key}>`;
    case 'number': return 1;
    case 'integer': return 1;
    case 'boolean': return true;
    case 'array': return [exampleValueFor(key, schema.items || { type: 'string' }, depth + 1)];
    case 'object': {
      const nested: Record<string, unknown> = {};
      const properties = schema.properties || {};
      const required = Array.isArray(schema.required) ? schema.required : Object.keys(properties).slice(0, 2);
      for (const nestedKey of required) {
        const nestedSchema = properties[nestedKey];
        if (nestedSchema) nested[nestedKey] = exampleValueFor(nestedKey, nestedSchema, depth + 1);
      }
      return nested;
    }
    default: return `<${key}>`;
  }
}

/** Render a schema as a short "field: type (required)" list. */
export function describeToolSchema(schema?: JsonSchemaNode | null): string {
  if (!schema || !schema.properties) return '';
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const lines: string[] = [];
  for (const [key, property] of Object.entries(schema.properties)) {
    if (lines.length >= MAX_SCHEMA_LINES) {
      lines.push('- …');
      break;
    }
    lines.push(`- ${key}: ${describeType(property)}${required.has(key) ? ' (required)' : ''}`);
  }
  if (schema.additionalProperties === false) lines.push('- no other top-level fields are accepted');
  return lines.join('\n');
}

function describeType(schema: JsonSchemaNode): string {
  if (Array.isArray(schema.enum) && schema.enum.length) {
    return `one of ${schema.enum.map((value) => JSON.stringify(value)).join(' | ')}`;
  }
  const type = Array.isArray(schema.type) ? schema.type.join('|') : schema.type;
  if (type === 'array') {
    const items = schema.items ? describeType(schema.items) : 'value';
    return `array of ${items}`;
  }
  if (type === 'object' && schema.properties) {
    const keys = Object.keys(schema.properties).slice(0, 6).join(', ');
    return `object { ${keys}${Object.keys(schema.properties).length > 6 ? ', …' : ''} }`;
  }
  return type || 'value';
}

function normalizeFieldErrors(fieldErrors?: string | string[] | null): string {
  if (!fieldErrors) return '';
  const text = Array.isArray(fieldErrors) ? fieldErrors.join('; ') : String(fieldErrors);
  return text.length > MAX_DETAIL_CHARS ? `${text.slice(0, MAX_DETAIL_CHARS)}…` : text;
}

const USER_MESSAGES: Record<string, string> = {
  /* Legacy umbrella code, still emitted by the connector executors. */
  invalid_tool_arguments: '工具参数格式无效，已把正确格式示例反馈给模型。',
  /* The three replacements — one per actual cause, so the card says what
     went wrong instead of blaming "格式" for all of them. */
  arguments_parse_failed: '工具参数没能完整解析（传输中被截断或不是单个 JSON 对象），已请模型重发。',
  arguments_schema_failed: '工具参数缺少必填字段或类型不符，已附上字段说明请模型修正。',
  arguments_too_large: '工具参数超出单次调用上限，已请模型拆分成多次调用。',
  duplicate_tool_call: '模型重复了同一个工具调用，本次已跳过执行。',
  tool_not_available: '该工具未启用或不可用，已告知模型可用的工具。',
  unknown_tool: '该工具不存在，已告知模型可用的工具。',
  visual_spec_invalid: '可视化规格有字段不符合要求，已附上正确示例请模型修正。',
  plan_spec_invalid: '计划结构有字段不符合要求，已附上正确示例请模型修正。',
  spec_spec_invalid: '规格结构有字段不符合要求，已附上正确示例请模型修正。',
};

/** Extra model-facing line per code — what to actually change. */
const MODEL_HINTS: Record<string, string> = {
  arguments_parse_failed: 'The arguments did not parse as a single JSON object. Re-emit them as one complete JSON object — no Markdown fence, no `input`/`arguments` wrapper, no prose around it, and no second object.',
  arguments_schema_failed: 'The JSON parsed, but it does not satisfy the schema below. Fix the listed fields and keep every required one.',
  arguments_too_large: 'The arguments were too large for one call and got cut off. Send a smaller payload and split the work across several calls.',
};


/**
 * Build the correction package for one rejected tool call.
 */
export function buildToolErrorFeedback(input: ToolErrorFeedbackInput): ToolErrorFeedback {
  const { toolName, schema, errorCode, retryable } = input;
  const fieldErrors = normalizeFieldErrors(input.fieldErrors);
  const example = canonicalToolExampleJson(toolName, schema);
  const schemaText = describeToolSchema(schema);

  const lines: string[] = [`[error] ${errorCode}: the call to \`${toolName}\` was rejected before execution.`];
  if (fieldErrors) lines.push(`[fields] ${fieldErrors}`);
  /* A per-code instruction, so "wrong shape" / "too big" / "not JSON" read
     as three different problems with three different fixes. */
  const codeHint = MODEL_HINTS[errorCode];
  if (codeHint) lines.push(codeHint);
  if (input.hint) lines.push(input.hint);

  if (errorCode === 'unknown_tool' || errorCode === 'tool_not_available') {
    const available = (input.availableTools || []).filter(Boolean);
    lines.push(available.length
      ? `Callable tools for this turn: ${available.map((name) => `\`${name}\``).join(', ')}. Pick one of those exact names, or answer in prose.`
      : 'No native tools are callable for this turn. Answer in prose.');
  } else {
    if (schemaText) lines.push('', `Expected arguments for \`${toolName}\`:`, schemaText);
    if (example) {
      lines.push(
        '',
        'A correct call sends exactly this shape as the function arguments (one JSON object, no Markdown fence, no `input`/`arguments` wrapper):',
        example,
      );
    }
  }

  lines.push('', retryable
    ? 'Send one corrected call with materially different arguments, or continue in prose if the tool is not needed.'
    : 'Do not repeat this call. Explain the situation to the user in prose instead.');

  const detailParts = [fieldErrors, example ? `example: ${example}` : ''].filter(Boolean);
  return {
    modelMessage: lines.join('\n'),
    detail: detailParts.join(' | ').slice(0, MAX_DETAIL_CHARS) || errorCode,
    userMessage: USER_MESSAGES[errorCode]
      || (retryable ? '工具调用被拒绝，已请模型按正确格式重试。' : '工具调用被拒绝，本轮不再重试。'),
  };
}
