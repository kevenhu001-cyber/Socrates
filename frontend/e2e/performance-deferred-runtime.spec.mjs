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
    'src/chat/editBranch.impl.ts',
    'src/ui/readAloud.impl.ts',
    'src/session/organize.ts',
    'src/ui/cmdK.impl.ts',
    'src/ui/knowledgeDetail.impl.ts',
    'src/tutor/socraticTurn.impl.ts',
    'src/chat/sessionBootstrap/tutorStart.impl.ts',
    'src/chat/send/tutorFlow.impl.ts',
    'src/react/menu/FoundationMenu.tsx',
    'src/react/dialog/FoundationDialog.tsx',
    'src/react/confirm/ConfirmDialogContent.tsx',
  ];

  for (const id of deferred) {
    const module = report.modules.find((item) => item.id === id);
    expect(module, `missing deferred module ${id}`).toBeTruthy();
    expect(scripts.has(module.chunk), `${id} leaked into static closure`).toBe(false);
  }

  const primitives = report.modules.filter((item) => item.id.includes('node_modules/@base-ui/'));
  expect(primitives.length, 'Base UI must be present in the deferred primitive runtimes').toBeGreaterThan(0);
  for (const module of primitives) {
    expect(scripts.has(module.chunk), `${module.id} leaked into static closure`).toBe(false);
  }

  const chunks = new Map(report.chunks.map((chunk) => [chunk.file, chunk]));
  for (const id of ['src/react/menu/FoundationMenu.tsx', 'src/react/dialog/FoundationDialog.tsx']) {
    const primitive = report.modules.find((item) => item.id === id);
    const scripts = new Set([primitive.chunk]);
    for (const file of scripts) {
      expect(file, `${id} must not load an editor or drawing runtime`).not.toMatch(/vendor-(?:editor|tldraw|three)-/);
      for (const dependency of chunks.get(file).imports) scripts.add(dependency);
    }
  }
});
