import fs from 'node:fs';
import { parse } from '@babel/parser';

const file = 'src/utils/i18n.js';
const source = fs.readFileSync(file, 'utf8');
const ast = parse(source, { sourceType: 'module' });
const decl = ast.program.body.find((node) => node.type === 'VariableDeclaration' && node.declarations.some((d) => d.id.name === 'translations'));
const root = decl?.declarations.find((d) => d.id.name === 'translations')?.init;
const critical = new Set(['delivered', 'received', 'completed', 'status_delivered', 'status_received', 'status_completed']);
const criticalConflicts = [];
const allDuplicates = [];
const terminalCollisions = [];

for (const locale of root?.properties || []) {
  const localeName = locale.key?.name || locale.key?.value;
  const seen = new Map();
  const terminal = new Map();
  for (const prop of locale.value?.properties || []) {
    if (prop.type !== 'ObjectProperty' || prop.computed) continue;
    const key = prop.key?.name || prop.key?.value;
    if (!key) continue;
    const value = source.slice(prop.value.start, prop.value.end);
    if (['status_delivered', 'status_received', 'status_completed'].includes(key)) terminal.set(key, value);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(value);
  }
  for (const [key, values] of seen) {
    if (values.length < 2) continue;
    const identical = new Set(values).size === 1;
    allDuplicates.push({ locale: localeName, key, identical });
    if (!identical && critical.has(key)) criticalConflicts.push({ locale: localeName, key });
  }
  if (new Set([...terminal.values()]).size !== 3) terminalCollisions.push({ locale: localeName, values: Object.fromEntries(terminal) });
}

const identicalCount = allDuplicates.filter((item) => item.identical).length;
console.log(`[i18n] duplicate keys: ${allDuplicates.length} (${identicalCount} identical, ${allDuplicates.length - identicalCount} conflicting)`);
if (criticalConflicts.length) {
  console.error('[i18n] critical conflicting duplicates:', JSON.stringify(criticalConflicts));
  process.exit(1);
}
if (terminalCollisions.length) {
  console.error('[i18n] terminal status values must be distinct:', JSON.stringify(terminalCollisions));
  process.exit(1);
}
console.log('[i18n] PASS: no conflicting duplicates in critical status scope');
