import test from 'node:test';
import assert from 'node:assert/strict';
import { rankMemoryTexts, memoryQuery } from '../src/services/embeddings/memoryRanker.js';
import { promptCacheFields, cacheProvider } from '../src/services/core/llm/cachePolicy.js';
import { requestBodyVariants, nextCompatibilityVariant } from '../src/services/core/llm/protocol.js';
import { addDeferredCoreTools, splitInitialToolNames } from '../src/services/integrations/connectorCatalog.js';
import { selectDeferredCoreTools } from '../src/routes/chat/pipeline/toolContext.js';

const base = { apiKey: 'test-secret', userId: 'user-a', cacheSessionId: 'session-a', model: 'deepseek/deepseek-v3', apiBase: 'https://openrouter.ai/api/v1', messages: [{ role: 'user', content: 'hello' }] };

test('cache affinity is stable and isolated by account, session and credential', () => {
  const a = promptCacheFields(base);
  assert.equal(typeof a.session_id, 'string');
  assert.deepEqual(a, promptCacheFields(base));
  for (const patch of [{userId:'user-b'}, {cacheSessionId:'session-b'}, {apiKey:'another-key'}, {model:'another-model'}]) {
    assert.notEqual(a.session_id, promptCacheFields({...base,...patch}).session_id);
  }
  assert.deepEqual(promptCacheFields({...base, cacheSessionId: undefined}), {});
  assert.deepEqual(promptCacheFields({...base, apiBase:'https://api.deepseek.com/v1'}), {});
  assert.deepEqual(promptCacheFields({...base, apiBase:'https://openrouter.ai.evil.example/v1'}), {});
  assert.equal(cacheProvider('https://api.moonshot.cn/v1'), 'moonshot');
  assert.equal(typeof promptCacheFields({...base,apiBase:'https://api.moonshot.cn/v1'}).prompt_cache_key, 'string');
  assert.deepEqual(promptCacheFields({...base,model:'anthropic/claude-sonnet-4.6'}).cache_control,{type:'ephemeral'});
});

test('a rejected cache hint has a fallback without losing tools or messages', () => {
  const tools = [{type:'function',function:{name:'lookup',parameters:{type:'object'}}}];
  const variants = requestBodyVariants({...base,tools},true);
  assert.ok(variants[0].body.session_id);
  const i = nextCompatibilityVariant(variants,0,'Unsupported parameter: session_id');
  assert.ok(i > 0);
  assert.equal(variants[i].body.session_id,undefined);
  assert.deepEqual(variants[i].body.tools,tools);
  assert.deepEqual(variants[i].body.messages,base.messages);
});

test('memory retrieval ranks Chinese and English terms, deduplicates, skips greetings', () => {
  const rows = [{text:'电池热管理与储能系统'},{text:'I use Python for optimization'},{text:'电池热管理与储能系统'},{text:'喜欢旅行'}];
  assert.deepEqual(rankMemoryTexts(rows,'电池热管理'),[rows[0]]);
  assert.deepEqual(rankMemoryTexts(rows,'Python optimization'),[rows[1]]);
  assert.equal(memoryQuery([{role:'user',content:'你好！'}]),'');
  assert.match(memoryQuery([{role:'user',content:'Python optimization'},{role:'assistant',content:'ok'},{role:'user',content:'继续'}]),/Python optimization/);
});

test('deferred tools are discoverable only if registered; relevant tools are prewarmed', () => {
  const body = {messages:[{role:'user',content:'你好'}]};
  assert.ok(selectDeferredCoreTools(body,'chat').has('code_interpreter'));
  const intent = {messages:[{role:'user',content:'用 Python 计算并绘制图表'}]};
  assert.ok(!selectDeferredCoreTools(intent,'chat').has('code_interpreter'));
  assert.ok(!selectDeferredCoreTools(intent,'chat').has('render_intelligent_ui'));
  const catalog = addDeferredCoreTools({entries:[],byTool:new Map()},[{function:{name:'code_interpreter',description:'Run Python',parameters:{type:'object'}}}],new Set(['code_interpreter','create_site']));
  assert.equal(catalog.byTool.has('code_interpreter'),true);
  assert.equal(catalog.byTool.has('create_site'),false);
  assert.deepEqual(splitInitialToolNames(['web_search','code_interpreter'],catalog),['web_search']);
});

test('routine questions keep Python deferred while execution-heavy requests prewarm it', () => {
  for (const content of [
    '计算 2 + 3',
    '推导这个方程',
    '解释代码',
    '画一个函数图像',
    'calculate 2 + 3',
    'explain this code',
    'Python 执行为什么慢',
    '什么是数据分析',
    'what is Python',
    'explain numerical simulation',
    'what is a CSV file',
  ]) {
    assert.ok(selectDeferredCoreTools({messages:[{role:'user',content}]},'chat').has('code_interpreter'),content);
  }
  for (const content of [
    '用 Python 计算这组数据',
    '分析这份 CSV 数据',
    '执行代码',
    '运行数值仿真',
    '把结果导出为 CSV',
    'run a numerical simulation',
    'analyze this dataset',
    'export this data as CSV',
  ]) {
    assert.ok(!selectDeferredCoreTools({messages:[{role:'user',content}]},'chat').has('code_interpreter'),content);
  }
});
