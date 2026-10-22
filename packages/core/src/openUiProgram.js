/** Shared, DOM-free checks on parser data. No generated code is executed here. */
export function openUiProgramIssues(parsed, declarations) {
  const issues = new Set();
  const declared = new Set(declarations);
  const record = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!record(parsed) || !record(parsed.meta)) return ['No parsed OpenUI document'];
  const meta = parsed.meta;
  if (!parsed.root && !parsed.rootExpression) issues.add('Define root as a Col component');
  if (meta.incomplete) issues.add('Complete all strings, brackets and statements');
  if (meta.unresolved?.length) issues.add(`Undefined references: ${meta.unresolved.join(', ')}`);
  for (const error of meta.errors ?? []) issues.add(JSON.stringify(error));
  if ([parsed.queryStatements, parsed.mutationStatements].some((v) => v?.length)) issues.add('Query and Mutation are not available; use supplied data');
  const bindings = { Input: 'value', TextArea: 'value', Select: 'value', Slider: 'value', Checkbox: 'checked', RadioGroup: 'value', SegmentedControl: 'value', DatePicker: 'value', Timer: 'seconds' };
  const layouts = new Set(['Col', 'Row', 'Grid', 'Box', 'Card', 'Form', 'Carousel']);
  const live = new Set();
  const inputs = new Set();
  const writes = new Map();
  let budget = 20000;
  const visit = (value, callback, depth = 0) => {
    if (--budget < 0 || depth > 100) { issues.add('OpenUI program is too complex'); return; }
    if (!value || typeof value !== 'object') return;
    callback(value);
    for (const item of Object.values(value)) visit(item, callback, depth + 1);
  };
  const refs = (value) => {
    const found = new Set();
    visit(value, (node) => { if (node.k === 'StateRef') found.add(node.n); });
    return found;
  };
  const consume = (value) => { for (const name of refs(value)) live.add(name); };
  const write = (target, dependencies) => {
    if (target?.k !== 'StateRef') { issues.add('Local actions must target a declared $state variable'); return; }
    const previous = writes.get(target.n) ?? new Set();
    for (const name of refs(dependencies)) previous.add(name);
    writes.set(target.n, previous);
  };
  const action = (value) => {
    if (!record(value)) return false;
    if (value.k === 'Comp') {
      const args = value.args ?? [];
      if (value.name === 'Action' && args[0]?.k === 'Arr') return args[0].els.length > 0 && args[0].els.map(action).every(Boolean);
      if (value.name === 'Set' && args.length === 2) { write(args[0], args[1]); return true; }
      if (value.name === 'Reset' && args.length > 0) { args.forEach((target) => write(target, null)); return true; }
      if (['ToAssistant', 'OpenUrl'].includes(value.name) && args.length > 0) { consume(args); return true; }
      return false;
    }
    if (['continue_conversation', 'open_url'].includes(value.type)) { consume(value); return true; }
    return false;
  };
  const hasSubmit = (value) => {
    let found = false;
    visit(value, (node) => { if ((node.k === 'Comp' && node.name === 'ToAssistant') || node.type === 'continue_conversation') found = true; });
    return found;
  };
  const walk = (value, submitted = false, depth = 0) => {
    if (--budget < 0 || depth > 100) { issues.add('OpenUI program is too complex'); return; }
    if (Array.isArray(value)) { value.forEach((item) => walk(item, submitted, depth + 1)); return; }
    if (!record(value)) return;
    if (value.k === 'Ternary') consume(value.cond);
    if (value.k === 'StateRef' && !declared.has(value.n)) issues.add(`Declare ${value.n} before using it`);
    const element = value.type === 'element';
    const name = element ? value.typeName : value.k === 'Comp' ? value.name : null;
    const props = element ? value.props : value.mappedProps;
    if (name && (record(props) || (value.k === 'Comp' && (bindings[name] || name === 'Button')))) {
      const fields = props ?? (name === 'Button' ? { label: value.args[0], action: value.args[1] } : { [bindings[name]]: value.args[0] });
      if (value.partial) issues.add('Complete every component');
      if (name === 'Form') submitted = hasSubmit(fields);
      if (name === 'Button') {
        if (fields.disabled !== true && !action(fields.action)) issues.add('Button requires an explicit action: @Set, @Reset, @ToAssistant or @OpenUrl');
        consume(fields.label);
      } else if (bindings[name]) {
        const binding = fields[bindings[name]];
        if (binding?.k !== 'StateRef') issues.add(`${name}.${bindings[name]} must bind to a declared $state variable`);
        else {
          inputs.add(binding.n);
          if (submitted || name === 'Timer' || (name === 'Checkbox' && fields.lineThrough === true)) live.add(binding.n);
        }
        // Labels may themselves be reactive outputs; the editable value is not.
        for (const [key, item] of Object.entries(fields)) if (key !== bindings[name]) consume(item);
      } else if (!layouts.has(name)) consume(fields);
      else for (const [key, item] of Object.entries(fields)) if (key !== 'children') consume(item);
    }
    for (const item of Object.values(value)) walk(item, submitted, depth + 1);
  };
  walk(parsed.root);
  walk(parsed.rootExpression);
  // A button can compute a result from inputs; follow that dependency backwards.
  for (let pass = 0; pass <= writes.size; pass++) {
    const before = live.size;
    for (const [target, dependencies] of writes) if (live.has(target)) for (const name of dependencies) live.add(name);
    if (before === live.size) break;
  }
  for (const name of inputs) if (!live.has(name)) issues.add(`${name} has no result binding: connect this input to displayed content or an explicit Form submission`);
  for (const name of writes.keys()) if (!live.has(name)) issues.add(`Action updates ${name}, but no displayed result or submitted field uses it`);
  return [...issues].slice(0, 12);
}

/** Invalid numbers must not silently turn a generated tool into an empty result. */
export function openUiStateIssue(state) {
  let budget = 10000;
  const inspect = (value, path, depth = 0) => {
    if (--budget < 0 || depth > 32) return 'Local tool state is too complex';
    if (typeof value === 'number' && !Number.isFinite(value)) return `${path} is not a finite number; guard invalid inputs and division by zero`;
    if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value)) {
        const issue = inspect(item, `${path}.${key}`, depth + 1);
        if (issue) return issue;
      }
    }
    return null;
  };
  return inspect(state, 'state');
}

/** Diagnose arithmetic in active output/action branches instead of accepting SDK fallbacks. */
export function openUiRuntimeIssues(parsed, state) {
  const issues = new Set();
  const stateIssue = openUiStateIssue(state);
  if (stateIssue) issues.add(stateIssue);
  const unknown = Symbol('unknown');
  let budget = 20000;
  const read = (node, depth = 0) => {
    if (--budget < 0 || depth > 100) return unknown;
    if (!node || typeof node !== 'object') return node;
    if (['Str', 'Num', 'Bool'].includes(node.k)) return node.v;
    if (node.k === 'Null') return null;
    if (node.k === 'StateRef') return Object.hasOwn(state, node.n) ? state[node.n] : unknown;
    if (node.k === 'UnaryOp') {
      const value = read(node.operand, depth + 1);
      return value === unknown ? unknown : node.op === '!' ? !value : node.op === '-' ? -Number(value) : Number(value);
    }
    if (node.k === 'Ternary') {
      const condition = read(node.cond, depth + 1);
      return condition === unknown ? unknown : read(condition ? node.then : node.else, depth + 1);
    }
    if (node.k !== 'BinOp') return unknown;
    const left = read(node.left, depth + 1);
    if (left === unknown) return unknown;
    if (node.op === '&&' && !left) return left;
    if (node.op === '||' && left) return left;
    const right = read(node.right, depth + 1);
    if (right === unknown) return unknown;
    let result;
    switch (node.op) {
      case '+': result = typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : Number(left) + Number(right); break;
      case '-': result = Number(left) - Number(right); break;
      case '*': result = Number(left) * Number(right); break;
      case '/': case '%':
        if (Number(right) === 0) { issues.add('Division or remainder by zero: guard the operation and show an input error instead of a fabricated result'); return unknown; }
        result = node.op === '/' ? Number(left) / Number(right) : Number(left) % Number(right); break;
      case '==': case '===': return left === right;
      case '!=': case '!==': return left !== right;
      case '>': return left > right;
      case '>=': return left >= right;
      case '<': return left < right;
      case '<=': return left <= right;
      case '&&': return right;
      case '||': return right;
      default: return unknown;
    }
    if (typeof result === 'number' && !Number.isFinite(result)) issues.add('Computed expression is not a finite number; validate numeric inputs and bounds');
    return result;
  };
  const walk = (node, depth = 0) => {
    if (--budget < 0 || depth > 100 || !node || typeof node !== 'object') return;
    if (['BinOp', 'UnaryOp'].includes(node.k)) { read(node, depth + 1); return; }
    if (node.k === 'Ternary') {
      const condition = read(node.cond, depth + 1);
      if (condition !== unknown) walk(condition ? node.then : node.else, depth + 1);
      return;
    }
    if (node.type === 'element' && node.typeName === 'Button' && read(node.props?.disabled) === true) return;
    if (node.k === 'Comp' && node.name === 'Button' && read(node.mappedProps?.disabled ?? node.args?.[6]) === true) return;
    for (const value of Object.values(node)) walk(value, depth + 1);
  };
  walk(parsed?.root);
  walk(parsed?.rootExpression);
  return [...issues];
}
