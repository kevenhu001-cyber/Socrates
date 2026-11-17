import { test, expect } from './_state-fixture.mjs';
import { prepareChatWorkbench, expectNoGlobalError } from './_chat-workbench.mjs';

const fence = (nodes) =>
  '```socrates-ui\n' + nodes.map((node) => JSON.stringify(node)).join('\n') + '\n```';

test('same-title whiteboards have separate content and keep all accepted seeds', async ({
  page,
}) => {
  const nodes = [
    {
      id: 'first',
      type: 'visualization',
      template: 'whiteboard',
      title: '同名白板',
      payload: { items: Array.from({ length: 31 }, (_, i) => ({ label: `Seed ${i + 1}` })) },
    },
    {
      id: 'second',
      type: 'visualization',
      template: 'whiteboard',
      title: '同名白板',
      payload: { items: [{ label: 'Independent idea' }] },
    },
  ];
  await prepareChatWorkbench(page, {
    lang: 'en',
    messages: [{ clientId: 'boards', role: 'assistant', type: 'assistant', rawText: fence(nodes) }],
  });
  const first = page.locator('[data-intui-id="first"]');
  const second = page.locator('[data-intui-id="second"]');
  await expect(first.locator('[data-shape-type="note"]')).toHaveCount(31, { timeout: 20000 });
  await expect(second.locator('[data-shape-type="note"]')).toHaveCount(1);
  await expect(second).toContainText('Independent idea');
  await expect(first).not.toContainText('Independent idea');
  await expect(second).not.toContainText('Seed 1');
  await expectNoGlobalError(page);
});

test('3D objects away from the origin fit the camera and release the WebGL context', async ({
  page,
}) => {
  const node = {
    id: 'far',
    type: 'visualization',
    template: 'geometry_3d',
    title: 'Distant object',
    payload: {
      objects: [{ type: 'box', position: [80, 60, 40], size: [4, 4, 4] }],
    },
  };
  await prepareChatWorkbench(page, {
    lang: 'en',
    messages: [{ clientId: '3d', role: 'assistant', type: 'assistant', rawText: fence([node]) }],
  });
  const canvas = page.locator('[data-intui-id="far"] canvas');
  await expect(canvas).toBeVisible({ timeout: 15000 });
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const gl = element.getContext('webgl2') || element.getContext('webgl');
        const pixels = new Uint8Array(element.width * element.height * 4);
        gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i + 3] > 0 && pixels[i + 2] > pixels[i] * 1.4 && pixels[i + 2] > 50) count++;
        return count;
      }),
    )
    .toBeGreaterThan(100);
  await canvas.screenshot({ path: 'test-results/visualization-3d-camera-fit.png' });
  await canvas.evaluate((element) => {
    window.__auditGl = element.getContext('webgl2') || element.getContext('webgl');
    window.__socratesLegacy.postRender.disposeVisualization(element.closest('.visualization-card'));
  });
  await expect.poll(() => page.evaluate(() => window.__auditGl.isContextLost())).toBe(true);
  await expectNoGlobalError(page);
});
