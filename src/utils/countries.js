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

export default COUNTRIES;
