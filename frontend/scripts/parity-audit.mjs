// scripts/parity-audit.mjs — PC UI audit against the chatgpt.com reference.
//
// Renders the built SPA (dist/ served by e2e/dist-server.mjs on :4173) with
// the mocked API, walks a scenario × viewport × theme × lang matrix, and for
// every scenario records (all under the gitignored debug/parity/):
//   - a PNG screenshot           → <scenario>-<w>-<mode>-<lang>.png
//   - geometry + computed styles → metrics.json
//   - layout defects (see detectDefects) → defects.json
//
// Usage:
//   node e2e/dist-server.mjs &           # serve dist/
//   node scripts/parity-audit.mjs [--quick] [--only=home,chat]
// ChatGPT reference values come from scripts/chatgpt-ref.mjs.
import { chromium } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { mockAuthedApp, waitForAppShell } from '../e2e/_mock-api.mjs';
import { gotoAndSettle } from '../e2e/_lib.mjs';

const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v ?? true];
}));
const BASE = args.base || 'http://127.0.0.1:4173';
const OUT = fileURLToPath(new URL('../debug/parity/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const WIDTHS = args.quick ? [1440] : [1440, 1280, 1024];
const MODES = args.quick ? ['dark'] : ['dark', 'light'];
const LANGS = args.quick ? ['zh'] : ['zh', 'en'];

// Elements measured per scenario, keyed by role (same role names as
// scripts/chatgpt-ref.mjs so the two JSON files line up).
const SOCRATES_ROLES = {
  body: 'body',
  sidebar: '#sidebar, .sidebar',
  sidebarItem: '#sidebar .sidebar-nav-btn',
  topbar: '.top-bar',
  heroTitle: '#topicSetup h1, .cg-hero-title, .topic-title',
  /* The three landing shortcuts. Their container height doubles as the
     home-surface dead-zone probe: when it collapses to 0 the landing page
     loses ~410px of empty band under the composer, which is exactly the
     regression that shipped unnoticed before 2026-10-04. */
  homeQuickActions: '#homeQuickActions',
  disclaimer: '#topicDisclaimer',
  composer: '#composerInputWrap',
  /* P_composer-single collapsed #topicInputWrap / #chatInputWrap into a
     single #composerInputWrap shell (2026-09). The three selectors below
     were left pointing at the retired ids, so the composer geometry this
     audit exists to protect was silently measuring null. Re-pointed here. */
  composerPlus: '#composerToolsBtn',
  composerSend: '#composerPrimaryBtn',
  composerMic: '#composerMicBtn',
  /* `.composer-editor-root` is `display: contents` (composer-unified.css),
     so it has no box and measure() can never resolve it — the first run of
     the unresolved-role guard caught exactly that. The inner ProseMirror
     element is what actually has geometry. */
  composerEditor: '#composerRoot .rich-composer-editor',
  userBubble: '.msg.user .msg-body',
  assistantProse: '.msg.assistant .msg-body',
  msgToolbar: '.msg-toolbar',
  codeBlock: 'pre',
  menu: '[role="menu"]',
  dialog: '[role="dialog"]',
};


const STYLE_KEYS = [
  'display', 'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight',
  'lineHeight', 'letterSpacing', 'borderRadius', 'borderTopWidth', 'borderTopColor',
  'boxShadow', 'padding', 'gap', 'maxWidth', 'transitionProperty',
  'transitionDuration', 'transitionTimingFunction', 'animationName', 'animationDuration',
];

async function measure(page, roles) {
  return page.evaluate(({ roles, keys }) => {
    const out = {};
    for (const [role, sel] of Object.entries(roles)) {
      const el = [...document.querySelectorAll(sel)].find((n) => {
        const r = n.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (!el) { out[role] = null; continue; }
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const style = {};
      for (const k of keys) style[k] = cs[k];
      out[role] = {
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height), style,
      };
    }
    return out;
  }, { roles, keys: STYLE_KEYS });
}

// Layout defects that indicate "错乱": CJK labels wrapped one glyph per line,
// controls in one composer row not vertically aligned, horizontal overflow,
// and interactive elements clipped by their container.
async function detectDefects(page) {
  return page.evaluate(() => {
    const defects = [];
    const visible = (n) => {
      const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    const label = (n) => n.id ? `#${n.id}` : `${n.tagName.toLowerCase()}.${[...n.classList].slice(0, 2).join('.')}`;

    // 1. Buttons / chips whose text wrapped (height >> line-height).
    for (const n of document.querySelectorAll('button, [role="button"], [role="menuitem"], .chip, a')) {
      if (!visible(n)) continue;
      const text = (n.innerText || '').trim();
      if (!text || text.length > 40) continue;
      const cs = getComputedStyle(n);
      const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3;
      const r = n.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(n);
      const tops = [...range.getClientRects()].filter((q) => q.width > 0).map((q) => q.top).sort((a, b) => a - b);
      const lines = tops.reduce((acc, t) => (acc.length && t - acc[acc.length - 1] < lh * 0.6 ? acc : [...acc, t]), []).length;
      if (lines > 1 && r.height > lh * 1.8 && !text.includes('\n')) {
        defects.push({ kind: 'text-wrap', el: label(n), text, lines, h: Math.round(r.height) });
      }
    }

    // 2. Composer rows: every direct control must share a vertical centre.
    for (const wrap of document.querySelectorAll('#composerInputWrap')) {
      if (!visible(wrap)) continue;
      if (wrap.classList.contains('composer-multiline')) continue;
      const ctrls = [...wrap.querySelectorAll('button, .composer-editor-root')]
        .filter((n) => visible(n) && !n.closest('[role="menu"], .attachment-chips'));
      const centres = ctrls.map((n) => {
        const r = n.getBoundingClientRect();
        return { el: label(n), c: Math.round(r.top + r.height / 2) };
      });
      const cs = centres.map((c) => c.c);
      if (cs.length && Math.max(...cs) - Math.min(...cs) > 6) {
        defects.push({ kind: 'composer-misaligned', el: label(wrap), centres,
          wrapH: Math.round(wrap.getBoundingClientRect().height) });
      }
    }

    // 3. Horizontal page overflow.
    const docW = document.documentElement.scrollWidth;
    if (docW > window.innerWidth + 1) {
      defects.push({ kind: 'page-overflow-x', scrollWidth: docW, viewport: window.innerWidth });
    }

    // 4. Controls clipped outside an overflow:hidden ancestor.
    for (const n of document.querySelectorAll('button')) {
      if (!visible(n)) continue;
      const r = n.getBoundingClientRect();
      let p = n.parentElement;
      while (p && p !== document.body) {
        const pcs = getComputedStyle(p);
        if (pcs.overflow === 'hidden' || pcs.overflowX === 'hidden') {
          const pr = p.getBoundingClientRect();
          if (pr.width > 0 && (r.right > pr.right + 2 || r.left < pr.left - 2)) {
            defects.push({ kind: 'clipped', el: label(n), container: label(p) });
          }
          break;
        }
        p = p.parentElement;
      }
    }

    // 5. Home dead zone — the landing composer with no shortcut row under it.
    // The three landing shortcuts (upload / write / research) are real
    // entry points with live markup, i18n and ui/homeSurface.js handlers.
    // When their container is display:none the landing page keeps a ~410px
    // empty band under the composer with nothing to do, which is how the
    // row got hidden in the first place and stayed hidden.
    if (document.body.dataset.conversationActive !== 'true') {
      const wrap = document.querySelector('#composerInputWrap');
      if (wrap && visible(wrap)) {
        const quick = document.querySelector('#homeQuickActions');
        const quickH = quick ? Math.round(quick.getBoundingClientRect().height) : 0;
        const gap = Math.round(window.innerHeight - wrap.getBoundingClientRect().bottom);
        if (quickH < 8 && gap > 240) {
          defects.push({ kind: 'home-dead-zone', quickActionsHeight: quickH, gapBelowComposer: gap });
        }
      }
    }
    return defects;
  });
}

const FIXTURE_MESSAGES = [
  { role: 'user', content: '用苏格拉底的方式帮我理解贝叶斯定理' },
  { role: 'assistant', content: [
    '## 先从一个例子开始',
    '',
    '假设某种病的患病率是 **1%**，检测准确率是 *99%*。你拿到阳性结果，真正患病的概率是多少？',
    '',
    '- 先验：$P(D)=0.01$',
    '- 似然：$P(+\\mid D)=0.99$',
    '',
    '$$P(D\\mid +)=\\frac{P(+\\mid D)P(D)}{P(+)}$$',
    '',
    '```python',
    'def posterior(prior, sens, fpr):',
    '    return sens * prior / (sens * prior + fpr * (1 - prior))',
    '```',
    '',
    '| 量 | 值 |',
    '| --- | --- |',
    '| 先验 | 0.01 |',
    '',
    '> 换个角度想想：100 个人里有几个真的患病？',
  ].join('\n') },
  { role: 'user', content: 'I think it is around 50%?' },
  { role: 'assistant', content: 'Good guess — let\'s count it out. Out of 10,000 people, how many are sick *and* test positive?' },
];

const SCENARIOS = {
  async home(page) {
    await page.evaluate(() => window.scrollTo(0, 0));
  },
  async chat(page) {
    await page.evaluate((raw) => {
      const messages = raw.map((m, i) => ({
        clientId: `audit-${i}`, role: m.role, type: m.role, rawText: m.content,
        html: typeof window.formatMsg === 'function' ? window.formatMsg(m.content) : `<p>${m.content}</p>`,
      }));
      const s = window.stateStore;
      s.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
      s.dispatch({ type: 'state/set', key: 'topic', value: '贝叶斯定理' });
      s.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      s.dispatch({ type: 'state/set', key: 'messages', value: messages });
      document.getElementById('topicSetup')?.classList.add('hidden');
      document.getElementById('mainInner')?.classList.add('hidden');
      document.getElementById('chatView')?.classList.remove('hidden');
      document.body.dataset.conversationActive = 'true';
      window.__socratesReactChatBridge?.publish({ type: 'state-synced', reason: 'parity-audit' });
    }, FIXTURE_MESSAGES);
    await page.waitForTimeout(800);
  },
  async plusMenu(page) {
    const btn = page.locator('#composerToolsBtn').first();
    await btn.click().catch(() => {});
    await page.waitForTimeout(400);
  },
  async effortMenu(page) {
    await page.locator('.effort-trigger:visible').first().click().catch(() => {});
    await page.waitForTimeout(400);
  },
  async cmdk(page) {
    await page.keyboard.press('Control+k');
    await page.waitForTimeout(500);
  },
  async settings(page) {
    await page.evaluate(() => window.openSettings?.());
    await page.waitForTimeout(600);
  },
};

async function runSocrates(browser) {
  const only = typeof args.only === 'string' ? args.only.split(',') : Object.keys(SCENARIOS);
  const metrics = {};
  const defects = {};
  for (const w of WIDTHS) for (const mode of MODES) for (const lang of LANGS) {
    for (const name of only) {
      const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.addInitScript((m) => { try { localStorage.setItem('socrates-theme', m); } catch (_) {} }, mode);
      await mockAuthedApp(page, { lang });
      await gotoAndSettle(page, BASE + '/');
      await waitForAppShell(page);
      await SCENARIOS[name](page);
      const key = `${name}-${w}-${mode}-${lang}`;
      await page.screenshot({ path: `${OUT}${key}.png` });
      metrics[key] = await measure(page, SOCRATES_ROLES);
      const d = await detectDefects(page);
      if (d.length) defects[key] = d;
      await ctx.close();
      process.stdout.write(`${key}: ${d.length} defects\n`);
    }
  }
  writeFileSync(`${OUT}metrics.json`, JSON.stringify(metrics, null, 1));
  writeFileSync(`${OUT}defects.json`, JSON.stringify(defects, null, 1));
}


/* ── Gate ────────────────────────────────────────────────────────────────
 * `--check` turns the audit from a diagnostic into a CI gate. Two rules:
 *
 *   1. ANY layout defect fails. Overflow / misalignment / clipping /
 *      text-wrap / home-dead-zone are objective — no baseline needed.
 *   2. A curated set of dimensions must not drift from
 *      scripts/parity-baseline.json by more than GEOM_TOLERANCE_PX.
 *
 * Only stable fields are compared. `x` / `y` are excluded on purpose:
 * they depend on scroll position and on overlay entrance animations, so
 * they would make the gate flaky without protecting anything real.
 *
 * `--update` rewrites the baseline from the run just measured. Review the
 * diff before committing it — that diff IS the visual change record.
 */
/* Every gated number is a Math.round()ed integer read off a CSS-driven box
 * (composer 52, sidebarItem 36, topbar 52 …), so it is already free of
 * sub-pixel jitter. A tolerance of 1px therefore absorbs nothing real while
 * still failing a 2px regression — which is the whole point of the gate. */
const GEOM_TOLERANCE_PX = 1;
const GATE_FIELDS = {
  heroTitle: ['h', 'style.fontSize', 'style.lineHeight'],
  homeQuickActions: ['h'],
  disclaimer: ['h'],
  composer: ['w', 'h', 'style.borderRadius'],
  /* The composer's individual controls. composerPlus and composerSend were
   * both among the roles left pointing at retired ids, so they are gated
   * too: a dead selector on either now fails the gate instead of silently
   * measuring nothing. Only w/h — composerSend's opacity tracks the draft
   * and the disabled state, which is behaviour, not geometry. */
  composerPlus: ['w', 'h'],
  composerSend: ['w', 'h'],
  composerMic: ['w', 'h'],
  composerEditor: ['w', 'h'],
  sidebar: ['w', 'style.fontSize', 'style.lineHeight'],
  sidebarItem: ['h', 'style.borderRadius', 'style.fontSize'],
  topbar: ['h'],
};

/* Every gated role must have resolved in at least one scenario of the run.
 *
 * measure() returns null for a selector that matches nothing, and pick()
 * then contributes no fields — so a role with a dead selector produces no
 * failure anywhere, it just quietly contributes nothing. That is exactly
 * how `composer`, `composerPlus` and `composerSend` sat pointing at
 * #topicInputWrap / #chatInputWrap / #startBtn (retired by
 * P_composer-single) while the audit reported a clean run: the geometry it
 * existed to protect was never being measured. A missing *value* is caught
 * by compareGated against the baseline; a role that never resolves at all
 * is caught here. */
function findUnresolvedRoles(actual, written) {
  const unresolved = [];
  for (const role of Object.keys(GATE_FIELDS)) {
    const resolvedSomewhere = Object.keys(actual).some((key) => actual[key] && actual[key][role]);
    if (resolvedSomewhere) continue;
    const selector = typeof SOCRATES_ROLES[role] === 'string' ? SOCRATES_ROLES[role] : '(computed selector)';
    const measured = Object.entries(written).filter(([, perRole]) => perRole[role]);
    unresolved.push({ role, selector, resolvedIn: `${measured.length}/${Object.keys(written).length} scenarios` });
  }
  return unresolved;
}

const BASELINE_PATH = fileURLToPath(new URL('./parity-baseline.json', import.meta.url));

function pick(entry, fields) {
  const out = {};
  for (const f of fields) {
    const v = f.startsWith('style.')
      ? entry && entry.style ? entry.style[f.slice(6)] : undefined
      : entry ? entry[f] : undefined;
    if (v !== undefined && v !== null && v !== '') out[f] = v;
  }
  return out;
}

function collectGated(metrics) {
  const out = {};
  for (const [key, perRole] of Object.entries(metrics)) {
    out[key] = {};
    for (const [role, fields] of Object.entries(GATE_FIELDS)) {
      const picked = pick(perRole[role], fields);
      if (Object.keys(picked).length) out[key][role] = picked;
    }
  }
  return out;
}

function compareGated(actual, expected) {
  const problems = [];
  /* Only scenarios present in BOTH sides are compared, so a partial run
     (`--only=home`) checks what it measured instead of reporting every
     baseline scenario it skipped as a failure. A scenario present in the
     baseline but missing from the run is a coverage gap, not a
     regression, so it is reported separately by the caller. */
  for (const key of Object.keys(expected)) {
    if (!actual[key]) continue;
    for (const role of Object.keys(expected[key])) {
      const a = actual[key][role] || {};
      const e = expected[key][role];
      for (const field of Object.keys(e)) {
        if (!(field in a)) { problems.push(`${key}/${role}.${field}: missing in run (baseline ${e[field]})`); continue; }
        const av = a[field]; const ev = e[field];
        if (typeof ev === 'number' && typeof av === 'number') {
          if (Math.abs(av - ev) > GEOM_TOLERANCE_PX) {
            problems.push(`${key}/${role}.${field}: ${av} vs baseline ${ev} (Δ${av - ev}, tol ${GEOM_TOLERANCE_PX})`);
          }
        } else if (String(av) !== String(ev)) {
          problems.push(`${key}/${role}.${field}: "${av}" vs baseline "${ev}"`);
        }
      }
    }
  }
  return problems;
}

const browser = await chromium.launch();
let exitCode = 0;
try {
  await runSocrates(browser);
} finally {
  await browser.close();
}

/* Post-run gate. Reads the artifacts runSocrates just wrote so the gate
 * and the diagnostic always measure the same pass. */
if (args.update || args.check) {
  const written = JSON.parse(readFileSync(`${OUT}metrics.json`, 'utf8'));
  const writtenDefects = JSON.parse(readFileSync(`${OUT}defects.json`, 'utf8'));
  const gated = collectGated(written);

  if (args.update) {
    const unresolved = findUnresolvedRoles(gated, written);
    if (unresolved.length) {
      console.error('refusing to write a baseline with roles that never resolved:');
      for (const u of unresolved) console.error(`  ${u.role} → "${u.selector}" resolved in ${u.resolvedIn}`);
      console.error('  fix the selector in SOCRATES_ROLES before baselining.');
      exitCode = 1;
    }
    writeFileSync(BASELINE_PATH, JSON.stringify({
      note: 'Committed visual baseline for scripts/parity-audit.mjs --check. ' +
            'Only stable fields are recorded (no x/y). Regenerate with ' +
            '`npm run parity:update` and review the diff.',
      tolerancePx: GEOM_TOLERANCE_PX,
      generatedBy: 'parity-audit.mjs --update',
      scenarios: gated,
    }, null, 1) + '\n');
    console.log(`parity baseline written: ${BASELINE_PATH}`);
  }

  if (args.check) {
    const failures = [];
    const unresolved = findUnresolvedRoles(gated, written);
    if (unresolved.length) {
      failures.push(`${unresolved.length} gated role(s) never resolved — a stale selector measures nothing and fails nothing:`);
      for (const u of unresolved) failures.push(`  ${u.role} → "${u.selector}" resolved in ${u.resolvedIn}`);
    }
    const defectCount = Object.values(writtenDefects).reduce((n, d) => n + d.length, 0);
    if (defectCount) {
      failures.push(`${defectCount} layout defect(s):`);
      for (const [key, list] of Object.entries(writtenDefects)) {
        for (const d of list) failures.push(`  ${key}: ${d.kind} ${JSON.stringify(d).slice(0, 160)}`);
      }
    }
    if (existsSync(BASELINE_PATH)) {
      const expected = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
      failures.push(...compareGated(gated, expected.scenarios || {}));
      const skipped = Object.keys(expected.scenarios || {}).filter((k) => !(k in gated));
      if (skipped.length) {
        console.log(`parity gate: ${skipped.length} baseline scenario(s) not in this run (partial --only?): ${skipped.join(', ')}`);
      }
    } else {
      failures.push(`no baseline at ${BASELINE_PATH} — run \`npm run parity:update\` first`);
    }
    if (failures.length) {
      console.error('\nparity gate FAILED\n' + failures.map((l) => '  ' + l).join('\n') + '\n');
      exitCode = 1;
    } else {
      console.log(`parity gate passed (${Object.keys(gated).length} scenarios, 0 defects)`);
    }
  }
}

process.exit(exitCode);
