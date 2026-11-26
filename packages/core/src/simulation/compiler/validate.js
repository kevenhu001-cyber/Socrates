import { record, finite, range, text, located, at } from '../foundation.js';
import { unary, name } from '../expression/functions.js';
import { parseDemonstrationExpression } from '../expression/parser.js';
import { expressionNames } from '../expression/evaluate.js';
import { normalizeDemonstrationProgram } from './normalize.js';
import { demonstrationShapeIssues, SHAPE_ISSUE_LIMIT, formatShapeIssue } from './shape.js';
import { lowerNumericalProgram } from './lower.js';

function inspectProgram(input, solver, parsed) {
  try {
    if (!record(input) && typeof input !== 'string')
      throw Error(
        'Demonstration requires a program object: {version:1, parameters, definitions, views}',
      );
    let program = normalizeDemonstrationProgram(input);
    if (!record(program))
      throw Error(
        'Demonstration requires a program object: {version:1, parameters, definitions, views}',
      );
    if (program.version !== 1)
      throw located('version', Error('Demonstration requires version 1 inside program'));
    if (
      program.resetKey !== undefined &&
      (typeof program.resetKey !== 'string' || program.resetKey.length > 80)
    )
      throw located('resetKey', Error('resetKey must be a string of at most 80 characters'));
    if (program.diagnostics !== undefined && typeof program.diagnostics !== 'boolean')
      throw located('diagnostics',Error('Diagnostics must be boolean'));
    if (JSON.stringify(program).length > 40000) throw Error('Demonstration is too large');
    program = lowerNumericalProgram(program,solver,validateDemonstration);
    const shape = demonstrationShapeIssues(program);
    if (shape.length) {
      const issues = shape.slice(0, SHAPE_ISSUE_LIMIT);
      return {
        ok: false,
        error: issues.map(formatShapeIssue).join('; '),
        path: issues[0].path,
        issues,
      };
    }
    const params = program.parameters ?? [],
      definitions = program.definitions ?? {},
      dynamics = program.dynamics;
    if (!Array.isArray(params) || params.length > 12)
      throw located('parameters', Error('Use a list of at most 12 parameters'));
    if (!record(definitions) || Object.keys(definitions).length > 24)
      throw located('definitions', Error('Use a map of at most 24 definitions'));
    const allowed = new Set(['x', 'y', 't', 'pi', 'e']);
    if (program.views?.some(view=>(view?.presentation==='vectors3d'||view?.presentation==='isosurface'||view?.slicePlane!==undefined))) allowed.add('spaceZ');
    params.forEach((p, i) =>
      at(`parameters.${record(p) && typeof p.id === 'string' ? p.id : `[${i}]`}`, () => {
        if (!record(p)) throw Error('Parameter must be an object');
        if (!name(p.id))
          throw Error(
            `id must be an ASCII identifier that is not x, y, t, pi, e or a function name`,
          );
        if (allowed.has(p.id)) throw Error('Duplicate or reserved parameter id');
        if (!text(p.label) || !text(p.unit))
          throw Error('label and unit must be text of at most 200 characters');
        if (![p.min, p.max, p.value].every(finite))
          throw Error('min, max and value must be numbers');
        if (p.min >= p.max || p.value < p.min || p.value > p.max)
          throw Error('Needs min < max and value inside [min, max]');
        if (p.step !== undefined && (!finite(p.step) || p.step <= 0))
          throw Error('step must be a positive number');
        allowed.add(p.id);
      }),
    );
    const check = (expression, scope = allowed, used) => {
      const ast = parsed ? cachedAst(parsed,expression) : parseDemonstrationExpression(expression);
      expressionNames(ast, scope, used);
      return ast;
    };
    if (dynamics !== undefined) {
      at('dynamics', () => {
        if (!record(dynamics) || !record(dynamics.initial) || !record(dynamics.derivatives))
          throw Error('Dynamics needs initial and derivatives maps');
        const adaptive = ['rk45', 'sdirk2'].includes(dynamics.method);
        if (dynamics.method !== undefined && !['rk4', 'rk45', 'sdirk2'].includes(dynamics.method))
          throw Error('Unknown dynamics method; use rk4, rk45 or sdirk2');
        if (
          !finite(dynamics.duration) || dynamics.duration <= 0 ||
          dynamics.duration > (adaptive ? 300 : 30) ||
          !finite(dynamics.step) || dynamics.step < (adaptive ? 1e-6 : 0.002) ||
          dynamics.step > (adaptive ? 1 : 0.05) ||
          Math.ceil(dynamics.duration / dynamics.step) > 10000
        )
          throw Error('Dynamics duration and maximum step exceed the solver resource limits');
        for (const key of ['rtol', 'atol']) {
          if (dynamics[key] !== undefined &&
              (!adaptive || !finite(dynamics[key]) || dynamics[key] < 1e-10 || dynamics[key] > 0.01))
            throw Error('Adaptive tolerances must be between 1e-10 and 0.01');
        }
        if (dynamics.events !== undefined &&
            (!adaptive || !Array.isArray(dynamics.events) || dynamics.events.length > 8))
          throw Error('Events require an adaptive solver and at most eight event definitions');
      });
      const keys = Object.keys(dynamics.initial);
      const maxStates = dynamics.method === 'sdirk2' ? 8 : dynamics.method === 'rk45' ? 32 : 6;
      if (!keys.length || keys.length > maxStates)
        throw located('dynamics.initial', Error(`Dynamics supports 1–${maxStates} states`));
      for (const key of keys) {
        at(`dynamics.initial.${key}`, () => {
          if (!name(key) || allowed.has(key))
            throw Error('Invalid state name, or it collides with a parameter');
          check(dynamics.initial[key]);
        });
        if (dynamics.derivatives[key] === undefined)
          throw located(`dynamics.derivatives.${key}`, Error('Every state needs a derivative'));
      }
      for (const key of Object.keys(dynamics.derivatives))
        if (!keys.includes(key))
          throw located(
            `dynamics.derivatives.${key}`,
            Error('Derivative has no matching initial state'),
          );
      if (dynamics.massMatrix !== undefined &&
          (!['rk45', 'sdirk2'].includes(dynamics.method) || keys.length > 8 ||
            !Array.isArray(dynamics.massMatrix) || dynamics.massMatrix.length !== keys.length ||
            dynamics.massMatrix.some((row) => !Array.isArray(row) || row.length !== keys.length)))
        throw located('dynamics.massMatrix', Error('A square mass matrix of 1–8 states requires an adaptive solver'));
      keys.forEach((key) => allowed.add(key));
      if (dynamics.algebraic !== undefined) {
        const a = dynamics.algebraic;
        if (!['rk45','sdirk2'].includes(dynamics.method) || !record(a) || !record(a.guess) || !record(a.residuals))
          throw located('dynamics.algebraic', Error('Algebraic constraints require an adaptive solver, guess and residuals maps'));
        const ids = Object.keys(a.guess);
        if (!ids.length || ids.length > 4 || Object.keys(a.residuals).length !== ids.length ||
            ids.some(id => !name(id) || allowed.has(id) || !Object.hasOwn(a.residuals,id)))
          throw located('dynamics.algebraic', Error('Use 1–4 distinct algebraic names with matching residual equations'));
        if (a.tolerance !== undefined && (!finite(a.tolerance) || a.tolerance < 1e-12 || a.tolerance > 1e-3))
          throw located('dynamics.algebraic.tolerance', Error('Residual tolerance must be 1e-12–1e-3'));
        const guessScope = new Set(['pi','e',...params.map(p=>p.id)]);
        for (const id of ids) at(`dynamics.algebraic.guess.${id}`, () => check(a.guess[id],guessScope));
        ids.forEach(id=>allowed.add(id));
      }
    }
    // Definitions may appear in any order; reject only genuine cycles.
    const defKeys = Object.keys(definitions);
    for (const key of defKeys)
      at(`definitions.${key}`, () => {
        if (!name(key))
          throw Error(
            'Definition name must be an ASCII identifier that is not x, y, t, pi, e or a function name',
          );
        if (allowed.has(key)) throw Error('Definition name collides with a parameter or state');
      });
    defKeys.forEach((key) => allowed.add(key));
    const dependencies = new Map();
    for (const [key, value] of Object.entries(definitions)) {
      const used = new Set();
      at(`definitions.${key}`, () => check(value, allowed, used));
      dependencies.set(
        key,
        [...used].filter((item) => dependencies.has(item) || defKeys.includes(item)),
      );
    }
    const state = new Map();
    const visit = (key, trail) => {
      if (state.get(key) === 2) return;
      if (state.get(key) === 1)
        throw located(
          `definitions.${key}`,
          Error(
            `Definitions form a cycle: ${[...trail.slice(trail.indexOf(key)), key].join(' → ')}`,
          ),
        );
      state.set(key, 1);
      for (const next of dependencies.get(key) ?? []) visit(next, [...trail, key]);
      state.set(key, 2);
    };
    defKeys.forEach((key) => visit(key, []));
    if (dynamics)
      for (const key of Object.keys(dynamics.initial))
        at(`dynamics.derivatives.${key}`, () => check(dynamics.derivatives[key]));
    for (const [key, value] of Object.entries(dynamics?.algebraic?.residuals ?? {}))
      at(`dynamics.algebraic.residuals.${key}`, () => check(value));
    for (const [i, row] of (dynamics?.massMatrix ?? []).entries())
      for (const [j, value] of row.entries())
        at(`dynamics.massMatrix[${i}][${j}]`, () => check(value));
    for (const [i, event] of (dynamics?.events ?? []).entries()) {
      at(`dynamics.events[${i}]`, () => {
        if (!record(event) || ![-1, 0, 1].includes(event.direction ?? 0) ||
            (event.terminal !== undefined && typeof event.terminal !== 'boolean'))
          throw Error('Event needs expression, direction -1/0/1 and optional boolean terminal');
        if (event.rearmTolerance !== undefined && (!finite(event.rearmTolerance) || event.rearmTolerance < 0 || event.rearmTolerance > 1e6))
          throw Error('Event rearm tolerance must be a finite nonnegative number ≤1e6');
        check(event.expression);
        if (event.reset !== undefined && !record(event.reset))
          throw Error('Event reset must be a map of state expressions');
        if (!event.terminal && !Object.keys(event.reset ?? {}).length)
          throw Error('Event must stop the simulation or reset at least one state');
        for (const [key, expression] of Object.entries(event.reset ?? {})) {
          if (!Object.hasOwn(dynamics.initial, key)) throw Error('Event reset must target a state');
          check(expression);
        }
      });
    }
    const views = program.views;
    if (!Array.isArray(views) || !views.length || views.length > 8)
      throw located('views', Error('Demonstration requires 1–8 views'));
    let fields = 0,
      curves = 0,
      controls = 0;
    views.forEach((view, i) => {
      const path = `views[${i}]`;
      at(path, () => {
        if (!record(view) || !text(view.label) || !text(view.xLabel) || !text(view.yLabel))
          throw Error('View must be an object with text labels of at most 200 characters');
      });
      for (const axis of ['x', 'y']) {
        const scale = view[`${axis}Scale`];
        if (scale !== undefined && (view.kind !== 'plot' || !['linear', 'log'].includes(scale)))
          throw located(`${path}.${axis}Scale`, Error('Use linear or log scales on plots only'));
        if (scale === 'log' && Array.isArray(view[axis]) && view[axis].some((v) => finite(v) && v <= 0))
          throw located(`${path}.${axis}`, Error('Logarithmic axis needs positive bounds'));
      }
      if (view.sliceY !== undefined) {
        if (view.kind !== 'plot' || view.history)
          throw located(`${path}.sliceY`, Error('Spatial slice is available on non-history plots only'));
        at(`${path}.sliceY`, () => check(view.sliceY));
      }
      if (view.history !== undefined &&
          (view.kind !== 'plot' || typeof view.history !== 'boolean' || (view.history && !dynamics)))
        throw located(`${path}.history`, Error('History requires a plot with dynamics'));
      if (view.kind === 'controls') {
        controls++;
        return;
      }
      if (view.kind === 'metrics') {
        if (!Array.isArray(view.values) || view.values.length > 6 || !view.values.length)
          throw located(`${path}.values`, Error('Use 1–6 metrics'));
        view.values.forEach((m, j) =>
          at(`${path}.values[${j}]`, () => {
            if (
              !record(m) ||
              !text(m.label) ||
              !text(m.unit) ||
              (m.digits !== undefined &&
                (!Number.isInteger(m.digits) || m.digits < 0 || m.digits > 5))
            )
              throw Error('Metric needs label, expression, optional unit and digits 0–5');
            check(m.expression);
          }),
        );
        return;
      }
      if (!['plot', 'field', 'trajectory', 'scene'].includes(view.kind))
        throw located(
          `${path}.kind`,
          Error(
            `Unknown demonstration view kind "${String(view.kind).slice(0, 40)}"; use controls, plot, field, trajectory, scene or metrics`,
          ),
        );
      for (const axis of ['x', 'y'])
        at(`${path}.${axis}`, () => {
          if (!range(view[axis])) throw Error('Needs an increasing [min, max] range within ±1e6');
          view[axis].forEach((v) => check(v));
        });
      if (view.kind === 'scene') {
        if (!Array.isArray(view.objects) || !view.objects.length || view.objects.length > 32)
          throw located(`${path}.objects`, Error('Use 1–32 scene objects'));
        view.objects.forEach((object, j) => {
          const objectPath = `${path}.objects[${j}]`;
          at(objectPath, () => {
            if (
              !record(object) ||
              !['body', 'block', 'rod', 'spring', 'vector', 'path', 'resistor', 'capacitor', 'inductor', 'voltageSource', 'currentSource', 'dimension', 'pin', 'roller', 'ground', 'atom', 'cell', 'bond', 'doubleBond', 'tripleBond', 'reactionArrow', 'reversibleArrow', 'inhibition'].includes(object.kind)
            )
              throw Error('Unknown scene object kind; use a documented mechanical or electrical symbol');
            if (object.kind==='atom' && (typeof object.element!=='string'||!/^[A-Z][a-z]?$/.test(object.element))) throw Error('Atom needs an element symbol');
            if (!text(object.label))
              throw Error('Object label must be text of at most 200 characters');
            if (
              object.color !== undefined &&
              !['ink', 'muted', 'blue', 'orange', 'red', 'green', 'violet'].includes(object.color)
            )
              throw Error('Use a documented scene color');
          });
          if (object.kind === 'path') {
            at(`${objectPath}.points`, () => {
              if (
                !Array.isArray(object.points) ||
                object.points.length < 2 ||
                object.points.length > 64
              )
                throw Error('Path needs 2–64 coordinate pairs');
              for (const point of object.points) {
                if (!Array.isArray(point) || point.length !== 2)
                  throw Error('Path points need two expressions');
                point.forEach((value) => check(value));
              }
              for (const key of ['closed', 'dashed'])
                if (object[key] !== undefined && typeof object[key] !== 'boolean')
                  throw Error('closed and dashed must be booleans');
            });
          }
          const pairs =
            object.kind === 'path'
              ? []
              : ['body', 'block', 'atom', 'cell'].includes(object.kind)
                ? ['center']
                : ['from', 'to'];
          for (const key of pairs)
            at(`${objectPath}.${key}`, () => {
              if (!Array.isArray(object[key]) || object[key].length !== 2)
                throw Error('Needs two coordinate expressions');
              object[key].forEach((value) => check(value));
            });
          const sizes =
            ['body','atom','cell'].includes(object.kind)
              ? ['radius']
              : object.kind === 'block'
                ? ['width', 'height']
                : [];
          for (const key of sizes)
            at(`${objectPath}.${key}`, () => {
              check(object[key]);
              if (typeof object[key] === 'number' && object[key] <= 0)
                throw Error('Size must be positive');
            });
          if (object.angle !== undefined) at(`${objectPath}.angle`, () => check(object.angle));
        });
      } else if (view.kind === 'field') {
        fields++;
        if(view.slicePlane!==undefined){
          if(!record(view.slicePlane)||!['x','y','z'].includes(view.slicePlane.axis)||
            ![undefined,'map'].includes(view.presentation)||view.vector!==undefined)
            throw located(path,Error('Scalar map slice needs axis x/y/z and at; no planar vector overlay'));
          check(view.slicePlane.at);
        }
        if (view.presentation !== undefined && !['map', 'surface', 'curve3d', 'vectors3d','parametricSurface','isosurface'].includes(view.presentation))
          throw located(`${path}.presentation`, Error('Use map, surface, curve3d, vectors3d, parametricSurface or isosurface'));
        if (view.surfaceStyle !== undefined && (!['surface','parametricSurface','isosurface'].includes(view.presentation) || !['wireframe','shaded'].includes(view.surfaceStyle)))
          throw located(`${path}.surfaceStyle`, Error('Surface style must be wireframe or shaded on a surface'));
        if (['surface','curve3d','vectors3d','parametricSurface','isosurface'].includes(view.presentation)) {
          if (!range(view.zRange)) throw located(`${path}.zRange`, Error('Surface needs increasing z bounds'));
          view.zRange.forEach((v) => check(v));
          if (view.vector !== undefined || view.contours !== undefined || view.colorRange !== undefined)
            throw located(path, Error('3D views cannot include 2D contours, vectors or color calibration'));
        } else if (view.zRange !== undefined) throw located(`${path}.zRange`, Error('zRange requires 3D presentation'));
        if(view.presentation==='isosurface'){
          if(view.isoLevel===undefined)throw located(path,Error('Isosurface needs an explicit isoLevel'));
          check(view.isoLevel);
        }else if(view.isoLevel!==undefined)throw located(path,Error('isoLevel requires isosurface presentation'));
        if(view.presentation==='parametricSurface'){
          if(!Array.isArray(view.surface3d)||view.surface3d.length!==3||!range(view.uRange)||!range(view.vRange))
            throw located(path,Error('Parametric surface needs three coordinate expressions and uRange/vRange'));
          [...view.surface3d,...view.uRange,...view.vRange].forEach(v=>check(v));
        }else if(view.surface3d!==undefined||view.uRange!==undefined||view.vRange!==undefined)
          throw located(path,Error('Parametric surface fields require parametricSurface presentation'));
        if(view.markers!==undefined){
          if(![undefined,'map'].includes(view.presentation)||!Array.isArray(view.markers)||view.markers.length>8)
            throw located(path,Error('Use at most 8 markers on a scalar map'));
          view.markers.forEach(m=>{if(!record(m)||!text(m.label))throw located(path,Error('Marker needs x/y and optional label'));check(m.x);check(m.y);});
        }
        if(view.presentation==='curve3d'){
          if(!Array.isArray(view.curve3d)||view.curve3d.length!==3)throw located(path,Error('Curve needs three coordinate expressions'));
          view.curve3d.forEach(v=>check(v));
          if(view.curveHistory!==undefined&&typeof view.curveHistory!=='boolean')throw located(path,Error('curveHistory must be boolean'));
          if(view.curveHistory){
            if(!dynamics||view.parameterRange!==undefined)throw located(path,Error('History curve needs dynamics and no parameterRange'));
          }else{
            if(!range(view.parameterRange))throw located(path,Error('Parametric curve needs parameterRange'));
            view.parameterRange.forEach(v=>check(v));
          }
        }else if(view.curve3d!==undefined||view.curveHistory!==undefined||view.parameterRange!==undefined)
          throw located(path,Error('Curve options require curve3d presentation'));
        if(view.presentation==='vectors3d'){
          if(!Array.isArray(view.vector3d)||view.vector3d.length!==3||view.vectorScale===undefined)
            throw located(path,Error('3D vector field needs three components and vectorScale'));
          view.vector3d.forEach(v=>check(v));
        }else if(view.vector3d!==undefined)throw located(path,Error('vector3d requires vectors3d presentation'));
        at(`${path}.expression`, () => check(view.expression));
        for (const key of ['gamma', 'exposure', 'vectorScale'])
          if (view[key] !== undefined) at(`${path}.${key}`, () => check(view[key]));
        if (view.colorRange !== undefined) {
          if (view.palette !== 'heat' || !range(view.colorRange))
            throw located(`${path}.colorRange`, Error('Calibrated range requires heat palette and increasing bounds'));
          view.colorRange.forEach((value) => check(value));
        }
        if (!text(view.unit)) throw located(`${path}.unit`, Error('Unit must be text'));
        if (view.contours !== undefined) {
          if (!Array.isArray(view.contours) || view.contours.length < 1 || view.contours.length > 6)
            throw located(`${path}.contours`, Error('Use 1–6 contour levels'));
          view.contours.forEach((value) => check(value));
        }
        if(view.streamlines!==undefined&&(typeof view.streamlines!=='boolean'||!view.vector||view.slicePlane!==undefined||![undefined,'map'].includes(view.presentation)))
          throw located(path,Error('Streamlines require a planar vector map'));
        if (view.vectorScale !== undefined && (!(view.vector||view.vector3d) || (finite(view.vectorScale) && view.vectorScale <= 0)))
          throw located(`${path}.vectorScale`, Error('Vector scale requires a vector and positive reference magnitude'));
        if (view.vector !== undefined)
          at(`${path}.vector`, () => {
            if (!Array.isArray(view.vector) || view.vector.length !== 2)
              throw Error('Field vector needs two expressions');
            view.vector.forEach((v) => check(v));
          });
        if (
          view.height !== undefined &&
          (!finite(view.height) || view.height < 64 || view.height > 320)
        )
          throw located(`${path}.height`, Error('Field height must be 64–320'));
        if (view.palette !== undefined && !['light', 'signed', 'heat'].includes(view.palette))
          throw located(
            `${path}.palette`,
            Error('Unknown field palette; use light, signed or heat'),
          );
        if (
          view.tint !== undefined &&
          (!Array.isArray(view.tint) ||
            view.tint.length !== 3 ||
            view.tint.some((v) => !finite(v) || v < 0 || v > 1))
        )
          throw located(`${path}.tint`, Error('Field tint is three 0–1 color channels'));
      } else if (view.kind === 'plot') {
        if (!Array.isArray(view.curves) || !view.curves.length || view.curves.length > 6)
          throw located(`${path}.curves`, Error('Use 1–6 curves per plot'));
        view.curves.forEach((c, j) =>
          at(`${path}.curves[${j}]`, () => {
            if (!record(c) || !text(c.label))
              throw Error('Curve needs an expression and an optional text label');
            if(c.interpolation!==undefined&&!['linear','step','points','stem'].includes(c.interpolation))throw Error('Curve interpolation must be linear, step, points or stem');
            if(c.samples!==undefined&&(!Number.isInteger(c.samples)||c.samples<2||c.samples>2049))throw Error('Explicit curve sample count must be 2–2049');
            check(c.expression);
            curves++;
          }),
        );
        if (view.markers !== undefined) {
          if (!Array.isArray(view.markers) || view.markers.length > 8)
            throw located(`${path}.markers`, Error('Use at most 8 markers'));
          view.markers.forEach((m, j) =>
            at(`${path}.markers[${j}]`, () => {
              if (!record(m) || !text(m.label))
                throw Error('Marker needs x, y and an optional text label');
              check(m.x);
              check(m.y);
            }),
          );
        }
      } else {
        if (!dynamics) throw located(path, Error('Trajectory requires dynamics'));
        at(`${path}.horizontal`, () => check(view.horizontal));
        at(`${path}.vertical`, () => check(view.vertical));
      }
    });
    if (fields > 2 || curves > 12 || controls > 1)
      throw located(
        'views',
        Error('Use at most two field views, twelve curves and one controls slot'),
      );
    if (
      program.duration !== undefined &&
      (!finite(program.duration) || program.duration <= 0 || program.duration > 30)
    )
      throw located('duration', Error('Duration must be 0–30 s'));
    if (program.presets !== undefined) {
      if (!Array.isArray(program.presets) || program.presets.length > 4)
        throw located('presets', Error('Use at most four presets'));
      program.presets.forEach((preset, i) =>
        at(`presets[${i}]`, () => {
          if (!record(preset) || !text(preset.label) || !record(preset.values))
            throw Error('Preset needs a label and a values map');
          for (const [key, value] of Object.entries(preset.values)) {
            const p = params.find((p) => p.id === key);
            if (!p) throw Error(`Unknown parameter ${key}`);
            check(value);
            if (typeof value === 'number' && (!finite(value) || value < p.min || value > p.max))
              throw Error(`Value for ${key} must be a number inside its range`);
          }
        }),
      );
    }
    return { ok: true, program };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid demonstration';
    return error instanceof Error && error.path
      ? { ok: false, error: message, path: error.path }
      : { ok: false, error: message };
  }
}

function validateDemonstration(input) {
  const result=inspectProgram(input);
  return result.ok ? {ok:true} : result;
}
function cachedAst(cache,expression){
  // Keep numbers and strings distinct, including invalid string spellings.
  if(!cache.has(expression))cache.set(expression,parseDemonstrationExpression(expression));
  return cache.get(expression);
}


export { inspectProgram, validateDemonstration, cachedAst };
