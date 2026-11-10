import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildConnectorCatalog,
  searchConnectorCatalog,
} from '../src/services/integrations/connectorCatalog.js';

/* A representative connected set: personal tools, project tools, and the
   OpenConnector services users ask about most often. The assertions are
   service-level, not exact-tool-level, so adding a better action for a
   service does not break the test. */
const catalog = buildConnectorCatalog({
  connectorConnectionsByProvider: { github: {}, notion: {}, zotero: {} },
  projectConnectorConnectionsByProvider: {
    googlecalendar: {}, gmail: {}, todoist: {}, gitlab: {}, qq_mail: {},
    oc_jira: {}, oc_linear: {}, oc_asana: {}, oc_trello: {}, oc_slack: {},
    oc_airtable: {}, oc_tencent_docs: {}, oc_feishu: {}, oc_outlook: {},
    oc_netease_mail: {}, oc_discord: {}, oc_telegram: {}, oc_zhihu: {},
    oc_bluesky: {}, oc_ticktick: {}, oc_clickup: {}, oc_monday: {},
    oc_mcdonalds_cn: {}, oc_luckin_coffee: {}, oc_amap: {},
  },
});

const CASES = [
  ['calendar events', ['googlecalendar']],
  ['find a meeting', ['googlecalendar']],
  ['gmail search', ['gmail']],
  ['qq mail', ['qq_mail']],
  ['outlook inbox', ['outlook']],
  ['github repos', ['github']],
  ['gitlab merge requests', ['gitlab']],
  ['notion pages', ['notion']],
  ['zotero references', ['zotero']],
  ['todoist tasks', ['todoist']],
  ['jira issue', ['jira']],
  ['linear issues', ['linear']],
  ['asana tasks', ['asana']],
  ['trello cards', ['trello']],
  ['slack messages', ['slack']],
  ['airtable records', ['airtable']],
  ['腾讯文档', ['tencent_docs']],
  ['飞书 消息', ['feishu']],
  ['discord 频道', ['discord']],
  ['telegram 消息', ['telegram']],
  ['知乎', ['zhihu']],
  ['ticktick 待办', ['ticktick']],
  ['clickup tasks', ['clickup']],
  ['monday board', ['monday']],
  ['麦当劳 菜单', ['mcdonalds_cn']],
  ['瑞幸 咖啡', ['luckin_coffee']],
  ['高德 地图', ['amap']],
  ['日历 会议', ['googlecalendar']],
  ['代码仓库', ['github', 'gitlab']],
  ['笔记', ['notion']],
  ['文献', ['zotero']],
  ['待办', ['todoist', 'ticktick']],
  ['表格', ['airtable', 'tencent_docs']],
];

test('representative English and Chinese requests recall the expected service in the top three', () => {
  const misses = [];
  for (const [query, expected] of CASES) {
    const top = searchConnectorCatalog(catalog, query, 3);
    const hit = top.some((match) => expected.includes(match.service));
    if (!hit) misses.push({ query, expected, top: top.map((match) => match.service) });
  }
  assert.deepEqual(misses, []);
});

test('unrelated requests return no connector matches', () => {
  assert.deepEqual(searchConnectorCatalog(catalog, 'quantum chromodynamics', 5), []);
});

test('the retrieval result is bounded by the requested limit', () => {
  const top = searchConnectorCatalog(catalog, 'task', 2);
  assert.ok(top.length <= 2);
  for (const match of top) assert.ok(match.score > 0);
});
