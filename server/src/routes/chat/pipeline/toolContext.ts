/**
 * toolContext — stage 2 of the chat stream pipeline.
 *
 * Assembles everything the tool-calling loop needs before the first hop:
 * the turn policy (iteration/call budgets), the user's connector
 * connection snapshots, the tool registry, the canonical name list, the
 * per-tool JSON schema accessor, and the canonical example bag. Extracted
 * verbatim from the route handler.
 */

import { eq, and } from 'drizzle-orm';
import { getDb } from '../../../db/index.js';
import { connectorConnections, projectConnectorConnections } from '../../../db/schema.js';
import { codeInterpreter } from '../../../services/codeInterpreter.js';
import { createToolRegistry } from '../../../services/toolRegistry.js';
import { canonicalToolExampleJson } from '../../../services/toolErrorFeedback.js';
import { createToolTurnPolicy } from '../../../services/toolTurnPolicy.js';
import type { JsonSchemaNode } from '../../../services/toolCallSafety.js';
import type { Request } from 'express';

export interface StreamToolContext {
  toolPolicy: ReturnType<typeof createToolTurnPolicy>;
  MAX_TOOL_ITERATIONS: number;
  toolRegistry: ReturnType<typeof createToolRegistry>;
  toolDefs: Array<Record<string, any>>;
  toolNames: string[];
  schemaForTool: (name: string) => JsonSchemaNode | null;
  toolExamples: Record<string, string>;
  FUZZY_SAFE: (name: string) => boolean;
  connectorConnectionsByProvider: Record<string, any>;
  projectConnectorConnectionsByProvider: Record<string, any>;
}

/**
 * Load the user's connector connections so the tool registry can gate
 * connector tools on whether the user has actually connected each
 * provider. arXiv is always enabled (public API).
 */
async function loadConnectorSnapshots(userId?: string): Promise<{
  connectorConnectionsByProvider: Record<string, any>;
  projectConnectorConnectionsByProvider: Record<string, any>;
}> {
  const connectorConnectionsByProvider: Record<string, any> = {};
  const projectConnectorConnectionsByProvider: Record<string, any> = {};
  if (!userId) return { connectorConnectionsByProvider, projectConnectorConnectionsByProvider };
  try {
    const db = getDb();
    const rows = await db.select().from(connectorConnections)
      .where(and(eq(connectorConnections.userId, userId), eq(connectorConnections.status, 'connected')));
    for (const row of rows) {
      connectorConnectionsByProvider[row.provider] = row;
    }
    const projectRows = await db.select().from(projectConnectorConnections)
      .where(and(eq(projectConnectorConnections.userId, userId), eq(projectConnectorConnections.status, 'connected')));
    for (const row of projectRows) projectConnectorConnectionsByProvider[row.provider] = row;
  } catch (err) {
    console.error('[chat/stream] failed to load connector connections:', (err as Error).message);
    // Non-blocking — connector tools simply won't be available.
  }
  return { connectorConnectionsByProvider, projectConnectorConnectionsByProvider };
}

export async function createStreamToolContext(req: Request & { userId?: string }, mode: string): Promise<StreamToolContext> {
  const toolPolicy = createToolTurnPolicy();
  const codeInterpreterToolDef = codeInterpreter.getToolDefinition();

  const { connectorConnectionsByProvider, projectConnectorConnectionsByProvider } =
    await loadConnectorSnapshots(req.userId);

  const toolRegistry = createToolRegistry({ codeInterpreterToolDef, mode, connectorConnectionsByProvider, projectConnectorConnectionsByProvider } as unknown as Parameters<typeof createToolRegistry>[0]);
  const toolDefs = toolRegistry.definitions as Array<Record<string, any>>;

  /* P_native-tool-contract — derive the prompt appendix from the same
   * definitions sent in the request. This keeps the injected system
   * guidance aligned with the current tool registry after additions or
   * connector changes. */
  const toolNames = toolDefs.map((tool) => (tool as { function?: { name?: string } }).function?.name || '');

  /** The `parameters` schema for a tool, used for repair and feedback. */
  const schemaForTool = (name: string): JsonSchemaNode | null => {
    const definition = toolDefs.find((tool) => (
      (tool as { function?: { name?: string } }).function?.name === name
    )) as { function?: { parameters?: JsonSchemaNode } } | undefined;
    return definition?.function?.parameters || null;
  };

  /* One canonical example per callable tool, shared by the system-prompt
   * contract and the correction text a rejected call receives, so the
   * two can never disagree. */
  const toolExamples: Record<string, string> = {};
  for (const name of toolNames) {
    if (!name) continue;
    const example = canonicalToolExampleJson(name, schemaForTool(name));
    if (example) toolExamples[name] = example;
  }

  /* Side-effecting tools never accept a fuzzy name match: acting on a
   * guess is worse than returning a correction to the model. The caller
   * applies this to the RESOLVED name — gating on the requested string
   * would let a near-miss spelling (`code_interprete`) slide into the
   * sandbox anyway. `pure` is the registry's side-effect flag and it
   * fails closed: unknown or unmarked names are not fuzzy-safe. */
  const FUZZY_SAFE = (name: string) => toolRegistry.get(name)?.pure === true;

  return {
    toolPolicy,
    MAX_TOOL_ITERATIONS: toolPolicy.maxIterations,
    toolRegistry,
    toolDefs,
    toolNames,
    schemaForTool,
    toolExamples,
    FUZZY_SAFE,
    connectorConnectionsByProvider,
    projectConnectorConnectionsByProvider,
  };
}
