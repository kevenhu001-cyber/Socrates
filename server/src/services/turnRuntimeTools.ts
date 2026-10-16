/** Native tools target the current turn's server-owned evidence and UI. */
export const CITE_SOURCES_TOOL = {
  type: 'function' as const,
  function: {
    name: 'cite_sources',
    description: 'Attach verified source references to claims already written in this answer. First write the factual prose, then call this tool with exact quotes and source IDs returned by web_search/web_fetch. Do not write numerical citation markers yourself. Each quote must uniquely match visible prose; for repeated quotes supply the zero-based occurrence. The UI renders inline references and a Sources list. Search snippets are not proof of an entire page: open a source when its context matters.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['claims'],
      properties: { claims: { type: 'array', minItems: 1, maxItems: 20, items: {
        type: 'object', additionalProperties: false, required: ['quote', 'sourceIds'],
        properties: { quote: { type: 'string', minLength: 1, maxLength: 2000 }, sourceIds: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } }, occurrence: { type: 'integer', minimum: 0, maximum: 1000 } },
      } } },
    },
  },
};

export const PATCH_INTELLIGENT_UI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'patch_intelligent_ui',
    description: 'Update a committed render_intelligent_ui surface in this turn without replacing its controls or local state. surfaceId is the render tool call ID; initial revision is 0, then use the returned revision. Apply an atomic list of add, patch, remove operations. patch changes props only, preserving id/type/parent. remove also removes descendants. Keep at least one valid node. A stale revision or unsafe operation rejects the whole transaction. Never use this tool to execute HTML, CSS or JS.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['surfaceId', 'revision', 'operations'],
      properties: {
        surfaceId: { type: 'string', minLength: 1, maxLength: 200 }, revision: { type: 'integer', minimum: 0 },
        operations: { type: 'array', minItems: 1, maxItems: 40, items: {
          type: 'object', required: ['op'], additionalProperties: false,
          properties: { op: { type: 'string', enum: ['add', 'patch', 'remove'] }, nodeId: { type: 'string' }, props: { type: 'object' }, node: { type: 'object' } },
        } },
      },
    },
  },
};
