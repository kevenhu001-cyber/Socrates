import { createParser, evaluate, split, tokenize, walkAST, type ASTNode, type LibraryJSONSchema } from '@openuidev/lang-core';
import { OPENUI_AST_BUDGET, openUiProgramIssues, openUiRuntimeIssues } from '../../../packages/core/src/openUiProgram.js';
import { validateVisualizationSpec } from './visualization.js';
import { OPENUI_SCHEMA } from './openUiPrompt.generated.js';

/** No React, DOM, model code evaluation or network operations on the server. */
const parser = createParser(OPENUI_SCHEMA as LibraryJSONSchema, 'Col');

/** The parser stops at the first type mismatch and reports the missing
 * arguments it could not fill. On its own that reads like "add a payload", so
 * the argument shape is spelled out once the component is named in the error. */
const VISUALIZATION_ARGUMENT_HINT = 'Visualization takes four arguments in order: the template name, a short title, the template payload and an accessibility summary. The payload is the template inner data, for example {"categories":["A"],"series":[{"name":"Values","data":[1,2]}]}. Do not pass the render_visualization envelope {version, template, title, accessibilitySummary, payload} as one object or as the payload.';

function withVisualizationArgumentHint(issues: string[]): string[] {
  const confused = issues.some((issue) => issue.includes('"component":"Visualization"')
    && (issue.includes('"/template"') || issue.includes('"/payload"') || issue.includes('"/accessibilitySummary"')));
  return confused ? [...issues, VISUALIZATION_ARGUMENT_HINT] : issues;
}

export function validateOpenUiProgram(source: string): string[] {
  return inspectOpenUiProgram(source).issues;
}

/** One Visualization(...) inside a program that the native validator rejected. */
export interface OpenUiVisualizationFailure {
  template: string | null;
  title: string | null;
  stage: string;
  issues: Array<{ path: string; message: string }>;
}

export interface OpenUiInspection {
  issues: string[];
  visualizations: Array<Record<string, unknown>>;
  /** Rejected Visualization calls, for template-specific correction hints. */
  failures: OpenUiVisualizationFailure[];
  /** Normalizer notes for accepted visualizations (truncation, gaps). */
  warnings: string[];
  /** The program ends mid-string or mid-statement (likely truncated). */
  incomplete: boolean;
  /** The parser itself threw (not just reported issues). */
  unparseable: boolean;
}

/** Parse and validate OpenUI once, returning native Visualization specs that
 * can be consumed by clients without an OpenUI runtime (for example the
 * Universal App). Dynamic values are evaluated from the program's declared
 * initial state; unresolved client-only values stay in the OpenUI document. */
export function inspectOpenUiProgram(source: string): OpenUiInspection {
  try {
    const declarations = split(tokenize(source)).map((statement) => statement.id);
    const parsed = parser.parse(source);
    const embedded = inspectEmbeddedVisualizations([parsed.root, parsed.rootExpression], parsed.stateDeclarations);
    const issues = [
      ...withVisualizationArgumentHint(openUiProgramIssues(parsed, declarations)),
      ...openUiRuntimeIssues(parsed, parsed.stateDeclarations),
      ...embedded.issues,
    ];
    const meta = (parsed as { meta?: { incomplete?: boolean } }).meta;
    return {
      issues: [...new Set(issues)].slice(0, 8),
      visualizations: issues.length === 0 ? embedded.visualizations : [],
      failures: embedded.failures,
      warnings: embedded.warnings,
      incomplete: Boolean(meta?.incomplete),
      unparseable: false,
    };
  } catch (error) {
    return {
      issues: [`OpenUI program could not be parsed (${String((error as Error)?.message || 'syntax error').slice(0, 120)}); use the supplied component signatures`],
      visualizations: [],
      failures: [],
      warnings: [],
      incomplete: looksUnterminated(source),
      unparseable: true,
    };
  }
}

/** Unclosed quote or bracket at the end of the source text. */
function looksUnterminated(source: string): boolean {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (const char of source) {
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (char === '\\') { escaped = true; continue; }
      if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
  }
  return Boolean(quote) || depth > 0;
}

/** The model sometimes hands the whole render_visualization envelope to the
 * Visualization component, either as the first argument or nested in the
 * payload. The native validator then reports a missing field inside the
 * payload, which points at the wrong thing and invites the same broken call
 * again, so the envelope shape is recognised here and named as what it is. */
function envelopeMisuse(props: Record<string, unknown>): string | null {
  const looksLikeEnvelope = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (!('payload' in record)) return false;
    return 'version' in record || 'template' in record || 'accessibilitySummary' in record;
  };
  if (looksLikeEnvelope(props.template)) {
    return 'Visualization: the first argument must be the template name as a string, for example "bar". Do not pass the render_visualization envelope {version, template, title, accessibilitySummary, payload} as one object: template, title, payload and accessibilitySummary are separate arguments.';
  }
  if (looksLikeEnvelope(props.payload)) {
    return 'Visualization: the payload argument must be the template inner data, for example {"categories":["A"],"series":[{"name":"Values","data":[1,2]}]}, not the render_visualization envelope. Pass template, title, payload and accessibilitySummary as separate arguments.';
  }
  return null;
}

/** Apply the existing visual contract to composed visuals whenever defaults are evaluable.
 * Custom client-only functions stay with the client; they are never executed here. */
function inspectEmbeddedVisualizations(root: unknown, state: Record<string, unknown>): {
  issues: string[];
  visualizations: Array<Record<string, unknown>>;
  failures: OpenUiVisualizationFailure[];
  warnings: string[];
} {
  const issues: string[] = [];
  const visualizations: Array<Record<string, unknown>> = [];
  const failures: OpenUiVisualizationFailure[] = [];
  const warnings: string[] = [];
  let budget = OPENUI_AST_BUDGET;
  const walk = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || --budget < 0 || depth > 100) return;
    const node = value as Record<string, unknown>;
    if (node.typeName === 'Visualization' || (node.k === 'Comp' && node.name === 'Visualization')) {
      const names = ['template', 'title', 'payload', 'accessibilitySummary', 'caption'];
      const props = (node.props || node.mappedProps || Object.fromEntries(names.map((name, index) => [name, (node.args as unknown[])[index]]))) as Record<string, unknown>;
      const misuse = envelopeMisuse(props);
      if (misuse) {
        issues.push(misuse);
        failures.push({ template: null, title: null, stage: 'envelope_misuse', issues: [{ path: 'Visualization', message: misuse }] });
      }
      else {
        let unresolved = false;
        const resolve = (input: unknown): unknown => {
          if (!input || typeof input !== 'object') return input;
          if (Array.isArray(input)) return input.map(resolve);
          const item = input as Record<string, unknown>;
          if (typeof item.k === 'string') {
            // Library functions run only in the client. Without that library,
            // evaluate() mistakes their mapped arguments for component props.
            let clientOnly = false;
            walkAST(input as ASTNode, (ast) => {
              if (ast.k === 'Comp' && ast.fn) clientOnly = true;
            });
            if (clientOnly) { unresolved = true; return undefined; }
            return evaluate(input as ASTNode, {
              getState: (name) => state[name],
              resolveRef: () => { unresolved = true; return undefined; },
              reportError: () => { unresolved = true; },
            });
          }
          return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, resolve(entry)]));
        };
        const spec = resolve({ version: 1, ...props });
        if (!unresolved) {
          const validation = validateVisualizationSpec(spec);
          const record = spec && typeof spec === 'object' ? spec as Record<string, unknown> : {};
          if (!validation.ok) {
            const label = typeof record.title === 'string' && record.title ? ` "${record.title.slice(0, 60)}"` : '';
            issues.push(`Visualization${label}: ${validation.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
            failures.push({
              template: validation.template ?? (typeof record.template === 'string' ? record.template : null),
              title: typeof record.title === 'string' ? record.title : null,
              stage: validation.stage,
              issues: validation.issues ?? [],
            });
          } else if (visualizations.length < 8) {
            visualizations.push(validation.spec as unknown as Record<string, unknown>);
            warnings.push(...(validation.warnings ?? []));
          }
        }
      }
    }
    for (const item of Object.values(node)) walk(item, depth + 1);
  };
  walk(root);
  return { issues: [...new Set(issues)].slice(0, 8), visualizations, failures: failures.slice(0, 8), warnings: [...new Set(warnings)].slice(0, 8) };
}
