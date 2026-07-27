import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:5199';
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

async function goto(url) {
  try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); }
  catch { await page.goto(url, { waitUntil: 'commit', timeout: 60000 }); await page.waitForTimeout(8000); }
}

await goto(BASE + '/');
await page.waitForTimeout(2500);
const gate = await page.locator('#authGate').isVisible().catch(() => false);
if (gate) {
  await page.fill('#authSigninEmail', 'qa-tester@example.com');
  await page.fill('#authSigninPassword', 'QaTest12345!');
  await page.locator('#authSigninBtn').click({ force: true, noWaitAfter: true });
  await page.waitForTimeout(4000);
}

// === Probe A: data-action coverage ===
const dataActionCoverage = await page.evaluate(() => {
  const used = new Set();
  document.querySelectorAll('[data-action]').forEach(el => {
    const v = el.getAttribute('data-action');
    v.split(';').forEach(p => { const id = p.trim().split('.')[0].split('(')[0]; if (id && id !== '__stop') used.add(id); });
  });
  // Look at registration by introspecting delegate.js actions — not accessible at runtime,
  // so we just enumerate uniqueness.
  return Array.from(used).sort();
});
console.log('DATA-ACTIONS USED:', dataActionCoverage.length, dataActionCoverage.join(','));

// === Probe B: window.* bindings health ===
const bindings = await page.evaluate(() => {
  // Inline event handlers and data-action chains reach into window.*; check a key set.
  const fns = ['toggleSidebar','setRecentsFilter','getRecentsFilter','clearRecentsFilter',
               'showConfirm','showToast','openSettings','closeSettings','openUsageModal','closeUsageModal',
               'loadUsageData','loadUsageMonth','showUsageTip','hideUsageTip',
               'openCmdK','closeCmdK','openCheatsheet','closeCheatsheet',
               'openPromptTemplatesModal','closePromptTemplatesModal',
               'closeTagEditor','clearActiveTemplate','onSlashRowClick','selectDiag',
               'prevDiagQuestion','nextDiagQuestion','skipDiagQuestion','finishDiagnostic',
               'proceedToTeaching','moveSessionToProject',
               'openNavLibrary','openNavProjects','openNavScheduled','openNavPlugins','openNavExam','openMoreNav',
               'setLang','resetApp','incognitoChat','signOut','updateModeBadge','syncEffortUI'];
  const missing = fns.filter(f => typeof window[f] !== 'function');
  return { missing, total: fns.length };
});
console.log('BINDINGS:', JSON.stringify(bindings));

// === Probe C: Settings modal opens correctly ===
await page.click('#settingsCloseBtn').catch(()=>{});
await page.evaluate(() => window.openSettings && window.openSettings());
await page.waitForTimeout(800);
const settingsState = await page.evaluate(() => {
  const o = document.getElementById('settingsOverlay');
  return { open: o && !o.classList.contains('hidden'), title: document.querySelector('.settings-title')?.textContent };
});
console.log('SETTINGS:', JSON.stringify(settingsState));
await page.click('#settingsCloseBtn').catch(()=>{});
await page.waitForTimeout(400);

// === Probe D: Cmd-K opens ===
await page.evaluate(() => window.openCmdK && window.openCmdK());
await page.waitForTimeout(500);
const cmdkState = await page.evaluate(() => {
  const o = document.getElementById('cmdKOverlay');
  return { open: o && !o.classList.contains('hidden') };
});
console.log('CMDK:', JSON.stringify(cmdkState));
await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// === Probe E: confirm dialog roundtrip ===
const confirmResult = await page.evaluate(async () => {
  const ok = await window.showConfirm('Test heading', 'Test message', true);
  return ok;
});
console.log('CONFIRM:', confirmResult);

// === Probe F: reaction to Esc key on tooltips/usage ===
await page.evaluate(() => window.openUsageModal && window.openUsageModal());
await page.waitForTimeout(1200);
const usageState = await page.evaluate(() => {
  const o = document.getElementById('usageOverlay');
  const t = document.querySelector('.usage-title')?.textContent;
  return { open: o && !o.classList.contains('hidden'), title: t };
});
console.log('USAGE MODAL:', JSON.stringify(usageState));

// === Probe G: heatmap tooltip (probe bindings showUsageTip/hideUsageTip without throwing) ===
const tipResult = await page.evaluate(async () => {
  try {
    const cell = document.querySelector('#usageHeatmap rect, #usageHeatmap td, .usage-heatmap rect, .usage-heatmap td');
    const r = { tipFound: !!cell, firedEnter: false, firedLeave: false };
    if (cell) {
      const ev = (id) => new MouseEvent(id, { bubbles: true });
      cell.dispatchEvent(ev('mouseenter'));
      r.firedEnter = true;
      cell.dispatchEvent(ev('mouseleave'));
      r.firedLeave = true;
    }
    return r;
  } catch (e) { return { err: String(e) }; }
});
console.log('USAGE TOOLTIP:', JSON.stringify(tipResult));

await page.keyboard.press('Escape');
await page.waitForTimeout(400);

// === Probe H: error console ===
console.log('CONSOLE ERRORS:', consoleErrors.length);
if (consoleErrors.length) console.log(consoleErrors.slice(0, 5).join('\n---\n'));

await browser.close();
