/**
 * DOM prop helpers shared by the packages/ui components.
 *
 * These are plain React DOM helpers, not a React Native compatibility layer:
 * `dataSet` exists only while the frozen `react-web` shim is being retired and
 * maps camelCase keys to `data-*` attributes exactly once, here.
 */
export type DataSet = Record<string, string | number | boolean | undefined | null>;

export function dataAttributes(dataSet?: DataSet): Record<string, string> {
  if (!dataSet) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(dataSet)) {
    if (value === undefined || value === null) continue;
    out[`data-${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`] = String(value);
  }
  return out;
}
