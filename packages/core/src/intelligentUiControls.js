const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const key = value => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,80}$/.test(value) && !['__proto__', 'constructor', 'prototype'].includes(value);
const OPS = new Set(['add', 'sub', 'mul', 'div', 'round', 'floor', 'ceil', 'min', 'max', 'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'and', 'or', 'not', 'if', 'concat']);
const expression = value => record(value) && ((key(value.state) && Object.keys(value).length <= 2) || typeof value.tool === 'string' || (Number.isInteger(value.tool) && value.tool >= 0) || (OPS.has(value.op) && Array.isArray(value.args)));
const text = value => (typeof value === 'string' && Boolean(value.trim())) || expression(value);
const numeric = value => (typeof value === 'number' && Number.isFinite(value)) || expression(value);

/** Shared with model guidance; deliberately portable to providers without oneOf. */
export const INTELLIGENT_UI_CONTROL_GUIDANCE = 'slider/choice/toggle require a safe bind state key. Slider defaults to min:0,max:100,step:1; min < max and step > 0. Choice needs 1–8 unique {label,value} scalar options. Button needs label and action: set(key,value), increment(key,amount?), prompt(prompt), open_url(url). Table needs 1–8 columns (strings or {key,label}) and 0–24 keyed object rows; [] is an explicit empty state. Chart needs kind:bar|line and 1–50 {label,value} numeric points. Tabs needs 1–8 unique {id,label}; bind is optional; child.tab must name a tab on its tabs parent.';

/** Only coerce known numeric positions; never invent bindings, actions or data. */
export function normalizeIntelligentUiControl(raw) {
  if (!record(raw)) return raw;
  const node = { ...raw };
  for (const field of ['options', 'columns', 'rows', 'points', 'tabs']) {
    const value = node[field];
    if (record(value) && Object.keys(value).length === 1 && ('item' in value || 'items' in value)) {
      const items = value.item ?? value.items;
      node[field] = Array.isArray(items) ? items : [items];
    }
  }
  const number = value => typeof value === 'string' && value.trim() && Number.isFinite(Number(value)) ? Number(value) : value;
  if (node.type === 'slider') for (const field of ['min', 'max', 'step', 'value']) {
    if (node[field] !== undefined) node[field] = number(node[field]);
  }
  if (node.type === 'chart') {
    if (!node.kind) node.kind = 'bar';
    if (Array.isArray(node.points)) node.points = node.points.map(point => record(point) ? { ...point, value: number(point.value) } : point);
  }
  if (node.type === 'choice' && Array.isArray(node.options)) {
    node.options = node.options.map(opt => typeof opt === 'string' ? { label: opt, value: opt } : opt);
  }
  if (record(node.action)) {
    const act = { ...node.action };
    if (!act.key && typeof act.target === 'string') act.key = act.target;
    node.action = act;
  }
  return node;
}

/** Field paths are relative to the node. No model-provided values enter diagnostics. */
export function intelligentUiControlIssues(node) {
  const issues = [];
  const require = (condition, path, message) => { if (!condition) issues.push({ path, message }); };
  if (['slider', 'choice', 'toggle'].includes(node.type)) require(key(node.bind), 'bind', 'Expected a safe local state key');
  if (node.state !== undefined) require(record(node.state) && Object.keys(node.state).every(key), 'state', 'Expected an object with safe state keys');
  if (node.type === 'slider') {
    for (const field of ['min', 'max', 'step']) if (node[field] !== undefined) require(numeric(node[field]), field, 'Expected a finite number or value expression');
    const min = node.min ?? 0, max = node.max ?? 100, step = node.step ?? 1;
    if (typeof min === 'number' && typeof max === 'number') require(min < max, 'max', 'Expected max greater than min');
    if (typeof step === 'number') require(step > 0, 'step', 'Expected a positive step');
  }
  if (node.type === 'choice') {
    require(Array.isArray(node.options) && node.options.length > 0 && node.options.length <= 8, 'options', 'Expected 1–8 options');
    const seen = new Set();
    if (Array.isArray(node.options)) node.options.forEach((option, i) => {
      const valid = record(option) && ['string', 'number', 'boolean'].includes(typeof option.value) && (typeof option.value !== 'number' || Number.isFinite(option.value));
      require(valid, `options.${i}.value`, 'Expected a scalar option value');
      require(record(option) && text(option.label ?? String(option.value ?? '')), `options.${i}.label`, 'Expected a visible option label');
      if (valid) { require(!seen.has(option.value), `options.${i}.value`, 'Expected unique option values'); seen.add(option.value); }
    });
  }
  if (node.type === 'button') {
    require(text(node.label), 'label', 'Expected a visible button label');
    require(record(node.action), 'action', 'Expected a button action object: set, increment, prompt, or open_url');
  }
  if (node.type === 'button' || node.action !== undefined) {
    const action = node.action;
    require(record(action) && ['set', 'increment', 'prompt', 'open_url'].includes(action.type), 'action.type', 'Expected set, increment, prompt or open_url');
    if (record(action)) {
      if (['set', 'increment'].includes(action.type)) require(key(action.key), 'action.key', 'Expected a safe local state key');
      if (action.type === 'set') require('value' in action, 'action.value', 'Expected a value');
      if (action.type === 'increment' && action.amount !== undefined) require(numeric(action.amount), 'action.amount', 'Expected a finite number or value expression');
      if (action.type === 'prompt') require(text(action.prompt), 'action.prompt', 'Expected prompt content');
      if (action.type === 'open_url') {
        let safe = false;
        try { const url = new URL(action.url); safe = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password; } catch { /* Invalid URLs are rejected. */ }
        require(safe, 'action.url', 'Expected an absolute credential-free HTTP(S) URL');
      }
    }
  }
  if (node.type === 'table') {
    require(Array.isArray(node.columns) && node.columns.length > 0 && node.columns.length <= 8, 'columns', 'Expected 1–8 columns');
    const seen = new Set();
    if (Array.isArray(node.columns)) node.columns.forEach((column, i) => {
      const id = typeof column === 'string' ? column : record(column) ? column.key : null;
      require(typeof id === 'string' && Boolean(id.trim()) && id.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(id) && !seen.has(id), `columns.${i}`, 'Expected a unique nonempty column key'); seen.add(id);
    });
    require(Array.isArray(node.rows) && node.rows.length <= 24 && node.rows.every(record), 'rows', 'Expected 0–24 keyed object rows; [] explicitly means no data');
  }
  if (node.type === 'chart') {
    if (node.kind !== undefined) require(['bar', 'line'].includes(node.kind), 'kind', 'Expected bar or line');
    require(Array.isArray(node.points) && node.points.length > 0 && node.points.length <= 50, 'points', 'Expected 1–50 points');
    if (Array.isArray(node.points)) node.points.forEach((point, i) => require(record(point) && numeric(point.value), `points.${i}.value`, 'Expected a finite number or value expression'));
  }
  if (node.type === 'tabs') {
    require(Array.isArray(node.tabs) && node.tabs.length > 0 && node.tabs.length <= 8, 'tabs', 'Expected 1–8 tabs');
    const seen = new Set();
    if (Array.isArray(node.tabs)) node.tabs.forEach((tab, i) => {
      require(record(tab) && key(tab.id) && !seen.has(tab.id) && text(tab.label ?? tab.id), `tabs.${i}`, 'Expected a unique safe id and visible label');
      if (record(tab)) seen.add(tab.id);
    });
    if (node.bind !== undefined) require(key(node.bind), 'bind', 'Expected a safe local state key');
  }
  if (node.type === 'text') {
    require(text(node.text ?? node.value), 'text', 'Expected visible text content');
  }
  if (node.type === 'callout') {
    require(text(node.text ?? node.title), 'text', 'Expected callout text or title');
  }
  if (node.type === 'metric') {
    require(node.value !== undefined || node.label !== undefined, 'value', 'Expected metric value or label');
  }
  if (node.type === 'progress') {
    require(node.value !== undefined, 'value', 'Expected progress value');
  }
  if (node.type === 'entity') {
    require(
      text(node.title ?? node.description ?? node.subtitle) ||
      (typeof node.image === 'string' && Boolean(node.image.trim())) ||
      (Array.isArray(node.fields) && node.fields.length > 0),
      'title',
      'Expected entity title, description, image, or fields',
    );
  }
  if (node.type === 'image-gallery') {
    require(Array.isArray(node.images) && node.images.length > 0 && node.images.length <= 8, 'images', 'Expected 1–8 gallery images');
  }
  return issues;
}
