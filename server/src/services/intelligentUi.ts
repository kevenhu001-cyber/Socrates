const TYPES = ['panel', 'stack', 'grid', 'text', 'metric', 'progress', 'divider', 'callout', 'slider', 'choice', 'toggle', 'button', 'table', 'chart', 'tabs', 'entity', 'image-gallery'];
export const INTELLIGENT_UI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'render_intelligent_ui',
    description: 'Render a small interactive UI alongside prose. Nodes have unique id/type and optional parent. Root state and bind support local controls: slider, choice, toggle and tabs. Values support {state:key}, {tool:callId,path:field}, or {op:add|sub|mul|div|round|min|max|eq|if|concat,args:[]}. Actions: set, increment, prompt, open_url. Charts use kind:bar|line and points:[{label,value}]; tables use columns and rows. Callouts and progress bars accept tone:neutral|info|success|warning|danger; metrics accept delta and trend:up|down|flat. No HTML, CSS, JS or executable handlers. Emit parents before children and write each complete node before starting the next. Keep essential conclusions in prose. After success, the surface ID is this tool call ID and revision is 0. Use patch_intelligent_ui to modify it in this turn while preserving local controls.',
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

export { validateIntelligentUi } from '../../../packages/core/src/intelligentUiValidation.js';
