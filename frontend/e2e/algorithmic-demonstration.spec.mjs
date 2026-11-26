import { test, expect } from './_state-fixture.mjs';
import { readFileSync } from 'node:fs';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';
import { publishChatRuntime } from './_lib.mjs';
const examples = JSON.parse(
  readFileSync(
    new URL('../../docs/examples/algorithmic-demonstrations.json', import.meta.url),
    'utf8',
  ),
);

for (const theme of ['light', 'dark'])
  for (const mobile of [false, true]) {
    test(`algorithmic grating matches linked plot, field and compact controls (${theme}, ${mobile ? 'phone' : 'desktop'})`, async ({
      page,
    }) => {
      await page.addInitScript((theme) => localStorage.setItem('socrates-theme', theme), theme);
      const node = {
        id: 'grating',
        type: 'demonstration',
        title: '光栅明暗纹与光强分布',
        program: examples.grating,
      };
      await prepareChatWorkbench(page, {
        lang: 'zh',
        viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 1100 },
        messages: [
          {
            clientId: 'grating',
            role: 'assistant',
            type: 'assistant',
            rawText: `光栅的光强分布是单缝衍射包络与多缝干涉的乘积。\n\n\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\`\n\n改变缝数和间距，观察主峰与包络怎样变化。`,
          },
        ],
      });
      const demo = page.getByRole('region', { name: node.title, exact: true });
      await demo.scrollIntoViewIfNeeded();
      await expect(demo).toHaveAttribute('data-demo-quality', 'full');
      await expect(demo.locator('canvas')).toBeVisible();
      await expect(demo.locator('.demo-plot path[fill="none"]')).toHaveCount(2);
      await expect(demo.locator('foreignObject.demo-axis-label .katex')).toHaveCount(2);
      await expect(demo.getByRole('slider')).toHaveCount(3);
      const before = await demo.locator('.demo-plot path[fill="none"]').first().getAttribute('d');
      await demo.getByRole('slider', { name: '缝数 N', exact: true }).fill('10');
      await expect(demo.locator('.demo-plot path[fill="none"]').first()).not.toHaveAttribute(
        'd',
        before,
      );
      const rows = demo.locator('.demo-control');
      const labelBox = await rows.first().locator('label').boundingBox(),
        sliderBox = await rows.first().locator('input').boundingBox(),
        outputBox = await rows.first().locator('output').boundingBox();
      expect(sliderBox.x).toBeGreaterThan(labelBox.x);
      expect(outputBox.x).toBeGreaterThan(sliderBox.x);
      expect(Math.abs(sliderBox.y - outputBox.y)).toBeLessThan(18);
      await expect(demo).toHaveAttribute('data-demo-quality', 'full');
      const pixels = await demo.locator('canvas').evaluate((canvas) => {
        const c = canvas.getContext('2d');
        const row = c.getImageData(0, Math.floor(canvas.height / 2), canvas.width, 1).data;
        return [...row].filter((_, i) => i % 4 !== 3);
      });
      expect(Math.max(...pixels)).toBeGreaterThan(200);
      expect(Math.min(...pixels)).toBeLessThan(5);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
      ).toBeLessThanOrEqual(1);
      await page.evaluate(() => {
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      });
      await demo.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      await demo.screenshot({
        path: `test-results/demo-grating-${encodeURIComponent(theme)}-${encodeURIComponent(mobile ? 'phone' : 'desktop')}.png`,
      });
      await expectNoGlobalError(page);
    });
  }

test('Airy demonstration has algorithmic light and three separately styled curves', async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('socrates-theme', 'light'));
  const node = {
    id: 'airy',
    type: 'demonstration',
    title: '双点光源的分辨',
    program: examples.airy,
  };
  await prepareChatWorkbench(page, {
    lang: 'zh',
    viewport: { width: 390, height: 1000 },
    messages: [
      {
        clientId: 'airy',
        role: 'assistant',
        type: 'assistant',
        rawText: `拖动滑块改变角间距，观察衍射光强怎样叠加。\n\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\``,
      },
    ],
  });
  const demo = page.getByRole('region', { name: node.title, exact: true });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  await expect(demo.locator('canvas')).toBeVisible();
  await expect(demo.locator('.demo-plot path[fill="none"]')).toHaveCount(3);
  const axes = demo.locator('foreignObject.demo-axis-label');
  await expect(axes.locator('.katex math msub')).toHaveCount(2);
  await expect(axes.nth(0).locator('annotation')).toHaveText('\\theta / \\theta_R');
  await expect(axes.nth(1).locator('annotation')).toHaveText('I / I_0');
  const axisLabelClearsTicks = await axes
    .nth(1)
    .locator('.katex-html')
    .evaluate((label) => {
      const svg = label.closest('svg');
      if (!svg) return false;
      const title = label.getBoundingClientRect();
      const ticks = [...svg.querySelectorAll('.demo-axis text[text-anchor="end"]')];
      return (
        ticks.length > 0 && ticks.every((tick) => tick.getBoundingClientRect().left >= title.right)
      );
    });
  expect(axisLabelClearsTicks).toBe(true);
  await expect(demo.locator('.demo-control output .katex math msub')).toHaveCount(1);
  await expect(demo.locator('.demo-metrics dd .katex math msub')).toHaveCount(1);
  await expect(demo.locator('.demo-metrics')).toContainText('73.5');
  await demo.getByRole('button', { name: '0.6 · 更近', exact: true }).click();
  await expect(demo.getByRole('slider', { name: '角间距', exact: true })).toHaveValue('0.6');
  await demo.getByRole('button', { name: '1.0 · 瑞利', exact: true }).click();
  await expect(demo.getByRole('slider', { name: '角间距', exact: true })).toHaveValue('1');
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  await expect(demo.locator('.demo-metrics')).toContainText('73.5');
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await demo.evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await demo.screenshot({ path: 'test-results/demo-airy-phone.png' });
  await expectNoGlobalError(page);
});

test('unregistered Lorenz ODE produces a computed attractor and linked state values', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const node = {
    id: 'chaos',
    type: 'demonstration',
    title: '自定义洛伦兹系统',
    program: examples.lorenz,
  };
  await prepareChatWorkbench(page, {
    lang: 'zh',
    viewport: { width: 1280, height: 1000 },
    messages: [
      {
        clientId: 'lorenz',
        role: 'assistant',
        type: 'assistant',
        rawText: `\`\`\`socrates-ui\n${JSON.stringify(node)}\n\`\`\``,
      },
    ],
  });
  const demo = page.getByRole('region', { name: node.title, exact: true });
  const time = demo.getByRole('slider', { name: '时间', exact: true });
  await time.fill('20');
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  const path = demo.locator('.demo-plot path[fill="none"]').first();
  expect((await path.getAttribute('d')).length).toBeGreaterThan(5000);
  const before = await path.getAttribute('d');
  await demo.getByRole('slider', { name: 'ρ', exact: true }).fill('15');
  await time.fill('20');
  await expect(path).not.toHaveAttribute('d', before);
  await demo.getByRole('slider', { name: 'ρ', exact: true }).fill('28');
  await time.fill('20');
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await demo
    .locator('.demo-plot')
    .evaluate((element) => element.scrollIntoView({ block: 'center' }));
  await demo.screenshot({ path: 'test-results/demo-lorenz.png' });
  await expectNoGlobalError(page);
});

test('native tool events render a program, preserve controls through a patch and restore history', async ({
  page,
}) => {
  await prepareChatWorkbench(page, { lang: 'zh' });
  const historicalGrating = {
    ...examples.grating,
    views: examples.grating.views.map((view) =>
      view.kind === 'plot' ? { ...view, xLabel: 'd · sinθ / 550 nm', yLabel: 'I / I₀' } : view,
    ),
  };
  await page.evaluate(async (program) => {
    const ctl = await window.addStreamingMessage({ userPrompt: '演示光栅衍射' });
    window.__demoCtl = ctl;
    let seq = 0;
    window.__demoEvent = (payload) =>
      ctl.recordTurnEvent({
        version: 1,
        turnId: 'native-demonstration',
        seq: ++seq,
        at: Date.now(),
        ...payload,
      });
    const node = { id: 'grating', type: 'demonstration', title: '原生工具演示', program };
    window.__demoEvent({
      type: 'ui.begin',
      surfaceId: 'demo-tool',
      toolCallId: 'demo-tool',
      textOffset: 0,
    });
    window.__demoEvent({ type: 'ui.commit', surfaceId: 'demo-tool', nodes: [node] });
    ctl.recordToolUse({
      id: 'demo-tool',
      name: 'render_intelligent_ui',
      input: { version: 1, nodes: [node] },
    });
    ctl.recordToolResult({
      id: 'demo-tool',
      name: 'render_intelligent_ui',
      ok: true,
      status: 'completed',
      output: 'Rendered algorithmic demonstration',
    });
    ctl.append('这些亮纹由同一组参数实时计算。');
  }, historicalGrating);
  const demo = page.locator('.demonstration');
  await expect(demo.locator('canvas')).toBeVisible();
  await expect(demo.locator('foreignObject.demo-axis-label .katex')).toHaveCount(2);
  await demo.getByRole('slider', { name: '缝数 N', exact: true }).fill('10');
  await page.evaluate(() => {
    window.__demoEvent({
      type: 'ui.edit',
      surfaceId: 'demo-tool',
      baseRevision: 0,
      operations: [{ op: 'patch', nodeId: 'grating', props: { title: '更新后的演示' } }],
    });
  });
  await expect(demo).toContainText('更新后的演示');
  await expect(demo.getByRole('slider', { name: '缝数 N', exact: true })).toHaveValue('10');
  await demo.getByRole('slider', { name: '波长', exact: true }).fill('600');
  const driven = {
    ...examples.grating,
    parameters: examples.grating.parameters.map((p) => (p.id === 'N' ? { ...p, value: 8 } : p)),
  };
  await page.evaluate(
    (program) =>
      window.__demoEvent({
        type: 'ui.edit',
        surfaceId: 'demo-tool',
        baseRevision: 1,
        operations: [{ op: 'patch', nodeId: 'grating', props: { program } }],
      }),
    driven,
  );
  await expect(demo.getByRole('slider', { name: '缝数 N', exact: true })).toHaveValue('8');
  await expect(demo.getByRole('slider', { name: '波长', exact: true })).toHaveValue('600');
  await page.evaluate((program) => {
    window.__demoEvent({
      type: 'ui.edit',
      surfaceId: 'demo-tool',
      baseRevision: 2,
      operations: [
        {
          op: 'patch',
          nodeId: 'grating',
          props: { program: { ...program, resetKey: 'restore-declared-values' } },
        },
      ],
    });
    window.__demoCtl.finish();
  }, driven);
  await expect(demo.getByRole('slider', { name: '波长', exact: true })).toHaveValue('550');
  const saved = await page.evaluate(() =>
    JSON.parse(JSON.stringify(window.__socratesTestState.session().messages)),
  );
  await prepareChatWorkbench(page, { lang: 'zh', messages: saved });
  await expect(page.locator('.demonstration')).toHaveCount(1);
  await expect(page.locator('.demonstration canvas')).toBeVisible();
  await expect(page.getByRole('slider', { name: '缝数 N', exact: true })).toHaveValue('8');
  await expectNoGlobalError(page);
});

test('complex raster fields reduce sampling and keep controls available across repeated renders', async ({
  page,
}) => {
  const program = {
    version: 1,
    parameters: [{ id: 'a', min: 0, max: 2, value: 1 }],
    definitions: {
      intensity: 'sum(k,1,128,sin(x*k+a)^2)/128',
      unused: 'sum(k,1,128,sum(j,1,128,k*j))',
    },
    views: [{ kind: 'field', x: [-2, 2], y: [-1, 1], expression: 'intensity' }],
  };
  const node = { id: 'costly', type: 'demonstration', title: '复杂场图', program };
  await prepareChatWorkbench(page, {
    lang: 'zh',
    messages: [
      {
        clientId: 'costly',
        role: 'assistant',
        type: 'assistant',
        rawText: '```socrates-ui\n' + JSON.stringify(node) + '\n```',
      },
    ],
  });
  const demo = page.locator('.demonstration');
  await expect(demo.locator('canvas')).toBeVisible();
  for (const value of ['0.5', '1.5', '1']) {
    await demo.getByRole('slider', { name: 'a', exact: true }).fill(value);
    await expect(demo.locator('.demo-error')).toHaveCount(0);
  }
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  const bright = await demo
    .locator('canvas')
    .evaluate((canvas) => canvas.getContext('2d').getImageData(160, 80, 1, 1).data[0]);
  expect(bright).toBeGreaterThan(0);
  await expectNoGlobalError(page);
});

test('a bare versioned document from the screenshot renders as an interactive demonstration', async ({
  page,
}) => {
  const doc = {
    version: 1,
    nodes: [
      {
        id: 'bare-demo',
        type: 'demonstration',
        title: '单缝夫琅禾费衍射',
        program: {
          version: 1,
          parameters: [
            { id: 'ratio', label: '缝宽 / 波长', value: 4, min: 0.6, max: 20, step: 0.2 },
          ],
          definitions: { I: 'sinc(pi*x)^2' },
          views: [
            { kind: 'controls' },
            {
              kind: 'plot',
              x: [-5, 5],
              y: [0, 1.05],
              curves: [{ expression: 'I', color: 'blue' }],
            },
          ],
        },
      },
    ],
  };
  await prepareChatWorkbench(page, {
    lang: 'zh',
    viewport: { width: 390, height: 844 },
    messages: [
      {
        clientId: 'bare',
        role: 'assistant',
        type: 'assistant',
        rawText:
          '下面这个可调演示里，你可以拖动滑块：\n\n' +
          JSON.stringify(doc, null, 2) +
          '\n\n调整参数观察变化。',
      },
    ],
  });
  const demo = page.getByRole('region', { name: '单缝夫琅禾费衍射', exact: true });
  await expect(demo.locator('.demo-plot path[fill="none"]')).toHaveCount(1);
  await demo.getByRole('slider').fill('6');
  await expect(demo.getByRole('slider')).toHaveValue('6');
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  await expect(page.locator('#msgList')).not.toContainText('"version"');
  await page.screenshot({ path: 'test-results/recovered-bare-demonstration-phone.png' });
  await expectNoGlobalError(page);
});

test('scrubbing keeps the latest frame and idle refinement restores exact raster samples', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const program = {
    version: 1,
    duration: 10,
    parameters: [{ id: 'a', min: 0, max: 2, step: 0.1, value: 1 }],
    views: [
      {
        kind: 'field',
        x: [-1, 1],
        y: [-1, 1],
        height: 64,
        gamma: 1,
        tint: [1, 1, 1],
        expression: '(a+x+y+t)/16',
      },
    ],
  };
  const node = { id: 'precision', type: 'demonstration', title: 'Precision', program };
  await prepareChatWorkbench(page, {
    messages: [
      {
        clientId: 'precision',
        role: 'assistant',
        type: 'assistant',
        rawText: '```socrates-ui\n' + JSON.stringify(node) + '\n```',
      },
    ],
  });
  const demo = page.getByRole('region', { name: 'Precision', exact: true });
  await demo.scrollIntoViewIfNeeded();
  const parameter = demo.getByRole('slider', { name: 'a', exact: true });
  const time = demo.getByRole('slider', { name: 'Time', exact: true });
  await parameter.fill('0.2');
  await time.fill('9');
  await parameter.fill('1.7');
  await time.fill('7.3');
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  const pixel = await demo
    .locator('canvas')
    .evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(181, 23, 1, 1).data));
  const x = -1 + (181 / 319) * 2;
  const y = 1 - (23 / 63) * 2;
  const channel = Math.round(((1.7 + x + y + 7.3) / 16) * 255);
  expect(pixel).toEqual([channel, channel, channel, 255]);
  await expectNoGlobalError(page);
});

test('visible demonstrations share a worker and release it when they leave the transcript', async ({
  page,
}) => {
  const program = {
    version: 1,
    duration: 30,
    views: [{ kind: 'field', x: [-1, 1], y: [-1, 1], height: 64, expression: 'sin(t+x+y)^2' }],
  };
  const nodes = ['first', 'second'].map((id) => ({
    id,
    type: 'demonstration',
    title: id,
    program,
  }));
  const tail = Array.from(
    { length: 40 },
    (_, index) => `Scroll probe paragraph ${index + 1}.`,
  ).join('\n\n');
  const workers = [];
  page.on('worker', (worker) => {
    if (worker.url().includes('demonstration.worker')) workers.push(worker);
  });
  await prepareChatWorkbench(page, {
    viewport: { width: 1280, height: 1100 },
    messages: [
      {
        clientId: 'shared-worker',
        role: 'assistant',
        type: 'assistant',
        rawText:
          nodes.map((node) => '```socrates-ui\n' + JSON.stringify(node) + '\n```').join('\n\n') +
          '\n\n' +
          tail,
      },
    ],
  });
  const demos = page.locator('.demonstration[data-demo-quality="full"]');
  await page
    .locator('.demonstration')
    .first()
    .evaluate((card) => card.scrollIntoView({ block: 'start' }));
  await expect(demos).toHaveCount(2);
  expect(workers).toHaveLength(1);
  const parked = workers[0].waitForEvent('close');
  await page.getByText('Scroll probe paragraph 40.', { exact: true }).scrollIntoViewIfNeeded();
  await parked;
  await expect(page.locator('.demonstration')).toHaveCount(2);
  await page
    .locator('.demonstration')
    .first()
    .evaluate((card) => card.scrollIntoView({ block: 'start' }));
  await expect.poll(() => workers.length).toBe(2);
  const closed = workers[1].waitForEvent('close');
  await page.evaluate(() => {
    window.__socratesTestState.patch({ session: { messages: [] } });
  });
  await publishChatRuntime(page, { type: 'state-synced', reason: 'demonstration-unmount' });
  await expect(page.locator('.demonstration')).toHaveCount(0);
  await closed;
  await expectNoGlobalError(page);
});

test('scientific field renders a physical color scale and contours without horizontal overflow', async ({ page }) => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  const node = { id: 'scientific-field', type: 'demonstration', title: 'Scientific field', program: scientific.field };
  await prepareChatWorkbench(page, {
    lang: 'en',
    viewport: { width: 390, height: 844 },
    messages: [{ clientId: 'scientific-field', role: 'assistant', type: 'assistant',
      rawText: '\x60\x60\x60socrates-ui\n' + JSON.stringify(node) + '\n\x60\x60\x60' }],
  });
  const demo = page.getByRole('region', { name: node.title, exact: true });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  await expect(demo.locator('canvas')).toBeVisible();
  await expect(demo.locator('.demo-color-scale')).toBeVisible();
  await expect(demo.getByText(/Contour levels/)).toBeVisible();
  expect(await demo.locator('.demo-color-scale').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await expectNoGlobalError(page);
});

test('Bode plots render physical decade tick labels on a narrow viewport', async ({ page }) => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  const node = { id: 'scientific-bode', type: 'demonstration', title: 'Bode response', program: scientific.bode };
  await prepareChatWorkbench(page, {
    lang: 'en', viewport: { width: 390, height: 844 },
    messages: [{ clientId: 'scientific-bode', role: 'assistant', type: 'assistant',
      rawText: '\x60\x60\x60socrates-ui\n' + JSON.stringify(node) + '\n\x60\x60\x60' }],
  });
  const demo = page.getByRole('region', { name: node.title, exact: true });
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-demo-quality', 'full');
  await expect(demo.locator('.demo-plot').first().getByText('1000',{exact:true})).toBeVisible();
  await expect(demo.locator('.demo-plot').first().getByText('0.1',{exact:true})).toBeVisible();
  await expectNoGlobalError(page);
});

test('rotatable scientific surface uses a sampled wireframe and local camera control', async ({ page }) => {
  const scientific = JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json', import.meta.url), 'utf8'));
  const node={id:'surface-3d',type:'demonstration',title:'Scientific surface',program:scientific.surface3D};
  await prepareChatWorkbench(page,{lang:'en',viewport:{width:390,height:844},messages:[{clientId:'surface-3d',role:'assistant',type:'assistant',rawText:'\x60\x60\x60socrates-ui\n'+JSON.stringify(node)+'\n\x60\x60\x60'}]});
  const demo=page.getByRole('region',{name:node.title,exact:true});
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-demo-quality','full');
  const surface=demo.getByRole('img',{name:'Radially damped surface'});
  await expect(surface).toBeVisible();
  const mesh=surface.locator('g[stroke] path').first();
  const before=await mesh.getAttribute('d');
  await demo.getByRole('slider',{name:'Azimuth'}).fill('75');
  await expect(mesh).not.toHaveAttribute('d',before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBeLessThanOrEqual(1);
  await expectNoGlobalError(page);
});

test('large heat grid renders shaded surface and physical cross section', async ({page}) => {
  const scientific=JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json',import.meta.url),'utf8'));
  const node={id:'implicit-heat-grid',type:'demonstration',title:'Implicit heat grid',program:scientific.implicitHeat2D};
  await prepareChatWorkbench(page,{lang:'en',viewport:{width:390,height:844},messages:[{clientId:node.id,role:'assistant',type:'assistant',rawText:'\x60\x60\x60socrates-ui\n'+JSON.stringify(node)+'\n\x60\x60\x60'}]});
  const demo=page.getByRole('region',{name:node.title,exact:true});
  await demo.scrollIntoViewIfNeeded();
  await expect(demo).toHaveAttribute('data-demo-quality','full',{timeout:30000});
  await expect(demo.locator('[data-surface-style="shaded"] polygon').first()).toBeVisible();
  await expect(demo.getByRole('img',{name:'Temperature surface'})).toBeVisible();
  await expectNoGlobalError(page);
});

test('spatial vector field and sparse diagnostics use native scientific views',async({page})=>{
  const scientific=JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json',import.meta.url),'utf8'));
  const nodes=[{id:'space-vector',type:'demonstration',title:'Spatial vector field',program:scientific.vectorField3D},{id:'sparse-chain',type:'demonstration',title:'Sparse chain',program:scientific.sparseChain}];
  await prepareChatWorkbench(page,{lang:'en',viewport:{width:390,height:844},messages:nodes.map(node=>({clientId:node.id,role:'assistant',type:'assistant',rawText:'\x60\x60\x60socrates-ui\n'+JSON.stringify(node)+'\n\x60\x60\x60'}))});
  const vector=page.getByRole('region',{name:'Spatial vector field',exact:true});
  await vector.scrollIntoViewIfNeeded();
  await expect(vector).toHaveAttribute('data-demo-quality','full');
  await expect(vector.locator('[data-space-vectors="1"] path').first()).toBeVisible();
  const sparse=page.getByRole('region',{name:'Sparse chain',exact:true});
  await sparse.scrollIntoViewIfNeeded();
  await expect(sparse).toHaveAttribute('data-demo-quality','full');
  await sparse.getByText('Solver diagnostics · PCG',{exact:true}).click();
  await expect(sparse.getByText('Matrix nonzero entries',{exact:true})).toBeVisible();
  await expectNoGlobalError(page);
});

test('chemistry and biological models render molecular symbols and linked reaction curves',async({page})=>{
  const scientific=JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json',import.meta.url),'utf8'));
  const nodes=[{id:'molecules',type:'demonstration',title:'Molecular structures',program:scientific.molecularStructures},{id:'enzyme',type:'demonstration',title:'Enzyme kinetics',program:scientific.enzymeKinetics}];
  await prepareChatWorkbench(page,{lang:'en',viewport:{width:390,height:844},messages:nodes.map(node=>({clientId:node.id,role:'assistant',type:'assistant',rawText:'\x60\x60\x60socrates-ui\n'+JSON.stringify(node)+'\n\x60\x60\x60'}))});
  const molecules=page.getByRole('region',{name:'Molecular structures',exact:true});
  await molecules.scrollIntoViewIfNeeded();
  await expect(molecules).toHaveAttribute('data-demo-quality','full');
  await expect(molecules.locator('[data-scene-object="atom"]')).toHaveCount(6);
  await expect(molecules.locator('[data-scene-object="doubleBond"]')).toHaveCount(2);
  const enzyme=page.getByRole('region',{name:'Enzyme kinetics',exact:true});
  await enzyme.scrollIntoViewIfNeeded();
  await expect(enzyme).toHaveAttribute('data-demo-quality','full');
  await expect(enzyme.locator('[data-scene-object="reversibleArrow"]')).toBeVisible();
  await expect(enzyme.getByRole('slider',{name:'Binding rate'})).toBeVisible();
  await expectNoGlobalError(page);
});

test('general numerical views expose local roots, field slices and linked controls',async({page})=>{
  const scientific=JSON.parse(readFileSync(new URL('../../docs/examples/scientific-simulation.json',import.meta.url),'utf8'));
  const nodes=[{id:'root',type:'demonstration',title:'Nonlinear root',program:scientific.nonlinearEquilibrium},{id:'slice',type:'demonstration',title:'Volume slice',program:scientific.volumeSlice}];
  await prepareChatWorkbench(page,{lang:'en',viewport:{width:390,height:844},messages:nodes.map(node=>({clientId:node.id,role:'assistant',type:'assistant',rawText:'\x60\x60\x60socrates-ui\n'+JSON.stringify(node)+'\n\x60\x60\x60'}))});
  const root=page.getByRole('region',{name:'Nonlinear root',exact:true});
  await root.scrollIntoViewIfNeeded();
  await expect(root).toHaveAttribute('data-demo-quality','full');
  await expect(root.getByText('Root q',{exact:true})).toBeVisible();
  const slice=page.getByRole('region',{name:'Volume slice',exact:true});
  await slice.scrollIntoViewIfNeeded();
  await expect(slice).toHaveAttribute('data-demo-quality','full');
  await expect(slice.getByText('Slice plane: z = 0.3',{exact:true})).toBeVisible();
  await slice.getByRole('slider',{name:'Slice position'}).fill('0.8');
  await expect(slice.getByText('Slice plane: z = 0.8',{exact:true})).toBeVisible();
  await expectNoGlobalError(page);
});
