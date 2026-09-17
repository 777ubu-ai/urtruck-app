import fs from 'node:fs';
import path from 'node:path';
import { parse } from '@babel/parser';

const roots = ['src', 'App.js', 'tests/frontend', 'tests/unit'];
const extensions = new Set(['.js', '.jsx', '.mjs']);
const files = [];

function collect(input) {
  const stat = fs.statSync(input);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(input)) collect(path.join(input, entry));
    return;
  }
  if (extensions.has(path.extname(input))) files.push(input);
}

for (const root of roots) collect(root);
let failed = 0;
for (const file of files.sort()) {
  try {
    parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      sourceFilename: file,
      plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining', 'nullishCoalescingOperator'],
    });
  } catch (error) {
    failed += 1;
    console.error(`[lint] ${file}: ${error.message}`);
  }
}

if (failed) process.exit(1);
console.log(`[lint] PASS: parsed ${files.length} active JavaScript files`);
