import { validateIntelligentUi as validateEnvelope } from '../../../packages/core/src/intelligentUiValidation.js';
import { validateOpenUiProgram } from './openUiProgram.js';
import { OPENUI_TOOL_GUIDANCE } from './openUiPrompt.generated.js';
const TYPES = ['panel', 'stack', 'grid', 'text', 'metric', 'progress', 'divider', 'callout', 'slider', 'choice', 'toggle', 'button', 'table', 'chart', 'tabs', 'entity', 'image-gallery', 'openui'];
export const INTELLIGENT_UI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'render_intelligent_ui',
    description: 'Render a small interactive UI alongside prose. Nodes have unique id/type and optional parent. Root state and bind support local controls: slider, choice, toggle and tabs. Values support {state:key}, {tool:callId,path:field}, or {op:add|sub|mul|div|round|min|max|eq|if|concat,args:[]}. Actions: set, increment, prompt, open_url. Charts use kind:bar|line and points:[{label,value}]; tables use columns and rows. Callouts and progress bars accept tone:neutral|info|success|warning|danger; metrics accept delta and trend:up|down|flat. For working tools and richer layouts, prefer one openui node with source in OpenUI Lang 1.0 (see source property). Existing native nodes remain supported. No HTML, CSS, JS or executable handlers. Emit parents before children and write each complete node before starting the next. Keep essential conclusions in prose. After success, the surface ID is this tool call ID and revision is 0. Use patch_intelligent_ui to modify it in this turn while preserving local controls.',
    parameters: {
      type: 'object', additionalProperties: false, required: ['version', 'nodes'],
      properties: {
        version: { type: 'integer', enum: [1] },
        nodes: {
          type: 'array', minItems: 1, maxItems: 80,
          items: {
            type: 'object', required: ['id', 'type'],
            properties: {
              id: { type: 'string', minLength: 1, maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' },
              type: { type: 'string', enum: TYPES },
              parent: { type: 'string', maxLength: 80, pattern: '^[A-Za-z0-9._:-]+$' },
              source: { type: 'string', maxLength: 50000, description: OPENUI_TOOL_GUIDANCE },
              title: { description: 'Plain text or local value expression.' },
              description: { description: 'Plain text or local value expression.' },
              text: { description: 'Text node or callout content, plain text or expression.' },
              label: { description: 'Accessible control, metric or progress label.' },
              value: { description: 'Literal scalar or {state:key}, {tool:callId,path:field}, {op,args} expression.' },
              prefix: { type: 'string' }, suffix: { type: 'string' },
              displayValue: { description: 'Optional formatted control or progress value.' },
              state: { type: 'object', description: 'Initial local state on a root node. Use safe keys.' },
              bind: { type: 'string', description: 'State key changed by slider/choice/toggle/tabs controls.' },
              min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
              checked: { type: 'boolean', description: 'Toggle value when root state declares no default.' },
              tone: { type: 'string', enum: ['neutral', 'info', 'success', 'warning', 'danger'], description: 'Callout or progress emphasis.' },
              delta: { description: 'Metric change, literal or expression.' },
              trend: { type: 'string', enum: ['up', 'down', 'flat'], description: 'Metric direction; inferred from delta when omitted.' },
              caption: { type: 'string', description: 'Table caption for assistive technology.' },
              when: { description: 'Boolean or value expression controlling visibility.' },
              columns: { description: 'Grid: number of columns. Table: [{key,label}].' },
              rows: { type: 'array', maxItems: 50, description: 'Table rows, keyed by column keys.' },
              kind: { type: 'string', enum: ['bar', 'line'], description: 'Chart style.' },
              points: { type: 'array', maxItems: 50, description: 'Chart values: [{label,value}].' },
              options: { type: 'array', maxItems: 8, description: 'Choice options: [{label,value}].' },
              tabs: { type: 'array', maxItems: 8, description: 'Tabs: [{id,label}].' },
              tab: { type: 'string', description: 'Child of tabs: the tab id that owns it.' },
              fields: { type: 'array', maxItems: 20, description: 'Entity fields: [{label,value}].' },
              image: { type: 'string', description: 'Absolute credential-free HTTP(S) image URL.' },
              images: { type: 'array', maxItems: 8, description: 'Gallery images: [{src,alt,caption}]. HTTP(S) only.' },
              actionLabel: { type: 'string' }, primary: { type: 'boolean' },
              action: { type: 'object', description: 'Button/entity action: {type:set,key,value}, {type:increment,key,amount}, {type:prompt,prompt}, {type:open_url,url}.' },
            },
            additionalProperties: true,
          },
        },
      },
    },
  },
};

export function validateIntelligentUi(value: unknown): { ok: true } | { ok: false; error: string } {
  const envelope = validateEnvelope(value);
  if (!envelope.ok) return envelope;
  for (const node of (value as { nodes: Array<{ id: string; type: string; source?: string; action?: { type?: string; key?: string; prompt?: unknown; url?: unknown } }> }).nodes) {
    if (node.type === 'button' || node.action) {
      const action = node.action;
      if (!action || !['set', 'increment', 'prompt', 'open_url'].includes(action.type || '')) return { ok: false, error: `UI ${node.id}: supply a supported explicit button action` };
      if (['set', 'increment'].includes(action.type!) && (typeof action.key !== 'string' || !/^[A-Za-z0-9._:-]{1,80}$/.test(action.key) || ['__proto__', 'constructor', 'prototype'].includes(action.key))) return { ok: false, error: `UI ${node.id}: local actions need a safe state key` };
      if (action.type === 'set' && !('value' in action)) return { ok: false, error: `UI ${node.id}: set action needs a value` };
      if (action.type === 'prompt' && !action.prompt) return { ok: false, error: `UI ${node.id}: prompt action needs prompt content` };
      if (action.type === 'open_url' && !action.url) return { ok: false, error: `UI ${node.id}: open_url action needs a URL` };
    }
    if (node.type !== 'openui') continue;
    const issues = validateOpenUiProgram(node.source!);
    if (issues.length) return { ok: false, error: `OpenUI ${node.id}: ${issues.join('; ')}` };
  }
  return { ok: true };
}
