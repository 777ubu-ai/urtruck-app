// countries — список стран для CountryPickerSheet.
//
// Приоритетные (popular) страны = ключевые рынки UrTruck:
// Казахстан, Китай, Россия, Узбекистан, Кыргызстан, Таджикистан,
// Туркменистан, Азербайджан, Грузия.
//
// Остальные страны — алфавитом, без флагов SVG (используем unicode-emoji
// для флагов — работает и на iOS, и на web). Если на каком-то платформе
// emoji не рендерится — fallback на пустую строку, dial code всё равно
// читается.
//
// dial — без "+" префикса, UI добавляет его сам.
// iso — двухбуквенный код, нужен для i18n country_XX ключей.

export const POPULAR_ISO = ['KZ', 'CN', 'RU', 'UZ', 'KG', 'TJ', 'TM', 'AZ', 'GE'];

// Полный ISO-3166 справочник. Названия строятся через Intl.DisplayNames,
// поэтому один и тот же код корректно отображается на RU/ZH/EN/KK без
// русских строк в китайском интерфейсе.
const ALL_ISO = 'AF AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW'.split(' ');

const localizedCountryName = (iso, lang = 'RU') => {
  try {
    const locale = lang === 'ZH' ? 'zh-CN' : lang === 'KK' ? 'kk-KZ' : lang === 'EN' ? 'en-US' : 'ru-RU';
    return new Intl.DisplayNames([locale], { type: 'region' }).of(iso) || iso;
  } catch { return iso; }
};

export const ALL_COUNTRIES = ALL_ISO.map((iso) => ({
  iso,
  name: localizedCountryName(iso, 'RU'),
  dial: '',
  flag: iso.replace(/./g, (letter) => String.fromCodePoint(letter.charCodeAt(0) + 127397)),
}));

export const COUNTRIES = [
  { iso: 'KZ', name: 'Казахстан',     dial: '7',   flag: '🇰🇿' },
  { iso: 'CN', name: 'Китай',         dial: '86',  flag: '🇨🇳' },
  { iso: 'RU', name: 'Россия',        dial: '7',   flag: '🇷🇺' },
  { iso: 'UZ', name: 'Узбекистан',    dial: '998', flag: '🇺🇿' },
  { iso: 'KG', name: 'Кыргызстан',    dial: '996', flag: '🇰🇬' },
  { iso: 'TJ', name: 'Таджикистан',   dial: '992', flag: '🇹🇯' },
  { iso: 'TM', name: 'Туркменистан',  dial: '993', flag: '🇹🇲' },
  { iso: 'AZ', name: 'Азербайджан',   dial: '994', flag: '🇦🇿' },
  { iso: 'GE', name: 'Грузия',        dial: '995', flag: '🇬🇪' },
  { iso: 'AM', name: 'Армения',       dial: '374', flag: '🇦🇲' },
  { iso: 'BY', name: 'Беларусь',      dial: '375', flag: '🇧🇾' },
  { iso: 'UA', name: 'Украина',       dial: '380', flag: '🇺🇦' },
  { iso: 'TR', name: 'Турция',        dial: '90',  flag: '🇹🇷' },
  { iso: 'AE', name: 'ОАЭ',           dial: '971', flag: '🇦🇪' },
  { iso: 'IR', name: 'Иран',          dial: '98',  flag: '🇮🇷' },
  { iso: 'AF', name: 'Афганистан',    dial: '93',  flag: '🇦🇫' },
  { iso: 'PK', name: 'Пакистан',      dial: '92',  flag: '🇵🇰' },
  { iso: 'IN', name: 'Индия',         dial: '91',  flag: '🇮🇳' },
  { iso: 'MN', name: 'Монголия',      dial: '976', flag: '🇲🇳' },
  { iso: 'KR', name: 'Южная Корея',   dial: '82',  flag: '🇰🇷' },
  { iso: 'JP', name: 'Япония',        dial: '81',  flag: '🇯🇵' },
  { iso: 'VN', name: 'Вьетнам',       dial: '84',  flag: '🇻🇳' },
  { iso: 'TH', name: 'Таиланд',       dial: '66',  flag: '🇹🇭' },
  { iso: 'SA', name: 'Саудовская Аравия', dial: '966', flag: '🇸🇦' },
  { iso: 'IL', name: 'Израиль',       dial: '972', flag: '🇮🇱' },
  { iso: 'EG', name: 'Египет',        dial: '20',  flag: '🇪🇬' },
  { iso: 'DE', name: 'Германия',      dial: '49',  flag: '🇩🇪' },
  { iso: 'FR', name: 'Франция',       dial: '33',  flag: '🇫🇷' },
  { iso: 'IT', name: 'Италия',        dial: '39',  flag: '🇮🇹' },
  { iso: 'ES', name: 'Испания',       dial: '34',  flag: '🇪🇸' },
  { iso: 'GB', name: 'Великобритания', dial: '44', flag: '🇬🇧' },
  { iso: 'US', name: 'США',           dial: '1',   flag: '🇺🇸' },
  { iso: 'CA', name: 'Канада',        dial: '1',   flag: '🇨🇦' },
  { iso: 'PL', name: 'Польша',        dial: '48',  flag: '🇵🇱' },
  { iso: 'CZ', name: 'Чехия',         dial: '420', flag: '🇨🇿' },
  { iso: 'RO', name: 'Румыния',       dial: '40',  flag: '🇷🇴' },
  { iso: 'BG', name: 'Болгария',      dial: '359', flag: '🇧🇬' },
  { iso: 'GR', name: 'Греция',        dial: '30',  flag: '🇬🇷' },
  { iso: 'AT', name: 'Австрия',       dial: '43',  flag: '🇦🇹' },
  { iso: 'AU', name: 'Австралия',     dial: '61',  flag: '🇦🇺' },
  { iso: 'AL', name: 'Албания',       dial: '355', flag: '🇦🇱' },
];

export const findCountry = (iso) => COUNTRIES.find((c) => c.iso === iso);

export const DEFAULT_COUNTRY = findCountry('KZ');

// Простой fuzzy-поиск: по имени (case-insensitive) или по dial code
// (с/без "+"). Возвращает в исходном порядке.
export const searchCountries = (query) => {
  const q = (query || '').trim().toLowerCase();
  if (!q) return COUNTRIES;
  const qDigits = q.replace(/[^\d]/g, '');
  return COUNTRIES.filter((c) => {
    if (c.name.toLowerCase().includes(q)) return true;
    if (c.iso.toLowerCase().includes(q)) return true;
    if (qDigits && c.dial.startsWith(qDigits)) return true;
    return false;
  });
};

export const getCountryName = (country, lang) => localizedCountryName(country?.iso || country, lang) || country?.name || country?.iso;

export const searchAllCountries = (query, lang = 'RU') => {
  const q = (query || '').trim().toLowerCase();
  if (!q) return ALL_COUNTRIES;
  return ALL_COUNTRIES.filter((country) => {
    const names = ['RU', 'EN', 'ZH', 'KK'].map((locale) => localizedCountryName(country.iso, locale).toLowerCase());
    return names.some((name) => name.includes(q)) || country.iso.toLowerCase().includes(q);
  });
};

export default COUNTRIES;
