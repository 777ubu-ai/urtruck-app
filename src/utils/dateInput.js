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
