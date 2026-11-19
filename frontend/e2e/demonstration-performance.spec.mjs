import { readFileSync } from 'node:fs';
import { test, expect } from './_state-fixture.mjs';
import { expectNoGlobalError, prepareChatWorkbench } from './_chat-workbench.mjs';
import { publishChatRuntime } from './_lib.mjs';

const { airy, lorenz } = JSON.parse(
  readFileSync(
    new URL('../../docs/examples/algorithmic-demonstrations.json', import.meta.url),
    'utf8',
  ),
);
const dynamic = {
  version: 1,
  duration: 30,
  parameters: [{ id: 'a', min: 0, max: 2, step: 0.01, value: 1 }],
  definitions: { intensity: 'sum(k,1,8,sin((x+y)*k+a+t)^2)/8' },
  views: [{ kind: 'field', x: [-4, 4], y: [-2, 2], height: 96, expression: 'intensity' }],
};

const scenarios = [
  { name: 'cold-airy-and-rk4', programs: [airy, lorenz], plot: true },
  { name: 'continuous-drag', programs: [airy], drag: true },
  { name: 'dynamic-field', programs: [dynamic] },
  { name: 'three-dynamic-fields', programs: [dynamic, dynamic, dynamic] },
  { name: 'three-dynamic-fields-cpu-4x', programs: [dynamic, dynamic, dynamic], cpu: 4 },
];

test.describe('demonstration performance benchmark', () => {
  test.skip(process.env.SOCRATES_DEMO_BENCH !== '1', 'Opt-in wall-clock benchmark');

  for (const scenario of scenarios) {
    test(scenario.name, async ({ page, context }, testInfo) => {
      await page.addInitScript(() => {
        const draw = CanvasRenderingContext2D.prototype.putImageData;
        window.demoBench = { paints: new WeakMap() };
        CanvasRenderingContext2D.prototype.putImageData = function (...args) {
          const state = window.demoBench;
          const value = state.paints.get(this.canvas) ?? { count: 0, first: performance.now() };
          value.count++;
          state.paints.set(this.canvas, value);
          return draw.apply(this, args);
        };
      });
      await prepareChatWorkbench(page, { viewport: { width: 1440, height: 1400 } });
      if (scenario.cpu) {
        const cdp = await context.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpu });
      }
      const messages = [
        {
          clientId: 'performance',
          role: 'assistant',
          type: 'assistant',
          rawText: scenario.programs
            .map(
              (program, index) =>
                '```socrates-ui\n' +
                JSON.stringify({
                  id: 'bench-' + index,
                  type: 'demonstration',
                  title: 'Benchmark ' + index,
                  program,
                }) +
                '\n```',
            )
            .join('\n\n'),
        },
      ];
      await page.evaluate((messages) => {
        const state = window.demoBench;
        state.start = performance.now();
        state.long = [];
        state.gaps = [];
        state.last = state.start;
        state.observer = new PerformanceObserver((list) => {
          for (const task of list.getEntries()) state.long.push(task.duration);
        });
        state.observer.observe({ entryTypes: ['longtask'] });
        const tick = (now) => {
          state.gaps.push({ at: now, ms: now - state.last });
          state.last = now;
          state.raf = requestAnimationFrame(tick);
        };
        state.raf = requestAnimationFrame(tick);
        window.__socratesTestState.patch({ session: { messages } });
      }, messages);
      await publishChatRuntime(page, { type: 'state-synced', reason: 'demo-benchmark' });
      const fieldCount = scenario.programs.filter((program) =>
        program.views.some((view) => view.kind === 'field'),
      ).length;
      await page.waitForFunction(
        ({ fieldCount, plot }) => {
          const fields = [...document.querySelectorAll('.demonstration canvas')];
          return (
            fields.length === fieldCount &&
            fields.every((canvas) => window.demoBench.paints.has(canvas)) &&
            (!plot ||
              document.querySelectorAll('.demonstration .demo-plot svg path[vector-effect]')
                .length >= 4)
          );
        },
        { fieldCount, plot: scenario.plot },
      );
      const ready = await page.evaluate(() => performance.now());
      const composer = page.locator('#composerRoot .rich-composer-editor').first();
      await composer.focus();
      const sample = page.evaluate(
        async ({ drag, dynamic }) => {
          const state = window.demoBench;
          const fields = [...document.querySelectorAll('.demonstration canvas')];
          const start = performance.now();
          const paintsAtStart = fields.map((canvas) => state.paints.get(canvas).count);
          const slider = document.querySelector('.demo-control input');
          const composer = document.querySelector('#composerRoot .rich-composer-editor');
          const inputDelays = [];
          const recordInput = (event) => {
            requestAnimationFrame(() => inputDelays.push(performance.now() - event.timeStamp));
          };
          composer.addEventListener('input', recordInput);
          const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
          const waits = [];
          const duration = 1800;
          let inputs = 0,
            ended = start;
          while (performance.now() - start < duration) {
            const target = performance.now() + 32;
            await new Promise((resolve) => setTimeout(resolve, 32));
            waits.push(Math.max(0, performance.now() - target));
            if (drag) {
              setValue.call(
                slider,
                String(
                  Number(slider.min) +
                    ((Number(slider.max) - Number(slider.min)) * (inputs % 17)) / 17,
                ),
              );
              slider.dispatchEvent(new Event('input', { bubbles: true }));
              inputs++;
              ended = performance.now();
            }
          }
          const observed = performance.now();
          if (drag) {
            const first = fields[0];
            const card = first.closest('.demonstration');
            while (
              card.hasAttribute('data-demo-quality') &&
              card.dataset.demoQuality !== 'full' &&
              performance.now() - ended < 5000
            )
              await new Promise(requestAnimationFrame);
          }
          const percentile = (values, p) => {
            const sorted = [...values].sort((a, b) => a - b);
            return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)] ?? 0;
          };
          composer.removeEventListener('input', recordInput);
          cancelAnimationFrame(state.raf);
          state.observer.disconnect();
          const gaps = state.gaps
            .filter(({ at }) => at > start && at <= observed)
            .map(({ ms }) => ms);
          const round = Math.round;
          return {
            firstCanvasMs: round(
              Math.min(...fields.map((canvas) => state.paints.get(canvas).first)) - state.start,
            ),
            allCanvasMs: round(
              Math.max(...fields.map((canvas) => state.paints.get(canvas).first)) - state.start,
            ),
            startupP95GapMs: round(
              percentile(
                state.gaps.filter(({ at }) => at <= start).map(({ ms }) => ms),
                0.95,
              ),
            ),
            frameP95GapMs: round(percentile(gaps, 0.95)),
            frameWorstGapMs: round(Math.max(...gaps)),
            timerP95DelayMs: round(percentile(waits, 0.95)),
            composerP95Ms: round(percentile(inputDelays, 0.95)),
            blockingMs: round(state.long.reduce((sum, ms) => sum + Math.max(0, ms - 50), 0)),
            inputEvents: inputs,
            finalRefinementMs:
              drag && fields[0].closest('.demonstration').hasAttribute('data-demo-quality')
                ? round(performance.now() - ended)
                : undefined,
            canvasUpdates: fields.map(
              (canvas, i) => state.paints.get(canvas).count - paintsAtStart[i],
            ),
            dynamic,
          };
        },
        { drag: scenario.drag, dynamic: !scenario.plot && !scenario.drag },
      );
      // Use three input events so a severely blocked baseline does not spend
      // the whole test timeout waiting for one round trip per character.
      for (const text of ['Chat ', 'stays ', 'responsive']) await page.keyboard.insertText(text);
      await expect(composer).toContainText('Chat stays responsive');
      const result = {
        scenario: scenario.name,
        ...(await sample),
        readyMs: Math.round(await page.evaluate((ready) => ready - window.demoBench.start, ready)),
      };
      if (result.dynamic) expect(result.canvasUpdates.every((count) => count > 0)).toBe(true);
      if (scenario.drag) expect(result.inputEvents).toBeGreaterThan(5);
      await expectNoGlobalError(page);
      console.log('DEMO_BENCH ' + JSON.stringify(result));
      await testInfo.attach('demonstration-performance', {
        body: JSON.stringify(result),
        contentType: 'application/json',
      });
    });
  }
});
