import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function productionStaticScripts() {
  const dist = resolve(import.meta.dirname, '..', 'dist');
  const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
  const report = JSON.parse(readFileSync(resolve(dist, '.vite/entry-graph.json'), 'utf8'));
  const chunks = new Map(report.chunks.map((chunk) => [chunk.file, chunk]));
  const scripts = new Set(
    [...html.matchAll(/(?:src|href)="\/(assets\/[^"?#]+\.js)"/g)].map((match) => match[1]),
  );

  for (const file of scripts) {
    expect(chunks.has(file), `missing graph for ${file}`).toBe(true);
    for (const dependency of chunks.get(file).imports) scripts.add(dependency);
  }
  return { report, scripts };
}

test('interaction-only runtimes stay outside the production static closure', () => {
  const { report, scripts } = productionStaticScripts();
  const deferred = [
    'src/session/loader.impl.ts',
    'src/chat/editBranch.impl.mjs',
    'src/ui/readAloud.impl.mjs',
    'src/session/organize.ts',
    'src/ui/cmdK.impl.mjs',
    'src/ui/knowledgeDetail.impl.mjs',
  ];

  for (const id of deferred) {
    const module = report.modules.find((item) => item.id === id);
    expect(module, `missing deferred module ${id}`).toBeTruthy();
    expect(scripts.has(module.chunk), `${id} leaked into static closure`).toBe(false);
  }
});
