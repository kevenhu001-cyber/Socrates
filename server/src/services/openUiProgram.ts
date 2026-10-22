import { createParser, evaluate, split, tokenize, type ASTNode, type LibraryJSONSchema } from '@openuidev/lang-core';
import { openUiProgramIssues, openUiRuntimeIssues } from '../../../packages/core/src/openUiProgram.js';
import { validateVisualizationSpec } from './visualization.js';
import { OPENUI_SCHEMA } from './openUiPrompt.generated.js';

/** No React, DOM, model code evaluation or network operations on the server. */
const parser = createParser(OPENUI_SCHEMA as LibraryJSONSchema, 'Col');
export function validateOpenUiProgram(source: string): string[] {
  try {
    const declarations = split(tokenize(source)).map((statement) => statement.id);
    const parsed = parser.parse(source);
    return [...openUiProgramIssues(parsed, declarations), ...openUiRuntimeIssues(parsed, parsed.stateDeclarations), ...embeddedVisualizationIssues([parsed.root, parsed.rootExpression], parsed.stateDeclarations)];
  } catch {
    return ['OpenUI program could not be parsed; use the supplied component signatures'];
  }
}

/** Apply the existing visual contract to composed visuals whenever defaults are evaluable.
 * Custom client-only functions stay with the client; they are never executed here. */
function embeddedVisualizationIssues(root: unknown, state: Record<string, unknown>): string[] {
  const issues: string[] = [];
  let budget = 20000;
  const walk = (value: unknown, depth = 0): void => {
    if (!value || typeof value !== 'object' || --budget < 0 || depth > 100) return;
    const node = value as Record<string, unknown>;
    if (node.typeName === 'Visualization' || (node.k === 'Comp' && node.name === 'Visualization')) {
      const names = ['template', 'title', 'payload', 'accessibilitySummary', 'caption'];
      const props = (node.props || node.mappedProps || Object.fromEntries(names.map((name, index) => [name, (node.args as unknown[])[index]]))) as Record<string, unknown>;
      let unresolved = false;
      const resolve = (input: unknown): unknown => {
        if (!input || typeof input !== 'object') return input;
        if (Array.isArray(input)) return input.map(resolve);
        const item = input as Record<string, unknown>;
        if (typeof item.k === 'string') return evaluate(input as ASTNode, {
          getState: (name) => state[name],
          resolveRef: () => { unresolved = true; return undefined; },
          reportError: () => { unresolved = true; },
        });
        return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, resolve(entry)]));
      };
      const spec = resolve({ version: 1, ...props });
      if (!unresolved) {
        const validation = validateVisualizationSpec(spec);
        if (!validation.ok) issues.push(`Visualization: ${validation.issues?.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`);
      }
    }
    for (const item of Object.values(node)) walk(item, depth + 1);
  };
  walk(root);
  return [...new Set(issues)].slice(0, 8);
}
