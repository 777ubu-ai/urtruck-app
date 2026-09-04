// chatDateSeparators — ЕДИНЫЙ source of truth для разделителей дней в чате.
//
// Проблема (§4, физически подтверждена 04.09.2026): сообщения разных
// календарных дней шли подряд и различались только временем (11:21 / 11:26 /
// 12:00) — визуально день не отделялся, и история за неделю читалась как
// один поток.
//
// Канон:
//   * separator появляется ТОЛЬКО при смене календарного дня в локальной
//     таймзоне устройства;
//   * время каждого сообщения остаётся внутри бабла (мы его не трогаем);
//   * подпись компактная, по центру, нейтральная — не заголовок;
//   * «Сегодня» / «Вчера» локализованы, остальное — локализованная дата
//     (год добавляется только если год отличается от текущего);
//   * при подгрузке старой истории (prepend) дубли невозможны: separator
//     вычисляется из самого списка по признаку «день предыдущего элемента»,
//     а не накапливается в состоянии.
//
// Чистая функция без React/RN и без импортов приложения — юнит-тестируется
// напрямую. BCP-47 локаль приходит параметром: канонический маппинг живёт в
// utils/i18n (HTML_LANG), дублировать его здесь нельзя.

// Локальный календарный день (НЕ UTC) — иначе у пользователя в UTC+6
// сообщение в 02:00 попадало бы в предыдущий день.
export function localDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysBetweenLocal(a, b) {
  const midnight = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((midnight(b) - midnight(a)) / 86400000);
}

/**
 * Локализованная подпись разделителя.
 * @param {Date} date  дата сообщения
 * @param {string} locale  BCP-47 локаль (см. HTML_LANG в utils/i18n)
 * @param {(key:string)=>string} t  переводчик (для «Сегодня»/«Вчера»)
 * @param {Date} [now]  подменяется в тестах
 */
export function formatDaySeparator(date, locale, t, now = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const diff = daysBetweenLocal(date, now);
  if (diff === 0) return t('chat_day_today');
  if (diff === 1) return t('chat_day_yesterday');

  const sameYear = date.getFullYear() === now.getFullYear();
  // Год показываем только когда он реально отличается — иначе подпись
  // становится длинной без пользы («3 сентября» vs «3 сентября 2025 г.»).
  const options = sameYear
    ? { day: 'numeric', month: 'long' }
    : { day: 'numeric', month: 'long', year: 'numeric' };
  try {
    return new Intl.DateTimeFormat(locale || 'en', options).format(date);
  } catch {
    // Hermes без полного ICU — безопасный числовой фолбэк.
    const d = String(date.getDate()).padStart(2, '0');
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return sameYear ? `${d}.${m}` : `${d}.${m}.${date.getFullYear()}`;
  }
}

/**
 * Вставляет разделители дней между сообщениями.
 *
 * Вход: массив сообщений, отсортированный по возрастанию времени, каждое с
 * `createdAt` (серверная строка) и `id`.
 * Выход: новый массив, где перед первым сообщением каждого нового дня стоит
 * элемент { id: 'daysep:<key>', daySeparator: true, label }.
 *
 * @param {Array} messages
 * @param {object} deps { locale, t, parseDate, now }
 */
export function withDateSeparators(messages, { locale = 'en', t = (k) => k, parseDate, now } = {}) {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const toDate = typeof parseDate === 'function'
    ? parseDate
    : (raw) => { const d = new Date(raw); return Number.isNaN(d.getTime()) ? null : d; };

  const out = [];
  let prevKey = null;
  for (const message of messages) {
    const date = message?.createdAt ? toDate(message.createdAt) : null;
    const key = date ? localDayKey(date) : null;
    // Сообщение без валидной даты (оптимистичное до ответа сервера) не
    // создаёт разделитель и не сбрасывает предыдущий день.
    if (key && key !== prevKey) {
      out.push({
        id: `daysep:${key}`,
        daySeparator: true,
        dayKey: key,
        label: formatDaySeparator(date, locale, t, now || new Date()),
      });
      prevKey = key;
    }
    out.push(message);
  }
  return out;
}

export default withDateSeparators;
