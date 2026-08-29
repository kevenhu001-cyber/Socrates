import fs from 'node:fs';

const p = 'src/styles.css';
const s = fs.readFileSync(p, 'utf8');
const marker = '/* ═══ Declarative tool-run renderer';
const i = s.indexOf(marker);
if (i < 0) throw new Error('marker not found');

/* The legacy "activity surface" passes use `.msg.assistant .msg-body:has(.tool-inline)
   .x` = specificity (0,5,0). A bare `.msg-body.is-declarative .x` is (0,3,0) and
   would lose every contest, so the declarative block needs the same chain. */
const OLD = '.msg-body.is-declarative';
const NEW = '.msg.assistant .msg-body.is-declarative:has(.tool-inline)';
const patched = s.slice(0, i) + s.slice(i).replaceAll(OLD, NEW);
fs.writeFileSync(p, patched);

const check = fs.readFileSync(p, 'utf8');
const tail = check.slice(check.indexOf(marker));
console.log('full-prefix selectors:', (tail.match(new RegExp(NEW.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length);
console.log('bare leftovers:', (tail.match(/\.msg-body\.is-declarative(?!:has)/g) || []).length);
