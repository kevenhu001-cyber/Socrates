#!/usr/bin/env node
// Build the public-site schema from the canonical API contract. Operator-only
// operations are documented internally but deliberately omitted from publication.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse } from 'yaml';

export function projectPublicSchema(source) {
  const doc = structuredClone(source);
  if (!doc || doc.openapi !== '3.1.0' || !doc.paths) throw new Error('Unexpected canonical OpenAPI document');
  for (const [path, pathItem] of Object.entries(doc.paths)) {
    // Internal-only surfaces stay canonical but never enter the public artifact.
    const privatePath = pathItem?.['x-internal'] === true || path.split('/').includes('_internal');
    for (const [method, operation] of Object.entries(pathItem)) {
      if (/^(get|post|put|patch|delete|head|options|trace)$/i.test(method) &&
          (privatePath || operation?.['x-internal'] === true || operation?.tags?.includes('admin'))) {
        delete pathItem[method];
      }
    }
    if (!Object.keys(pathItem).some((key) => /^(get|post|put|patch|delete|head|options|trace)$/i.test(key))) delete doc.paths[path];
  }
  doc.tags = (doc.tags ?? []).filter((tag) => tag.name !== 'admin');
  return doc;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const sourcePath = resolve(root, 'docs/api/openapi.yaml');
  const outputPath = resolve(root, 'site/openapi.json');
  const doc = projectPublicSchema(parse(readFileSync(sourcePath, 'utf8')));
  const json = `${JSON.stringify(doc, null, 2)}\n`;
  if (process.argv.includes('--check')) {
    if (readFileSync(outputPath, 'utf8') !== json) {
      console.error('site/openapi.json is stale; run npm run openapi:generate');
      process.exit(1);
    }
    console.log('site/openapi.json is current');
  } else {
    writeFileSync(outputPath, json);
    console.log(`generated ${outputPath}`);
  }
}
