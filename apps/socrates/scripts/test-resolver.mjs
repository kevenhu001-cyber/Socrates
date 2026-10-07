import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const appRequire = createRequire(new URL('../package.json', import.meta.url));
export async function resolve(specifier, context, nextResolve) {
  // Windows drive-letter entry points reach hooks as bare paths; the ESM
  // loader reads `C:` as an unsupported URL scheme unless converted first.
  if (/^[a-zA-Z]:[\\/]/.test(specifier)) return nextResolve(pathToFileURL(specifier).href, context);
  if (specifier.startsWith('@socrates/')) {
    const directory = resolvePath(root, 'packages', specifier.slice('@socrates/'.length));
    const pkg = JSON.parse(readFileSync(resolvePath(directory, 'package.json'), 'utf8'));
    return nextResolve(pathToFileURL(resolvePath(directory, pkg.main)).href, context);
  }
  if (specifier === 'react' || specifier === 'zustand' || specifier === 'marked') return nextResolve(pathToFileURL(appRequire.resolve(specifier)).href, context);
  if (specifier.startsWith('.') && !/\.\w+$/.test(specifier)) {
    const source = new URL(`${specifier}.ts`, context.parentURL);
    if (existsSync(source)) return nextResolve(source.href, context);
  }
  return nextResolve(specifier, context);
}
