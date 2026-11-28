import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = new URL('../../', import.meta.url);
const fixtures = JSON.parse(
  readFileSync(new URL('docs/examples/scientific-simulation.json', root), 'utf8'),
);
const analytic = {
  version: 1,
  views: [{ kind: 'plot', x: [0, 1], y: [0, 1], curves: [{ expression: 'x^2' }] }],
};
const cases = {
  analytic,
  adaptive: fixtures.fftOscillator,
  sparse: fixtures.nonsymmetricSparse,
  fem: fixtures.finiteElementPoisson,
  verlet: fixtures.verletOscillator,
};
function finish(generator) {
  let yields = 0,
    next = generator.next();
  while (!next.done) {
    yields++;
    next = generator.next();
  }
  return { runtime: next.value, yields };
}
if (process.argv[2] === '--child') {
  const [, , , mode, id] = process.argv;
  const program = cases[id];
  if (!program) throw Error('Unknown benchmark: ' + id);
  const start = performance.now();
  const module =
    mode === 'lazy'
      ? await import('../../packages/core/src/demonstrationAsync.js')
      : await import('../../packages/core/src/demonstration.js');
  const imported = performance.now();
  const factory =
    mode === 'lazy'
      ? await module.compileDemonstrationRuntimeAsync(program)
      : module.compileDemonstrationRuntime(program);
  const compiled = performance.now();
  const { runtime, yields } = finish(factory());
  const prepared = performance.now();
  const warmStart = performance.now();
  finish(factory());
  const warmEnd = performance.now();
  const metrics = {
    importMs: imported - start,
    compileMs: compiled - imported,
    prepareMs: prepared - compiled,
    warmPrepareMs: warmEnd - warmStart,
    firstReadyMs: prepared - start,
    yields,
    heapBytes: process.memoryUsage().heapUsed,
    warnings: runtime.warnings.length,
  };
  process.stdout.write(JSON.stringify(metrics));
} else {
  const repeats = Number(process.argv[2] ?? 5);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 30)
    throw Error('Choose 1–30 fresh-process repetitions');
  const med = (values) => {
    const a = [...values].sort((a, b) => a - b);
    return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2;
  };
  const rows = [];
  for (const id of Object.keys(cases))
    for (const mode of ['sync', 'lazy']) {
      const samples = [];
      for (let i = 0; i < repeats; i++) {
        const result = spawnSync(
          process.execPath,
          [fileURLToPath(import.meta.url), '--child', mode, id],
          { encoding: 'utf8' },
        );
        if (result.status !== 0) throw Error(result.stderr || 'Benchmark child failed');
        const sample = JSON.parse(result.stdout);
        if (sample.warnings) throw Error('Benchmark produced warnings: ' + id);
        samples.push(sample);
      }
      const row = { case: id, mode, runs: repeats };
      for (const key of [
        'importMs',
        'compileMs',
        'prepareMs',
        'warmPrepareMs',
        'firstReadyMs',
        'heapBytes',
        'yields',
      ]) {
        row[key] = Number(med(samples.map((s) => s[key])).toFixed(2));
      }
      rows.push(row);
    }
  console.table(rows);
  console.log(
    'Fresh Node processes, median results; not browser/network timings or device memory measurements.',
  );
}
