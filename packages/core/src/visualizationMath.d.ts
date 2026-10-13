export type FunctionPoint = [number, number | null];
export interface FunctionSample {
  points: FunctionPoint[];
  extent: [number, number];
  domain: [number, number];
  evaluator: (x: number) => number;
}

export function parseFunctionExpression(source: string): (x: number) => number;
export function robustExtent(values: number[]): [number, number];
export function sampleFunction(
  expression: string,
  domain?: [number, number],
  count?: number,
): FunctionSample;
