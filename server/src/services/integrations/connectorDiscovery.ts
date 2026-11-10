/**
 * Connector discovery tools.
 *
 * The model sees these two small tools instead of every connected connector.
 * `search_connectors` ranks the connected catalog against the request;
 * `get_connector_spec` returns the exact argument schema, a copy-ready
 * example, and activates that one tool for the next hop.
 */

import { canonicalToolExampleJson, describeToolSchema } from '../tools/toolErrorFeedback.js';
import type { ConnectorCatalog, ConnectorCatalogEntry, ConnectorMatch } from './connectorCatalog.js';

export const SEARCH_CONNECTORS_TOOL = {
  type: 'function' as const,
  function: {
    name: 'search_connectors',
    description:
      'Search the user\'s connected apps for a tool that can answer the request. Returns matching tool names, the connected service, and a short description. Use this instead of guessing a connector tool name. After choosing a result, call get_connector_spec with the exact tool name to read its arguments; that tool becomes callable on the next step.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          minLength: 1,
          maxLength: 300,
          description: 'What the user wants to do, using the app name and action in English when possible, e.g. "calendar events", "gmail search", "github repos", "notion pages". Common Chinese app names are also matched.',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 20,
          description: 'Maximum matches to return (default 8).',
        },
      },
    },
  },
};

export const GET_CONNECTOR_SPEC_TOOL = {
  type: 'function' as const,
  function: {
    name: 'get_connector_spec',
    description:
      'Read the exact argument schema and usage guidance for one connector tool returned by search_connectors. Call this before the first call to that tool. The tool becomes callable on the next step.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['tool'],
      properties: {
        tool: {
          type: 'string',
          minLength: 1,
          maxLength: 200,
          description: 'Exact tool name from search_connectors.',
        },
      },
    },
  },
};

function shortDescription(description: string): string {
  const text = String(description || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 320) return text;
  return `${text.slice(0, 317)}...`;
}

export function formatConnectorSearchResult(
  catalog: ConnectorCatalog,
  query: string,
  matches: ConnectorMatch[],
): string {
  const services = catalog.services.length ? catalog.services.join(', ') : 'none';
  if (!matches.length) {
    return [
      `No connector matched "${query}".`,
      `Connected services: ${services}.`,
      'A broader query with the app name and the action may match, for example "gmail search", "calendar events", "github repos", or "notion pages".',
    ].join('\n');
  }
  const lines = matches.map((match, index) => (
    `${index + 1}. ${match.tool} (${match.service}) - ${shortDescription(match.description)}`
  ));
  return [
    `Matching connector tools (${matches.length}):`,
    ...lines,
    '',
    'Specs for these tools are available via get_connector_spec; the selected tool becomes callable on the next step.',
    `Connected services: ${services}.`,
  ].join('\n');
}

export function formatConnectorSpec(entry: ConnectorCatalogEntry): string {
  const schema = describeToolSchema(entry.parameters as never);
  const example = canonicalToolExampleJson(entry.tool, entry.parameters as never);
  return [
    `[connector: ${entry.tool}]`,
    `[service: ${entry.service}]`,
    `[family: ${entry.family}]`,
    shortDescription(entry.description),
    '',
    'Arguments:',
    schema || '(no arguments)',
    ...(example ? ['', `Example: ${example}`] : []),
    '',
    'The tool is now callable on the next step; its exact JSON schema is also supplied in that step\'s tools list.',
  ].join('\n');
}
