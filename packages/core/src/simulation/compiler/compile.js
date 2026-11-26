import { prepareExpressionTape } from '../expression/evaluate.js';
import { inspectProgram, cachedAst } from './validate.js';
import { prepareRuntime } from '../runtime/prepare.js';

/* ---------- Runtime ---------- */
/** Synchronous entry point for server and shared consumers. */
function createDemonstrationRuntime(input, values = {}) {
  const steps = compileDemonstrationRuntime(input)(values);
  let next = steps.next();
  while (!next.done) next = steps.next();
  return next.value;
}

/** Share validation, expression compilation and dependency analysis across parameter changes. */
function compileDemonstrationRuntime(input) {
  const solver={}, parsed=new Map();
  const validation = inspectProgram(input,solver,parsed);
  if (!validation.ok) {
    const error = Error(validation.error);
    if (validation.path) error.path = validation.path;
    throw error;
  }
  const program=validation.program;
  const prepared = new WeakSet();
  const compile = (expression) => {
    const ast=cachedAst(parsed,expression);
    if(!prepared.has(ast)){prepareExpressionTape(ast);prepared.add(ast);}
    return ast;
  };
  const definitions = new Map(Object.entries(program.definitions ?? {}));
  const stateNames = Object.keys(program.dynamics?.initial ?? {});
  const flags = new Map([['x', 1], ['y', 2], ['t', 4], ...stateNames.map((name) => [name, 4]), ...Object.keys(program.dynamics?.algebraic?.guess ?? {}).map(name=>[name,4])]);
  if(program.views.some(view=>(view.presentation==='vectors3d'||view.presentation==='isosurface'||view.slicePlane!==undefined))) flags.set('spaceZ',8);
  const expressionMasks = new Map();
  const definitionMasks = new Map();
  function dependencies(expression) {
    if (expressionMasks.has(expression)) return expressionMasks.get(expression);
    const mask = astMask(compile(expression), new Set());
    expressionMasks.set(expression, mask);
    return mask;
  }
  function astMask(ast, locals) {
    if (ast.kind === 'variable') {
      const name = ast.name;
      if (locals.has(name)) return 0;
      if (!definitions.has(name)) return flags.get(name) ?? 0;
      if (!definitionMasks.has(name))
        definitionMasks.set(name, dependencies(definitions.get(name)));
      return definitionMasks.get(name);
    }
    if (ast.kind === 'unary') return astMask(ast.arg, locals);
    if (ast.kind === 'binary') return astMask(ast.left, locals) | astMask(ast.right, locals);
    if (ast.kind !== 'call') return 0;
    if(ast.name==='diff')return astMask(ast.args[1],locals)|astMask(ast.args[2],new Set([...locals,ast.args[0].name]));
    if (ast.name === 'sum' || ast.name === 'iterate' || ast.name==='integral') {
      return (
        astMask(ast.args[1], locals) |
        astMask(ast.args[2], locals) |
        astMask(ast.args[3], new Set([...locals, ast.args[0].name]))
      );
    }
    return ast.args.reduce((mask, arg) => mask | astMask(arg, locals), 0);
  }

  return (values = {}) =>
    prepareRuntime(program, definitions, stateNames, compile, dependencies, values, solver, compileDemonstrationRuntime);
}

export { createDemonstrationRuntime, compileDemonstrationRuntime };

export { validateDemonstration } from './validate.js';
