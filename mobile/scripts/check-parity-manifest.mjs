import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../docs/parity-manifest.json', import.meta.url), 'utf8'));
const routes = manifest.nativeSurfaces.map((surface) => surface.route);
const duplicates = routes.filter((route, index) => routes.indexOf(route) !== index);
if (duplicates.length) throw new Error(`Duplicate native parity routes: ${duplicates.join(', ')}`);
if (!manifest.webBaseline || manifest.webBaseline.length < 8) throw new Error('parity manifest is missing its frozen web baseline');
if (!manifest.viewports.some((viewport) => viewport.width === 390) || !manifest.viewports.some((viewport) => viewport.width === 768)) {
  throw new Error('parity manifest must cover phone and tablet viewports');
}
const forbidden = new Set(['projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'api-settings', 'profile', 'usage', 'storage', 'display', 'library', 'exam']);
const controlledTargets = manifest.controlledWebViews.map((surface) => surface.id);
for (const target of controlledTargets) {
  if (forbidden.has(target)) throw new Error(`Product page cannot be a controlled WebView: ${target}`);
}
console.log(`Parity manifest OK: ${routes.length} native routes, ${controlledTargets.length} controlled WebView surfaces`);
