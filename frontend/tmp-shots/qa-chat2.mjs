/* Scratch visual QA harness (not part of the app). Renders a realistic chat
   transcript with inline tool rows in every state, using the real
   ui/toolInline module from the dev server. Prose is hand-written HTML
   because the CDN-backed markdown pipeline is unavailable offline.
   Usage: node tmp-shots/qa-chat2.mjs   (dark)
          QA_MODE=light node tmp-shots/qa-chat2.mjs */
import { chromium } from 'playwright';

const URL = process.env.QA_URL || 'http://localhost:5173/';
const OUT = process.env.QA_OUT || 'tmp-shots/qa-chat2.png';
const DARK = (process.env.QA_MODE || 'dark') === 'dark';
const W = Number(process.env.QA_W || 1180);

const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: W, height: 1600 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  // Keep the React message-list runtime from claiming #msgList, so the
  // harness can build a static transcript inside it.
  window.__socratesShareMsgListTakeover = true;
  // boot.js re-shows the auth gate once its health probe times out; keep it
  // pinned hidden for the whole session so the harness shots stay usable.
  const kill = () => {
    const gate = document.getElementById('authGate');
    if (gate) { gate.classList.add('hidden'); gate.style.display = 'none'; }
    document.getElementById('appShell')?.classList.remove('hidden');
    document.documentElement.dataset.bootState = 'app';
    document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach((e) => e.remove());
  };
  document.addEventListener('DOMContentLoaded', kill);
  setInterval(kill, 250);
});
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  document.getElementById('sidebar')?.classList.add('collapsed');
});

const info = await page.evaluate(async ({ dark }) => {
  const mod = await import('/src/ui/toolInline.js');
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  document.getElementById('chatView')?.classList.remove('hidden');
  document.getElementById('topicSetup')?.classList.add('hidden');
  const list = document.getElementById('msgList');
  if (!list) return 'no #msgList';
  list.innerHTML = '';

  function userMsg(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = '<div class="msg-body"><p>' + text + '</p></div>';
    list.appendChild(el);
  }
  function assistantShell() {
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = '<div class="msg-body"></div>';
    list.appendChild(el);
    return el.querySelector('.msg-body');
  }
  function seg(body, html) {
    const d = document.createElement('div');
    d.className = 'stream-segment';
    d.innerHTML = html;
    body.appendChild(d);
  }
  let n = 0;
  function row(body, name, input) {
    const r = mod.createInlineToolRow({ id: 'r' + (++n), name: name, input: input });
    body.appendChild(r);
    return r;
  }
  function group(body, headName, members) {
    const head = mod.createInlineToolRow({ id: members[0].id, name: headName, input: members[0].input });
    head.dataset.groupIds = members.map(function (m) { return m.id; }).join(',');
    body.appendChild(head);
    mod.updateInlineToolGroupLabel(head, members.length);
    mod.settleInlineToolGroupRow(head, members);
    return head;
  }

  /* ── Turn 1: search → fetch → failing search → still running ── */
  userMsg('帮我查一下 2025 年 transformer 架构改进的论文，然后总结一下');
  const b1 = assistantShell();
  seg(b1, '<p>好的，我先搜索一下相关的论文。</p>');
  mod.settleInlineToolRow(row(b1, 'web_search', { query: 'transformer architecture improvements 2025' }), {
    ok: true, durationMs: 1840, output: '3 results',
    results: [
      { title: 'Transformers: From Attention to Multi-Modal Reasoning', url: 'https://arxiv.org/abs/2501.00001' },
      { title: 'MoE-Transformer: Sparse Routing at Scale', url: 'https://arxiv.org/abs/2502.11223' },
      { title: 'Linear Attention: A Survey', url: 'https://arxiv.org/abs/2503.44556' },
    ],
  });
  mod.settleInlineToolRow(row(b1, 'web_fetch', { url: 'https://arxiv.org/abs/2501.00001' }), {
    ok: true, durationMs: 620, output: 'Fetched 12.4k characters from arxiv.org',
  });
  mod.settleInlineToolRow(row(b1, 'web_search', { query: 'mixture of experts routing survey' }), {
    ok: false, durationMs: 30000, errorCode: 'search_timeout', retryable: true,
    error: 'Search backend timed out after 30s', userMessage: 'Web search timed out.',
  });
  row(b1, 'code_interpreter', { code: 'import statistics' });
  seg(b1, [
    '<h2>主要发现</h2>',
    '<p>我阅读了这几篇论文，2025 年的改进集中在三个方向：</p>',
    '<ol><li><strong>稀疏专家路由（MoE）</strong> — 把 FFN 拆成多个专家，推理时只激活 2/64。</li>',
    '<li><strong>线性注意力</strong> — 把二次复杂度降到线性。</li>',
    '<li><strong>多模态统一</strong> — 视觉 token 与文本 token 共享同一套权重。</li></ol>',
    '<pre><code class="language-python">def attention(q, k, v):\n    scores = q @ k.T / (q.shape[-1] ** 0.5)\n    return softmax(scores) @ v\n</code></pre>',
    '<p>其中 MoE 的落地效果最明显。</p>',
  ].join(''));

  /* ── Turn 2: grouped file reads, then a write/edit group ── */
  userMsg('再看看代码仓库里的实现');
  const b2 = assistantShell();
  seg(b2, '<p>我来读一下相关文件。</p>');
  group(b2, 'Read', [
    { id: 'm1', name: 'Read', input: { file_path: 'src/attention/moe.py' }, result: { ok: true, durationMs: 40, output: 'def moe(x):\n    ...' } },
    { id: 'm2', name: 'Read', input: { file_path: 'src/attention/routing.py' }, result: { ok: true, durationMs: 35, output: 'class Router:\n    ...' } },
    { id: 'm3', name: 'Grep', input: { pattern: 'load_balance' }, result: { ok: true, durationMs: 20, output: 'Found 4 matches' } },
  ]);
  group(b2, 'Edit', [
    { id: 'w1', name: 'Edit', input: { file_path: 'src/attention/moe.py' }, result: { ok: true, durationMs: 12, output: 'The file src/attention/moe.py has been updated.' } },
    { id: 'w2', name: 'Write', input: { file_path: 'src/attention/router_v2.py' }, result: { ok: true, durationMs: 15, output: 'File created successfully.' } },
    { id: 'w3', name: 'Bash', input: { command: 'pytest tests/test_moe.py -q' }, result: { ok: true, durationMs: 4100, output: '8 passed in 4.02s' } },
  ]);
  seg(b2, '<p>实现读完了，路由层的负载均衡损失缺了一个系数，我补上并跑了测试。</p>');

  const rows = list.querySelectorAll('details.tool-inline');
  if (rows[0]) rows[0].setAttribute('open', '');
  return rows.length + ' rows';
}, { dark: DARK });

console.log(info);
await page.waitForTimeout(600);
await page.screenshot({ path: OUT });
console.log('saved', OUT);
await b.close();
