// Design v1 Commit 7 — permanent guard: no duplicate keys inside any locale
// block of src/utils/i18n.js.
//
// Why: JS object literals silently let the LAST duplicate win, so a repeated
// key never throws — the earlier (often divergent) value is dead code and the
// effective copy is invisible at the definition site. The 2026-09-09 dedup
// (Commit 7) removed 480 earlier-duplicate entries (RU 25 / EN 167 / KK 153 /
// ZH 135) while proving key→lastValue equality before/after; this test keeps
// the file clean.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(process.cwd() + '/package.json');
const { parse } = require('@babel/parser');

const FILE = 'src/utils/i18n.js';

test('i18n.js parses (object literal intact)', () => {
  const src = readFileSync(FILE, 'utf8');
  assert.doesNotThrow(() => parse(src, { sourceType: 'module' }));
});

test('no duplicate keys within any locale block', () => {
  const src = readFileSync(FILE, 'utf8');
  const ast = parse(src, { sourceType: 'module' });
  const decl = ast.program.body.find(
    (n) => n.type === 'VariableDeclaration' && n.declarations.some((d) => d.id.name === 'translations'),
  );
  assert.ok(decl, 'translations declaration not found');
  const root = decl.declarations.find((d) => d.id.name === 'translations').init;
  assert.equal(root.type, 'ObjectExpression');

  const dups = [];
  for (const localeProp of root.properties) {
    const locale = localeProp.key.name || localeProp.key.value;
    const seen = new Map();
    for (const p of localeProp.value.properties) {
      if (p.type !== 'ObjectProperty' || p.computed) continue;
      const key = p.key.name || p.key.value;
      if (seen.has(key)) {
        dups.push(`${locale}.${key} (lines ${seen.get(key)} and ${p.loc.start.line})`);
      } else {
        seen.set(key, p.loc.start.line);
      }
    }
  }
  assert.deepEqual(dups, [], `duplicate i18n keys found: ${dups.join(', ')}`);
});

test('locale blocks keep parity with each other (key sets identical)', () => {
  const src = readFileSync(FILE, 'utf8');
  const m = src.match(/const translations = (\{[\s\S]*?\n\};)/);
  assert.ok(m, 'translations object not found');
  // eslint-disable-next-line no-eval
  const t = eval(`(${m[1].slice(0, -1)})`);
  const keysets = ['RU', 'EN', 'KK', 'ZH'].map((l) => new Set(Object.keys(t[l] || {})));
  for (let i = 1; i < keysets.length; i++) {
    const missing = [...keysets[0]].filter((k) => !keysets[i].has(k));
    const extra = [...keysets[i]].filter((k) => !keysets[0].has(k));
    assert.deepEqual({ missing, extra }, { missing: [], extra: [] }, 'locale key set diverges from RU');
  }
});
