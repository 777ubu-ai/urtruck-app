// Транслитерация кириллицы → латиница (ISO 9 / ICAO Doc 9303)
// Для международного формата ФИО (паспорт, международные перевозки)

const MAP = {
  // Русский + казахский
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'E',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya',
  // Казахские доп. буквы (IATA)
  'Ә': 'A', 'Ғ': 'G', 'Қ': 'Q', 'Ң': 'N', 'Ө': 'O', 'Ұ': 'U', 'Ү': 'U', 'Һ': 'H', 'І': 'I',
  // Украинские
  'Є': 'Ye', 'Ї': 'Yi', 'І': 'I',
};

function translitChar(ch) {
  const upper = ch.toUpperCase();
  const latin = MAP[upper];
  if (latin === undefined) return ch; // не кириллица — оставляем как есть
  // Сохраняем регистр
  if (ch === upper) return latin;
  // строчная: первая буква заглавная остальные строчные — делаем полностью lowercase
  return latin.toLowerCase();
}

/**
 * Транслитерировать кириллицу в латиницу.
 *   "Каримов Ержан Асылбекұлы" → "Karimov Yerzhan Asylbekuly"
 */
export function translit(input) {
  if (!input) return '';
  let out = '';
  for (const ch of String(input)) {
    out += translitChar(ch);
  }
  // Первая буква каждого слова заглавная
  return out.replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Проверить, нужно ли транслитерировать (есть кириллица).
 */
export function hasCyrillic(input) {
  return /[\u0400-\u04FF]/.test(String(input || ''));
}
