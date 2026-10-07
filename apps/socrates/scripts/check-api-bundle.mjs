import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const expected = process.env.EXPO_PUBLIC_API_BASE_URL;
if (!expected) throw new Error('EXPO_PUBLIC_API_BASE_URL is required to verify the build target');
const directory = resolve(process.argv[2] || 'dist', '_expo/static/js/web');
const bundles = readdirSync(directory).filter((file) => file.endsWith('.js'));
if (!bundles.some((file) => readFileSync(resolve(directory, file), 'utf8').includes(expected))) {
  throw new Error('Configured API address was not embedded in the web bundle');
}
console.log('[api-bundle] configured API target is embedded');
