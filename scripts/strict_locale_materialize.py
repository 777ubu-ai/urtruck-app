from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(rel):
    return (ROOT / rel).read_text(encoding="utf-8")

def write(rel, text):
    (ROOT / rel).write_text(text, encoding="utf-8")

def replace_once(rel, old, new):
    text = read(rel)
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{rel}: expected exactly one anchor, found {count}: {old[:120]!r}")
    write(rel, text.replace(old, new, 1))

# 1) Never fall back to Russian for a non-Russian locale.
replace_once(
    "src/utils/useI18n.js",
    """    if (lang === 'ZH') return translations.EN?.[resolvedKey] || resolvedKey;
    return translations.RU?.[resolvedKey] || translations.EN?.[resolvedKey] || resolvedKey;""",
    """    if (lang !== 'RU') return translations.EN?.[resolvedKey] || resolvedKey;
    return translations.RU?.[resolvedKey] || translations.EN?.[resolvedKey] || resolvedKey;""",
)

replace_once(
    "src/utils/i18n.js",
    """  if (currentLang === 'ZH') return translations.EN[key] || key;
  return translations.RU[key] || translations.EN[key] || key;""",
    """  if (currentLang !== 'RU') return translations.EN[key] || key;
  return translations.RU[key] || translations.EN[key] || key;""",
)

replace_once(
    "src/utils/i18n.js",
    """  if (currentLang === 'RU' || currentLang === 'KK' || currentLang === 'KG') {
    return `${n} ${pluralRu(n, 'предложение', 'предложения', 'предложений')}`;
  }
  return `${n} ${t('bids')}`;""",
    """  if (currentLang === 'RU') {
    return `${n} ${pluralRu(n, 'предложение', 'предложения', 'предложений')}`;
  }
  return `${n} ${t('bids')}`;""",
)

replace_once(
    "src/utils/i18n.js",
    """const LEGACY_ZH_TRUCK_TYPES = {
  'Тент': '篷布车',
  'Фура': '大型货车',
  'Рефрижератор': '冷藏车',
  'Изотерм': '保温车',
  'Бортовой': '栏板车',
  'Площадка': '平板车',
  'Автовоз': '汽车运输车',
  'Цистерна': '罐车',
  "Контейнер 20'": '20尺集装箱',
  "Контейнер 40'": '40尺集装箱',
  'Контейнер 20′': '20尺集装箱',
  'Контейнер 40′': '40尺集装箱',
};

export const formatTruckType = (type) => {
  if (!type) return t('cargo_type_unknown');
  const val = t(type);
  if (val !== type) return val;
  if (currentLang === 'ZH') return LEGACY_ZH_TRUCK_TYPES[String(type).trim()] || translations.EN[type] || t('cargo_type_unknown');
  return type;
};""",
    """const LEGACY_TRUCK_TYPE_KEYS = {
  'Тент': 'tent',
  'Фура': 'tent',
  'Рефрижератор': 'ref',
  'Изотерм': 'izoterm',
  'Бортовой': 'open_truck',
  'Площадка': 'platform',
  'Автовоз': 'auto',
  'Цистерна': 'tanker',
  "Контейнер 20'": 'cont20',
  "Контейнер 40'": 'cont40',
  'Контейнер 20′': 'cont20',
  'Контейнер 40′': 'cont40',
};

export const formatTruckType = (type) => {
  if (!type) return t('cargo_type_unknown');
  const raw = String(type).trim();
  const val = t(raw);
  if (val !== raw) return val;
  const legacyKey = LEGACY_TRUCK_TYPE_KEYS[raw];
  if (legacyKey) return t(legacyKey);
  return currentLang === 'RU' ? raw : (translations.EN[raw] || t('cargo_type_unknown'));
};""",
)

# Chinese informational copy itself must not contain Russian checkpoint names.
replace_once(
    "src/utils/i18n.js",
    "支持 50 多个边境口岸,包括 Достык-Алашанькоу、Нур Жолы-Хоргос、Калжат-Дулаты、Майкапчагай-Зимунай。",
    "支持 50 多个边境口岸,包括 多斯特克—阿拉山口、努尔饶勒—霍尔果斯、喀勒扎特—都拉塔、迈卡普恰盖—吉木乃。",
)

# 2) Dynamic system-owned place/cargo/status presentation.
places = read("src/utils/places.js")
marker = "const ARROW_RE = /([↔→←⇄]+)/;"
if marker not in places:
    raise SystemExit("places.js marker missing")
addition = r"""
// Kazakh display aliases for canonical legacy values. Canonical DB strings may
// remain Russian for backward compatibility, but UI must not leak RU when KK
// is selected. Missing proper-name aliases fall back to the English canonical
// transliteration rather than Russian.
const KK_PLACE_DICT = {
  'Алматы': 'Алматы', 'Астана': 'Астана', 'Нур-Султан': 'Астана',
  'Шымкент': 'Шымкент', 'Караганда': 'Қарағанды', 'Актобе': 'Ақтөбе',
  'Атырау': 'Атырау', 'Усть-Каменогорск': 'Өскемен', 'Павлодар': 'Павлодар',
  'Семей': 'Семей', 'Тараз': 'Тараз', 'Костанай': 'Қостанай',
  'Кызылорда': 'Қызылорда', 'Уральск': 'Орал', 'Актау': 'Ақтау',
  'Петропавловск': 'Петропавл', 'Кокшетау': 'Көкшетау',
  'Хоргос': 'Қорғас', 'Нур Жолы': 'Нұр Жолы', 'Нур жолы': 'Нұр Жолы',
  'Достык': 'Достық', 'Алашанькоу': 'Алашанькоу', 'Майкапчагай': 'Майқапшағай',
  'Зимунай': 'Зимунай', 'Джеминай': 'Жеминай', 'Бахты': 'Бақты',
  'Тачэн': 'Тачэн', 'Чугучак': 'Шәуешек', 'Калжат': 'Қалжат',
  'Дулаты': 'Дулаты', 'Покиту': 'Покиту',
  'Иу': 'Иу', 'Гуанчжоу': 'Гуанчжоу', 'Шэньчжэнь': 'Шэньчжэнь',
  'Пекин': 'Бейжің', 'Шанхай': 'Шанхай', 'Урумчи': 'Үрімші',
  'Москва': 'Мәскеу', 'Санкт-Петербург': 'Санкт-Петербург',
  'Новосибирск': 'Новосибирск', 'Екатеринбург': 'Екатеринбург',
  'Казань': 'Қазан', 'Челябинск': 'Челябі', 'Самара': 'Самара',
  'Омск': 'Омбы', 'Оренбург': 'Орынбор',
  'Ташкент': 'Ташкент', 'Самарканд': 'Самарқанд', 'Бухара': 'Бұхара',
  'Бишкек': 'Бішкек', 'Ош': 'Ош', 'Душанбе': 'Душанбе',
  'Минск': 'Минск', 'Ереван': 'Ереван', 'Тбилиси': 'Тбилиси',
  'Батуми': 'Батуми', 'Баку': 'Баку', 'Стамбул': 'Ыстанбұл',
  'Анкара': 'Анкара', 'Берлин': 'Берлин', 'Варшава': 'Варшава',
};

const CARGO_KK = {
  'Одежда и текстиль': 'Киім және тоқыма',
  'Одежда': 'Киім',
  'Текстиль': 'Тоқыма',
  'Текстиль и одежда': 'Тоқыма және киім',
  'Обувь': 'Аяқ киім',
  'Электроника': 'Электроника',
  'Бытовая техника': 'Тұрмыстық техника',
  'Компьютеры и офисная техника': 'Компьютерлер және кеңсе техникасы',
  'Электросамокаты': 'Электр самокаттары',
  'LED-панели': 'LED-панельдер',
  'Автозапчасти': 'Автобөлшектер',
  'Шины и диски': 'Шиналар мен дискілер',
  'Автомобили': 'Автомобильдер',
  'Стройматериалы': 'Құрылыс материалдары',
  'Строительные материалы': 'Құрылыс материалдары',
  'Металл и арматура': 'Металл және арматура',
  'Трубы': 'Құбырлар',
  'Цемент': 'Цемент',
  'Плитка керамическая': 'Керамикалық плитка',
  'Мебель': 'Жиһаз',
  'Продукты питания': 'Азық-түлік',
  'Мясо говяжье': 'Сиыр еті',
  'Овощи и фрукты': 'Көкөністер мен жемістер',
  'Мёд': 'Бал',
  'Зерно': 'Астық',
  'Напитки': 'Сусындар',
  'Медикаменты': 'Дәрі-дәрмек',
  'Косметика': 'Косметика',
  'Игрушки': 'Ойыншықтар',
  'Спорттовары': 'Спорт тауарлары',
  'Книги и канцелярия': 'Кітаптар мен кеңсе тауарлары',
  'Бумажная продукция': 'Қағаз өнімдері',
  'Химия (бытовая)': 'Тұрмыстық химия',
  'Бытовая химия': 'Тұрмыстық химия',
  'Удобрения': 'Тыңайтқыштар',
  'Сельхоз техника': 'Ауыл шаруашылығы техникасы',
  'Оборудование промышленное': 'Өнеркәсіптік жабдық',
  'Товары для дома': 'Үйге арналған тауарлар',
  'Посуда': 'Ыдыс-аяқ',
  'Оптовые товары из Китая': 'Қытайдан көтерме тауарлар',
  'Ткани рулонные': 'Рулонды маталар',
  'Лом металла': 'Металл сынықтары',
  'Бумага для принтера': 'Принтер қағазы',
  'Упаковка': 'Қаптама',
  'Мотоциклы': 'Мотоциклдер',
  'Металлическая посуда': 'Металл ыдыс-аяқ',
  'Посуда металлическая': 'Металл ыдыс-аяқ',
  'Холодильники': 'Тоңазытқыштар',
  'Детские стулья': 'Балалар орындықтары',
};

const SYSTEM_MESSAGE_DICT = {
  '🤝 Сделка создана': { zh: '🤝 交易已创建', en: '🤝 Deal created', kk: '🤝 Мәміле құрылды' },
  '🚛 Рейс начался': { zh: '🚛 运输已开始', en: '🚛 Trip started', kk: '🚛 Рейс басталды' },
  '🛂 На границе': { zh: '🛂 在边境', en: '🛂 At the border', kk: '🛂 Шекарада' },
  '🛂 Груз на границе': { zh: '🛂 货物在边境', en: '🛂 Cargo at the border', kk: '🛂 Жүк шекарада' },
  '✅ Доставлен — ожидается подтверждение получения': { zh: '✅ 已送达 — 等待确认收货', en: '✅ Delivered — awaiting receipt confirmation', kk: '✅ Жеткізілді — қабылдауды растау күтілуде' },
  '✅ Груз доставлен': { zh: '✅ 货物已送达', en: '✅ Cargo delivered', kk: '✅ Жүк жеткізілді' },
  '✅ Груз доставлен — ожидается подтверждение получения': { zh: '✅ 货物已送达 — 等待确认收货', en: '✅ Cargo delivered — awaiting receipt confirmation', kk: '✅ Жүк жеткізілді — қабылдауды растау күтілуде' },
  '✅ Получение подтверждено': { zh: '✅ 已确认收货', en: '✅ Receipt confirmed', kk: '✅ Қабылдау расталды' },
  '✅ Получение груза подтверждено': { zh: '✅ 已确认收货', en: '✅ Cargo receipt confirmed', kk: '✅ Жүктің қабылдануы расталды' },
  '🤝 Сделка завершена': { zh: '🤝 交易已完成', en: '🤝 Deal completed', kk: '🤝 Мәміле аяқталды' },
  '❌ Отменено': { zh: '❌ 已取消', en: '❌ Cancelled', kk: '❌ Болдырылмады' },
  '❌ Сделка отменена': { zh: '❌ 交易已取消', en: '❌ Deal cancelled', kk: '❌ Мәміле тоқтатылды' },
};
"""
places = places.replace(marker, addition + "\n" + marker, 1)

old_localize_head = """function localizeHead(head, lang) {
  const key = head.trim();
  const full = DICT[key];
  if (full && full[lang]) return head.replace(key, full[lang]);
  if (ARROW_RE.test(head)) {
    return head.split(ARROW_RE).map((part) => {
      const k = part.trim();
      const e = k && DICT[k];
      return (e && e[lang]) ? part.replace(k, e[lang]) : part;
    }).join('');
  }
  return head;
}"""
new_localize_head = """function translatedPlace(key, lang) {
  if (lang === 'kk') return KK_PLACE_DICT[key] || DICT[key]?.en || key;
  return DICT[key]?.[lang] || key;
}

function localizeHead(head, lang) {
  const key = head.trim();
  const full = DICT[key];
  if (full) return head.replace(key, translatedPlace(key, lang));
  if (ARROW_RE.test(head)) {
    return head.split(ARROW_RE).map((part) => {
      const k = part.trim();
      const e = k && DICT[k];
      return e ? part.replace(k, translatedPlace(k, lang)) : part;
    }).join('');
  }
  return head;
}"""
if places.count(old_localize_head) != 1:
    raise SystemExit("places localizeHead anchor mismatch")
places = places.replace(old_localize_head, new_localize_head, 1)

places = places.replace(
    """  if (l !== 'zh' && l !== 'en') return clean;
  return localizeHead(clean, l);""",
    """  if (l === 'ru') return clean;
  if (l !== 'zh' && l !== 'en' && l !== 'kk') return clean;
  return localizeHead(clean, l);""",
    1,
)
places = places.replace(
    """export function localizeCargoName(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw || (l !== 'zh' && l !== 'en')) return raw;
  const key = String(raw).trim();
  const e = CARGO_DICT[key] || CARGO_INDEX[key.toLocaleLowerCase('ru-RU')];
  return (e && e[l]) ? e[l] : raw;
}""",
    """export function localizeCargoName(raw, lang) {
  const l = String(lang || '').toLowerCase();
  if (!raw || l === 'ru') return raw;
  const key = String(raw).trim();
  const e = CARGO_DICT[key] || CARGO_INDEX[key.toLocaleLowerCase('ru-RU')];
  if (l === 'kk') return CARGO_KK[key] || e?.en || raw;
  if (l === 'zh' || l === 'en') return (e && e[l]) ? e[l] : raw;
  return raw;
}

export function localizeSystemMessage(raw, lang) {
  if (!raw) return raw;
  const l = String(lang || '').toLowerCase();
  if (l === 'ru') return raw;
  const value = String(raw).trim();
  const direct = SYSTEM_MESSAGE_DICT[value];
  if (direct && direct[l]) return direct[l];

  // Some old rows append an amount after the system phrase.
  for (const [prefix, variants] of Object.entries(SYSTEM_MESSAGE_DICT)) {
    if (value.startsWith(`${prefix} ·`) && variants[l]) {
      return `${variants[l]}${value.slice(prefix.length)}`;
    }
  }
  // Never machine-translate arbitrary participant text here.
  return raw;
}""",
    1,
)
write("src/utils/places.js", places)

# 3) Cargo type suggestions search and render in selected locale, while DB keeps canonical names.
replace_once(
    "src/utils/cargoTypes.js",
    """import { storage } from './storage';""",
    """import { storage } from './storage';
import { localizeCargoName } from './places';""",
)
replace_once(
    "src/utils/cargoTypes.js",
    """export const searchCargoTypes = (query) => {
  if (!query || query.length < 1) return BASE_CARGO_TYPES.slice(0, 8);
  const q = query.toLowerCase().trim();
  const all = [..._custom, ...BASE_CARGO_TYPES];
  const matches = all.filter(c => c.name.toLowerCase().includes(q));
  matches.sort((a, b) => {
    const aS = a.name.toLowerCase().startsWith(q);
    const bS = b.name.toLowerCase().startsWith(q);
    if (aS && !bS) return -1;
    if (!aS && bS) return 1;
    return 0;
  });
  const result = matches.slice(0, 7);
  if (!matches.some(c => c.name.toLowerCase() === q) && q.length >= 2) {
    result.push({ name: query.trim(), icon: '➕', isCustom: true });
  }
  return result;
};""",
    """export const searchCargoTypes = (query, lang = 'RU') => {
  if (!query || query.length < 1) return BASE_CARGO_TYPES.slice(0, 8);
  const q = query.toLocaleLowerCase().trim();
  const all = [..._custom, ...BASE_CARGO_TYPES];
  const display = (c) => c.custom ? c.name : (localizeCargoName(c.name, lang) || c.name);
  const matches = all.filter((c) => {
    const canonical = c.name.toLocaleLowerCase();
    const localized = String(display(c)).toLocaleLowerCase();
    return canonical.includes(q) || localized.includes(q);
  });
  matches.sort((a, b) => {
    const aS = String(display(a)).toLocaleLowerCase().startsWith(q) || a.name.toLocaleLowerCase().startsWith(q);
    const bS = String(display(b)).toLocaleLowerCase().startsWith(q) || b.name.toLocaleLowerCase().startsWith(q);
    if (aS && !bS) return -1;
    if (!aS && bS) return 1;
    return 0;
  });
  const result = matches.slice(0, 7);
  const exact = matches.some((c) =>
    c.name.toLocaleLowerCase() === q || String(display(c)).toLocaleLowerCase() === q
  );
  if (!exact && q.length >= 2) {
    result.push({ name: query.trim(), icon: '➕', isCustom: true });
  }
  return result;
};""",
)

replace_once(
    "src/components/CargoTypeInput.js",
    """import { useTheme } from '../utils/ThemeContext';
import { t } from '../utils/i18n';
import { searchCargoTypes, addCustomCargoType, subscribeToCargoTypes } from '../utils/cargoTypes';""",
    """import { useTheme } from '../utils/ThemeContext';
import { useI18n } from '../utils/useI18n';
import { localizeCargoName } from '../utils/places';
import { searchCargoTypes, addCustomCargoType, subscribeToCargoTypes } from '../utils/cargoTypes';""",
)
replace_once(
    "src/components/CargoTypeInput.js",
    """  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(value || '');""",
    """  const { theme } = useTheme();
  const { t, lang } = useI18n();
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState(localizeCargoName(value, lang) || value || '');""",
)
replace_once(
    "src/components/CargoTypeInput.js",
    """  useEffect(() => { setQuery(value || ''); }, [value]);
  useEffect(() => subscribeToCargoTypes(() => setTick(x => x + 1)), []);

  const suggestions = focused ? searchCargoTypes(query) : [];""",
    """  useEffect(() => { setQuery(localizeCargoName(value, lang) || value || ''); }, [value, lang]);
  useEffect(() => subscribeToCargoTypes(() => setTick(x => x + 1)), []);

  const suggestions = focused ? searchCargoTypes(query, lang) : [];""",
)
replace_once(
    "src/components/CargoTypeInput.js",
    """    setQuery(item.name);
    onChange(item.name);""",
    """    setQuery(localizeCargoName(item.name, lang) || item.name);
    onChange(item.name);""",
)
replace_once(
    "src/components/CargoTypeInput.js",
    """                {c.isCustom ? t('cargo_type_custom_label').replace('{name}', c.name) : c.name}""",
    """                {c.isCustom
                  ? t('cargo_type_custom_label').replace('{name}', c.name)
                  : (localizeCargoName(c.name, lang) || c.name)}""",
)

# 4) Create forms show localized points, but save clean canonical point names (no embedded flags).
for rel in ("src/screens/CreateCargoScreen.js", "src/screens/CreateTripScreen.js"):
    text = read(rel)
    text = text.replace(
        "import { useI18n } from '../utils/useI18n';",
        "import { useI18n } from '../utils/useI18n';\nimport { cleanPlaceName, localizePlace } from '../utils/places';\nimport { countryFlag } from '../utils/countryFlags';",
        1,
    )
    text = text.replace("const { t } = useI18n();", "const { t, lang } = useI18n();", 1)
    anchor = "  const [from, setFrom] = useState('');"
    if anchor not in text:
        raise SystemExit(f"{rel}: from state anchor missing")
    helper = """  const displayRoutePoint = (raw, point) => {
    const canonical = point?.name || cleanPlaceName(raw || '');
    const localized = localizePlace(canonical, lang) || canonical;
    const flag = point?.country ? countryFlag(point.country) : '';
    return [localized, flag].filter(Boolean).join(', ');
  };

"""
    text = text.replace(anchor, helper + anchor, 1)
    text = text.replace("value={from}\n", "value={displayRoutePoint(from, fromPoint)}\n", 1)
    text = text.replace("value={to}\n", "value={displayRoutePoint(to, toPoint)}\n", 1)
    text = text.replace("from_city: from.trim(),", "from_city: fromPoint?.name || cleanPlaceName(from.trim()),", 1)
    text = text.replace("to_city: to.trim(),", "to_city: toPoint?.name || cleanPlaceName(to.trim()),", 1)
    write(rel, text)

# 5) Deal workspace: dynamic route/cargo/truck/unit/system messages follow locale.
replace_once(
    "src/screens/DealWorkspaceScreenV2.js",
    """import { localizePlace } from '../utils/places';
import { getLanguage, formatStatus } from '../utils/i18n';""",
    """import { localizeCargoName, localizePlace, localizeSystemMessage } from '../utils/places';
import { getLanguage, formatStatus, formatTruckType } from '../utils/i18n';""",
)
replace_once(
    "src/screens/DealWorkspaceScreenV2.js",
    """const formatWeight = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `${Number.isInteger(n) ? n : n.toFixed(1)} т`;
};""",
    """const formatWeight = (value, lang) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '';
  const amount = Number.isInteger(n) ? n : n.toFixed(1);
  if (lang === 'ZH') return `${amount} 吨`;
  if (lang === 'EN') return `${amount} t`;
  return `${amount} т`;
};""",
)
replace_once(
    "src/screens/DealWorkspaceScreenV2.js",
    """        return {
          id: String(message.id),
          clientMsgId: message.client_msg_id || null,
          mine,
          system: message.sender_id === 'system',
          text: message.text || '',""",
    """        const system = message.sender_id === 'system';
        return {
          id: String(message.id),
          clientMsgId: message.client_msg_id || null,
          mine,
          system,
          text: system ? localizeSystemMessage(message.text || '', lang) : (message.text || ''),""",
)
replace_once(
    "src/screens/DealWorkspaceScreenV2.js",
    """  }, [roomId, session?.user?.id]);""",
    """  }, [roomId, session?.user?.id, lang]);""",
)
replace_once(
    "src/screens/DealWorkspaceScreenV2.js",
    """  const cargoMeta = [
    text(deal?.cargo_desc, cargo?.cargo_desc),
    formatWeight(text(deal?.weight_tons, cargo?.weight_tons)),
    text(deal?.cargo_type, cargo?.cargo_type, deal?.truck_type, trip?.truck_type),
    deal?.amount != null ? formatPrice(deal.amount, deal.currency || cargo?.currency || trip?.currency || 'USD', t) : null,
  ].filter(Boolean).join(' · ');""",
    """  const rawCargoName = text(deal?.cargo_desc, cargo?.cargo_desc);
  const rawTruckType = text(deal?.cargo_type, cargo?.cargo_type, deal?.truck_type, trip?.truck_type);
  const cargoMeta = [
    localizeCargoName(rawCargoName, lang) || rawCargoName,
    formatWeight(text(deal?.weight_tons, cargo?.weight_tons), lang),
    rawTruckType ? formatTruckType(rawTruckType) : null,
    deal?.amount != null ? formatPrice(deal.amount, deal.currency || cargo?.currency || trip?.currency || 'USD', t) : null,
  ].filter(Boolean).join(' · ');""",
)

# 6) Border screen: server checkpoint names are canonical legacy Russian; localize at presentation boundary.
replace_once(
    "src/screens/QueueScreenLazy.js",
    """import { storage } from '../utils/storage';""",
    """import { storage } from '../utils/storage';
import { localizePlace } from '../utils/places';""",
)
replace_once(
    "src/screens/QueueScreenLazy.js",
    """    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано',""",
    """    cached: 'из кэша UrTruck', live: 'живые данные', selected: 'Выбрано', open: 'Нажать',""",
)
replace_once(
    "src/screens/QueueScreenLazy.js",
    """    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды',""",
    """    status: 'Күйі', cached: 'UrTruck кэшінен', live: 'нақты дерек', selected: 'Таңдалды', open: 'Ашу',""",
)
replace_once(
    "src/screens/QueueScreenLazy.js",
    """    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected',""",
    """    checkpoint: 'Checkpoint', queueTime: 'Queue time', status: 'Status', cached: 'UrTruck cache', live: 'live data', selected: 'Selected', open: 'Open',""",
)
replace_once(
    "src/screens/QueueScreenLazy.js",
    """    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择',""",
    """    cached: 'UrTruck 缓存', live: '实时数据', selected: '已选择', open: '查看',""",
)
queue = read("src/screens/QueueScreenLazy.js")
anchor = "function normalizePlate(value) {"
helper = """function localizeCheckpointName(raw, lang) {
  const value = String(raw || '').trim();
  if (!value) return value;
  const parts = value.split(/\\s+(?:-|–|—)\\s+/).filter(Boolean);
  if (parts.length > 1) return parts.map((part) => localizePlace(part, lang)).join(' — ');
  return localizePlace(value, lang);
}

"""
if anchor not in queue:
    raise SystemExit("queue helper anchor missing")
queue = queue.replace(anchor, helper + anchor, 1)
queue = queue.replace(
    "return String(a.name || '').localeCompare(String(b.name || ''), 'ru');",
    "return localizeCheckpointName(a.name, lang).localeCompare(localizeCheckpointName(b.name, lang));",
    1,
)
queue = queue.replace("  }, [catalog, selectedCountry, favorites]);", "  }, [catalog, selectedCountry, favorites, lang]);", 1)
queue = queue.replace(
    "{String(cp.name || '').split(' - ')[0]}",
    "{localizeCheckpointName(cp.name, lang).split(' — ')[0]}",
    1,
)
queue = queue.replace("{cp.name}</Text>", "{localizeCheckpointName(cp.name, lang)}</Text>", 1)
queue = queue.replace("{active ? L.selected : 'Нажать'}</Text>", "{active ? L.selected : L.open}</Text>", 1)
queue = queue.replace("{live.name || selected.name}</Text>", "{localizeCheckpointName(live.name || selected.name, lang)}</Text>", 1)
queue = queue.replace("{L.checkpoint}: {lookup.checkpoint}</Text>", "{L.checkpoint}: {localizeCheckpointName(lookup.checkpoint, lang)}</Text>", 1)
write("src/screens/QueueScreenLazy.js", queue)

# 7) DealRoom KK branch must never fall through to Russian.
replace_once(
    "src/components/deal/DealRoom.js",
    """  const mapCopy = language.startsWith('zh')
    ? { title: '计划路线', hint: '行程开始后，车辆位置会自动显示', live: '车辆位置' }
    : language.startsWith('en')
      ? { title: 'Planned route', hint: 'Truck location will appear automatically after trip start', live: 'Truck location' }
      : { title: 'Плановый маршрут', hint: 'После начала рейса машина появится автоматически', live: 'Машина на маршруте' };""",
    """  const mapCopy = language.startsWith('zh')
    ? { title: '计划路线', hint: '行程开始后，车辆位置会自动显示', live: '车辆位置' }
    : language.startsWith('en')
      ? { title: 'Planned route', hint: 'Truck location will appear automatically after trip start', live: 'Truck location' }
      : language.startsWith('kk')
        ? { title: 'Жоспарланған бағыт', hint: 'Рейс басталғаннан кейін көліктің орны автоматты түрде көрінеді', live: 'Көлік бағыты' }
        : { title: 'Плановый маршрут', hint: 'После начала рейса машина появится автоматически', live: 'Машина на маршруте' };""",
)

# 8) Notification center also localizes known persisted system-status text.
replace_once(
    "src/screens/NotificationsScreen.js",
    """import { getLanguage } from '../utils/i18n';
import Feather from '@expo/vector-icons/Feather';""",
    """import { getLanguage } from '../utils/i18n';
import { localizeSystemMessage } from '../utils/places';
import Feather from '@expo/vector-icons/Feather';""",
)
replace_once(
    "src/screens/NotificationsScreen.js",
    """  const { t } = useI18n();""",
    """  const { t, lang } = useI18n();""",
)
replace_once(
    "src/screens/NotificationsScreen.js",
    """    const cleanTitle = cleanNotifText(item.title);
    const cleanBody = cleanNotifText(item.body);""",
    """    const cleanTitle = localizeSystemMessage(cleanNotifText(item.title), lang);
    const cleanBody = localizeSystemMessage(cleanNotifText(item.body), lang);""",
)

# 9) New strict regression: non-RU locales may never inherit Russian system-owned copy.
test = r"""import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { localizeCargoName, localizePlace, localizeSystemMessage } from '../../src/utils/places.js';

const read = (p) => fs.readFileSync(p, 'utf8');
const i18n = read('src/utils/i18n.js');
const hook = read('src/utils/useI18n.js');
const cargoInput = read('src/components/CargoTypeInput.js');
const cargoTypes = read('src/utils/cargoTypes.js');
const createCargo = read('src/screens/CreateCargoScreen.js');
const createTrip = read('src/screens/CreateTripScreen.js');
const workspace = read('src/screens/DealWorkspaceScreenV2.js');
const queue = read('src/screens/QueueScreenLazy.js');
const dealRoom = read('src/components/deal/DealRoom.js');
const notifications = read('src/screens/NotificationsScreen.js');

const cyrillic = /[\u0400-\u052F]/u;
const stringLiterals = (src) => {
  const out = [];
  const re = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(src))) out.push((m[1] ?? m[2] ?? '').replace(/\\n/g, '\n'));
  return out;
};

test('known canonical cargo/place/system content localizes for ZH, EN and KK', () => {
  assert.equal(localizeCargoName('Обувь', 'ZH'), '鞋类');
  assert.equal(localizeCargoName('Обувь', 'EN'), 'Footwear');
  assert.equal(localizeCargoName('Обувь', 'KK'), 'Аяқ киім');
  assert.equal(localizePlace('Иу, 🇨🇳', 'ZH'), '义乌');
  assert.equal(localizePlace('Иу, 🇨🇳', 'EN'), 'Yiwu');
  assert.equal(localizePlace('Москва', 'KK'), 'Мәскеу');
  assert.equal(localizePlace('Бахты', 'ZH'), '巴克图');
  assert.equal(localizeSystemMessage('🚛 Рейс начался', 'ZH'), '🚛 运输已开始');
  assert.equal(localizeSystemMessage('✅ Получение груза подтверждено', 'EN'), '✅ Cargo receipt confirmed');
  assert.equal(localizeSystemMessage('🤝 Сделка завершена', 'KK'), '🤝 Мәміле аяқталды');
});

test('translation fallback can never jump from non-RU locale to RU', () => {
  assert.match(hook, /if \(lang !== 'RU'\) return translations\.EN/);
  assert.match(i18n, /if \(currentLang !== 'RU'\) return translations\.EN/);
  assert.doesNotMatch(i18n, /currentLang === 'RU' \|\| currentLang === 'KK'/);
});

test('cargo suggestions render/search localized labels while preserving canonical value', () => {
  assert.match(cargoTypes, /searchCargoTypes = \(query, lang = 'RU'\)/);
  assert.match(cargoTypes, /localizeCargoName\(c\.name, lang\)/);
  assert.match(cargoInput, /searchCargoTypes\(query, lang\)/);
  assert.match(cargoInput, /localizeCargoName\(c\.name, lang\)/);
  assert.match(cargoInput, /onChange\(item\.name\)/);
});

test('create forms localize selected route point and persist clean canonical names', () => {
  for (const src of [createCargo, createTrip]) {
    assert.match(src, /displayRoutePoint/);
    assert.match(src, /localizePlace\(canonical, lang\)/);
    assert.match(src, /from_city: fromPoint\?\.name \|\| cleanPlaceName\(from\.trim\(\)\)/);
    assert.match(src, /to_city: toPoint\?\.name \|\| cleanPlaceName\(to\.trim\(\)\)/);
  }
});

test('deal workspace localizes dynamic cargo, body type, units and legacy system messages', () => {
  assert.match(workspace, /localizeSystemMessage\(message\.text \|\| '', lang\)/);
  assert.match(workspace, /localizeCargoName\(rawCargoName, lang\)/);
  assert.match(workspace, /formatTruckType\(rawTruckType\)/);
  assert.match(workspace, /if \(lang === 'ZH'\) return `\$\{amount\} 吨`/);
  assert.match(workspace, /\[roomId, session\?\.user\?\.id, lang\]/);
});

test('border catalog and notifications localize server-owned legacy text', () => {
  assert.match(queue, /localizeCheckpointName\(cp\.name, lang\)/);
  assert.match(queue, /localizeCheckpointName\(live\.name \|\| selected\.name, lang\)/);
  assert.match(queue, /active \? L\.selected : L\.open/);
  assert.doesNotMatch(queue, /\? L\.selected : 'Нажать'/);
  assert.match(notifications, /localizeSystemMessage\(cleanNotifText\(item\.title\), lang\)/);
});

test('KK-only deal map copy does not fall through to Russian', () => {
  assert.match(dealRoom, /language\.startsWith\('kk'\)/);
  assert.match(dealRoom, /Жоспарланған бағыт/);
});

test('ZH and EN translation string literals contain no Cyrillic leakage', () => {
  const zhStart = i18n.indexOf('  ZH: {');
  const enStart = i18n.indexOf('  EN: {', zhStart);
  assert.ok(zhStart >= 0 && enStart > zhStart, 'ZH/EN blocks must be found');
  const end = i18n.indexOf('\n},\n};', enStart);
  assert.ok(end > enStart, 'EN block end must be found');
  const blocks = {
    ZH: i18n.slice(zhStart, enStart),
    EN: i18n.slice(enStart, end),
  };
  for (const [lang, block] of Object.entries(blocks)) {
    const bad = stringLiterals(block).filter((value) => cyrillic.test(value));
    assert.deepEqual(bad, [], `${lang} contains Cyrillic UI strings: ${bad.slice(0, 20).join(' | ')}`);
  }
});
"""
write("tests/frontend/test_strict_locale_owned_content.mjs", test)

# Guard against the exact screenshot regressions.
for rel, forbidden in {
    "src/screens/QueueScreenLazy.js": ["'Нажать'"],
}.items():
    src = read(rel)
    for token in forbidden:
        if token in src:
            raise SystemExit(f"{rel}: forbidden token still present: {token}")

print("STRICT_LOCALE_MATERIALIZED=1")
