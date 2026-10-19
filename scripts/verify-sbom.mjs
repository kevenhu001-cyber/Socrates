#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2] ?? 'sbom';
const expected = ['frontend.cdx.json', 'server.cdx.json', 'apps-socrates.cdx.json'];

function fail(message) {
  console.error(`SBOM verification failed: ${message}`);
  process.exitCode = 1;
}

for (const name of expected) {
  const path = join(directory, name);
  let stat;
  try {
    stat = statSync(path);
  } catch {
    fail(`missing ${path}`);
    continue;
  }
  if (!stat.isFile() || stat.size === 0) {
    fail(`empty or non-file SBOM: ${path}`);
    continue;
  }
  let bom;
  try {
    bom = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`invalid JSON in ${path}: ${error.message}`);
    continue;
  }
  const count = Array.isArray(bom.components) ? bom.components.length : 0;
  if (!bom.metadata?.component) fail(`no metadata.component in ${path}`);
  if (count < 1) fail(`no components in ${path}`);
  if (bom.metadata?.component && count > 0) console.log(`${path}: ${count} components`);
}

let extras;
try {
  extras = readdirSync(directory).filter((name) => name.endsWith('.cdx.json') && !expected.includes(name));
} catch {
  // Missing expected files have already been reported above.
}
if (extras?.length) fail(`unexpected SBOM output(s): ${extras.join(', ')}`);
