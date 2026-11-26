import { record, finite, range, at } from '../foundation.js';

/* ---------- Shape preflight ---------- */
const VIEW_KIND_SET = new Set(['controls', 'plot', 'field', 'trajectory', 'scene', 'metrics']);
const SHAPE_ISSUE_LIMIT = 8;
const shapeIssue = (path, message) => ({ path, message });
const formatShapeIssue = (issue) => `${issue.path}: ${issue.message}`;
/** Parameter completeness and range checks that can be reported together. */
function parameterShapeIssues(parameters) {
  if (parameters === undefined) return [];
  if (!Array.isArray(parameters))
    return [shapeIssue('parameters', 'use a list of at most 12 entries')];
  const issues = [];
  if (parameters.length > 12) issues.push(shapeIssue('parameters', 'use at most 12 entries'));
  parameters.forEach((parameter, index) => {
    const path = `parameters[${index}]`;
    if (!record(parameter)) {
      issues.push(shapeIssue(path, 'must be an object'));
      return;
    }
    for (const key of ['id', 'value', 'min', 'max'])
      if (parameter[key] === undefined || parameter[key] === null || parameter[key] === '')
        issues.push(shapeIssue(`${path}.${key}`, 'is required'));
    if (finite(parameter.min) && finite(parameter.max) && parameter.min >= parameter.max)
      issues.push(shapeIssue(path, 'min must be < max'));
    if (
      finite(parameter.value) &&
      finite(parameter.min) &&
      finite(parameter.max) &&
      (parameter.value < parameter.min || parameter.value > parameter.max)
    )
      issues.push(shapeIssue(`${path}.value`, 'must be inside [min,max]'));
  });
  return issues;
}
/** Required fields per view kind, independent of expression syntax. */
function viewShapeIssues(view, index, hasDynamics) {
  const path = `views[${index}]`;
  if (!record(view)) return [shapeIssue(path, 'must be an object')];
  const kind = typeof view.kind === 'string' ? view.kind : '';
  if (!VIEW_KIND_SET.has(kind))
    return [shapeIssue(`${path}.kind`, 'use controls, plot, field, trajectory, scene or metrics')];
  if (kind === 'controls') return [];
  if (kind === 'metrics') {
    if (!Array.isArray(view.values) || view.values.length < 1 || view.values.length > 6)
      return [shapeIssue(`${path}.values`, 'use 1-6 values')];
    return [];
  }
  const issues = [];
  for (const axis of ['x', 'y'])
    if (!Array.isArray(view[axis]) || view[axis].length !== 2)
      issues.push(shapeIssue(`${path}.${axis}`, 'needs a two-element [min,max] range'));
  if (kind === 'scene') {
    if (!Array.isArray(view.objects) || view.objects.length < 1 || view.objects.length > 32)
      issues.push(shapeIssue(`${path}.objects`, 'use 1-32 scene objects'));
  } else if (kind === 'plot') {
    if (!Array.isArray(view.curves) || view.curves.length < 1 || view.curves.length > 6)
      issues.push(shapeIssue(`${path}.curves`, 'use 1-6 curves'));
  } else if (kind === 'field') {
    if (view.expression === undefined || view.expression === null || view.expression === '')
      issues.push(shapeIssue(`${path}.expression`, 'needs a mathematical expression'));
  } else if (kind === 'trajectory') {
    if (!hasDynamics) issues.push(shapeIssue(path, 'trajectory requires program.dynamics'));
    for (const key of ['horizontal', 'vertical'])
      if (view[key] === undefined || view[key] === null || view[key] === '')
        issues.push(shapeIssue(`${path}.${key}`, 'needs a mathematical expression'));
  }
  return issues;
}
/**
 * Collect every structural omission before the first semantic check. The old
 * validator stopped at the first error, so a plot missing x, y and curves
 * consumed three turns and was withdrawn before the model could fix it; one
 * corrected call should be enough.
 */
function demonstrationShapeIssues(program) {
  const issues = [];
  if (program.parameters !== undefined) issues.push(...parameterShapeIssues(program.parameters));
  if (program.definitions !== undefined) {
    if (!record(program.definitions))
      issues.push(shapeIssue('definitions', 'use an object of name to expression'));
    else if (Object.keys(program.definitions).length > 24)
      issues.push(shapeIssue('definitions', 'use at most 24 entries'));
  }
  if (program.dynamics !== undefined && !record(program.dynamics))
    issues.push(shapeIssue('dynamics', 'must be an object'));
  if (
    program.duration !== undefined &&
    (!finite(program.duration) || program.duration <= 0 || program.duration > 30)
  )
    issues.push(shapeIssue('duration', 'must be a number between 0 and 30'));
  const views = program.views;
  if (!Array.isArray(views)) {
    issues.push(shapeIssue('views', 'use 1-8 views'));
    return issues;
  }
  if (views.length < 1 || views.length > 8) issues.push(shapeIssue('views', 'use 1-8 views'));
  const hasDynamics = record(program.dynamics);
  let controls = 0,
    fields = 0,
    curves = 0;
  views.forEach((view, index) => {
    issues.push(...viewShapeIssues(view, index, hasDynamics));
    if (!record(view)) return;
    if (view.kind === 'controls') controls++;
    if (view.kind === 'field') fields++;
    if (Array.isArray(view.curves)) curves += view.curves.length;
  });
  if (controls > 1)
    issues.push(shapeIssue('views', `use at most one controls view (found ${controls})`));
  if (fields > 2) issues.push(shapeIssue('views', `use at most two field views (found ${fields})`));
  if (curves > 12)
    issues.push(shapeIssue('views', `use at most twelve curves in total (found ${curves})`));
  return issues;
}

export { demonstrationShapeIssues, SHAPE_ISSUE_LIMIT, formatShapeIssue };
