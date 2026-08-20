from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT / rel).read_text(encoding='utf-8')

def write(rel, text):
    (ROOT / rel).write_text(text, encoding='utf-8')

def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{rel}: anchor count={count}: {old[:120]!r}')
    write(rel, text.replace(old, new, 1))

# Make formatCargoType locale-aware for canonical Russian category values too.
replace_once(
    'src/utils/i18n.js',
    "// Переводы UrTruck — RU / EN / KZ / CN\n",
    "import { localizeCargoName } from './places';\n\n// Переводы UrTruck — RU / EN / KZ / CN\n",
)
replace_once(
    'src/utils/i18n.js',
    """export const formatCargoType = (type) => {
  if (!type) return t('cargo_type_unknown');
  const val = t(type);
  return val !== type ? val : type;
};""",
    """export const formatCargoType = (type) => {
  if (!type) return t('cargo_type_unknown');
  const raw = String(type).trim();
  const val = t(raw);
  if (val !== raw) return val;
  return localizeCargoName(raw, currentLang) || raw;
};""",
)

# Border lookup: never render CGR's raw Russian status in a non-Russian locale.
queue = read('src/screens/QueueScreenLazy.js')
repls = {
"""    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', open: 'Нажать',
""": """    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', open: 'Нажать',
    statusInQueue: 'В очереди', statusCalled: 'Вызван на КПП', statusCrossed: 'КПП пройден', statusRevoked: 'Пропуск отозван',
    statusPayment: 'Ожидается оплата', statusNotPaid: 'Не оплачено', statusValidating: 'Проверяется', statusReviewFailed: 'Требуется проверка', statusUnknown: 'Статус неизвестен',
""",
"""    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', open: 'Ашу',
""": """    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', open: 'Ашу',
    statusInQueue: 'Кезекте', statusCalled: 'Өткізу бекетіне шақырылды', statusCrossed: 'Өткізу бекетінен өтті', statusRevoked: 'Рұқсат жойылды',
    statusPayment: 'Төлем күтілуде', statusNotPaid: 'Төленбеген', statusValidating: 'Тексерілуде', statusReviewFailed: 'Қосымша тексеру қажет', statusUnknown: 'Күйі белгісіз',
""",
"""    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected', open: 'Open',
""": """    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected', open: 'Open',
    statusInQueue: 'In queue', statusCalled: 'Called to checkpoint', statusCrossed: 'Checkpoint crossed', statusRevoked: 'Pass revoked',
    statusPayment: 'Payment pending', statusNotPaid: 'Not paid', statusValidating: 'Validating', statusReviewFailed: 'Review required', statusUnknown: 'Status unknown',
""",
"""    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', open: '查看',
""": """    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', open: '查看',
    statusInQueue: '排队中', statusCalled: '已叫号，请前往口岸', statusCrossed: '已通过口岸', statusRevoked: '通行许可已撤销',
    statusPayment: '等待付款', statusNotPaid: '未付款', statusValidating: '审核中', statusReviewFailed: '需要复核', statusUnknown: '状态未知',
""",
}
for old, new in repls.items():
    if queue.count(old) != 1:
        raise SystemExit(f'Queue COPY anchor mismatch count={queue.count(old)}: {old[:80]!r}')
    queue = queue.replace(old, new, 1)

anchor = """function normalizePlate(value) {
"""
helper = """function localizedQueueStatus(lookup, L, lang) {
  const code = String(lookup?.status || '').trim().toLowerCase();
  const byCode = {
    in_queue: L.statusInQueue,
    called: L.statusCalled,
    crossed: L.statusCrossed,
    revoked: L.statusRevoked,
    payment: L.statusPayment,
    not_paid: L.statusNotPaid,
    validating: L.statusValidating,
    review_failed: L.statusReviewFailed,
  };
  if (byCode[code]) return byCode[code];
  if (lang === 'RU' && lookup?.status_raw) return String(lookup.status_raw);
  return L.statusUnknown;
}

"""
if queue.count(anchor) != 1:
    raise SystemExit('Queue normalizePlate anchor mismatch')
queue = queue.replace(anchor, helper + anchor, 1)
old_status = """{lookup.status_raw || lookup.status}</Text>"""
new_status = """{localizedQueueStatus(lookup, L, lang)}</Text>"""
if queue.count(old_status) != 1:
    raise SystemExit(f'Queue status display anchor mismatch count={queue.count(old_status)}')
queue = queue.replace(old_status, new_status, 1)
write('src/screens/QueueScreenLazy.js', queue)

# Extend strict regression to block raw-status leakage and raw canonical cargo fallback.
test = read('tests/frontend/test_strict_locale_owned_content.mjs')
old = """  assert.match(queue, /active \\? L\\.selected : L\\.open/);
  assert.doesNotMatch(queue, /\\? L\\.selected : 'Нажать'/);
  assert.match(notifications, /localizeSystemMessage\\(cleanNotifText\\(item\\.title\\), lang\\)/);
});"""
new = """  assert.match(queue, /active \\? L\\.selected : L\\.open/);
  assert.doesNotMatch(queue, /\\? L\\.selected : 'Нажать'/);
  assert.match(queue, /localizedQueueStatus\\(lookup, L, lang\\)/);
  assert.doesNotMatch(queue, /\\{lookup\\.status_raw \\|\\| lookup\\.status\\}/);
  assert.match(notifications, /localizeSystemMessage\\(cleanNotifText\\(item\\.title\\), lang\\)/);
});"""
if test.count(old) != 1:
    raise SystemExit(f'strict test border anchor mismatch count={test.count(old)}')
test = test.replace(old, new, 1)

insert_after = """test('translation fallback can never jump from non-RU locale to RU', () => {
  assert.match(hook, /if \\(lang !== 'RU'\\) return translations\\.EN/);
  assert.match(i18n, /if \\(currentLang !== 'RU'\\) return translations\\.EN/);
  assert.doesNotMatch(i18n, /currentLang === 'RU' \\|\\| currentLang === 'KK'/);
});
"""
addition = """
test('generic cargo formatter uses canonical locale dictionary instead of raw Russian fallback', () => {
  assert.match(i18n, /import \\{ localizeCargoName \\} from '\\.\\/places'/);
  assert.match(i18n, /return localizeCargoName\\(raw, currentLang\\) \\|\\| raw/);
});
"""
if test.count(insert_after) != 1:
    raise SystemExit('strict test fallback anchor mismatch')
test = test.replace(insert_after, insert_after + addition, 1)
write('tests/frontend/test_strict_locale_owned_content.mjs', test)

print('STRICT_LOCALE_FOLLOWUP=1')
