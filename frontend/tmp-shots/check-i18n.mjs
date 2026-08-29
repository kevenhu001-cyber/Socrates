import fs from 'node:fs';

const dir = 'src/react/tool-run';
const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
const keys = new Set();
for (const f of files) {
  const s = fs.readFileSync(`${dir}/${f}`, 'utf8');
  for (const m of s.matchAll(/\bt[f]?\(\s*'([A-Za-z0-9_.]+)'/g)) keys.add(m[1]);
}
const i18n = fs.readFileSync('src/i18n.js', 'utf8');
const missing = [...keys].filter((k) => !i18n.includes(`'${k}'`) && !i18n.includes(`"${k}"`));
console.log('used keys:', keys.size);
console.log('MISSING:', missing.length ? missing.join('\n  ') : '(none)');
