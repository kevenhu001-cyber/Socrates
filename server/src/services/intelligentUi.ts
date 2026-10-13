const TYPES = ['panel', 'stack', 'grid', 'text', 'metric', 'progress', 'divider', 'callout', 'slider', 'choice', 'button', 'table', 'chart', 'tabs', 'entity', 'image-gallery'];
export const INTELLIGENT_UI_TOOL = {
  type: 'function' as const,
  function: {
    name: 'render_intelligent_ui',
    description: 'Render a small interactive UI alongside prose. Nodes have unique id/type and optional parent. Root state and bind support local controls. Values support {state:key}, {tool:callId,path:field}, or {op:add|sub|mul|div|round|min|max|eq|if|concat,args:[]}. Actions: set, increment, prompt, open_url. Charts use kind:bar|line and points:[{label,value}]; tables use columns and rows. No HTML, CSS, JS or executable handlers. Keep essential conclusions in prose.',
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
              bind: { type: 'string', description: 'State key changed by slider/choice/tabs controls.' },
              min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
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

/** Bound complexity and reject unsafe data before it is stored or rendered. */
export function validateIntelligentUi(value: unknown): { ok: true } | { ok: false; error: string } {
  if (!value || typeof value !== 'object') return { ok: false, error: 'Expected version and nodes' };
  const document = value as Record<string, unknown>;
  if (document.version !== 1 || !Array.isArray(document.nodes) || !document.nodes.length || document.nodes.length > 80) return { ok: false, error: 'Expected version 1 and 1–80 nodes' };
  let budget = 10000;
  const unsafe = (data: unknown, depth = 0): boolean => {
    if (--budget < 0 || depth > 16) return true;
    if (!data || typeof data !== 'object') return false;
    return Object.entries(data).some(([key, item]) => {
      if (['__proto__', 'prototype', 'constructor', 'html', 'css', 'javascript', 'onClick'].includes(key)) return true;
      if (['src', 'url', 'image', 'href'].includes(key) && typeof item === 'string' && !safeUiUrl(item)) return true;
      return unsafe(item, depth + 1);
    });
  };
  if (unsafe(document.nodes)) return { ok: false, error: 'Unsafe or overly complex UI data' };
  if (JSON.stringify(document.nodes).length > 60000) return { ok: false, error: 'UI document too large' };
  const nodes = document.nodes as Array<Record<string, unknown>>;
  const ids = new Set<string>();
  for (const node of nodes) {
    if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !safeId(node.id)
        || typeof node.type !== 'string' || !TYPES.includes(node.type) || ids.has(node.id)
        || (node.parent !== undefined && (typeof node.parent !== 'string' || !safeId(node.parent)))) {
      return { ok: false, error: 'Invalid or duplicate node id/type' };
    }
    ids.add(node.id);
  }
  const byId = new Map(nodes.map((node) => [node.id as string, node]));
  for (const node of nodes) {
    const seen = new Set<unknown>([node.id]);
    let parent = node.parent;
    while (parent) {
      if (typeof parent !== 'string' || !byId.has(parent) || seen.has(parent)) return { ok: false, error: 'Invalid or cyclic parent' };
      seen.add(parent);
      parent = byId.get(parent as string)?.parent;
    }
  }
  return { ok: true };
}

function safeId(value: string): boolean {
  return value.length > 0 && value.length <= 80 && /^[A-Za-z0-9._:-]+$/.test(value)
    && !['__proto__', 'prototype', 'constructor'].includes(value);
}

function safeUiUrl(value: string): boolean {
  if (value.length > 2048) return false;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}
