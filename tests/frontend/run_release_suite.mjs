#!/usr/bin/env node
// КАНОНИЧЕСКИЙ раннер frontend release-сюита.
//
// ROOT CAUSE финального gate (04.09.2026): релизный прогон делался наивно —
// `for f in tests/frontend/*.mjs; do node "$f"; done`. Такой прогон давал
// «78 / 85, 7 FAIL», и это НЕ было ни stale-тестами, ни продуктовой
// регрессией:
//
//   1) в знаменатель попадал сам харнесс `loader.mjs` (85 = 84 теста + loader),
//      то есть цифра «85» изначально не была числом тестов;
//   2) 7 тестов из 84 импортируют РЕАЛЬНЫЕ модули `src/**` (не читают их как
//      текст), а `src/**` написан по конвенции Metro:
//        * относительные импорты без расширения (`./storage`, `./places`,
//          `../config/supabase`) — строгий ESM-резолвер Node их не находит;
//        * транзитивный `react-native` — это Flow-синтаксис, Node его не парсит.
//      Ровно для этого и существует `tests/frontend/loader.mjs`
//      (resolve-hook + моки), и CI (`.github/workflows/pr-quality-gate.yml`)
//      запускает эти файлы ИМЕННО через него. Наивный раннер loader не
//      подключал — падал резолв, а не проверяемое поведение.
//
// Поэтому единственный поддерживаемый способ прогнать сюит — этот файл:
// loader подключается ко ВСЕМ тестам, харнесс и моки исключаются из списка,
// а итог печатается как «PASS/FAIL из N тестов» — без магических знаменателей.
//
// Запуск: npm run test:frontend

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const LOADER = join(HERE, 'loader.mjs');

// Не тесты: сам resolve-hook и его моки.
const NOT_A_TEST = new Set(['loader.mjs', 'run_release_suite.mjs']);

const files = readdirSync(HERE)
  .filter((name) => name.endsWith('.mjs') && !NOT_A_TEST.has(name))
  .sort();

const failed = [];
for (const name of files) {
  const res = spawnSync(
    process.execPath,
    ['--experimental-loader', LOADER, join(HERE, name)],
    { cwd: REPO, encoding: 'utf8' },
  );
  const ok = res.status === 0;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${name}\n`);
  if (!ok) {
    failed.push(name);
    // Печатаем причину сразу — иначе «7 FAIL» опять придётся расследовать
    // отдельным прогоном.
    const out = `${res.stdout || ''}${res.stderr || ''}`.trimEnd();
    if (out) process.stdout.write(`${out.split('\n').map((l) => `      ${l}`).join('\n')}\n`);
  }
}

const total = files.length;
process.stdout.write(
  `\nFRONTEND RELEASE SUITE: ${total - failed.length} / ${total} PASS`
  + `${failed.length ? `, ${failed.length} FAIL` : ''}\n`,
);
if (failed.length) {
  process.stdout.write(`FAILED: ${failed.join(', ')}\n`);
  process.exit(1);
}
