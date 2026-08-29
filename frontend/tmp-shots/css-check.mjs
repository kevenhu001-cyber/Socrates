import fs from 'node:fs';
const s = fs.readFileSync('src/styles.css', 'utf8');
const i = s.indexOf('Declarative tool-run renderer');
const tail = s.slice(i);
console.log('marker at', i);
console.log('is-declarative mentions', (tail.match(/is-declarative/g) || []).length);
console.log('long prefix count', (tail.match(/\.msg\.assistant \.msg-body\.is-declarative:has/g) || []).length);
console.log(tail.split('\n').filter((l) => l.includes('{')).slice(0, 12).join('\n'));
