// Маппинг разговорных/опечаточных запросов в каноничные ключи кузова.
// Используется в Feed-поиске: пользователь печатает "тнт" — карточки с
// truckType: 'tent' попадают в выдачу. Не зависит от языка приложения,
// потому что водители часто пишут смесью RU/EN/CN.
//
// Каждый канонический ключ повторяет ключи в TRUCK_KEYS (FeedScreen) и в
// i18n: 'tent', 'ref', 'platform', 'auto', 'izoterm', 'cont20', 'cont40',
// 'jumbo', 'mega', 'curtain', 'lowloader', 'tanker', 'dumptruck', 'grain',
// 'livestock', 'logger', 'hazmat', 'open_truck', 'closed', 'longliner',
// 'microvan'.

const SYNONYMS = {
  tent:       ['тент', 'тнт', 'tent', 'curtainside short', 'тент.'],
  ref:        ['реф', 'рефр', 'рефер', 'рефрижератор', 'reefer', 'refrigerator', 'ref', 'холодильник'],
  platform:   ['платформа', 'площадка', 'platform', 'flatbed', 'open platform'],
  auto:       ['автовоз', 'auto', 'car carrier', 'car_carrier', 'carcarrier'],
  izoterm:    ['изотерм', 'изотермич', 'isotherm', 'isothermal', 'термос'],
  cont20:     ['конт20', 'контейнер 20', 'container 20', '20 фут', '20ft', 'cont20'],
  cont40:     ['конт40', 'контейнер 40', 'container 40', '40 фут', '40ft', 'cont40'],
  // 'конт' / 'контейнер' без размера — оба контейнера показываем
  curtain:    ['штора', 'шторка', 'curtain', 'тент-штора'],
  jumbo:      ['джамбо', 'jumbo'],
  mega:       ['мега', 'mega'],
  lowloader:  ['трал', 'низкорам', 'lowloader', 'low loader'],
  tanker:     ['цистерна', 'танкер', 'tanker', 'tank'],
  dumptruck:  ['самосвал', 'дамп', 'dump', 'dumptruck', 'dump truck'],
  grain:      ['зерновоз', 'зерно', 'grain'],
  livestock:  ['скотовоз', 'скот', 'livestock', 'cattle'],
  logger:     ['лесовоз', 'лес', 'logger', 'log'],
  hazmat:     ['опасный', 'adr', 'hazmat', 'опасные грузы'],
  open_truck: ['борт', 'бортовой', 'open truck', 'open_truck', 'side board'],
  closed:     ['закрытый', 'фургон', 'closed', 'box truck'],
  longliner:  ['длинномер', 'longliner', 'long liner'],
  microvan:   ['микроавтобус', 'микро', 'microvan', 'микроавт', 'фолькс'],
};

const norm = (s) => String(s || '').toLowerCase().trim();

// Возвращает массив канонических ключей кузовов, которые соответствуют
// поисковой строке. Один запрос может матчить несколько ключей (напр.
// "контейнер" → ['cont20','cont40']). Пустой массив = синонимов нет, поиск
// идёт по обычным полям (route/cargo/name).
export const matchTruckTypes = (query) => {
  const q = norm(query);
  if (!q) return [];
  const matched = [];
  // 1) точное / partial совпадение по канон. ключу
  for (const key of Object.keys(SYNONYMS)) {
    if (key.startsWith(q) || q.startsWith(key)) matched.push(key);
  }
  // 2) словарь синонимов
  for (const [key, list] of Object.entries(SYNONYMS)) {
    if (matched.includes(key)) continue;
    for (const syn of list) {
      if (syn.startsWith(q) || q.includes(syn)) { matched.push(key); break; }
    }
  }
  // 3) "конт"/"контейнер" — оба размера
  if (q === 'конт' || q.startsWith('контейнер') || q === 'cont' || q === 'container') {
    if (!matched.includes('cont20')) matched.push('cont20');
    if (!matched.includes('cont40')) matched.push('cont40');
  }
  return matched;
};
