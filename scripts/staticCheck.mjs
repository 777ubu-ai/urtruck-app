import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as babel from '@babel/core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_ROOTS = ['src', 'scripts'];
const ROOT_FILES = ['App.js', 'index.js'];
const EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs']);

async function collect(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await collect(fullPath));
    else if (EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

const files = [
  ...await Promise.all(SOURCE_ROOTS.map((root) => collect(path.join(ROOT, root)))),
  ...ROOT_FILES.map((file) => path.join(ROOT, file)),
].flat().sort();

const parserPlugins = [
  'jsx', 'classProperties', 'optionalChaining',
  'nullishCoalescingOperator', 'dynamicImport', 'topLevelAwait',
];
const failures = [];

for (const file of files) {
  try {
    const source = await fs.readFile(file, 'utf8');
    await babel.parseAsync(source, {
      filename: file,
      sourceType: 'unambiguous',
      parserOpts: { sourceType: 'unambiguous', plugins: parserPlugins },
      configFile: false,
      babelrc: false,
    });
  } catch (error) {
    failures.push(`${path.relative(ROOT, file)}: ${error.message}`);
  }
}

if (failures.length) {
  console.error(`Static check failed for ${failures.length} file(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Static check passed: ${files.length} production JavaScript files parsed.`);
}
