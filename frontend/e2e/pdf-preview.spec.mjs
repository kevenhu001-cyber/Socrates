import { test, expect } from './_state-fixture.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

// A real one-page PDF with a painted rectangle and a valid cross-reference table.
function pdfFixture() {
  const stream = '0 0 1 rg 20 20 100 100 re f\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const start = Buffer.byteLength(body);
  body += `xref\n0 5\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(body);
}

test('sent PDF renders with a JavaScript worker under the production CSP', async ({ page }) => {
  await mockAuthedApp(page);
  await page.route('**/api/v2/files/pdf-preview-fixture/raw?inline=1', (route) =>
    route.fulfill({ contentType: 'application/pdf', body: pdfFixture() }),
  );
  // Mirror nginx's default .mjs MIME mapping: a regression must fail here.
  await page.route('**/assets/*.mjs', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, contentType: 'application/octet-stream' });
  });
  const workerPromise = page.waitForEvent('worker');
  await page.goto('/');
  await waitForAppShell(page);
  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
    window.__socratesTestState.patch({ session: { phase: 'chat' } });
    window.__socratesTestState.patch({ session: { messages: [] } });
    window.addMessage('user', 'Preview this PDF.', null, null, [
      {
        id: 'pdf-preview',
        kind: 'document',
        docKind: 'pdf',
        name: 'preview.pdf',
        mime: 'application/pdf',
        size: 500,
        fileId: 'pdf-preview-fixture',
      },
    ]);
  });
  await page.locator('.msg.user .file-card').click();
  const worker = await workerPromise;
  expect(worker.url()).toMatch(/\/assets\/pdf\.worker\.min-[\w-]+\.js$/);
  await expect(page.locator('.doc-preview-toolbar-page')).toHaveText('1 / 1');
  const canvas = page.locator('.doc-preview-page-canvas');
  await expect(canvas).toBeVisible();
  await expect
    .poll(() =>
      canvas.evaluate((element) => {
        const pixels = element
          .getContext('2d')
          .getImageData(0, 0, element.width, element.height).data;
        for (let index = 0; index < pixels.length; index += 4) {
          if (pixels[index] === 0 && pixels[index + 1] === 0 && pixels[index + 2] === 255)
            return true;
        }
        return false;
      }),
    )
    .toBe(true);
});
