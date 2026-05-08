// Phone helpers — Stage 46.
//
// Контекст бага:
//   На iPhone/Android с активной казахской клавиатурой (KK QWERTY)
//   верхний ряд цифр заменён казахскими буквами (Ә, І, Ң, Ғ, Ү, Ұ,
//   Қ, Ө, Һ). Если веб-страница не подсказала браузеру открыть
//   numeric keypad через `inputMode="tel"`, пользователь видит
//   обычную текстовую клавиатуру и **не может** ввести цифру —
//   их там просто нет.
//
//   Старый locally-defined formatPhone в Premium*Screens работал
//   через `replace(/\D/g, '')` — отбрасывал казахские буквы и
//   оставлял пользователя с пустым полем. Поле выглядело как
//   "сломанное" под казахской раскладкой, а под русской/английской
//   работало (там цифры есть в верхнем ряду).
//
// Что делает этот модуль:
//   1. NFKC-нормализация — конвертирует Unicode-digits (например
//      арабские ٠١٢٣ или китайские ０１２３) в ASCII 0-9.
//   2. Снимает форматирование (пробелы, дефисы, скобки) и
//      приводит ведущую `8` или `+7` к каноничному `7…` префиксу.
//   3. Возвращает каноничный `+7XXXXXXXXXX` для backend и
//      `+7 XXX XXX XX XX` для display.
//   4. Корректно работает с частичным вводом — никогда не
//      обрезает цифры, которые пользователь только что напечатал.
//
// Главный реальный фикс бага — сторонний от этого helper'а: в
// TextInput добавлены props `inputMode="tel"` (web) и явный
// `autoComplete="tel"`, чтобы numeric keypad открывался независимо
// от выбранной клавиатуры. Helper лишь делает нормализацию более
// устойчивой к чему бы ни ввёл пользователь.

const KZ_LOCAL_LEN = 10;     // количество цифр без кода страны
const KZ_FULL_LEN  = 11;     // 7 + 10
const COUNTRY_CODE = '7';

// Конвертирует строку в "только ASCII-digits", честно проходя
// через NFKC-нормализацию (так арабские/китайские digits станут
// латинскими 0-9). Без NFKC мы их выкинули бы фильтром /\D/.
export function toAsciiDigits(input) {
  if (input == null) return '';
  let s = String(input);
  // NFKC раскладывает full-width / стилизованные цифры в ASCII.
  // (См. Unicode TR15.) try/catch на случай старых рантаймов.
  try { s = s.normalize('NFKC'); } catch {}
  // Дополнительно ловим арабско-индийские (٠-٩) и расширенные
  // арабско-индийские (۰-۹) диапазоны — некоторые клавиатуры
  // отдают именно их.
  s = s.replace(/[٠-٩]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x0660 + 0x30));
  s = s.replace(/[۰-۹]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x06F0 + 0x30));
  // Теперь забираем все 0-9.
  return s.replace(/[^0-9]/g, '');
}

// Берёт что угодно (`+7 747 …`, `8-747-…`, `7479171118`,
// `8(747)9171118`, paste с пробелами/невидимыми символами) и
// возвращает каноничный `+7XXXXXXXXXX`. Если цифр меньше чем
// нужно — возвращает то что есть с префиксом `+7` (для частичного
// ввода) либо пустую строку.
export function normalizePhoneInput(raw) {
  let digits = toAsciiDigits(raw);
  if (!digits) return '';
  // Снимаем ведущий 8 (KZ местный префикс).
  if (digits[0] === '8') digits = COUNTRY_CODE + digits.slice(1);
  // Если нет +7 / 7 префикса и длина 10 — добавляем 7.
  if (digits.length === KZ_LOCAL_LEN && digits[0] !== COUNTRY_CODE) {
    digits = COUNTRY_CODE + digits;
  }
  // Если первая цифра не 7 — это не KZ номер; всё равно
  // префиксуем 7 (вьюшка покажет +7…) пусть UI сообщит ошибку.
  if (digits[0] !== COUNTRY_CODE) digits = COUNTRY_CODE + digits;
  // Обрезаем до 11 цифр — длиннее быть не может.
  digits = digits.slice(0, KZ_FULL_LEN);
  return '+' + digits;
}

// Форматирует raw в `+7 XXX XXX XX XX` для display. Идемпотентно:
// если на входе уже отформатированная строка, не теряет цифры.
// Никогда не возвращает префикс без хотя бы +7.
export function formatPhoneForDisplay(raw) {
  const normalized = normalizePhoneInput(raw);
  if (!normalized) return '';
  // normalized = '+7XXXXXXXXXX' (длина 12) или короче (например
  // '+7' если пользователь только начал вводить).
  const digits = normalized.slice(1); // без '+'
  // digits[0] === '7' гарантировано выше.
  const a = digits.slice(1, 4);
  const b = digits.slice(4, 7);
  const c = digits.slice(7, 9);
  const d = digits.slice(9, 11);
  let out = '+7';
  if (a) out += ' ' + a;
  if (b) out += ' ' + b;
  if (c) out += ' ' + c;
  if (d) out += ' ' + d;
  return out;
}

// True если raw содержит ровно 11 цифр и начинается с 7.
export function isValidKzPhone(raw) {
  const digits = toAsciiDigits(raw);
  if (digits.length === KZ_FULL_LEN && digits[0] === COUNTRY_CODE) return true;
  // Ввод с ведущей 8 тоже валиден — будет перенормализован.
  if (digits.length === KZ_FULL_LEN && digits[0] === '8') return true;
  // 10 цифр без кода страны — тоже валидно (helper потом добавит 7).
  if (digits.length === KZ_LOCAL_LEN) return true;
  return false;
}

export default {
  toAsciiDigits,
  normalizePhoneInput,
  formatPhoneForDisplay,
  isValidKzPhone,
};
