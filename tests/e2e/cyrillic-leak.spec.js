// Static guard: prevents specific Russian UI strings from leaking back into
// `src/screens` and `src/components` outside i18n.js. Runs as a Playwright test
// (`npx playwright test tests/e2e/cyrillic-leak.spec.js`) so it's part of the
// standard local pipeline; does not need a browser or running server.
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', 'src');
const SCAN_DIRS = [path.join(ROOT, 'screens'), path.join(ROOT, 'components')];

// Russian UI labels that must never re-appear in JSX outside i18n.js.
// Matches the spec the user gave and previous QA reports.
const FORBIDDEN = [
  'Фильтры', 'Тип кузова', 'Сортировка',
  'Сбросить', 'Применить', 'Откликнуться',
  'Маршрут рейса', 'Статус рейса', 'Запланирован', 'Текущий статус',
  'Груз принят', 'Написать водителю', 'Оставить отзыв',
  'Чаты', 'ВСЕГДА ОНЛАЙН', 'Диалоги',
  'Биометрия (FaceID)', 'Быстрая авторизация', 'Проверка через госбазу',
  'Банковский счёт', 'Приём платежей',
  'Светлая', 'Тёмная',
  'Моя работа', 'Обновить приложение',
  'Завершайте рейсы', 'Получайте отзывы 5★', 'Верифицируйте документы',
  'Подтвердите счёт', 'КАК ПОВЫСИТЬ', 'ЧЕГО ИЗБЕГАТЬ',
  'Ваши данные защищены', 'Мой статус',
  'Я водитель', 'Я грузовладелец', 'Я перевозчик', 'Я грузоотправитель',
  'Проверенные перевозчики', 'Сделки и статусы', 'Чат с переводом',
  'Международные маршруты',
  'Ставка принята', 'Регистрация завершена', 'Начать проверку',
  'ФИО (как в паспорте)', 'ИИН (12 цифр)',
  'Введите номер', 'Введите код', 'Получить код',
  'Готовы к проверке?', 'Ручная проверка',
  'Профиль компании', 'Завершить', 'Добро пожаловать',
  // Bid action MVP labels
  'Дать скидку', 'Отозвать свою ставку?', 'Отправить скидку',
  'Ставка обновлена', 'Ставка отменена', 'Ставка отклонена',
  'Не удалось отменить ставку', 'Не удалось отклонить ставку',
  'Текущая цена', 'Водитель выбран',
  // Counter-offer + chat-before-accept
  'Предложить свою цену', 'Отправить встречную цену',
  'Встречная цена отправлена', 'Встречная цена принята', 'Встречная цена отклонена',
  'Принять встречную', 'Отклонить встречную',
  'Открыть чат', 'Не удалось открыть чат', 'Водитель предложил',
  // Deal/order MVP
  'Начать перевозку', 'Я доехал', 'Подтвердить доставку',
  'Отменить сделку', 'Сделка отменена', 'Статус обновлён',
  'Чат по заказу', 'Следующий шаг',
  'Сообщите когда выехали', 'Ожидайте начала перевозки',
  'Подтвердите получение груза',
  // Publish-route P1 placeholder
  'можно оставить пустым',
];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

test.describe('Static guard: Russian UI leftovers', () => {
  test('no forbidden Russian UI strings in src/screens and src/components', () => {
    const files = SCAN_DIRS.flatMap(d => fs.existsSync(d) ? walk(d) : []);
    const hits = [];
    for (const file of files) {
      const raw = fs.readFileSync(file, 'utf8');
      // Strip /* … */ block comments (incl. JSX {/* … */}) and // line comments.
      const cleaned = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
      for (const phrase of FORBIDDEN) {
        if (cleaned.includes(phrase)) {
          const lineIdx = cleaned.split('\n').findIndex(l => l.includes(phrase));
          const rel = path.relative(path.resolve(__dirname, '..', '..'), file);
          hits.push(`${rel}:${lineIdx + 1} → "${phrase}"`);
        }
      }
    }
    expect(hits, `Russian UI leftovers detected:\n  ${hits.join('\n  ')}`).toEqual([]);
  });
});
