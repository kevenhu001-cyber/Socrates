import fs from 'node:fs';

const s = fs.readFileSync('src/i18n.js', 'utf8');
const zhAt = s.indexOf('zh:{');
const keys = [
  'tool.groupSearchDone', 'tool.groupSearchEmpty', 'tool.nActions', 'tool.techDetails',
  'tool.fetchedHost', 'tool.exploredFiles', 'tool.doneWriteFiles', 'tool.fileSummaryReview',
  'tool.searchedFor', 'tool.groupExplored', 'tool.retry', 'tool.errorCode', 'tool.retryable',
  'tool.sources', 'tool.output', 'tool.noDetails', 'tool.searchFailedFor', 'tool.nSources',
  'tool.readFile', 'tool.ranCommand', 'tool.ranCode', 'tool.statusTimeout', 'tool.metaToolCount',
];
for (const k of keys) {
  const re = new RegExp('"' + k + '":"([^"]*)"', 'g');
  const hits = [...s.matchAll(re)].map((m) => ({ i: m.index, v: m[1] }));
  const en = hits.find((h) => h.i < zhAt);
  const zh = hits.find((h) => h.i > zhAt);
  console.log(k.padEnd(24), '| en:', en ? en.v : '(MISSING)', '| zh:', zh ? zh.v : '(MISSING)');
}
