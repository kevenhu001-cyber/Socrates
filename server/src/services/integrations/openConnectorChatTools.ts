/* Handwritten validation and execution for OpenConnector chat tools.
 *
 * The reviewed catalog (319 entries) lives in
 * openConnectorChatToolCatalog.ts; this module owns only argument checks and
 * the OOMOL-hosted execution call. Regenerating the catalog must not touch
 * this file.
 */
import {
  connectorErrorPayload,
  externalUserId,
  getProjectConnector,
} from './oomolProjectConnector.js';
import { getOpenConnectorChatTool } from './openConnectorChatToolCatalog.js';

/* ---- Handwritten: argument validation and execution ----
 * Everything below this banner is handwritten. The generator only emits the
 * table above (up to getOpenConnectorChatTool); regenerating the table must
 * preserve this section.
 *
 * Validation mirrors the project-connector policy: the model only ever sends
 * known top-level fields, required fields must be present, and payloads are
 * size-capped. The OOMOL-hosted runtime enforces the full provider JSON
 * schema afterwards.
 */

/** Unknown actions are not safe to retry because their side effects are unknown. */
export function isOpenConnectorActionRetryable(toolName: unknown): boolean {
  const spec = getOpenConnectorChatTool(toolName);
  return Boolean(spec) && spec?.retryableOnTransientError !== false;
}

const MAX_ARG_JSON_BYTES = 16_384;
const MAX_STRING_VALUE_LENGTH = 2000;
const MAX_ARG_DEPTH = 4;
const MAX_OUTPUT_CHARS = 12_000;

function argumentDepth(value: unknown, depth = 0): number {
  if (depth > MAX_ARG_DEPTH) return depth;
  if (Array.isArray(value)) {
    return value.reduce((max: number, item: unknown) => Math.max(max, argumentDepth(item, depth + 1)), depth);
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce((max: number, item: unknown) => Math.max(max, argumentDepth(item, depth + 1)), depth);
  }
  return depth;
}

function stringsWithinLimit(value: unknown): boolean {
  if (typeof value === 'string') return value.length <= MAX_STRING_VALUE_LENGTH;
  if (Array.isArray(value)) return (value as unknown[]).every(stringsWithinLimit);
  if (value && typeof value === 'object') return Object.values(value as Record<string, unknown>).every(stringsWithinLimit);
  return true;
}

export function validateOpenConnectorToolArguments(toolName: unknown, args: unknown):
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; error: string } {
  const spec = getOpenConnectorChatTool(toolName);
  if (!spec) return { ok: false, error: 'unknown_openconnector_tool' };
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { ok: false, error: 'arguments must be an object' };
  }
  const input = args as Record<string, unknown>;
  const params = (spec.parameters || {}) as { properties?: Record<string, unknown>; required?: unknown };
  const properties = params.properties && typeof params.properties === 'object' ? Object.keys(params.properties) : [];
  for (const key of Object.keys(input)) {
    if (properties.length > 0 && !properties.includes(key)) {
      return { ok: false, error: `unknown argument: ${key}` };
    }
  }
  const required = Array.isArray(params.required)
    ? params.required.filter((key: unknown): key is string => typeof key === 'string')
    : [];
  for (const key of required) {
    const value = input[key];
    if (value === undefined || value === null || value === '') {
      return { ok: false, error: `missing required argument: ${key}` };
    }
  }
  for (const [key, value] of Object.entries(input)) {
    const rawSchema = params.properties?.[key];
    if (!rawSchema || typeof rawSchema !== 'object' || Array.isArray(rawSchema)) continue;
    const schema = rawSchema as { type?: unknown; minLength?: unknown; maxLength?: unknown };
    if (schema.type !== 'string') continue;
    if (typeof value !== 'string') return { ok: false, error: `argument ${key} must be a string` };
    const minLength = typeof schema.minLength === 'number' ? schema.minLength : 0;
    const maxLength = typeof schema.maxLength === 'number' ? schema.maxLength : Number.POSITIVE_INFINITY;
    if (value.length < minLength) return { ok: false, error: `argument ${key} is too short` };
    if (value.length > maxLength) return { ok: false, error: `argument ${key} is too long` };
  }
  if (spec.actionId === 'jimeng_ai.submit_image_generation_4_6'
    && typeof input.prompt === 'string' && input.prompt.trim().length === 0) {
    return { ok: false, error: 'argument prompt must not be blank' };
  }
  if (!stringsWithinLimit(input)) return { ok: false, error: 'an argument value is too long' };
  if (argumentDepth(input) > MAX_ARG_DEPTH) return { ok: false, error: 'arguments are nested too deeply' };
  if (JSON.stringify(input).length > MAX_ARG_JSON_BYTES) return { ok: false, error: 'arguments payload is too large' };
  return { ok: true, args: input };
}

export async function executeOpenConnectorTool(
  toolName: string,
  args: Record<string, unknown>,
  userId: string,
  connection: { status?: string; connectionName?: string | null; connectedAccountId?: string | null } | null,
) {
  const validated = validateOpenConnectorToolArguments(toolName, args);
  if (!validated.ok) {
    return {
      status: 'failed',
      errorCode: 'invalid_tool_arguments',
      error: validated.error,
      userMessage: '工具参数无效，请按要求重新生成。',
    };
  }
  const spec = getOpenConnectorChatTool(toolName);
  if (!spec || !connection || connection.status !== 'connected') {
    return { status: 'failed', errorCode: 'app_not_connected', error: 'The required app is not connected.', userMessage: 'Connect this app in Plugin Center first.' };
  }
  const project = getProjectConnector();
  if (!project) {
    return { status: 'failed', errorCode: 'project_connector_not_configured', error: 'OOMOL ProjectConnector is not configured.', userMessage: 'The connector service is not configured yet.' };
  }
  try {
    /* The OOMOL-hosted runtime owns provider credentials and action execution;
     * the connection row carries the opaque connectionName/connectedAccountId
     * recorded when the user linked the app. */
    const data = await project.execute(externalUserId(userId), spec.actionId, validated.args, {
      connectionName: connection.connectionName || 'socrates',
      connectedAccountId: connection.connectedAccountId || undefined,
      // Retryability is classified by the chat pipeline; the SDK's default
      // retries could duplicate non-idempotent actions.
      retries: 0,
    });
    const output = JSON.stringify(data);
    return {
      status: 'completed',
      output: output.length > MAX_OUTPUT_CHARS ? `${output.slice(0, MAX_OUTPUT_CHARS)}…[truncated]` : output,
    };
  } catch (error) {
    const payload = connectorErrorPayload(error);
    return {
      status: 'failed',
      errorCode: payload.code,
      error: payload.message,
      retryable: spec.retryableOnTransientError !== false && payload.retryable,
      userMessage: 'The connected app could not complete that request.',
    };
  }
}
