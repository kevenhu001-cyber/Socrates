import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mobileRoot = join(scriptDir, '..');
const repoRoot = join(mobileRoot, '..');
const read = (path) => readFileSync(join(mobileRoot, path), 'utf8');
const manifest = JSON.parse(read('docs/parity-manifest.json'));

function fail(message) {
  throw new Error(`[parity] ${message}`);
}

function duplicates(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

function sourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(?:ts|tsx)$/.test(entry) && !/\.test\.(?:ts|tsx)$/.test(entry) ? [path] : [];
  });
}

function exactSet(label, expected, actual) {
  const missing = expected.filter((value) => !actual.includes(value));
  const stale = actual.filter((value) => !expected.includes(value));
  if (missing.length || stale.length) {
    fail(`${label} drifted${missing.length ? `; missing: ${missing.join(', ')}` : ''}${stale.length ? `; stale: ${stale.join(', ')}` : ''}`);
  }
}

if (manifest.schemaVersion !== 2) fail('schemaVersion must be 2');
if (!manifest.webBaseline || manifest.webBaseline.length !== 40) fail('webBaseline must be a full commit hash');

const currentWebBaseline = execFileSync('git', ['log', '-1', '--format=%H', '--', 'frontend'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim();
if (manifest.webBaseline !== currentWebBaseline) {
  fail(`web baseline is stale: manifest=${manifest.webBaseline.slice(0, 8)}, frontend=${currentWebBaseline.slice(0, 8)}`);
}

const requiredViewports = ['390x844', '412x915', '768x1024', '1440x900'];
const manifestViewports = manifest.viewports.map(({ width, height }) => `${width}x${height}`);
exactSet('viewport matrix', requiredViewports, manifestViewports);
exactSet('locale matrix', ['en', 'zh'], manifest.locales);
for (const theme of ['dark', 'light']) {
  if (!manifest.themes.includes(theme)) fail(`theme matrix is missing ${theme}`);
}
for (const state of ['loading', 'empty', 'data', 'error', 'offline', 'streaming', 'complete']) {
  if (!manifest.states.includes(state)) fail(`state matrix is missing ${state}`);
}

const routeTypes = read('src/navigation/types.ts');
const routeBlock = routeTypes.match(/RootStackParamList\s*=\s*\{([\s\S]*?)\n\};/)?.[1];
if (!routeBlock) fail('could not read RootStackParamList');
const typedRoutes = [...routeBlock.matchAll(/^\s{2}([A-Z][A-Za-z0-9]*):/gm)].map((match) => match[1]);

const appSource = read('App.tsx');
const mountedRoutes = [...appSource.matchAll(/<Stack\.Screen\s+name="([^"]+)"/g)].map((match) => match[1]);
exactSet('Stack.Navigator versus RootStackParamList', typedRoutes, mountedRoutes);

const declaredRoutes = [
  ...manifest.nativeSurfaces.map((surface) => surface.route).filter(Boolean),
  ...manifest.controlledWebViews.flatMap((surface) => surface.routes ?? []),
];
if (duplicates(declaredRoutes).length) fail(`duplicate manifest routes: ${duplicates(declaredRoutes).join(', ')}`);
exactSet('manifest routes versus native navigator', typedRoutes, declaredRoutes);

const sourceText = sourceFiles(join(mobileRoot, 'src'))
  .map((path) => `\n// ${relative(mobileRoot, path)}\n${readFileSync(path, 'utf8')}`)
  .join('\n');
for (const overlay of manifest.nativeOverlays) {
  const tag = new RegExp(`<${overlay.implementation}(?:\\s|/|>)`);
  if (!tag.test(`${appSource}\n${sourceText}`)) {
    fail(`registered overlay is not mounted: ${overlay.id} (${overlay.implementation})`);
  }
}

const forbiddenWebViewIds = new Set([
  'projects', 'scheduled', 'plugins', 'knowledge', 'mistakes', 'api-settings',
  'profile', 'usage', 'storage', 'display', 'library', 'exam', 'home', 'chat', 'tutor',
]);
for (const surface of manifest.controlledWebViews) {
  if (forbiddenWebViewIds.has(surface.id)) fail(`product page cannot be a controlled WebView: ${surface.id}`);
  if (!surface.bridge || !surface.csp || !surface.fallback) {
    fail(`controlled WebView must declare bridge, CSP and fallback policy: ${surface.id}`);
  }
}

const stringsSource = read('src/i18n/strings.ts');
const [englishBlock, chineseAndTail] = stringsSource.split(/\n\s{2}zh:\s*\{/);
if (!chineseAndTail) fail('could not split en/zh string tables');
const chineseBlock = chineseAndTail.split(/\n\s{2}\},\n\} as const/)[0];
const keyPattern = /^\s{4}'([^']+)':/gm;
const keysIn = (block) => [...block.matchAll(keyPattern)].map((match) => match[1]);
const englishKeys = keysIn(englishBlock);
const chineseKeys = keysIn(chineseBlock);
if (duplicates(englishKeys).length) fail(`duplicate English translation keys: ${duplicates(englishKeys).join(', ')}`);
if (duplicates(chineseKeys).length) fail(`duplicate Chinese translation keys: ${duplicates(chineseKeys).join(', ')}`);
exactSet('Chinese translations versus English source', englishKeys, chineseKeys);

const translationCalls = [...`${appSource}\n${sourceText}`.matchAll(/\b(?:t|tSync)\(\s*['"]([^'"]+)['"]/g)]
  .map((match) => match[1]);
const missingTranslations = [...new Set(translationCalls.filter((key) => !englishKeys.includes(key)))].sort();
if (missingTranslations.length) fail(`translation calls missing from string tables: ${missingTranslations.join(', ')}`);

console.log(
  `Parity manifest OK: web ${currentWebBaseline.slice(0, 8)}, ${declaredRoutes.length} routes, ` +
  `${manifest.nativeOverlays.length} overlays, ${englishKeys.length} translated keys`,
);
