import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../../src/utils/store.js', import.meta.url), 'utf8');

assert.match(source, /fallbackLabel:\s*'Запланирован'/, 'planned state needs a readable fallback label');
assert.match(source, /fallbackLabel:\s*'В пути'/, 'in-transit state needs a readable fallback label');
assert.match(source, /fallbackLabel:\s*'Доставлен'/, 'delivered state needs a readable fallback label');
assert.match(
  source,
  /const label = String\(info\.label \|\| info\.fallbackLabel \|\| nextState \|\| 'статус'\)/,
  'notification label must be normalized before toLowerCase',
);
assert.doesNotMatch(source, /info\.label\.toLowerCase\(\)/, 'state advance must never dereference a missing label');

console.log('Trip state notification contract: OK');
