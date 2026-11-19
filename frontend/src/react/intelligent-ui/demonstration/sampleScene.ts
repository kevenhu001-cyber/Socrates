import type {
  DemonstrationObject,
  DemonstrationRuntime,
  DemonstrationScene,
  DemonstrationValue,
} from '@socrates/core/demonstration';
import { errorMessage } from './sampleField';

function objectExpressions(object: DemonstrationObject): DemonstrationValue[] {
  switch (object.kind) {
    case 'path':
      return object.points.flat();
    case 'body':
      return [...object.center, object.radius];
    case 'block':
      return [...object.center, object.width, object.height, object.angle ?? 0];
    default:
      return [...object.from, ...object.to];
  }
}

export function sceneExpressions(view: DemonstrationScene) {
  return [...view.x, ...view.y, ...view.objects.flatMap(objectExpressions)];
}

export function* sampleScene(
  view: DemonstrationScene,
  runtime: DemonstrationRuntime,
  time: number,
) {
  const values = new Map<DemonstrationValue, number | string>();
  runtime.resetBudget();
  for (const expression of sceneExpressions(view)) {
    if (values.has(expression)) continue;
    try {
      values.set(expression, runtime.evaluate(expression, time));
    } catch (error) {
      values.set(expression, errorMessage(error));
    }
    yield;
  }
  return values;
}
export type SceneSample = Map<DemonstrationValue, number | string>;
