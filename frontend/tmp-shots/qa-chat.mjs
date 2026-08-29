/* Scratch visual QA harness: renders a realistic chat turn with inline tool
   rows in several states, using the real toolInline module from the dev
   server. Not part of the app. Delete when done. */
import { chromium } from 'playwright';

const URL = process.env.QA_URL || 'http://localhost:5173/';
const OUT = process.env.QA_OUT || 'tmp-shots/qa-chat.png';
const DARK = (process.env.QA_MODE || 'dark') === 'dark';

const b = await chromium.launch({ args: ['--no-sandbox'] });
const page = await b.newPage({ viewport: { width: 1280, height: 2200 }, deviceScaleFactor: 2 });
await page.addInitScript(() => {
  localStorage.setItem('socrates-lang-app', 'zh');
  localStorage.setItem('socrates-theme', 'dark');
});
await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });

await page.evaluate(() => {
  document.getElementById('authGate')?.classList.add('hidden');
  document.getElementById('appShell')?.classList.remove('hidden');
  document.documentElement.dataset.bootState = 'app';
  document.querySelectorAll('#socratesCookieConsent,.socrates-cookie-consent').forEach((e) => e.remove());
});
await page.waitForTimeout(600);

const result = await page.evaluate(async ({ dark }) => {
  const mod = await import('/src/ui/toolInline.js');
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
  // Show chat view
  const cv = document.getElementById('chatView');
  cv?.classList.remove('hidden');
  document.getElementById('topicSetup')?.classList.add('hidden');
  const list = document.getElementById('msgList');
  if (!list) return 'no #msgList';
  list.innerHTML = '';

  const md = await import('/src/render/markdown.js').catch(() => null);
  const renderMd = (t) => {
    try { return md?.formatMsg ? md.formatMsg(t) : `<p>${t}</p>`; } catch (_) { return `<p>${t}</p>`; }
  };

  function userMsg(text) {
    const el = document.createElement('div');
    el.className = 'msg user';
    el.innerHTML = `<div class="msg-body">${text}</div>`;
    list.appendChild(el);
  }

  function assistantShell() {
    const el = document.createElement('div');
    el.className = 'msg assistant';
    el.innerHTML = `
      <div class="msg-model"><span class="msg-model-badge">S</span>Socrates</div>
      <div class="msg-body"></div>
      <div class="msg-toolbar" style="opacity:1"></div>`;
    list.appendChild(el);
    return el.querySelector('.msg-body');
  }

  function seg(body, text) {
    const d = document.createElement('div');
    d.className = 'stream-segment';
    d.innerHTML = renderMd(text);
    body.appendChild(d);
    return d;
  }

  function row(body, name, input) {
    const id = 'r' + Math.random().toString(36).slice(2, 8);
    const r = mod.createInlineToolRow({ id, name, input });
    body.appendChild(r);
    return { r, id };
  }

  // ---------- Turn 1: search + fetch, mixed states ----------
  userMsg('帮我查一下 2025 年 transformer 架构改进的论文，然后总结一下');
  const b1 = assistantShell();
  seg(b1, '好的，我先搜索一下相关的论文。');
  {
    const a = row(b1, 'web_search', { query: 'transformer architecture improvements 2025' });
    mod.settleInlineToolRow(a.r, {
      ok: true, durationMs: 1840,
      results: [
        { title: 'Transformers: From Attention to Multi-Modal Reasoning', url: 'https://arxiv.org/abs/2501.00001', snippet: '…' },
        { title: 'MoE-Transformer: Sparse Routing at Scale', url: 'https://arxiv.org/abs/2502.11223', snippet: '…' },
        { title: 'Linear Attention: A Survey', url: 'https://arxiv.org/abs/2503.44556', snippet: '…' },
      ],
      output: '3 results',
    });
  }
  {
    const a = row(b1, 'web_fetch', { url: 'https://arxiv.org/abs/2501.00001' });
    mod.settleInlineToolRow(a.r, { ok: true, durationMs: 620, output: 'Fetched 12.4k characters from arxiv.org' });
  }
  {
    const a = row(b1, 'web_search', { query: 'nope this one fails' });
    mod.settleInlineToolRow(a.r, {
      ok: false, durationMs: 300, errorCode: 'search_timeout', retryable: true,
      error: 'Search backend timed out after 30s', userMessage: 'Web search timed out.',
    });
  }
  { const a = row(b1, 'web_search', { query: 'still running…' }); void a; }
  seg(b1, `## 主要发现

我阅读了这几篇论文，2025 年的改进集中在三个方向：

1. **稀疏专家路由（MoE）** — 把 FFN 拆成多个专家，推理时只激活 2/64。
2. **线性注意力** — 把 $O(n^2)$ 降到 $O(n)$。
3. **多模态统一** — 视觉 token 与文本 token 共享同一套权重。

\`\`\`python
def attention(q, k, v):
    scores = q @ k.T / (q.shape[-1] ** 0.5)
    return softmax(scores) @ v
\`\`\`

其中 MoE 的落地效果最明显。`);

  // ---------- Turn 2: grouped read/write rows ----------
  userMsg('再看看代码仓库里的实现');
  const b2 = assistantShell();
  seg(b2, '我来读一下相关文件。');
  {
    const members = [
      { id: 'm1', name: 'Read', input: { file_path: 'src/attention/moe.py' }, result: { ok: true, durationMs: 40, output: 'def moe(x):\n    ...\n' } },
      { id: 'm2', name: 'Read', input: { file_path: 'src/attention/routing.py' }, result: { ok: true, durationMs: 35, output: 'class Router:\n    ...\n' } },
      { id: 'm3', name: 'Glob', input: { pattern: 'src/**/*.py' }, result: { ok: true, durationMs: 20, output: '42 files' } },
    ];
    const head = mod.createInlineToolRow({ id: 'm1', name: 'Read', input: members[0].input });
    head.dataset.groupIds = members.map((m) => m.id).join(',');
    b2.appendChild(head);
    mod.updateInlineToolGroupLabel(head, members.length);
    mod.settleInlineToolGroupRow(head, members);
  }
  {
    const members = [
      { id: 'w1', name: 'Edit', input: { file_path: 'src/attention/moe.py' }, result: { ok: true, durationMs: 12, output: 'The file src/attention/moe.py has been updated.' } },
      { id: 'w2', name: 'Write', input: { file_path: 'src/attention/router_v2.py' }, result: { ok: true, durationMs: 15, output: 'File created.' } },
      { id: 'w3', name: 'Bash', input: { command: 'pytest tests/test_moe.py' }, result: { ok: true, durationMs: 4100, output: '8 passed in 4.02s' } },
    ];
    const head = mod.createInlineToolRow({ id: 'w1', name: 'Edit', input: members[0].input });
    head.dataset.groupIds = members.map((m) => m.id).join(',');
    b2.appendChild(head);
    mod.updateInlineToolGroupLabel(head, members.length);
    mod.settleInlineToolGroupRow(head, members);
  }
  seg(b2, '实现读完了，路由层的负载均衡损失缺了一个系数，我补上并跑了测试。');

  // open the first row so the detail panel is visible
  const firstDetails = list.querySelectorAll('details.tool-inline');
  if (firstDetails[0]) firstDetails[0].setAttribute('open', '');
  if (firstDetails[4]) firstDetails[4].setAttribute('open', '');
  return `${firstDetails.length} rows`;
}, { dark: DARK });

console.log(result);
await page.waitForTimeout(700);
await page.screenshot({ path: OUT, fullPage: false });
// also capture the transcript scrolled to the second turn
console.log('saved', OUT);
await b.close();
