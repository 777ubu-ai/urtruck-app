// Country-code normalisation only. Rendering belongs exclusively to
// components/ui/v1/CountryFlag; this module never emits emoji UI.
const ISO_CODES = new Set(['KZ', 'CN', 'RU', 'UZ', 'KG', 'TJ', 'BY', 'TR', 'IR', 'AF', 'PK', 'MN', 'GE', 'AZ', 'AM', 'TM', 'UA']);

const ALIASES = {
  KAZ: 'KZ', CHN: 'CN', RUS: 'RU', UZB: 'UZ', KGZ: 'KG', TJK: 'TJ', BLR: 'BY', TUR: 'TR', IRN: 'IR', AFG: 'AF', PAK: 'PK', MNG: 'MN', GEO: 'GE', AZE: 'AZ', ARM: 'AM', TKM: 'TM', UKR: 'UA',
  KAZAKHSTAN: 'KZ', CHINA: 'CN', RUSSIA: 'RU', UZBEKISTAN: 'UZ', KYRGYZSTAN: 'KG', TAJIKISTAN: 'TJ', BELARUS: 'BY', TURKEY: 'TR', IRAN: 'IR', AFGHANISTAN: 'AF', PAKISTAN: 'PK', MONGOLIA: 'MN', GEORGIA: 'GE', AZERBAIJAN: 'AZ', ARMENIA: 'AM', TURKMENISTAN: 'TM', UKRAINE: 'UA',
  КАЗАХСТАН: 'KZ', КИТАЙ: 'CN', РОССИЯ: 'RU', УЗБЕКИСТАН: 'UZ', КЫРГЫЗСТАН: 'KG', ТАДЖИКИСТАН: 'TJ', БЕЛАРУСЬ: 'BY', ТУРЦИЯ: 'TR', ИРАН: 'IR', АФГАНИСТАН: 'AF', ПАКИСТАН: 'PK', МОНГОЛИЯ: 'MN', ГРУЗИЯ: 'GE', АЗЕРБАЙДЖАН: 'AZ', АРМЕНИЯ: 'AM', ТУРКМЕНИСТАН: 'TM', УКРАИНА: 'UA',
};

const LEGACY_EMOJI_TO_ISO = {
  '\u{1F1F0}\u{1F1FF}': 'KZ', '\u{1F1E8}\u{1F1F3}': 'CN', '\u{1F1F7}\u{1F1FA}': 'RU', '\u{1F1FA}\u{1F1FF}': 'UZ', '\u{1F1F0}\u{1F1EC}': 'KG', '\u{1F1F9}\u{1F1EF}': 'TJ', '\u{1F1E7}\u{1F1FE}': 'BY', '\u{1F1F9}\u{1F1F7}': 'TR', '\u{1F1EE}\u{1F1F7}': 'IR', '\u{1F1E6}\u{1F1EB}': 'AF', '\u{1F1F5}\u{1F1F0}': 'PK', '\u{1F1F2}\u{1F1F3}': 'MN', '\u{1F1EC}\u{1F1EA}': 'GE', '\u{1F1E6}\u{1F1FF}': 'AZ', '\u{1F1E6}\u{1F1F2}': 'AM', '\u{1F1F9}\u{1F1F2}': 'TM', '\u{1F1FA}\u{1F1E6}': 'UA',
};

export function countryCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (LEGACY_EMOJI_TO_ISO[raw]) return LEGACY_EMOJI_TO_ISO[raw];
  const normalized = raw.toUpperCase();
  return ISO_CODES.has(normalized) ? normalized : (ALIASES[normalized] || '');
}

// Compatibility name for callers that already expect an ISO result.
export const flagCode = countryCode;

// Deprecated visual helper. It intentionally returns no glyph: active screens
// must render CountryFlag, while legacy text-only paths never regress to emoji.
export const countryFlag = () => '';
