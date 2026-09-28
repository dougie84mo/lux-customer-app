#!/usr/bin/env node
// Key parity between locales/en and every other language, plus
// interpolation-variable parity ({{name}} in en must appear in es).
// Exit 1 on any drift. Run: node scripts/i18n-check.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'locales');
const langs = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
const others = langs.filter((l) => l !== 'en');

const flatten = (obj, prefix = '') =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? flatten(v, `${prefix}${k}.`) : [[`${prefix}${k}`, String(v)]],
  );
const vars = (s) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort().join(',');

let problems = 0;
for (const file of readdirSync(join(root, 'en')).filter((f) => f.endsWith('.json'))) {
  const en = new Map(flatten(JSON.parse(readFileSync(join(root, 'en', file), 'utf8'))));
  for (const lang of others) {
    let other;
    try {
      other = new Map(flatten(JSON.parse(readFileSync(join(root, lang, file), 'utf8'))));
    } catch (e) {
      console.error(`${lang}/${file}: ${e.message}`);
      problems++;
      continue;
    }
    for (const [k, v] of en) {
      if (!other.has(k)) {
        console.error(`${lang}/${file}: missing ${k}`);
        problems++;
      } else if (vars(v) !== vars(other.get(k))) {
        console.error(`${lang}/${file}: ${k} variables {${vars(v)}} ≠ {${vars(other.get(k))}}`);
        problems++;
      }
    }
    for (const k of other.keys()) {
      if (!en.has(k)) {
        console.error(`${lang}/${file}: extra ${k} (not in en)`);
        problems++;
      }
    }
  }
}
if (problems) {
  console.error(`\n${problems} i18n problem(s).`);
  process.exit(1);
}
console.log(`i18n OK — ${others.join(', ')} match en.`);
