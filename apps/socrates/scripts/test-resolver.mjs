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
  /* TypeScript ESM sources write `./x.js` for a module that only exists as
     `./x.ts` (Node's convention so the emitted `.js` resolves at runtime).
     packages/core/src/index.ts does exactly that for `./physicsModels.js`,
     and the loader would otherwise fail with ERR_MODULE_NOT_FOUND. Map to
     the `.ts` twin ONLY when the `.js` file is absent, so genuine runtime
     `.js` modules keep winning. */
  if (specifier.endsWith('.js') && /^\.{1,2}\//.test(specifier)) {
    const emitted = new URL(specifier, context.parentURL);
    const source = new URL(`${specifier.slice(0, -3)}.ts`, context.parentURL);
    if (!existsSync(emitted) && existsSync(source)) return nextResolve(source.href, context);
  }
  return nextResolve(specifier, context);
}
