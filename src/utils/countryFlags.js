const FLAGS = {
  KZ: '\u{1F1F0}\u{1F1FF}', CN: '\u{1F1E8}\u{1F1F3}', RU: '\u{1F1F7}\u{1F1FA}',
  UZ: '\u{1F1FA}\u{1F1FF}', KG: '\u{1F1F0}\u{1F1EC}', TJ: '\u{1F1F9}\u{1F1EF}',
  BY: '\u{1F1E7}\u{1F1FE}', TR: '\u{1F1F9}\u{1F1F7}', IR: '\u{1F1EE}\u{1F1F7}',
  AF: '\u{1F1E6}\u{1F1EB}', PK: '\u{1F1F5}\u{1F1F0}', MN: '\u{1F1F2}\u{1F1F3}',
  GE: '\u{1F1EC}\u{1F1EA}', AZ: '\u{1F1E6}\u{1F1FF}', AM: '\u{1F1E6}\u{1F1F2}',
  TM: '\u{1F1F9}\u{1F1F2}', UA: '\u{1F1FA}\u{1F1E6}',
};

export function countryFlag(code) {
  if (!code) return '';
  return FLAGS[code.trim().toUpperCase()] || '';
}
