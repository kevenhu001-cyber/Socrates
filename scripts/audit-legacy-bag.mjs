// scripts/audit-legacy-bag.mjs
// v4: handles `const nsVar = getLegacyActions().ns; nsVar.field(...)` pattern.

import { readFile } from "node:fs/promises";
import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const ROOT = dirname(fileURLToPath(import.meta.url)) + "/..";
const ASSEMBLY_FILE = "frontend/src/main.js";
const REACT_ROOT = "frontend/src/react";

const accessed = new Map();

async function readAll(dir) {
  const out = [];
  for (const entry of await readdir(dir)) {
    const p = join(dir, entry);
    const s = await stat(p);
    if (s.isDirectory()) out.push(...(await readAll(p)));
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry)) out.push(p);
  }
  return out;
}
const files = await readAll(join(ROOT, REACT_ROOT));

const seg = String.raw`(?:\?\.|\.)`;

function add(key, rel) {
  if (!accessed.has(key)) accessed.set(key, new Set());
  accessed.get(key).add(rel);
}

for (const f of files) {
  const rel = relative(ROOT, f).replaceAll("\\", "/");
  const text = await readFile(f, "utf8");

  // Pattern 1: getLegacyActions().ns.field
  const directRe = new RegExp(`getLegacyActions\\(\\)\\s*${seg}([a-zA-Z_$][\\w$]*)\\s*${seg}([a-zA-Z_$][\\w$]*)`, "g");
  let m;
  while ((m = directRe.exec(text)) !== null) add(`${m[1]}.${m[2]}`, rel);

  // Pattern 2: const legacy = getLegacyActions(); legacy.ns.field
  // Pattern 2b: const nsVar = getLegacyActions().ns; nsVar.field
  const assignedRe = new RegExp(`(?:const|let|var)\\s+([a-zA-Z_$][\\w$]*)\\s*=\\s*(?:getLegacyActions\\(\\)|[a-zA-Z_$][\\w$]*)\\s*(?:${seg}([a-zA-Z_$][\\w$]*))?`, "g");
  const aliases = new Map(); // local var name -> "ns" (or null if assigned full legacy)
  let am;
  while ((am = assignedRe.exec(text)) !== null) {
    if (am[2]) {
      aliases.set(am[1], am[2]);
    } else {
      aliases.set(am[1], null); // full legacy
    }
  }
  for (const [n, ns] of aliases) {
    if (ns) {
      // nsVar.field — record ns.field
      const re = new RegExp(`\\b${n}\\s*${seg}([a-zA-Z_$][\\w$]*)`, "g");
      let cm;
      while ((cm = re.exec(text)) !== null) add(`${ns}.${cm[1]}`, rel);
    } else {
      // legacy.ns.field
      const re = new RegExp(`\\b${n}\\s*${seg}([a-zA-Z_$][\\w$]*)\\s*${seg}([a-zA-Z_$][\\w$]*)`, "g");
      let cm;
      while ((cm = re.exec(text)) !== null) add(`${cm[1]}.${cm[2]}`, rel);
    }
  }

  // Pattern 3: const { field } = getLegacyActions().ns or { field } = legacy
  const destructureRe = new RegExp(`(?:const|let|var)\\s*\\{([^}]+)\\}\\s*=\\s*(?:getLegacyActions\\(\\)|[a-zA-Z_$][\\w$]*)\\s*${seg}([a-zA-Z_$][\\w$]*)`, "g");
  let dm;
  while ((dm = destructureRe.exec(text)) !== null) {
    const ns = dm[2];
    const fields = dm[1].split(",").map((s) => s.trim().split(/[:=]/)[0].trim()).filter(Boolean);
    for (const fld of fields) add(`${ns}.${fld}`, rel);
  }

  // Pattern 4: getLegacyActions()?.ns?.field (already covered by Pattern 1 with seg)
  // Pattern 5: chained via ?.: `legacy?.ns?.field` — handled by Pattern 2
  // Pattern 6: `messages.editUserMessage` (namespace is shorthand) — handled
  //            when the assignment was `const messages = getLegacyActions().messages`
  //            then messages.editUserMessage is matched by Pattern 2
}

const mainText = await readFile(join(ROOT, ASSEMBLY_FILE), "utf8");
const startIdx = mainText.indexOf("window.__socratesLegacy = {");
if (startIdx < 0) { console.error("assembly not found"); process.exit(1); }
const assemblyText = mainText.slice(startIdx);
const lines = assemblyText.split("\n");
const definedNamespaces = new Map();
let currentNs = null;
for (const line of lines) {
  const nsMatch = line.match(/^\s{2}([a-zA-Z_$][\w$]*)\s*:\s*\{/);
  if (nsMatch) {
    currentNs = nsMatch[1];
    if (!definedNamespaces.has(currentNs)) definedNamespaces.set(currentNs, new Set());
    continue;
  }
  const fieldMatch = line.match(/^\s{4}([a-zA-Z_$][\w$]*)\s*:/);
  if (fieldMatch && currentNs) {
    definedNamespaces.get(currentNs).add(fieldMatch[1]);
  }
}

console.log("=== __socratesLegacy entry audit (v4) ===\n");
const total = [...definedNamespaces.values()].reduce((s, set) => s + set.size, 0);
console.log(`Assembly: ${definedNamespaces.size} namespaces, ${total} fields\n`);

const dead = [];
const used = [];
for (const [ns, fields] of [...definedNamespaces.entries()].sort()) {
  for (const f of [...fields].sort()) {
    const key = `${ns}.${f}`;
    const readers = accessed.get(key);
    if (!readers || readers.size === 0) {
      dead.push({ ns, field: f, key });
    } else {
      used.push({ ns, field: f, key, readers: [...readers] });
    }
  }
}
console.log(`Used : ${used.length}`);
console.log(`Dead : ${dead.length}\n`);
if (dead.length) {
  console.log("=== DEAD fields ===");
  for (const d of dead) console.log(`  ${d.key}`);
  console.log("");
}
console.log("=== USED fields ===");
for (const u of used) {
  console.log(`  ${u.key.padEnd(40)} readers=${u.readers.length}`);
}
