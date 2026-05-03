// Автоформат даты: 15042026 → 15.04.2026
export const formatDate = (input) => {
  const digits = (input || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return digits.slice(0, 2) + '.' + digits.slice(2);
  return digits.slice(0, 2) + '.' + digits.slice(2, 4) + '.' + digits.slice(4);
};

// Валидация: 01-31 день, 01-12 месяц, 2026-2030 год
export const isValidDate = (s) => {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(s || '');
  if (!m) return false;
  const d = +m[1], mo = +m[2], y = +m[3];
  return d >= 1 && d <= 31 && mo >= 1 && mo <= 12 && y >= 2026 && y <= 2030;
};

// Нормализация ввода даты в стабильный YYYY-MM-DD без timezone shift.
// Принимает "DD.MM.YYYY" или "YYYY-MM-DD" и возвращает "YYYY-MM-DD".
// Никогда не вызывает new Date() — иначе локаль/UTC сдвинут число на ±1.
export const normalizeDateInput = (s) => {
  if (!s) return null;
  const v = String(s).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  return null;
};

// Форматирование даты для UI: "YYYY-MM-DD" → "DD.MM.YYYY".
// Принимает также "DD.MM.YYYY" — возвращает как есть.
export const formatDateForDisplay = (s) => {
  if (!s) return '';
  const v = String(s).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);  // тоже срезает T... если ISO-time
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(v);
  if (m) return `${m[1].padStart(2, '0')}.${m[2].padStart(2, '0')}.${m[3]}`;
  return v;
};
