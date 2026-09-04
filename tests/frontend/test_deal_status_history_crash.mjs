/**
 * P1-DEAL-STATUS-001 (nightly 04.09.2026, repro 2/2) — Regression:
 * Deal Room → «Статусы и история» → ErrorBoundary,
 * runtime: Property 'statusLabel' doesn't exist.
 *
 * ROOT CAUSE (доказан git-историей): коммит 16b7e06b («whatsapp style»)
 * убрал статус-пилюлю из шапки DealWorkspaceScreenV2 и вместе с ней удалил
 *   const statusLabel = visibleDealStatus === 'delivered'
 *     ? ui.awaitingReceiptStatus : formatStatus(visibleDealStatus);
 * при этом статус-модалка продолжила ссылаться на statusLabel в renderItem
 * (fallbackStatus у DealStatusTimeline). Свободная переменная в замыкании
 * резолвится Hermes'ом только в момент рендера модалки → детерминированный
 * ReferenceError ровно при открытии «Статусы и история».
 *
 * ПОЧЕМУ ТЕСТЫ ПРОПУСТИЛИ: ни один тест не рендерит модалку; статические
 * тесты проверяли testID'ы. Единственный тест, ловивший потерю строки —
 * test_delivery_confirmation_copy.mjs — был красным с 16b7e06b, но был
 * ошибочно классифицирован как «устаревший ассерт», а не как канарейка.
 *
 * Этот файл:
 *   §1 воспроизводит класс дефекта (упал бы ДО фикса): каждое
 *      использование statusLabel обязано иметь объявление в файле;
 *   §2 обобщает guard на все идентификаторы-значения JSX-пропсов внутри
 *      блока статус-модалки;
 *   §3-§9 фиксируют контракт модалки: локализованный label (RU/ZH),
 *      обе роли, unknown/legacy статусы без crash, таймлайн, Back.
 *
 * Run: node tests/frontend/test_deal_status_history_crash.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

let passed = 0;
let failed = 0;
function expect(cond, msg) {
  if (cond) { console.log(`  ✅ ${msg}`); passed++; }
  else { console.error(`  ❌ FAIL: ${msg}`); failed++; }
}

const v2Raw = read('src/screens/DealWorkspaceScreenV2.js');
const timelineSrc = read('src/components/deal/DealStatusTimeline.js');
const i18nSrc = read('src/utils/i18n.js');

// Анализ идентификаторов — только по коду, комментарии описывают сам баг.
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const v2 = stripComments(v2Raw);

console.log('\n=== 1. Репро-guard: каждое использование statusLabel объявлено (ДО фикса — FAIL) ===');
{
  const uses = (v2.match(/(?<![.\w$'"])statusLabel(?![\w$:'"])/g) || []).length;
  expect(uses >= 2, `statusLabel используется в коде (${uses} вхождений: объявление + модалка)`);
  expect(
    /const statusLabel = /.test(v2),
    'const statusLabel объявлен в DealWorkspaceScreenV2 (до фикса объявления не было — Hermes бросал ReferenceError)'
  );
  // Объявление обязано стоять РАНЬШЕ использования в модалке.
  const declIdx = v2.indexOf('const statusLabel = ');
  const useIdx = v2.indexOf('fallbackStatus={statusLabel}');
  expect(useIdx !== -1, 'модалка передаёт fallbackStatus={statusLabel} в DealStatusTimeline');
  expect(declIdx !== -1 && useIdx !== -1 && declIdx < useIdx, 'объявление стоит раньше использования');
}

console.log('\n=== 2. Обобщённый guard: идентификаторы JSX-пропсов статус-модалки объявлены ===');
{
  // Берём блок статус-модалки целиком (от statusModalOpen-Modal до его закрытия).
  const start = v2.indexOf('<Modal visible={statusModalOpen}');
  expect(start !== -1, 'блок статус-модалки найден');
  const block = v2.slice(start, v2.indexOf('</Modal>', start));

  // Собираем голые идентификаторы из prop={ident} и prop={ident.path}.
  const usedIdents = new Set();
  for (const m of block.matchAll(/=\{\s*([A-Za-z_$][\w$]*)\s*[}.]/g)) usedIdents.add(m[1]);
  for (const m of block.matchAll(/\{\s*([A-Za-z_$][\w$]*)\s*\?\./g)) usedIdents.add(m[1]);

  // Всё, что объявлено в файле любым способом.
  const declared = new Set();
  for (const m of v2.matchAll(/\b(?:const|let|var|function)\s+(?:\[\s*)?([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of v2.matchAll(/\b(?:const|let|var)\s+\[\s*[A-Za-z_$][\w$]*\s*,\s*([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of v2.matchAll(/\bimport\s+([A-Za-z_$][\w$]*)\s+from/g)) declared.add(m[1]);
  for (const m of v2.matchAll(/\bimport\s*\{([^}]+)\}\s*from/g)) {
    m[1].split(',').forEach((piece) => {
      const name = piece.split(' as ').pop().trim();
      if (name) declared.add(name);
    });
  }
  // Локальные параметры callback'ов внутри блока (item и т.п.).
  for (const m of block.matchAll(/\(\s*\{?\s*([A-Za-z_$][\w$]*)\s*\}?\s*\)\s*=>/g)) declared.add(m[1]);

  const undeclared = [...usedIdents].filter((n) => !declared.has(n));
  expect(
    undeclared.length === 0,
    `все идентификаторы модалки объявлены (необъявленных: ${undeclared.length ? undeclared.join(', ') : 'нет'})`
  );
}

console.log('\n=== 3. Восстановленный контракт statusLabel (утверждённая копия) ===');
{
  expect(
    /const statusLabel = visibleDealStatus === 'delivered' \? ui\.awaitingReceiptStatus : formatStatus\(visibleDealStatus\);/.test(v2),
    "statusLabel: delivered → ui.awaitingReceiptStatus, иначе formatStatus(visibleDealStatus)"
  );
  expect(
    /const visibleDealStatus = userFacingDealStatus\(deal\?\.status \|\| 'accepted'\)/.test(v2),
    'статус проходит через канонический userFacingDealStatus'
  );
  expect(
    /import \{ getLanguage, formatStatus, formatTruckType \} from '\.\.\/utils\/i18n'/.test(v2Raw),
    'formatStatus импортирован из канонического i18n (не второй helper)'
  );
}

console.log('\n=== 4. DealStatusTimeline: fallbackStatus — ЛОКАЛИЗОВАННАЯ строка, не enum ===');
{
  expect(
    /fallbackStatus = ''/.test(timelineSrc),
    'fallbackStatus имеет безопасный дефолт (пустая строка, не undefined)'
  );
  expect(
    /\{fallbackStatus \|\| ui\.empty\}/.test(timelineSrc),
    'при пустом таймлайне fallbackStatus рендерится как есть — значит обязан быть локализованным label'
  );
  expect(
    /events = \[\]/.test(timelineSrc),
    'events имеет безопасный дефолт [] — пустой таймлайн не роняет рендер'
  );
}

console.log('\n=== 5. Unknown/legacy статус — безопасный канонический fallback, не crash ===');
{
  const mod = await import(path.join(ROOT, 'src/utils/dealStatusOrder.js'));
  // Легаси-статус старых сборок сводится к каноническому.
  expect(
    mod.userFacingDealStatus('awaiting_confirmation') === 'delivered',
    "legacy 'awaiting_confirmation' канонизируется в 'delivered'"
  );
  expect(
    mod.userFacingDealStatus('accepted') === 'accepted',
    'канонический статус проходит без изменений'
  );
  // Неизвестный мусор не взрывается на этом слое…
  const junk = mod.userFacingDealStatus('weird_legacy_junk');
  expect(typeof junk === 'string' && junk.length > 0, 'неизвестный статус не роняет канонизацию');
  // …а на слое i18n ловится веткой status_unknown.
  expect(
    /return val !== key \? val : t\('status_unknown'\)/.test(i18nSrc),
    "formatStatus: неизвестный статус → t('status_unknown'), не сырой enum и не ключ перевода"
  );
  const unknownCount = (i18nSrc.match(/(?<![A-Za-z0-9_])status_unknown:/g) || []).length;
  expect(unknownCount >= 4, `status_unknown определён во всех языках (найдено ${unknownCount})`);
}

console.log('\n=== 6. RU/ZH: канонические статусы имеют переводы ===');
{
  for (const st of ['accepted', 'in_progress', 'at_border', 'delivered', 'received', 'completed', 'cancelled']) {
    const n = (i18nSrc.match(new RegExp(`(?<![A-Za-z0-9_])status_${st}:`, 'g')) || []).length;
    expect(n >= 4, `status_${st} определён в ≥4 языковых блоках (найдено ${n})`);
  }
}

console.log('\n=== 7. Обе роли открывают одну и ту же модалку (нет role-ветвления рендера) ===');
{
  const start = v2.indexOf('<Modal visible={statusModalOpen}');
  const block = v2.slice(start, v2.indexOf('</Modal>', start));
  expect(
    !/role ===|isDriver|isShipper/.test(block),
    'рендер таймлайна в модалке не ветвится по роли — Boris и Fedya получают один код-путь'
  );
  // Ролевая логика живёт в nextAction (кнопке действия), а не в рендере истории.
  expect(
    block.includes('nextAction'),
    'ролевое действие идёт через канонический nextAction, отдельного role-рендера нет'
  );
}

console.log('\n=== 8. Back/reopen контракт модалки ===');
{
  expect(
    /<Modal visible=\{statusModalOpen\}[^>]*onRequestClose=\{\(\) => setStatusModalOpen\(false\)\}/.test(v2),
    'hardware Back закрывает модалку через onRequestClose (не роняет экран)'
  );
  const opens = (v2.match(/setStatusModalOpen\(true\)/g) || []).length;
  expect(opens >= 2, `модалка переоткрывается из ≥2 точек входа (найдено ${opens}: шапка + attach-меню)`);
}

console.log('\n=== 9. Таймлайн: события + текущий статус ===');
{
  expect(
    /events=\{timeline\}/.test(v2),
    'модалка передаёт реальные события timeline'
  );
  expect(
    /const \[timeline, setTimeline\] = React\.useState\(\[\]\)/.test(v2),
    'timeline — state с безопасным начальным []'
  );
  // Таймлайн рендерит несколько событий списком.
  expect(
    /events\.map\(|\.map\(\s*\(?\s*(event|ev|item)/.test(stripComments(timelineSrc)),
    'DealStatusTimeline итерирует события (несколько записей истории)'
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
