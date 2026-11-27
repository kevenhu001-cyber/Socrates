import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { rankMemoryTexts, memoryQuery } from '../src/services/embeddings/memoryRanker.js';
import { promptCacheFields, cacheProvider } from '../src/services/core/llm/cachePolicy.js';
import {
  requestBodyVariants,
  nextCompatibilityVariant,
} from '../src/services/core/llm/protocol.js';
import {
  addDeferredCoreTools,
  splitInitialToolNames,
} from '../src/services/integrations/connectorCatalog.js';
import {
  createStreamToolContext,
  selectDeferredCoreTools,
} from '../src/routes/chat/pipeline/toolContext.js';

import { shutdownPubsub } from '../src/lib/pubsub.js';

after(async () => {
  await shutdownPubsub();
});

const base = {
  apiKey: 'test-secret',
  userId: 'user-a',
  cacheSessionId: 'session-a',
  model: 'deepseek/deepseek-v3',
  apiBase: 'https://openrouter.ai/api/v1',
  messages: [{ role: 'user', content: 'hello' }],
};

test('cache affinity is stable and isolated by account, session and credential', () => {
  const a = promptCacheFields(base);
  assert.equal(typeof a.session_id, 'string');
  assert.deepEqual(a, promptCacheFields(base));
  for (const patch of [
    { userId: 'user-b' },
    { cacheSessionId: 'session-b' },
    { apiKey: 'another-key' },
    { model: 'another-model' },
  ]) {
    assert.notEqual(a.session_id, promptCacheFields({ ...base, ...patch }).session_id);
  }
  assert.deepEqual(promptCacheFields({ ...base, cacheSessionId: undefined }), {});
  assert.deepEqual(promptCacheFields({ ...base, apiBase: 'https://api.deepseek.com/v1' }), {});
  assert.deepEqual(
    promptCacheFields({ ...base, apiBase: 'https://openrouter.ai.evil.example/v1' }),
    {},
  );
  assert.equal(cacheProvider('https://api.moonshot.cn/v1'), 'moonshot');
  assert.equal(
    typeof promptCacheFields({ ...base, apiBase: 'https://api.moonshot.cn/v1' }).prompt_cache_key,
    'string',
  );
  assert.deepEqual(
    promptCacheFields({ ...base, model: 'anthropic/claude-sonnet-4.6' }).cache_control,
    { type: 'ephemeral' },
  );
});

test('a rejected cache hint has a fallback without losing tools or messages', () => {
  const tools = [
    { type: 'function', function: { name: 'lookup', parameters: { type: 'object' } } },
  ];
  const variants = requestBodyVariants({ ...base, tools }, true);
  assert.ok(variants[0].body.session_id);
  const i = nextCompatibilityVariant(variants, 0, 'Unsupported parameter: session_id');
  assert.ok(i > 0);
  assert.equal(variants[i].body.session_id, undefined);
  assert.deepEqual(variants[i].body.tools, tools);
  assert.deepEqual(variants[i].body.messages, base.messages);
});

test('memory retrieval ranks Chinese and English terms, deduplicates, skips greetings', () => {
  const rows = [
    { text: '电池热管理与储能系统' },
    { text: 'I use Python for optimization' },
    { text: '电池热管理与储能系统' },
    { text: '喜欢旅行' },
  ];
  assert.deepEqual(rankMemoryTexts(rows, '电池热管理'), [rows[0]]);
  assert.deepEqual(rankMemoryTexts(rows, 'Python optimization'), [rows[1]]);
  assert.equal(memoryQuery([{ role: 'user', content: '你好！' }]), '');
  assert.match(
    memoryQuery([
      { role: 'user', content: 'Python optimization' },
      { role: 'assistant', content: 'ok' },
      { role: 'user', content: '继续' },
    ]),
    /Python optimization/,
  );
});

test('deferred tools are discoverable only if registered; relevant tools are prewarmed', () => {
  const body = { messages: [{ role: 'user', content: '你好' }] };
  assert.ok(selectDeferredCoreTools(body, 'chat').has('code_interpreter'));
  const intent = { messages: [{ role: 'user', content: '用 Python 计算并绘制图表' }] };
  assert.ok(!selectDeferredCoreTools(intent, 'chat').has('code_interpreter'));
  assert.ok(!selectDeferredCoreTools(intent, 'chat').has('render_intelligent_ui'));
  const catalog = addDeferredCoreTools(
    { entries: [], byTool: new Map() },
    [
      {
        function: {
          name: 'code_interpreter',
          description: 'Run Python',
          parameters: { type: 'object' },
        },
      },
    ],
    new Set(['code_interpreter', 'create_site']),
  );
  assert.equal(catalog.byTool.has('code_interpreter'), true);
  assert.equal(catalog.byTool.has('create_site'), false);
  assert.deepEqual(splitInitialToolNames(['web_search', 'code_interpreter'], catalog), [
    'web_search',
  ]);
});

test('the requested reasoning effort reaches the turn tool budget', async () => {
  const request = {
    body: { messages: [{ role: 'user', content: '2 + 2 是多少？' }] },
  };
  const low = await createStreamToolContext(request, 'chat', 'low');
  assert.equal(low.toolPolicy.maxIterations, 4);
  assert.equal(low.MAX_TOOL_ITERATIONS, 4);

  const medium = await createStreamToolContext(request, 'chat', 'medium');
  assert.equal(medium.toolPolicy.maxIterations, 8);

  const defaulted = await createStreamToolContext(request, 'chat');
  assert.equal(defaulted.toolPolicy.maxIterations, 12);
});

test('simple explanations do not prewarm visualization or workspace tools', () => {
  const cases = [
    ['解释一下贝叶斯定理', 'chat'],
    ['推导这个方程', 'chat'],
    ['解释这个图表', 'tutor'],
    ['这个项目为什么慢', 'chat'],
    ['执行代码是什么意思', 'chat'],
    ['什么是 HTML', 'chat'],
    ['文档是什么', 'chat'],
    ['论文怎么写', 'chat'],
    ['图片格式有哪些', 'chat'],
  ];
  for (const [content, mode] of cases) {
    const deferred = selectDeferredCoreTools({ messages: [{ role: 'user', content }] }, mode);
    assert.ok(deferred.has('render_intelligent_ui'), `visual should stay deferred: ${content}`);
    assert.ok(deferred.has('workspace_agent'), `workspace should stay deferred: ${content}`);
    assert.ok(deferred.has('create_site'), `site should stay deferred: ${content}`);
    assert.ok(deferred.has('create_document'), `document should stay deferred: ${content}`);
    assert.ok(deferred.has('arxiv_search'), `arxiv should stay deferred: ${content}`);
    assert.ok(deferred.has('image_search'), `image search should stay deferred: ${content}`);
  }
});

test('a short follow-up inherits topic but not a definitional workspace intent', () => {
  const deferred = selectDeferredCoreTools(
    {
      messages: [
        { role: 'user', content: '执行代码是什么意思' },
        { role: 'assistant', content: 'Let me explain.' },
        { role: 'user', content: '继续' },
      ],
    },
    'chat',
  );
  assert.ok(deferred.has('workspace_agent'));
});

test('plan and algorithm wording does not pull in the workspace agent', () => {
  const plan = selectDeferredCoreTools(
    { messages: [{ role: 'user', content: '写一个项目计划' }] },
    'chat',
  );
  assert.ok(plan.has('workspace_agent'));
  assert.ok(!plan.has('create_document'));

  const algorithm = selectDeferredCoreTools(
    { messages: [{ role: 'user', content: '实现这个函数' }] },
    'chat',
  );
  assert.ok(algorithm.has('workspace_agent'));
});

test('explicit artifact and workspace requests prewarm the matching tool', () => {
  const cases = [
    ['画一个函数图像', 'render_intelligent_ui'],
    ['做一个交互演示', 'render_intelligent_ui'],
    ['update a visual with the latest result', 'render_intelligent_ui'],
    ['修改 src/app.ts 并运行测试', 'workspace_agent'],
    ['帮我修复这个 bug', 'workspace_agent'],
    ['写一份实现计划', 'create_document'],
    ['帮我做一个网站', 'create_site'],
    ['找几篇关于 RAG 的论文', 'arxiv_search'],
    ['找几张猫的图片', 'image_search'],
  ];
  for (const [content, tool] of cases) {
    assert.ok(
      !selectDeferredCoreTools({ messages: [{ role: 'user', content }] }, 'chat').has(tool),
      `${tool} should be prewarmed: ${content}`,
    );
  }
});

test('routine questions keep Python deferred while execution-heavy requests prewarm it', () => {
  for (const content of [
    '计算 2 + 3',
    '推导这个方程',
    '解释代码',
    '解释如何执行代码',
    '执行代码是什么意思',
    'what does executing code mean',
    '画一个函数图像',
    'calculate 2 + 3',
    'explain this code',
    'Python 执行为什么慢',
    '什么是数据分析',
    'what is data analysis',
    'what is Python',
    'explain numerical simulation',
    'what is a CSV file',
  ]) {
    assert.ok(
      selectDeferredCoreTools({ messages: [{ role: 'user', content }] }, 'chat').has(
        'code_interpreter',
      ),
      content,
    );
  }
  for (const content of [
    '用 Python 计算这组数据',
    '进行数据分析',
    'perform data analysis',
    '分析这份 CSV 数据',
    '执行代码',
    '请运行这段代码',
    '帮我执行脚本',
    '运行数值仿真',
    '把结果导出为 CSV',
    'run a numerical simulation',
    'analyze this dataset',
    'export this data as CSV',
  ]) {
    assert.ok(
      !selectDeferredCoreTools({ messages: [{ role: 'user', content }] }, 'chat').has(
        'code_interpreter',
      ),
      content,
    );
  }
});
