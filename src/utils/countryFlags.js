const FLAGS = {
  KZ: '\u{1F1F0}\u{1F1FF}', CN: '\u{1F1E8}\u{1F1F3}', RU: '\u{1F1F7}\u{1F1FA}',
  UZ: '\u{1F1FA}\u{1F1FF}', KG: '\u{1F1F0}\u{1F1EC}', TJ: '\u{1F1F9}\u{1F1EF}',
  BY: '\u{1F1E7}\u{1F1FE}', TR: '\u{1F1F9}\u{1F1F7}', IR: '\u{1F1EE}\u{1F1F7}',
  AF: '\u{1F1E6}\u{1F1EB}', PK: '\u{1F1F5}\u{1F1F0}', MN: '\u{1F1F2}\u{1F1F3}',
  GE: '\u{1F1EC}\u{1F1EA}', AZ: '\u{1F1E6}\u{1F1FF}', AM: '\u{1F1E6}\u{1F1F2}',
  TM: '\u{1F1F9}\u{1F1F2}', UA: '\u{1F1FA}\u{1F1E6}',
};

const ALIASES = {
  KAZ: 'KZ', CHN: 'CN', RUS: 'RU', UZB: 'UZ', KGZ: 'KG', TJK: 'TJ',
  BLR: 'BY', TUR: 'TR', IRN: 'IR', AFG: 'AF', PAK: 'PK', MNG: 'MN',
  GEO: 'GE', AZE: 'AZ', ARM: 'AM', TKM: 'TM', UKR: 'UA',
  KAZAKHSTAN: 'KZ', CHINA: 'CN', RUSSIA: 'RU', UZBEKISTAN: 'UZ',
  KYRGYZSTAN: 'KG', TAJIKISTAN: 'TJ', BELARUS: 'BY', TURKEY: 'TR',
  IRAN: 'IR', AFGHANISTAN: 'AF', PAKISTAN: 'PK', MONGOLIA: 'MN',
  GEORGIA: 'GE', AZERBAIJAN: 'AZ', ARMENIA: 'AM', TURKMENISTAN: 'TM',
  UKRAINE: 'UA',
  КАЗАХСТАН: 'KZ', КИТАЙ: 'CN', РОССИЯ: 'RU', УЗБЕКИСТАН: 'UZ',
  КЫРГЫЗСТАН: 'KG', ТАДЖИКИСТАН: 'TJ', БЕЛАРУСЬ: 'BY', ТУРЦИЯ: 'TR',
  ИРАН: 'IR', АФГАНИСТАН: 'AF', ПАКИСТАН: 'PK', МОНГОЛИЯ: 'MN',
  ГРУЗИЯ: 'GE', АЗЕРБАЙДЖАН: 'AZ', АРМЕНИЯ: 'AM', ТУРКМЕНИСТАН: 'TM',
  УКРАИНА: 'UA',
};

export function countryFlag(code) {
  if (!code) return '';
  const norm = code.trim().toUpperCase();
  return FLAGS[norm] || FLAGS[ALIASES[norm]] || '';
}
