/* Throwaway visual harness: renders the exam setup form markup against the
   real styles.css at several widths and screenshots each. */
import { chromium } from 'playwright';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(__dirname, '../src/styles.css'), 'utf8');
const outDir = resolve(__dirname, '../test-results/harness');
mkdirSync(outDir, { recursive: true });

const DIFFS = [['beginner', 'Beginner'], ['intermediate', 'Intermediate'], ['hard', 'Hard'], ['expert', 'Expert']];
const DIFFS_ZH = [['beginner', '入门'], ['intermediate', '中级'], ['hard', '困难'], ['expert', '专家']];

function form(diffs) {
  const seg = diffs.map(([v, l]) =>
    `<button type="button" class="exam-seg-btn${v === 'intermediate' ? ' active' : ''}" data-diff="${v}">${l}</button>`).join('');
  return `<div class="exam-view" id="examView" style="position:static;display:flex;flex-direction:column">
  <div class="exam-view-body">
   <div class="exam-form-container">
    <div class="exam-form-section">
      <div class="exam-form-section-header"><span class="exam-form-section-title">Settings</span></div>
      <div class="exam-form-field"><label class="exam-form-label">Model</label>
        <div class="exam-model-wrap"><button class="exam-model-trigger" type="button"><span class="exam-model-label">GPT-4o mini</span></button></div>
      </div>
      <div class="exam-form-row">
        <div class="exam-form-field"><label class="exam-form-label">Difficulty</label>
          <div class="exam-seg" id="examDifficultySeg">${seg}</div></div>
        <div class="exam-form-field"><label class="exam-form-label">Questions</label>
          <div class="exam-stepper">
            <button type="button" class="exam-stepper-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12h14"/></svg></button>
            <span class="exam-stepper-val">5</span>
            <button type="button" class="exam-stepper-btn"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg></button>
          </div></div>
      </div>
    </div>
   </div>
  </div></div>`;
}

const browser = await chromium.launch();
for (const [label, diffs, scale] of [
  ['en', DIFFS, 1], ['zh', DIFFS_ZH, 1], ['en-scale115', DIFFS, 1.15], ['en-scale130', DIFFS, 1.3],
]) {
  for (const w of [1440, 900, 760, 660, 620, 601, 560, 420]) {
    const page = await browser.newPage({ viewport: { width: w, height: 700 } });
    await page.setContent(`<!doctype html><html><head><style>${css}</style>
      <style>:root{--app-font-scale:${scale}}body{margin:0;background:hsl(var(--bg-100))}</style>
      </head><body>${form(diffs)}</body></html>`);
    await page.waitForTimeout(120);
    const box = await page.locator('.exam-form-row').boundingBox();
    const segBox = await page.locator('.exam-seg').boundingBox();
    const btns = await page.locator('.exam-seg-btn').evaluateAll((els) => els.map((e) => {
      const r = e.getBoundingClientRect();
      return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), y: +r.top.toFixed(1), clipped: e.scrollWidth > e.clientWidth + 1, sw: e.scrollWidth, cw: e.clientWidth };
    }));
    const step = await page.locator('.exam-stepper').boundingBox();
    const rows = new Set(btns.map((b) => b.y)).size;
    const clipped = btns.filter((b) => b.clipped).length;
    console.log(`${label} w=${w} row.h=${box?.height.toFixed(0)} seg.w=${segBox?.width.toFixed(0)} segRows=${rows} clipped=${clipped} btnH=${btns.map(b=>b.h).join('/')} stepTop=${step?.y.toFixed(0)} segTop=${segBox?.y.toFixed(0)}`);
    await page.locator('.exam-form-section').screenshot({ path: `${outDir}/${label}-${w}.png` });
    await page.close();
  }
}
await browser.close();
