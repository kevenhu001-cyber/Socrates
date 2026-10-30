import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { marked } from 'marked';
import { normalizeChineseProse } from '../src/util/chineseTypography.ts';
import { zh } from '../src/i18n/zh.ts';
import { asProse, asText } from '../src/react/intelligence-ui/renderRuntime.ts';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.marked = marked;
const { formatMsg, formatMsgProgressive } = await import('../src/render/markdown.ts');
const { showToast } = await import('../src/ui/toast.js');
const { showConfirm, closeConfirm } = await import('../src/ui/confirm.js');
const { confirmState } = await import('../src/ui/confirmState.js');
const asDom = (html) => { const root = document.createElement('div'); root.innerHTML = html; return root; };

test('Chinese prose uses full-width punctuation and matched, nested quotes', () => {
  const input = `你好,世界. 他说:"先理解'概念',再练习!" (准备好了吗?)`;
  assert.equal(normalizeChineseProse(input), '你好，世界。 他说：“先理解‘概念’，再练习！” （准备好了吗？）');
  assert.equal(normalizeChineseProse('使用 OpenAI, Claude (可选); 好吗? 可以!'), '使用 OpenAI， Claude （可选）； 好吗？ 可以！');
  assert.equal(normalizeChineseProse('你好。 Hello, world! 接下来,继续.'), '你好。 Hello, world! 接下来，继续。');
  const chinese = '他说：“先理解‘概念’，再练习。”';
  assert.equal(normalizeChineseProse(chinese), chinese);
  assert.equal(normalizeChineseProse("Don't change English, punctuation (or quotes)."), "Don't change English, punctuation (or quotes).");
  assert.equal(normalizeChineseProse('1. 特征方程法'), '1. 特征方程法');
  assert.equal(normalizeChineseProse('他说: "你好,\n再见."'), '他说： “你好，\n再见。”');
  assert.equal(normalizeChineseProse('他说: “你好!"'), '他说： “你好！”');
});

test('abbreviations keep their trailing period instead of ending the sentence', () => {
  /* The period in "e.g." closes the abbreviation; turning it into a Chinese
     full stop split the sentence in half ("例如 e.g。这样写。"). */
  assert.equal(normalizeChineseProse('例如 e.g. 这样写。'), '例如 e.g. 这样写。');
  assert.equal(normalizeChineseProse('也就是说 i.e. 这一点。'), '也就是说 i.e. 这一点。');
  assert.equal(normalizeChineseProse('比如 U.S. 的数据。'), '比如 U.S. 的数据。');
  assert.equal(normalizeChineseProse('参考 Dr. Smith 的观点。'), '参考 Dr. Smith 的观点。');
  assert.equal(normalizeChineseProse('版本 No. 5 的说明。'), '版本 No. 5 的说明。');
  assert.equal(normalizeChineseProse('见 Fig. 3 的说明。'), '见 Fig. 3 的说明。');
  assert.equal(normalizeChineseProse('换言之 etc. 都可以。'), '换言之 etc. 都可以。');
  assert.equal(normalizeChineseProse('对比 A vs. B 的差异。'), '对比 A vs. B 的差异。');
  assert.equal(normalizeChineseProse('例如 e.g.'), '例如 e.g.');
  /* A word that merely ends a Chinese clause still takes the full stop, and
     a dotted identifier is not an abbreviation. */
  assert.equal(normalizeChineseProse('使用 React.'), '使用 React。');
  assert.equal(normalizeChineseProse('使用 Node.js.'), '使用 Node.js。');
  assert.equal(normalizeChineseProse('配置 src/main.ts 完成。'), '配置 src/main.ts 完成。');
});

test('URLs, file paths, JSON, formulas, numbers, versions and template data remain exact', () => {
  for (const data of [
    'https://example.test/中文?q=1,2', 'name@example.test', 'C:\\目录\\配置.json', '配置.json',
    'GPT-5.5', '1,000.50', '12:30', 'f(x, y)', '{hh}:{mm}', '{"提示":"你好,世界.","值":1.5}',
    '[{"提示":"你好,世界."},2]', '$f(x)=1.5,\\text{你好,世界.}$', '\\(f(x)=1.5,\\text{你好.}\\)',
  ]) {
    assert.equal(normalizeChineseProse('内容: ' + data), '内容： ' + data, data);
  }
});

test('generated UI labels follow Chinese typography while action/data strings stay exact', () => {
  assert.equal(asProse('AI 卡片: "说明"(可选).'), 'AI 卡片： “说明”（可选）。');
  assert.equal(asText('输入: "保留原始值",不要改变.'), '输入: "保留原始值",不要改变.');
});

for (const [name, render] of [
  ['finished', formatMsg], ['streaming', formatMsgProgressive],
  ['settled', (text) => formatMsgProgressive(text, { complete: true })],
]) {
  test(`${name}: quotes span emphasis, Markdown links work, and code/math remain exact`, () => {
    const source = '他说: "**你好**,世界!" (再试一次); 下一步?\n\n' +
      '[文档](https://example.test/中文?q=1,2) 和 `print("你好,世界.")`.\n\n' +
      '```json\n{"提示":"你好,世界.","值":1.5}\n```\n\n' +
      '数学: $f(x)=1.5,\\text{你好,世界.}$';
    const root = asDom(render(source));
    assert.match(root.textContent, /他说： “你好，世界！” （再试一次）； 下一步？/);
    assert.equal(root.querySelector('strong').textContent, '你好');
    assert.equal(root.querySelector('a').getAttribute('href'), 'https://example.test/%E4%B8%AD%E6%96%87?q=1,2');
    assert.equal(root.querySelector('code').textContent, 'print("你好,世界.")');
    assert.match(root.querySelector('pre code').textContent, /\{"提示":"你好,世界\.","值":1\.5\}/);
    assert.match(root.textContent, /\$f\(x\)=1\.5,\\text\{你好,世界\.\}\$/);
  });
}

test('renderer fallback keeps code untouched and never rewrites HTML attributes', () => {
  const saved = globalThis.marked;
  delete globalThis.marked;
  try {
    const root = asDom(formatMsg('中文: "你好!"\n\n```text\n你好,世界.\n```'));
    assert.match(root.textContent, /中文： “你好！”/);
    assert.match(root.querySelector('pre code').textContent, /你好,世界\./);
  } finally { globalThis.marked = saved; }
  const root = asDom(formatMsg('<p title="你好,世界.">正文: "你好!"</p><img src=x onerror="alert(1)">'));
  assert.match(root.textContent, /正文： “你好！”/);
  assert.equal(root.querySelector('p').getAttribute('title'), '你好,世界.');
  assert.equal(root.querySelector('[onerror]'), null);
});

test('Chinese system hints, confirmations and toast copy use the same punctuation policy', async () => {
  for (const [key, value] of Object.entries(zh)) assert.equal(normalizeChineseProse(value), value, key);
  assert.equal(zh['chat.placeholder'], '输入你的想法……');
  assert.equal(zh['sidebar.scheduled.custom'], '自定义（cron）');
  showToast('已保存: "中文提示",请继续.', { duration: 0 });
  assert.equal(document.querySelector('.msg-toast').textContent, '已保存： “中文提示”，请继续。');
  const confirmation = showConfirm('系统提示: "确认"', '是否继续(本次操作)?');
  confirmState.flush();
  const snapshot = confirmState.getSnapshot();
  assert.equal(snapshot.title, '系统提示： “确认”');
  assert.equal(snapshot.msg, '是否继续（本次操作）？');
  closeConfirm(false);
  confirmState.flush();
  assert.equal(await confirmation, false);
});
